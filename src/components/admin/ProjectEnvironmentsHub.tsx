import React, { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, GitBranch, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import AdminPanel from './AdminPanel';
import RoleGuard from './RoleGuard';
import CustomDropdown from '../ui/CustomDropdown';
import { createProjectEnvironment, deleteProjectEnvironment, fetchProjectEnvironments, retryProjectEnvironment, type ProjectEnvironment } from '../../lib/api';

const typeLabels: Record<ProjectEnvironment['type'], string> = {
  production: 'Prod',
  staging: 'Staging',
  ephemeral: 'Preview',
};

const EnvironmentAuditReport: React.FC<{
  report: NonNullable<ProjectEnvironment['audit_report']>;
  onFix: (layer: 'red' | 'config' | 'aislamiento') => void;
}> = ({ report, onFix }) => (
  <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-left">
    <h4 className="text-sm font-bold text-red-400">Reporte de Auditoría</h4>
    {Object.entries(report.layers).map(([key, layer]) => layer.ok === false && (
      <div key={key} className="flex items-center justify-between gap-3 text-xs">
        <span className="text-red-200">{layer.msg}</span>
        <button type="button" onClick={() => onFix(key as 'red' | 'config' | 'aislamiento')} className="text-blue-400 underline hover:text-blue-300">
          {layer.suggestion}
        </button>
      </div>
    ))}
  </div>
);

const ProjectEnvironmentsHub: React.FC<{ projectId: string; isAdmin?: boolean }> = ({ projectId, isAdmin = false }) => {
  const [items, setItems] = useState<ProjectEnvironment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ type: 'production' | 'staging'; name: string; url: string; apiUrl: string }>({ type: 'staging', name: 'Staging', url: '', apiUrl: '' });

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchProjectEnvironments(projectId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los entornos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [projectId]);


  const hasVerifying = items.some((item) => item.status === 'verifying');
  useEffect(() => {
    if (!hasVerifying) return;
    const interval = window.setInterval(() => {
      fetchProjectEnvironments(projectId).then(setItems).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [hasVerifying, projectId]);

  const changeType = (type: string) => {
    const nextType = type as 'production' | 'staging';
    setForm({ ...form, type: nextType, name: nextType === 'production' ? 'Producción' : 'Staging' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createProjectEnvironment(projectId, { ...form, apiUrl: form.apiUrl || null });
      setModalOpen(false);
      setForm({ type: 'staging', name: 'Staging', url: '', apiUrl: '' });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el entorno.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (environment: ProjectEnvironment) => {
    if (!window.confirm(`¿Eliminar el entorno "${environment.name}"?`)) return;
    try {
      await deleteProjectEnvironment(projectId, environment.id);
      setItems((current) => current.filter((item) => item.id !== environment.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el entorno.');
    }
  };

  const retry = async (environment: ProjectEnvironment) => {
    setItems((current) => current.map((item) => item.id === environment.id ? { ...item, status: 'verifying', error_details: null } : item));
    setError('');
    try {
      await retryProjectEnvironment(projectId, environment.id);
    } catch (requestError) {
      setItems((current) => current.map((item) => item.id === environment.id ? { ...item, status: 'failed' } : item));
      setError(requestError instanceof Error ? requestError.message : 'No se pudo reintentar la verificación.');
    }
  };

  return (
    <AdminPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 px-6 py-5"><div><h2 className="font-semibold text-white/85">Hub de Entornos</h2><p className="mt-1 text-xs text-white/35">URLs fijas y previews sincronizados desde GitHub.</p></div><RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>{isAdmin && <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"><Plus className="h-4 w-4" />Añadir Entorno</button>}</RoleGuard></div>
      {error && <p className="m-5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-white/45"><tr><th className="px-6 py-4">Nombre</th><th className="px-6 py-4 text-center">Tipo</th><th className="px-6 py-4 text-center">Estado</th><th className="px-6 py-4 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-white/5">{items.map((environment) => <tr key={environment.id}><td className="px-6 py-4"><p className="font-medium text-white/80">{environment.name}</p><p className="mt-1 max-w-md truncate text-xs text-white/35">{environment.url}</p></td><td className="px-6 py-4 text-center"><div className="flex items-center justify-center gap-2"><span className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${environment.type === 'production' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : environment.type === 'staging' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'}`}>{typeLabels[environment.type]}</span>{environment.type === 'ephemeral' && environment.branch_name && <span className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300"><GitBranch size={12} />{environment.branch_name}</span>}</div></td><td className="px-6 py-4 text-center"><div className="mx-auto flex max-w-sm items-center justify-center">{environment.status === 'verifying' ? <span className="inline-flex items-center gap-1.5 text-amber-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Validando...</span> : environment.status === 'deployed_ui' ? <span className="text-cyan-300">Esperando verificación</span> : (environment.status === 'active' || environment.status === 'ready') ? <span className="text-emerald-300">En línea</span> : environment.status === 'failed' ? environment.audit_report ? <EnvironmentAuditReport report={environment.audit_report} onFix={() => void retry(environment)} /> : environment.error_details ? <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 shadow-sm"><AlertCircle className="h-5 w-5 shrink-0" /><span className="text-sm font-medium">{environment.error_details}</span></div> : <span className="text-red-300">Error de conexión</span> : <span className="text-white/40">Inactivo</span>}</div></td><td className="px-6 py-4"><div className="flex justify-end gap-2">{environment.status === 'failed' ? <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-white/25"><ExternalLink className="h-3.5 w-3.5" />Abrir</span> : <a href={environment.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"><ExternalLink className="h-3.5 w-3.5" />Abrir</a>}{environment.status === 'deployed_ui' && <button type="button" onClick={() => void retry(environment)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-500/20"><ShieldCheck className="h-3.5 w-3.5" />Verificar Entorno</button>}{environment.status === 'failed' && <button type="button" onClick={() => void retry(environment)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/20"><RefreshCw className="h-3.5 w-3.5" />Reintentar</button>}<RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>{isAdmin && <button type="button" onClick={() => void remove(environment)} className="rounded-lg border border-red-500/15 bg-red-500/5 p-2 text-red-300 hover:bg-red-500/15" aria-label={`Eliminar ${environment.name}`}><Trash2 className="h-4 w-4" /></button>}</RoleGuard></div></td></tr>)}{!loading && items.length === 0 && <tr><td colSpan={4} className="px-6 py-10 text-center text-white/30">No hay entornos registrados.</td></tr>}{loading && <tr><td colSpan={4} className="px-6 py-10 text-center text-white/30">Cargando entornos...</td></tr>}</tbody></table></div>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => { if(e.target === e.currentTarget) setModalOpen(false); }}>
            <form onSubmit={save} onMouseDown={e => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-4"><h3 className="font-semibold text-white/90">Añadir Entorno</h3><button type="button" onClick={() => setModalOpen(false)} className="p-2 text-white/45"><X className="h-5 w-5" /></button></div>
              <div className="grid gap-4">
                <div><span className="mb-1.5 block text-xs uppercase tracking-wider text-white/45">Tipo</span><CustomDropdown value={form.type} onChange={changeType} placeholder="Seleccionar tipo..." options={[{ value: 'production', label: 'Producción' }, { value: 'staging', label: 'Staging' }]} /></div>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Nombre</span><input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">URL</span><input required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://frontend.vercel.app" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">API URL (Backend) - Para validación de Health Check</span><input type="url" value={form.apiUrl} onChange={(event) => setForm({ ...form, apiUrl: event.target.value })} placeholder="https://api.example.com" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /><span className="text-xs text-white/30">Se consultará /api/health en esta URL. Si se omite, se usará la URL principal.</span></label>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60">Cancelar</button><button disabled={saving} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar'}</button></div>
            </form>
          </div>
        )}
      </RoleGuard>
    </AdminPanel>
  );
};

export default ProjectEnvironmentsHub;
