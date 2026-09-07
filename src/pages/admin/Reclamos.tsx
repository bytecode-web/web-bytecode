import React, { useEffect, useState, useRef } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Download, Mail, MessageSquareText, RefreshCw, Tag, X, UserCheck } from 'lucide-react';
import { apiRequest, apiUrl } from '../../lib/api';
import StatusHistoryTimeline from '../../components/admin/StatusHistoryTimeline';
import Timeline from '../../components/ui/Timeline';
import type { StatusHistoryRecord } from '../../types/status';
import PaginationControl from '../../components/ui/PaginationControl';
import { useTerminalState } from '../../hooks/useTerminalState';
import { useOutletContext, useLocation } from 'react-router-dom';
import type { AdminUser } from '../../components/admin/AdminLayout';

export interface Complaint {
  id: string;
  code: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  claim_type: string;
  tipo_reclamo: string;
  status: string;
  status_name?: string;
  priority?: string;
  priority_name?: string;
  attachment_original_name?: string;
  created_at: string;
  assigned_to?: string;
}

type ComplaintItem = Complaint;

type AssignmentHistoryItem = {
  id: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at: string | null;
  notes: string | null;
  assigned_to_name: string;
  assigned_by_name: string | null;
};

type DetailItem = Record<string, string | number | null | undefined>;

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '';

const formatCardDate = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value));

import AdminPanel from '../../components/admin/AdminPanel';
import CustomDropdown from '../../components/ui/CustomDropdown';

const PAGE_SIZE = 9;

