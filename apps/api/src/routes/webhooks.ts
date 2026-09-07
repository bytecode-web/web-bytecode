import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Router } from 'express';

const execAsync = promisify(exec);
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { triggerEnvironmentVerification } from '../services/environmentVerification.js';
import { sendDirectInAppNotification } from '../services/notificationService.js';

const router = Router();

type GithubRepository = { html_url?: string; full_name?: string };

type GithubPushPayload = {
  ref?: string;
  repository?: GithubRepository;
  commits?: Array<{
    id: string;
    message: string;
    timestamp: string;
    url: string;
    author: { name: string; email: string };
  }>;
  head_commit?: { id: string };
};

type GithubPullRequestPayload = {
  action?: 'opened' | 'synchronize' | 'closed' | 'reopened';
  number?: number;
  pull_request?: {
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
    state?: string;
  };
  repository?: GithubRepository;
};

type GithubDeploymentStatusPayload = {
  repository?: GithubRepository;
  deployment?: { sha?: string };
  deployment_status?: {
    target_url?: string | null;
    environment?: string;
    state?: string;
  };
};

const findProjectByRepository = (repository?: GithubRepository) => {
  const htmlUrl = repository?.html_url?.replace(/\/+$/, '') ?? null;
  const fullNameUrl = repository?.full_name ? `https://github.com/${repository.full_name}` : null;
  return pool.query(
    `SELECT id FROM projects
     WHERE deleted_at IS NULL
       AND lower(rtrim(github_repo, '/')) IN (lower($1), lower($2))
     LIMIT 1`,
    [htmlUrl, fullNameUrl],
  );
};

const verifyGithubSignature = (req: Request) => {
  if (!env.githubWebhookSecret) {
    if (env.nodeEnv === 'development') return;
    throw new HttpError(500, 'GitHub webhook secret no configurado.');
  }
  const signature = req.header('x-hub-signature-256');
  if (!signature?.startsWith('sha256=') || !req.rawBody) throw new HttpError(401, 'Firma de webhook invalida.');
  const expected = crypto.createHmac('sha256', env.githubWebhookSecret).update(req.rawBody).digest('hex');
  const received = signature.slice(7);
  if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    throw new HttpError(401, 'Firma de webhook invalida.');
  }
};

