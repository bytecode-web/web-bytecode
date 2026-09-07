import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { accessRouter, settingsRouter, usersRouter } from './admin/access.js';
import { casesRouter } from './admin/cases.js';
import { contentRouter } from './admin/content.js';
import { projectAssignmentsRouter } from './admin/projectAssignments.js';
import { projectActivityRouter } from './admin/projectActivity.js';
import { projectEnvironmentsRouter } from './admin/projectEnvironments.js';
import { projectMilestonesRouter } from './admin/projectMilestones.js';
import { projectMilestonePaymentsRouter } from './admin/projectMilestonePayments.js';
import { projectsRouter } from './admin/projects.js';
import { projectReadRouter } from './admin/projectRead.js';
import { quotesRouter } from './admin/quotes.js';
import directoryRouter from './admin/directory.js';
import notificationsRouter from './admin/notifications.js';
import { auditLogsRouter, dashboardRouter, governanceRouter } from './admin/system.js';

const router = Router();

router.use(requireAdmin);

router.use('/', accessRouter);
router.use('/', dashboardRouter);
router.use('/', casesRouter);
router.use('/', usersRouter);
router.use('/', settingsRouter);
router.use('/', auditLogsRouter);
router.use('/', contentRouter);
router.use('/', projectsRouter);
router.use('/', projectActivityRouter);
router.use('/', projectAssignmentsRouter);
router.use('/', projectEnvironmentsRouter);
router.use('/', projectMilestonesRouter);
router.use('/', projectMilestonePaymentsRouter);
router.use('/', projectReadRouter);
router.use('/', quotesRouter);
router.use('/', directoryRouter);
router.use('/', notificationsRouter);
router.use('/', governanceRouter);

export default router;