const priorityBadge = (code: string, name: string) => {
  const colors: Record<string, string> = {
    urgent: 'bg-red-500/20 text-red-400 border border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    normal: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    low: 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  };
  const color = colors[code] || colors.normal;
  return <span className={"h-fit rounded-md px-2 py-0.5 text-[10px] whitespace-nowrap " + color}>{name || 'Normal'}</span>;
};


// ... (skip to the component rendering)

const Reclamos: React.FC = () => {
  const { addToast } = useToastStore();
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const { isReadOnly, formProps } = useTerminalState({ isTerminal: Boolean(detail?.isTerminal) });
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('registered');
  const [priority, setPriority] = useState('normal');
  const [priorities, setPriorities] = useState<{ value: string, label: string }[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [statuses, setStatuses] = useState<{ value: string, label: string }[]>([]);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [adminsList, setAdminsList] = useState<{ value: string, label: string }[]>([]);
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canAssign = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.reclamos.assign') === true;

  const statusLabel = (statusCode: string) => statuses.find((item) => item.value === statusCode)?.label ?? statusCode;

  const loadCatalogs = async () => {
    try {
      const res = await apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/statuses?domain=complaint');
      setStatuses(res.items.map(s => ({ value: s.code, label: s.name })));
      const prioRes = await apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/priorities');
      setPriorities(prioRes.items.map(s => ({ value: s.code, label: s.name })));
      const adminRes = await apiRequest<{ data: { id: string, name: string }[] }>('/admin/cases/assignment-options?domain=complaint');
      setAdminsList([
        { value: '', label: 'Sin Asignar' },
        ...adminRes.data.map(a => ({ value: a.id, label: a.name }))
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  const loadList = async () => {
    setListLoading(true);
    try {
      const result = await apiRequest<{ data: ComplaintItem[]; total: number }>(`/admin/complaints?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`);
      if (result.data.length === 0 && result.total > 0 && page > 1) { setPage(page - 1); return; }
      setComplaints(result.data);
      setTotal(result.total);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo cargar la lista.', 'error');
    } finally {
      setListLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const [result, historyResult, assignmentResult] = await Promise.all([
        apiRequest<{ item: DetailItem }>(`/admin/complaints/${id}`),
        apiRequest<{ items: StatusHistoryRecord[] }>(`/admin/complaints/${id}/history`),
        apiRequest<{ items: AssignmentHistoryItem[] }>(`/admin/complaints/${id}/assignment-history`),
      ]);
      setDetail(result.item);
      setStatusHistory(historyResult.items);
      setHistory(assignmentResult.items);
      setStatus(String(result.item.status ?? 'registered'));
      setPriority(String(result.item.priority ?? 'normal'));
      setNotes(String(result.item.admin_notes ?? ''));
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        setMobileDetailOpen(true);
      }
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo cargar el detalle.', 'error');
    }
  };

  const handleAssignCase = async (adminId: string) => {
    if (!selectedId) return;
    setIsAssigning(true);
    try {
      const result = await apiRequest<{ item: DetailItem }>(`/admin/complaints/${selectedId}/assign`, {
        method: 'POST',
        json: { assigned_to: adminId },
      });
      setDetail(result.item);
      const histResult = await apiRequest<{ items: AssignmentHistoryItem[] }>(`/admin/complaints/${selectedId}/assignment-history`);
      setHistory(histResult.items);
      addToast('Asignación actualizada exitosamente.', 'success');
      loadList();
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'Error al asignar el caso.', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  const location = useLocation();
  const processedAutoOpenId = useRef<string | null>(null);

  useEffect(() => {
    void loadCatalogs();
  }, []);

  useEffect(() => {
    void loadList();
  }, [page]);

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && 'autoOpenId' in location.state) {
      const autoOpenId = (location.state as { autoOpenId: string }).autoOpenId;
      if (autoOpenId && autoOpenId !== processedAutoOpenId.current) {
        processedAutoOpenId.current = autoOpenId;
        void loadDetail(autoOpenId);
        window.history.replaceState({}, '');
      }
    }
  }, [location.state]);

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      const result = await apiRequest<{ item: DetailItem }>(`/admin/complaints/${selectedId}`, {
        method: 'PATCH',
        json: { status, adminNotes: notes, priority },
      });
      setDetail(result.item);
      const historyResult = await apiRequest<{ items: StatusHistoryRecord[] }>(`/admin/complaints/${selectedId}/history`);
      setStatusHistory(historyResult.items);
      await loadList();
      addToast('Reclamo actualizado correctamente.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    }
  };

  const renderDetailContent = () => {
    if (!detail) {
      return (
        <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-white/30 p-8">
          <MessageSquareText className="h-8 w-8 mb-4 opacity-50" />
          <p className="text-sm">Selecciona un registro para ver el detalle.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        <div className="p-6 lg:p-8 flex flex-col gap-8">
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <h2 className="text-xl font-semibold text-white/90">Detalle del Reclamo</h2>
            {detail.attachment_original_name && selectedId && (
              <a
                href={apiUrl(`/admin/complaints/${selectedId}/attachment`)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                <Download className="h-3.5 w-3.5" /> Adjunto
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {Object.entries(detail)
              .filter(([key]) => !['admin_notes', 'status', 'attachment_path'].includes(key))
              .map(([key, value]) => (
                <div key={key} className={key === 'detalle' || key === 'pedido' ? 'sm:col-span-2' : ''}>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{key.replace(/_/g, ' ')}</p>
                  <p className="break-words text-sm text-white/80">
                    {key === 'created_at' || key === 'updated_at'
                      ? formatDate(String(value ?? ''))
                      : String(value ?? '-')}
                  </p>
                </div>
              ))}
          </div>

          <Timeline
            heading="Historial de Asignaciones"
            emptyMessage="No hay asignaciones registradas."
            items={history.map((item) => ({
              date: item.assigned_at,
              icon: <UserCheck className="h-4 w-4" />,
              title: (
                <>
                  Asignado a <span className="font-medium text-white">{item.assigned_to_name}</span>
                  <span className="block text-white/45">por {item.assigned_by_name || 'Sistema'}</span>
                  {item.notes && <span className="mt-2 block border-l border-white/20 pl-2 text-white/55">“{item.notes}”</span>}
                </>
              ),
            }))}
          />

          <div className="pt-6 border-t border-white/5 flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/40">Agente</label>
                {isAssigning ? (
                  <div className="w-full rounded-lg bg-white/5 border border-white/5 px-3 py-2.5 text-sm text-white/40 text-center animate-pulse">Asignando...</div>
                ) : (
                  <CustomDropdown
                            value={String(detail.assigned_to ?? "")}
                            placeholder="Seleccionar..."
                            onChange={handleAssignCase}
                            options={[{ value: "", label: "Sin Asignar" }, ...adminsList]}
                            disabled={isReadOnly || !canAssign}
                          />
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/40">Estado</label>
                <CustomDropdown
                          value={status}
                          placeholder="Seleccionar estado..."
                          onChange={(val) => setStatus(val)}
                          options={statuses}
                          disabled={isReadOnly}
                        />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/40">Prioridad</label>
                <CustomDropdown
                  value={priority}
                  placeholder="Seleccionar..."
                  onChange={(val) => setPriority(val)}
                  options={priorities}
                  disabled={isReadOnly}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/40">Notas Internas</label>
              <textarea
                {...formProps}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Observaciones..."
                className="w-full resize-none rounded-lg bg-white/5 border border-white/5 px-3 py-2.5 text-sm text-white/80 outline-none focus:border-white/20 transition-colors custom-scrollbar"
              />
            </div>
          </div>

          <StatusHistoryTimeline records={statusHistory} />
        </div>

        <div className="p-6 border-t border-white/5 bg-[#0a0a0a]">
          <div className="grid grid-cols-2 gap-4">
            {detail.email ? (
              <a href={`mailto:${detail.email}`} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium transition hover:bg-white/10 text-white/80">
                <Mail className="h-4 w-4" /> Responder
              </a>
            ) : (
              <div />
            )}
            {isReadOnly ? (
              <p className="text-red-400 font-bold text-xs flex items-center justify-center">Este caso está cerrado y no admite modificaciones.</p>
            ) : (
              <button onClick={handleSave} className="flex items-center justify-center gap-2 rounded-lg bg-white text-black py-2.5 text-sm font-medium transition hover:bg-white/90">
              Guardar
            </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-120px)] font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <h1 className="text-2xl font-semibold tracking-wide text-white/90">Gestión de Reclamos</h1>
        <button onClick={loadList} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
        </button>
      </div>

      <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        
        {/* Panel Izquierdo: Lista */}
        <AdminPanel className="flex max-h-[calc(100vh-190px)] flex-col overflow-hidden lg:max-h-none">
          <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between bg-white/[0.01]">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Reclamos</span>
            <span className="bg-white/5 text-white/70 text-[10px] px-2 py-0.5 rounded font-medium">{complaints.length}</span>
          </div>
          <div className="divide-y divide-white/5 overflow-y-auto flex-1 custom-scrollbar">
            {listLoading ? (
              <div className="px-5 py-10 text-center text-white/30 text-sm">Cargando...</div>
            ) : complaints.length === 0 ? (
              <div className="px-5 py-10 text-center text-white/30 text-sm">No hay registros.</div>
            ) : (
              complaints.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadDetail(item.id)}
                  className={`w-full grid gap-2 px-5 py-4 text-left transition-colors duration-200 md:grid-cols-[1fr_auto] border-l-2 ${selectedId === item.id ? 'bg-white/5 border-white/40' : 'border-transparent hover:bg-white/[0.02]'}`}
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className={`truncate text-sm font-medium transition-colors ${selectedId === item.id ? 'text-white' : 'text-white/80'}`}>
                      {item.code} · {[item.nombres, item.apellidos].filter(Boolean).join(' ') || 'Sin nombre'}
                    </p>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/40">
                      <Tag className="h-3 w-3 shrink-0" />
                      <span className="truncate font-medium text-white/55">{item.tipo_reclamo || 'Tipo no especificado'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-white/30">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span className="font-medium text-white/40">{formatCardDate(item.created_at)}</span>
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 justify-start">
                    {item.assigned_to === admin.id ? (
                      <span className="h-fit rounded-md bg-[#06CFD6]/10 px-2 py-0.5 text-[10px] text-[#06CFD6] whitespace-nowrap flex items-center gap-1 border border-[#06CFD6]/20 shadow-[0_0_8px_rgba(6,207,214,0.15)]" title="Asignado a ti">
                        <UserCheck className="w-3 h-3" /> Mío
                      </span>
                    ) : item.assigned_to ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-white/30" title="Asignado a otro">
                        <UserCheck className="h-3 w-3" />
                      </span>
                    ) : null}
                    <span className="h-fit rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/60 whitespace-nowrap">
                      {statusLabel(item.status)}
                    </span>
                    {item.priority && priorityBadge(item.priority, item.priority_name!)}
                  </div>
                </button>
              ))
            )}
          </div>
          <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={listLoading} />
        </AdminPanel>

        {/* Panel Derecho: Detalle y Controles */}
        <AdminPanel className="hidden flex-col overflow-visible lg:flex">
          {renderDetailContent()}
        </AdminPanel>
      </section>

      <AnimatePresence>
        {mobileDetailOpen && detail && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileDetailOpen(false)}
          >
            <motion.div
              className="max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#060c1d] shadow-2xl custom-scrollbar"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#060c1d]/95 px-5 py-4 backdrop-blur">
                <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Detalle de reclamo</span>
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar detalle"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {renderDetailContent()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reclamos;