router.post('/github', asyncHandler(async (req: Request, res: Response) => {
  verifyGithubSignature(req);
  const githubEvent = req.headers['x-github-event'];

  if (githubEvent === 'ping') {
    return res.status(202).json({ message: 'Event ping ignored' });
  }
  if (githubEvent !== 'pull_request' && githubEvent !== 'deployment_status' && githubEvent !== 'push') {
    return res.status(202).json({ message: `Event ${githubEvent} ignored` });
  }

  if (githubEvent === 'push') {
    const payload = req.body as GithubPushPayload;
    const branchName = payload.ref?.replace('refs/heads/', '') ?? '';
    const repoName = payload.repository?.full_name;

    let projectId: string | undefined;
    try {
      const project = await findProjectByRepository(payload.repository);
      projectId = project.rows[0]?.id as string | undefined;
    } catch (lookupError) {
      console.error('[GitHub Webhook] Project lookup error for repo:', repoName, lookupError);
      return res.status(200).json({ message: 'Skipped: Project lookup failed' });
    }

    if (!projectId) {
      console.error('[GitHub Webhook] CRITICAL: Could not resolve projectId for repo:', repoName);
      return res.status(200).json({ message: 'Skipped: No project found' });
    }

    const commits = payload.commits || [];
    let insertedCount = 0;

    for (const commit of commits) {
      try {
        await pool.query(
          `INSERT INTO project_commits (
            project_id, commit_hash, message, author_name, author_email, 
            branch, github_url, committed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (project_id, commit_hash) DO NOTHING`,
          [
            projectId,
            commit.id,
            commit.message,
            commit.author?.name || 'Unknown',
            commit.author?.email || '',
            branchName,
            commit.url || '',
            commit.timestamp ? new Date(commit.timestamp) : new Date(),
          ],
        );
        insertedCount++;
      } catch (err) {
        console.error('[GitHub Webhook] SQL Error saving commit:', commit.id, err);
      }
    }

    if (insertedCount > 0) {
      try {
        await pool.query(
          `DELETE FROM project_commits
           WHERE project_id = $1
             AND id NOT IN (
               SELECT id FROM project_commits
               WHERE project_id = $1
               ORDER BY committed_at DESC
               LIMIT 250
             )`,
          [projectId]
        );
      } catch (err) {
        console.error('[GitHub Webhook] SQL Error cleaning up old commits:', err);
      }

      try {
        const assignedUsersRes = await pool.query('SELECT user_id FROM project_assignments WHERE project_id = $1', [projectId]);
        if (assignedUsersRes.rows.length > 0) {
          const projectNameRes = await pool.query('SELECT name FROM projects WHERE id = $1', [projectId]);
          const projectName = projectNameRes.rows[0]?.name || 'Proyecto Desconocido';
          
          for (const row of assignedUsersRes.rows) {
            await sendDirectInAppNotification(
              row.user_id,
              "Nuevos Commits",
              `Se han registrado ${insertedCount} nuevo(s) commit(s) en el repositorio de "${projectName}".`,
              "projects",
              projectId
            );
          }
        }
      } catch (err) {
        console.error('[GitHub Webhook] Error sending push notifications:', err);
      }
    }

    return res.status(200).json({ message: `Processed ${commits.length} commits, inserted ${insertedCount}`, projectId });
  }

  if (githubEvent === 'pull_request') {
    const payload = req.body as GithubPullRequestPayload;
    if (!payload.action || !payload.pull_request) {
      return res.status(400).json({ error: 'Missing pull_request payload data' });
    }

    const action = payload.action;
    const branchName = payload.pull_request.head?.ref;
    const sha = payload.pull_request.head?.sha;

    if (!branchName) return res.status(400).json({ error: 'Missing head branch name' });

    if (branchName === 'main' || branchName === 'master') {
      return res.status(200).json({ message: 'Main branch PR ignored.' });
    }

    const repoName = payload.repository?.full_name;
    let projectId: string | undefined;
    try {
      const project = await findProjectByRepository(payload.repository);
      projectId = project.rows[0]?.id as string | undefined;
    } catch (lookupError) {
      console.error('[GitHub Webhook] Project lookup error for repo:', repoName, lookupError);
      return res.status(200).json({ message: 'Skipped: Project lookup failed' });
    }

    if (!projectId) {
      console.error('[GitHub Webhook] CRITICAL: Could not resolve projectId for repo:', repoName);
      return res.status(200).json({ message: 'Skipped: No project found' });
    }

    const prNumber = payload.number;

    if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
      if (!sha) return res.status(400).json({ error: 'Missing commit SHA' });
      const envName = `Preview: ${branchName}`;
      const url = `https://pr${prNumber}.env.bytecode.com.pe`;
      const dbName = `pr_${prNumber}`;

      // Respondemos a GitHub inmediatamente para evitar su estricto timeout de 10 segundos
      res.status(202).json({ message: 'Preview environment provisioning started in background', branchName, sha });

      // Ejecutamos las operaciones pesadas de aprovisionamiento docker/db en segundo plano
      void (async () => {
        try {
          await pool.query(
            `INSERT INTO project_environments (project_id, type, name, branch_name, commit_sha, status, url)
             VALUES ($1, 'ephemeral', $2, $3, $4, 'verifying', NULL)
             ON CONFLICT (project_id, type, name)
             DO UPDATE SET commit_sha = EXCLUDED.commit_sha, branch_name = EXCLUDED.branch_name,
                           status = 'verifying', error_details = NULL`,
            [projectId, envName, branchName, sha],
          );

          try {
            // 1. Levantar el entorno efímero
            const ephemeralDir = `/var/www/ephemeral/pr-${prNumber}`;
            await execAsync(`
              mkdir -p /var/www/ephemeral &&
              if [ ! -d "${ephemeralDir}" ]; then git clone --shared /var/www/web-bytecode ${ephemeralDir}; fi &&
              cd ${ephemeralDir} &&
              git remote set-url origin https://github.com/bytecode-web/web-bytecode.git &&
              git fetch origin ${branchName} &&
              git checkout -B ${branchName} origin/${branchName} &&
              git reset --hard origin/${branchName} &&
              cp /var/www/web-bytecode/.env .env &&
              PR_NUMBER=${prNumber} docker compose --env-file .env -f docker-compose.ephemeral.yml -p pr-${prNumber} up -d --build
            `);

            // 2. Esperar 20 segundos para inicialización de Postgres
            await new Promise(resolve => setTimeout(resolve, 20000));

            // 3. Detener backend
            await execAsync(`docker stop bytecode-backend-pr-${prNumber}`).catch(() => {});

            // 4. Crear BD
            await execAsync(`docker exec bytecode-db-pr-${prNumber} createdb -U bytecode_user bytecode_pr_${prNumber}`).catch(() => {});

            // 5. Clonar datos de prod
            await execAsync(`docker exec bytecode-db pg_dump -U bytecode_user -c --if-exists bytecode_prod | docker exec -i bytecode-db-pr-${prNumber} psql -U bytecode_user -d bytecode_pr_${prNumber}`);

            // 6. Reiniciar backend y limpiar
            await execAsync(`docker start bytecode-backend-pr-${prNumber}`).catch(() => {});
            await execAsync(`docker image prune -f`).catch(() => {});

            await pool.query(
              `UPDATE project_environments
               SET status = 'active', url = $1
               WHERE project_id = $2 AND name = $3`,
              [url, projectId, envName],
            );
          } catch (dockerError: any) {
            console.error('[GitHub Webhook] Docker/DB provisioning failed:', dockerError);
            await pool.query(
              `UPDATE project_environments
               SET status = 'failed', error_details = $1
               WHERE project_id = $2 AND name = $3`,
              [String(dockerError.message || dockerError), projectId, envName],
            );
          }
        } catch (err) {
          console.error('[GitHub Webhook] SQL Error in background PR task:', err);
        }
      })();
      return;
    }

    if (action === 'closed') {
      res.status(202).json({ message: 'Preview environment cleanup started in background', branchName });

      void (async () => {
        const dbName = `pr_${prNumber}`;
        try {
          const ephemeralDir = `/var/www/ephemeral/pr-${prNumber}`;
          await execAsync(`cd ${ephemeralDir} && PR_NUMBER=${prNumber} docker compose --env-file .env -f docker-compose.ephemeral.yml -p pr-${prNumber} down -v && cd /var/www/ephemeral && rm -rf pr-${prNumber}`);
        } catch (cleanupError: any) {
          console.error('[GitHub Webhook] Cleanup Error:', cleanupError);
        }

        try {
          await pool.query(
            `UPDATE project_environments
             SET status = 'inactive', url = NULL, error_details = NULL, audit_report = NULL
             WHERE project_id = $1 AND branch_name = $2 AND type = 'ephemeral'`,
            [projectId, branchName],
          );
        } catch (err) {
          console.error('[GitHub Webhook] SQL Error on PR close:', err);
        }
      })();
      return;
    }

    return res.status(200).json({ message: `Action ${action} ignored` });
  }

  const payload = req.body as GithubDeploymentStatusPayload;
  const project = await findProjectByRepository(payload.repository);
  if (!project.rowCount) {
    return res.status(202).json({ ok: true, ignored: true, reason: 'project_not_mapped' });
  }

  const projectId = project.rows[0].id;
  const sha = payload.deployment?.sha;
  const targetUrl = payload.deployment_status?.target_url;
  const environmentType = payload.deployment_status?.environment?.toLowerCase();
  const state = payload.deployment_status?.state?.toLowerCase();

  if (environmentType === 'production') {
    await pool.query(
      `UPDATE project_environments
       SET status = 'ready'
       WHERE project_id = $1 AND type = 'production'`,
      [projectId],
    );
    return res.status(200).json({ message: 'Production status synced, URL preserved' });
  }

  if (environmentType === 'preview' && state === 'success') {
    if (!sha || !targetUrl) {
      return res.status(400).json({ error: 'Missing deployment SHA or target URL' });
    }
    const updated = await pool.query(
      `UPDATE project_environments
       SET url = $1, status = 'deployed_ui', error_details = NULL
       WHERE project_id = $2 AND commit_sha = $3 AND type = 'ephemeral'`,
      [targetUrl, projectId, sha],
    );
    if (!updated.rowCount) {
      console.warn(`[Webhook] No ephemeral row found for SHA: ${sha}. Skipping update.`);
    }
    return res.status(200).json({ message: 'Preview updated' });
  }

  return res.status(200).json({ message: 'Ignored status' });
}));

