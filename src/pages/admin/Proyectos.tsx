import React, { useEffect, useState, useRef } from 'react';
import { FolderKanban, Plus, RefreshCw, X } from 'lucide-react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import AdminPanel from '../../components/admin/AdminPanel';
import type { AdminUser } from '../../components/admin/AdminLayout';
import RoleGuard from '../../components/admin/RoleGuard';
import ProjectQuoteSelector from '../../components/admin/ProjectQuoteSelector';
import PaginationControl from '../../components/ui/PaginationControl';
import CustomDropdown from '../../components/ui/CustomDropdown';
import {
  apiRequest,
  createProject,
  fetchProjects,
  type Project,
  type ProjectInput,
} from '../../lib/api';
import type { StatusCatalogItem } from '../../types/status';
import { useToastStore } from '../../stores/toastStore';

const PAGE_SIZE = 9;
type CustomerOption = { id: string; label: string; email: string; type: string; company_name: string | null };
type ServiceOption = { id: string; code: string; name: string };

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): ProjectInput => ({
  customerId: '',
  serviceId: '',
  quoteId: null,
  name: '',
  description: '',
  status: '',
  githubRepo: '',
  startDate: '',
  estimatedEndDate: '',
  totalBudget: 0,
  currencyCode: 'PEN',
});