router.post('/ephemeral-deploy', asyncHandler(async (req: Request, res: Response) => {
  const { branchName, url, apiUrl, status } = req.body;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'No autorizado: Falta el token');
  }
  const token = authHeader.split(' ')[1];
  if (token !== env.jwtSecret) {
    throw new HttpError(401, 'No autorizado: Token invalido');
  }

  if (status === 'destroyed') {
    await pool.query(
      `UPDATE project_environments
       SET status = 'destroyed', url = NULL, error_details = NULL, audit_report = NULL
       WHERE branch_name = $1 AND type = 'ephemeral'`,
      [branchName],
    );
    return res.status(200).json({ ok: true, message: 'Ephemeral environment marked as destroyed' });
  }

  const result = await pool.query(
    `UPDATE project_environments
     SET url = $1, api_url = $2, status = 'deployed_ui', error_details = NULL
     WHERE branch_name = $3 AND type = 'ephemeral'
     RETURNING id, project_id`,
    [url, apiUrl, branchName],
  );

  if (result.rowCount) {
    const { id, project_id } = result.rows[0];
    triggerEnvironmentVerification(id, project_id);
  } else {
    console.warn(`[Webhook] No ephemeral environment row found for branch: ${branchName} to update to deployed_ui.`);
  }

  res.status(200).json({ ok: true, message: 'Ephemeral environment updated and verification triggered' });
}));

export default router;