const Proyectos: React.FC = () => {
  const navigate = useNavigate();
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canCreate = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.proyectos.create') === true;
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [statuses, setStatuses] = useState<StatusCatalogItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState<ProjectInput>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToastStore();  
  const selectedCustomerEmail = customers.find((customer) => customer.id === form.customerId)?.email ?? '';

  const loadProjects = async () => {
    setLoading(true);
    try {
      const result = await fetchProjects(page, PAGE_SIZE);
      if (!result.data.length && result.total > 0 && page > 1) { setPage(page - 1); return; }
      setProjects(result.data);
      setTotal(result.total);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los proyectos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const location = useLocation();
  const processedAutoOpenId = useRef<string | null>(null);

  useEffect(() => { void loadProjects(); }, [page]);

  useEffect(() => {
    if (location.state && typeof location.state === 'object') {
      const stateObj = location.state as { autoOpenId?: string, notificationTimestamp?: number };
      const autoOpenId = stateObj.autoOpenId;
      const timestamp = stateObj.notificationTimestamp;
      
      const uniqueId = timestamp ? `${autoOpenId || 'refresh'}-${timestamp}` : autoOpenId;
      
      if (uniqueId && uniqueId !== processedAutoOpenId.current) {
        processedAutoOpenId.current = uniqueId;
        
        if (autoOpenId) {
          navigate(`/admin/proyectos/${autoOpenId}`);
        } else {
          addToast('Has sido removido de un proyecto y ya no tienes acceso.', 'error');
          void loadProjects();
        }
        
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, navigate]);  useEffect(() => {
    apiRequest<{ items: StatusCatalogItem[] }>('/catalog/statuses?domain=project')
      .then((result) => setStatuses(result.items))
      .catch(() => setStatuses([]));
    if (!canCreate) return;
    apiRequest<{ customers: CustomerOption[]; services: ServiceOption[] }>('/admin/projects/options')
      .then((options) => {
        setCustomers(options.customers);
        setServices(options.services);
      })
      .catch(() => undefined);
  }, [canCreate]);

  const openNew = () => {
    const defaultStatus = statuses.find((s) => !s.isTerminal)?.code ?? '';
    setForm({ ...emptyForm(), status: defaultStatus });
    setModalOpen(true);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createProject({
        ...form,
        githubRepo: form.githubRepo || undefined,
      });
      setModalOpen(false);
      if (page !== 1) setPage(1); else await loadProjects();
      navigate(`/admin/proyectos/${created.id}`);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo crear el proyecto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3"><FolderKanban className="h-6 w-6 text-white/50" /><div><h1 className="text-2xl font-semibold text-white/90">Proyectos</h1><p className="mt-1 text-xs uppercase tracking-widest text-white/40">Entrega y seguimiento técnico</p></div></div>
        <div className="flex gap-3">
          <button type="button" onClick={() => void loadProjects()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80"><RefreshCw className="h-4 w-4" />Actualizar</button>
          <RoleGuard requiredPermission="admin.proyectos.create" fallback={null}>
            <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"><Plus className="h-4 w-4" />Nuevo Proyecto</button>
          </RoleGuard>
        </div>
      </div>
      
      <AdminPanel className="flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-white/50"><tr><th className="px-6 py-4">Proyecto</th><th className="px-6 py-4">Cliente</th><th className="px-6 py-4">GitHub</th><th className="px-6 py-4 text-center">Estado</th></tr></thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {projects.map((project) => (
                <tr key={project.id} onClick={() => navigate(`/admin/proyectos/${project.id}`)} className="cursor-pointer transition hover:bg-white/[0.03]">
                  <td className="px-6 py-4"><p className="font-medium text-white/90">{project.name}</p><p className="mt-1 text-xs text-white/35">{project.project_code}</p></td>
                  <td className="px-6 py-4"><p>{project.customer_name}</p><p className="text-xs text-white/35">{project.customer_email}</p></td>
                  <td className="max-w-[280px] px-6 py-4"><span className="block truncate text-xs text-cyan-300/80">{project.github_repo || 'Sin repositorio'}</span></td>
                  <td className="px-6 py-4 text-center"><span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-white/65">{project.status_name || project.status}</span></td>
                </tr>
              ))}
              {!loading && !projects.length && <tr><td colSpan={4} className="px-6 py-10 text-center text-white/30">No hay proyectos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      </AdminPanel>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8">
            <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4"><h2 className="text-lg font-semibold text-white/90">Nuevo proyecto</h2><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/5"><X className="h-5 w-5" /></button></div>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-1.5 md:col-span-2"><span className="text-xs uppercase tracking-wider text-white/45">Nombre</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
              <div><span className="mb-1.5 block text-xs uppercase tracking-wider text-white/45">Cliente</span><CustomDropdown value={form.customerId} onChange={(customerId) => setForm({ ...form, customerId, quoteId: null, totalBudget: 0 })} placeholder="Seleccionar cliente..." options={customers.map((item) => ({ value: item.id, label: item.label }))} /></div>
              <div><span className="mb-1.5 block text-xs uppercase tracking-wider text-white/45">Servicio</span><CustomDropdown value={form.serviceId} onChange={(serviceId) => setForm({ ...form, serviceId })} placeholder="Seleccionar servicio..." options={services.map((item) => ({ value: item.id, label: item.name }))} /></div>
              <div className="md:col-span-2"><ProjectQuoteSelector email={selectedCustomerEmail} value={form.quoteId ?? ''} onChange={(quote) => setForm({ ...form, quoteId: quote?.id ?? null, totalBudget: quote ? Number(quote.total_amount) : form.totalBudget, currencyCode: quote ? quote.currency_code : form.currencyCode })} /></div>
              <div><span className="mb-1.5 block text-xs uppercase tracking-wider text-white/45">Estado</span><CustomDropdown value={form.status} onChange={(status) => setForm({ ...form, status })} placeholder="Seleccionar estado..." options={statuses.filter((item) => !item.isTerminal).map((item) => ({ value: item.code, label: item.name }))} /></div>
              <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Presupuesto ({form.currencyCode})</span><input type="number" min={0} step="0.01" required value={form.totalBudget} onChange={(e) => setForm({ ...form, totalBudget: Number(e.target.value) })} readOnly={!!form.quoteId} className={`rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white ${form.quoteId ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`} /></label>
              <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Inicio</span><input type="date" required min={today()} value={form.startDate} onChange={(e) => { const newStartDate = e.target.value; if (!newStartDate) { setForm({ ...form, startDate: '', estimatedEndDate: '' }); return; } const d = new Date(newStartDate); d.setDate(d.getDate() + 7); const minEndDate = d.toISOString().slice(0,10); setForm({ ...form, startDate: newStartDate, estimatedEndDate: form.estimatedEndDate && form.estimatedEndDate < minEndDate ? minEndDate : form.estimatedEndDate }); }} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
              <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Fin estimado</span><input type="date" required disabled={!form.startDate} min={form.startDate ? (() => { const d = new Date(form.startDate); d.setDate(d.getDate() + 7); return d.toISOString().slice(0,10); })() : undefined} value={form.estimatedEndDate} onChange={(e) => setForm({ ...form, estimatedEndDate: e.target.value })} className={`rounded-lg border border-white/10 px-4 py-2.5 text-white ${!form.startDate ? 'cursor-not-allowed bg-white/5 opacity-40' : 'bg-white/5'}`} title={!form.startDate ? 'Selecciona una fecha de inicio primero' : ''} /></label>
              <label className="grid gap-1.5 md:col-span-2"><span className="text-xs uppercase tracking-wider text-white/45">GitHub Repo</span><input type="url" value={form.githubRepo} onChange={(e) => setForm({ ...form, githubRepo: e.target.value })} placeholder="https://github.com/org/repo" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
              <label className="grid gap-1.5 md:col-span-2"><span className="text-xs uppercase tracking-wider text-white/45">Descripción</span><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65">Cancelar</button><button disabled={saving || !form.customerId || !form.serviceId || !form.status} className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{saving ? 'Guardando...' : 'Crear proyecto'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Proyectos;
