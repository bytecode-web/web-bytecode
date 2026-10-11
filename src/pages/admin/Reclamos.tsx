import React, { useEffect, useState, useRef } from 'react';
import { IconBrandWhatsapp, IconBrandFacebook, IconBrandInstagram, IconBrandLinkedin, IconWorld, IconMail, IconPhone, IconShield } from '@tabler/icons-react';
import { useToastStore } from '../../stores/toastStore';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Mail, MessageSquareText, RefreshCw, Tag, X, UserCheck, Megaphone, Search, FilterX } from 'lucide-react';
import { apiRequest, apiUrl } from '../../lib/api';
import { forceDownload } from '../../lib/download';
import { formatLocalDate } from '../../lib/dateFormatter';
import StatusHistoryTimeline from '../../components/admin/StatusHistoryTimeline';
import Timeline from '../../components/ui/Timeline';
import type { StatusHistoryRecord } from '../../types/status';
import PaginationControl from '../../components/ui/PaginationControl';
import { useTerminalState } from '../../hooks/useTerminalState';
import { useOutletContext, useLocation, useSearchParams } from 'react-router-dom';
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
  tipo_doc?: string;
  person_type?: string;
  legal_response_due_at?: string;
  deleted_at?: string;
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

const channelIconMap: Record<string, { icon: any, color: string }> = {
  web: { icon: IconWorld, color: '#3b82f6' },
  whatsapp: { icon: IconBrandWhatsapp, color: '#25D366' },
  email: { icon: IconMail, color: '#ef4444' },
  linkedin: { icon: IconBrandLinkedin, color: '#0a66c2' },
  phone: { icon: IconPhone, color: '#8b5cf6' },
  facebook: { icon: IconBrandFacebook, color: '#1877f2' },
  instagram: { icon: IconBrandInstagram, color: '#e1306c' },
  admin: { icon: IconShield, color: '#64748b' }
};

// ... (skip to the component rendering)

const Reclamos: React.FC = () => {
  const { addToast } = useToastStore();
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const { isReadOnly } = useTerminalState({ isTerminal: Boolean(detail?.isTerminal) });
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('registered');
  const [priority, setPriority] = useState('normal');
  const [priorities, setPriorities] = useState<{ value: string, label: string }[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [statuses, setStatuses] = useState<{ value: string, label: string }[]>([]);
  const [globalHolidays, setGlobalHolidays] = useState<{ month: number, day: number, year: number | null }[]>([]);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRecord[]>([]);
  const [timeEvents, setTimeEvents] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [evidences, setEvidences] = useState<any[]>([]);
  const [complaintNotes, setComplaintNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [responseFormOpen, setResponseFormOpen] = useState(false);
  const [responseBody, setResponseBody] = useState('');
  const [resolutionType, setResolutionType] = useState('founded');
  const [isResponding, setIsResponding] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState({ total_activos: 0, por_vencer: 0, avg_resolution_days: 0 });

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterArchived, setFilterArchived] = useState('false');

  const [adminsList, setAdminsList] = useState<{ value: string, label: string }[]>([]);
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canAssign = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.reclamos.assign') === true;

  const statusLabel = (statusCode: string) => statuses.find((item) => item.value === statusCode)?.label ?? statusCode;

  const loadCatalogs = async () => {
    try {
      const res = await apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/statuses?domain=complaint');
      setStatuses([{ value: '', label: 'Todos los estados' }, ...res.items.map(s => ({ value: s.code, label: s.name }))]);
      const holRes = await apiRequest<{ items: { month: number, day: number, year: number | null }[] }>('/catalog/system-holidays');
      setGlobalHolidays(holRes.items);
      const prioRes = await apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/priorities');
      setPriorities(prioRes.items.map(s => ({ value: s.code, label: s.name })));
      const adminRes = await apiRequest<{ data: { id: string, name: string }[] }>('/admin/cases/assignment-options?domain=complaint');
      setAdminsList([
        { value: '', label: 'Cualquier agente' },
        ...adminRes.data.map(a => ({ value: a.id, label: a.name }))
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  const loadList = async () => {
    setListLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: ((page - 1) * PAGE_SIZE).toString(),
        archived: filterArchived
      });
      if (searchQuery) queryParams.append('search', searchQuery);
      if (filterUrgency) queryParams.append('urgency', filterUrgency);
      if (filterTipo) queryParams.append('tipo', filterTipo);
      if (filterOrigin) queryParams.append('origin', filterOrigin);
      if (filterAgent) queryParams.append('agent', filterAgent);

      const [result, metricsRes] = await Promise.all([
        apiRequest<{ data: ComplaintItem[]; total: number }>(`/admin/complaints?${queryParams.toString()}`),
        apiRequest<{ data: any }>('/admin/complaints/metrics')
      ]);
      if (result.data.length === 0 && result.total > 0 && page > 1) { setPage(page - 1); return; }
      setComplaints(result.data);
      setTotal(result.total);
      setMetrics(metricsRes.data);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo cargar la lista.', 'error');
    } finally {
      setListLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const [result, historyResult, assignmentResult, timeEventsResult, responsesResult, evidencesResult, notesResult] = await Promise.all([
          apiRequest<{ item: DetailItem }>(`/admin/complaints/${id}`),
          apiRequest<{ items: StatusHistoryRecord[] }>(`/admin/complaints/${id}/history`),
          apiRequest<{ items: any[] }>(`/admin/complaints/${id}/assignment-history`),
          apiRequest<{ items: any[] }>(`/admin/complaints/${id}/time-events`),
          apiRequest<{ items: any[] }>(`/admin/complaints/${id}/responses`),
          apiRequest<{ items: any[] }>(`/admin/complaints/${id}/evidences`),
          apiRequest<{ items: any[] }>(`/admin/complaints/${id}/notes`),
        ]);
        setDetail(result.item);
        setStatusHistory(historyResult.items);
        setHistory(assignmentResult.items);
        setTimeEvents(timeEventsResult.items);
        setResponses(responsesResult.items);
        setEvidences(evidencesResult.items);
        setComplaintNotes(notesResult.items);
        setResponseFormOpen(false);
        setResponseBody('');
        setResolutionType('founded');
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
  const [searchParams] = useSearchParams();
  const processedAutoOpenId = useRef<string | null>(null);

  useEffect(() => {
    void loadCatalogs();
  }, []);

  useEffect(() => {
    void loadList();
  }, [page]);

  useEffect(() => {
    const queryId = searchParams.get('id');
    if (queryId && queryId !== processedAutoOpenId.current) {
      processedAutoOpenId.current = queryId;
      void loadDetail(queryId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && 'autoOpenId' in location.state) {
      const stateObj = location.state as { autoOpenId: string, notificationTimestamp?: number };
      const autoOpenId = stateObj.autoOpenId;
      const uniqueId = stateObj.notificationTimestamp ? `${autoOpenId}-${stateObj.notificationTimestamp}` : autoOpenId;
      
      if (autoOpenId && uniqueId !== processedAutoOpenId.current) {
        processedAutoOpenId.current = uniqueId;
        void (async () => {
          await loadList();
          await loadDetail(autoOpenId);
        })();
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

  const [isUploadingEvidences, setIsUploadingEvidences] = useState(false);

  const handleInternalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedId || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const payload = new FormData();
    files.forEach(f => payload.append('archivosAdjuntos', f));

    setIsUploadingEvidences(true);
    try {
      await fetch(apiUrl(`/admin/complaints/${selectedId}/evidences`), {
        method: 'POST',
        headers: { 'X-CSRF-Token': localStorage.getItem('csrf_token') || '' },
        body: payload,
      });
      addToast('Evidencias subidas exitosamente.', 'success');
      await loadDetail(selectedId);
    } catch (err) {
      addToast('Error al subir evidencias.', 'error');
    } finally {
      setIsUploadingEvidences(false);
      e.target.value = '';
    }
  };

  const handleAddNote = async () => {
    if (!selectedId || !newNote.trim()) return;
    setIsAddingNote(true);
    try {
      await apiRequest(`/admin/complaints/${selectedId}/notes`, {
        method: 'POST',
        json: { note_text: newNote },
      });
      setNewNote('');
      addToast('Nota interna agregada.', 'success');
      await loadDetail(selectedId);
    } catch (err) {
      addToast('Error al agregar nota.', 'error');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleSendResponse = async () => {
    if (!selectedId) return;
    if (responseBody.trim().length < 10) {
      addToast('La respuesta debe ser más detallada (mínimo 10 caracteres).', 'error');
      return;
    }
    setIsResponding(true);
    try {
      await apiRequest(`/admin/complaints/${selectedId}/responses`, {
        method: 'POST',
        json: { response_body: responseBody, final_status_code: resolutionType }
      });
      addToast('Respuesta enviada y reclamo cerrado exitosamente.', 'success');
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al enviar la respuesta.', 'error');
    } finally {
      setIsResponding(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedId || !window.confirm('¿Está seguro de archivar este reclamo? Se ocultará de la lista principal.')) return;
    try {
      await apiRequest(`/admin/complaints/${selectedId}/archive`, { method: 'POST' });
      addToast('Reclamo archivado.', 'success');
      setSelectedId(null);
      setDetail(null);
      loadList();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al archivar', 'error');
    }
  };

  const handlePurge = async () => {
    if (!selectedId || !detail?.code) return;
    const confirmCode = window.prompt(`Esta acción DESTRUIRÁ FÍSICAMENTE el reclamo y todos sus datos forenses.\nEscriba el código exacto del reclamo (${detail.code}) para confirmar:`);
    if (confirmCode !== detail.code) {
      if (confirmCode !== null) addToast('Código incorrecto. Operación cancelada.', 'error');
      return;
    }
    const adminPassword = window.prompt('Por seguridad, ingrese su contraseña de administrador para autorizar la purga:');
    if (!adminPassword) {
      addToast('Operación cancelada. Se requiere contraseña.', 'error');
      return;
    }
    
    try {
      await apiRequest(`/admin/complaints/${selectedId}/purge`, { 
        method: 'DELETE',
        json: { password: adminPassword }
      });
      addToast('Reclamo purgado físicamente.', 'success');
      setSelectedId(null);
      setDetail(null);
      loadList();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al purgar', 'error');
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

    let slaColorClass = 'bg-white/5 text-white/50 border-white/10';
    let slaLabel = 'Cerrado / Respondido';

    if (!isReadOnly && detail.legal_response_due_at) {
      const dueDate = new Date(detail.legal_response_due_at);
      const now = new Date();
      let diffDays = 0;
      const isOverdue = now > dueDate;
      const startCalc = isOverdue ? new Date(dueDate) : new Date(now);
      const endCalc = isOverdue ? new Date(now) : new Date(dueDate);
      startCalc.setHours(0,0,0,0);
      endCalc.setHours(0,0,0,0);
      let current = new Date(startCalc);
      while (current < endCalc) {
        const day = current.getDay();
        const offsetDate = new Date(current.getTime() - (current.getTimezoneOffset() * 60000));
        
        let isHoliday = false;
        if (day !== 0 && day !== 6) {
          const m = offsetDate.getMonth() + 1;
          const d = offsetDate.getDate();
          const y = offsetDate.getFullYear();
          isHoliday = globalHolidays.some(h => h.month === m && h.day === d && (h.year === null || h.year === y));
        }

        if (day !== 0 && day !== 6 && !isHoliday) {
          diffDays++;
        }
        current.setDate(current.getDate() + 1);
      }
      diffDays = isOverdue ? -diffDays : diffDays;
      
      
      if (diffDays > 7) {
        slaColorClass = 'bg-green-500/20 text-green-400 border-green-500/30';
        slaLabel = `Quedan ${diffDays} días hábiles`;
      } else if (diffDays >= 3) {
        slaColorClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        slaLabel = `Quedan ${diffDays} días hábiles`;
      } else {
        slaColorClass = 'bg-red-500/20 text-red-400 border-red-500/30';
        slaLabel = diffDays < 0 ? `Vencido hace ${Math.abs(diffDays)} días` : diffDays === 0 ? '¡Vence hoy!' : `¡Vence en ${diffDays} días!`;
      }
    }

    return (
      <div className="flex flex-col">
        <div className="p-6 lg:p-8 flex flex-col gap-8">
          {/* Cabecera del expediente con semáforo SLA */}
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-white/90">Detalle del Reclamo</h2>
              <div className={"mt-1 w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border " + slaColorClass}>
                {slaLabel}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {detail.source_channel && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wider font-semibold border border-white/10" style={{ color: String(detail.channel_color || channelIconMap[String(detail.source_channel)]?.color || '#888') }}>
                  {React.createElement(channelIconMap[String(detail.source_channel)]?.icon || IconWorld, { size: 14 })}
                  {String(detail.source_channel)}
                </span>
              )}
              {detail.code && (
                <span className="text-sm font-mono text-white/50">
                  #{String(detail.code)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Ficha del Reclamante */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">Ficha del Reclamante</h3>
                {String(detail.tipo_doc) === 'RUC' || String(detail.person_type) === 'company' ? (
                  <span className="inline-flex items-center gap-1.5 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/30 uppercase tracking-wide">
                    B2B {String(detail.tipo_doc) === 'RUC' ? '- Empresa Local' : '- Entidad Extranjera'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/30 uppercase tracking-wide">
                    B2C Consumidor
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Nombre / Razón Social</p><p className="text-sm text-white/80 font-medium">{detail.nombres} {detail.apellidos}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Documento</p><p className="text-sm text-white/80">{detail.tipo_doc}: {detail.numero_doc}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Email</p><p className="text-sm text-white/80">{detail.email}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Teléfono</p><p className="text-sm text-white/80">{detail.prefijo_telefono} {detail.telefono}</p></div>
                <div className="col-span-2"><p className="text-[10px] uppercase text-white/40 mb-1">Domicilio</p><p className="text-sm text-white/80">{detail.domicilio || 'No especificado'}</p></div>
              </div>
            </div>

            {/* Ficha del Bien o Servicio */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50 border-b border-white/5 pb-2">Ficha del Bien o Servicio</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Clasificación</p><p className="text-sm text-white/80">{detail.good_type === 'product' ? 'Producto' : detail.good_type === 'service' ? 'Servicio' : String(detail.good_type || '-')} / {detail.tipo_reclamo}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Proyecto / Unidad</p><p className="text-sm text-white/80">{detail.nombre_unidad || 'N/A'}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Monto Implicado</p><p className="text-sm font-mono text-cyan-400 font-medium">{detail.monto_cuantificable ? `${detail.currency_code || 'PEN'} ${detail.monto_cuantificable}` : 'No especificado'}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Comprobante (Factura/Boleta)</p><p className="text-sm text-white/80">{detail.invoice_number || 'N/A'}</p></div>
                <div className="col-span-2"><p className="text-[10px] uppercase text-white/40 mb-1">Descripción de la Adquisición</p><p className="text-sm text-white/80">{detail.descripcion}</p></div>
              </div>
            </div>

            {/* Cuerpo Fáctico y Petitorio */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50 border-b border-white/5 pb-2">Cuerpo Fáctico y Petitorio</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[10px] uppercase text-white/40 mb-1">Detalle del Reclamo/Queja</p>
                  <div className="text-sm text-white/80 bg-white/5 p-4 rounded-md whitespace-pre-wrap leading-relaxed">{detail.detalle}</div>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-white/40 mb-1">Solución Solicitada (Petitorio)</p>
                  <div className="text-sm text-white/90 bg-cyan-950/20 p-4 rounded-md whitespace-pre-wrap leading-relaxed border-l-2 border-cyan-500 font-medium">
                    {detail.pedido}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Metadata Forense */}
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-[10px] uppercase text-white/40 mb-1">IP de Registro</p><p className="text-xs text-white/60 font-mono">{detail.customer_ip || '-'}</p></div>
              <div><p className="text-[10px] uppercase text-white/40 mb-1">User Agent</p><p className="text-xs text-white/60 font-mono truncate" title={String(detail.customer_user_agent || '')}>{detail.customer_user_agent || '-'}</p></div>
            </div>
            
            {/* Gestor de Evidencias */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">Evidencias y Adjuntos</h3>
                {!isReadOnly && (
                  <button onClick={() => document.getElementById('internal-evidence-upload')?.click()} disabled={isUploadingEvidences} className="text-[10px] bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1.5 rounded font-medium flex items-center gap-1 transition disabled:opacity-50">
                    {isUploadingEvidences ? 'Subiendo...' : '+ Adjuntar Prueba Interna'}
                  </button>
                )}
                <input id="internal-evidence-upload" type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleInternalUpload} />
              </div>
              
              {(!evidences || evidences.length === 0) ? (
                <p className="text-sm text-white/40 text-center py-4">No hay evidencias adjuntas.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {evidences.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between p-3 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition">
                      <div className="flex flex-col overflow-hidden mr-3">
                        <span className="text-xs font-medium text-white/90 truncate" title={ev.original_name}>{ev.original_name}</span>
                        <span className="text-[10px] text-white/40 mt-0.5">{new Date(ev.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(ev.mime_type?.startsWith('image/') || ev.mime_type === 'application/pdf') && (
                          <button onClick={() => window.open(ev.public_url || apiUrl(`/admin/complaints/${selectedId}/attachment?fileId=${ev.id}`), '_blank')} className="text-[10px] font-medium text-cyan-400 hover:bg-cyan-500/10 px-2 py-1 rounded transition">Ver</button>
                        )}
                        <button onClick={() => forceDownload(ev.public_url || apiUrl(`/admin/complaints/${selectedId}/attachment?fileId=${ev.id}`), ev.original_name)} className="text-[10px] font-medium text-white/70 hover:bg-white/10 px-2 py-1 rounded transition">Descargar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                            options={adminsList}
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
            {/* Bloc de Notas Internas */}
            <div className="flex flex-col gap-3">
              <label className="block text-xs font-semibold uppercase tracking-widest text-white/50">Bloc de Notas Internas</label>
              
              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {complaintNotes.map(note => (
                  <div key={note.id} className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-amber-400">{note.author_name || 'Sistema'}</span>
                      <span className="text-[10px] text-white/40">{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-white/80 whitespace-pre-wrap">{note.note_text}</p>
                  </div>
                ))}
                {complaintNotes.length === 0 && <p className="text-xs text-white/40 italic">No hay notas internas.</p>}
              </div>

              {!isReadOnly && (
                <div className="flex gap-2 mt-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                    placeholder="Escribe una nueva nota interna..."
                    className="flex-1 resize-none rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90 outline-none focus:border-amber-500/50 transition-colors custom-scrollbar"
                  />
                  <button 
                    onClick={handleAddNote} 
                    disabled={isAddingNote || !newNote.trim()} 
                    className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 rounded-lg transition disabled:opacity-50 text-xs"
                  >
                    {isAddingNote ? 'Agregando...' : 'Agregar'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <StatusHistoryTimeline records={statusHistory} />
            
            {timeEvents.length > 0 && (
              <div className="mt-6">
                <Timeline 
                  heading="Trazabilidad SLA (Caja Negra)" 
                  items={timeEvents.map(te => ({
                    date: te.created_at,
                    title: (
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-semibold text-cyan-400">{te.event_type}</span>
                        {te.metadata && te.event_type === 'SUBMITTED_AND_CALCULATED' && (
                          <div className="bg-white/5 border border-white/10 rounded-md p-3 text-xs text-white/70 font-mono mt-1">
                            <p><strong className="text-white/90">Registro Oficial:</strong> {new Date(te.metadata.base_date || te.created_at).toLocaleString()}</p>
                            <p><strong className="text-white/90">Plazo (Días Hábiles):</strong> {te.metadata.business_days_allotted || 15}</p>
                            <p><strong className="text-white/90">Fines de Semana (Saltados):</strong> {te.metadata.skipped_weekends || 0}</p>
                            <p><strong className="text-white/90">Feriados (Saltados):</strong> {Array.isArray(te.metadata.skipped_holidays) && te.metadata.skipped_holidays.length > 0 ? te.metadata.skipped_holidays.join(', ') : 'Ninguno'}</p>
                            <p className="mt-2 pt-2 border-t border-white/10 text-amber-400 font-bold uppercase tracking-wider">
                              Vencimiento: {te.metadata.calculated_due_date ? new Date(te.metadata.calculated_due_date).toLocaleString() : 'N/A'}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  }))} 
                  emptyMessage="No hay eventos de SLA." 
                />
              </div>
            )}
            {responses.length > 0 && (
              <div className="mt-6 border-t border-white/5 pt-6">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">Historial de Respuestas Oficiales</h3>
                <div className="flex flex-col gap-4">
                  {responses.map(r => (
                    <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-cyan-400">{r.admin_name}</span>
                        <span className="text-[10px] text-white/40">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-white/80 whitespace-pre-wrap">{r.response_body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        <div className="p-6 border-t border-white/5 bg-[#0a0a0a] flex flex-col gap-4">
            {responseFormOpen ? (
              <div className="rounded-lg border border-white/10 p-4 bg-white/[0.02] flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-white/90">Respuesta Oficial</h4>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input type="radio" checked={resolutionType === 'founded'} onChange={() => setResolutionType('founded')} className="accent-cyan-500" />
                    Fundado (Procede)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input type="radio" checked={resolutionType === 'unfounded'} onChange={() => setResolutionType('unfounded')} className="accent-cyan-500" />
                    Infundado (No Procede)
                  </label>
                </div>
                <textarea
                  value={responseBody}
                  onChange={(e) => setResponseBody(e.target.value)}
                  placeholder="Detalle de la resolución oficial a enviar al cliente..."
                  className="min-h-[120px] w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-y custom-scrollbar"
                />
                <div className="flex justify-end gap-3 mt-2">
                  <button onClick={() => setResponseFormOpen(false)} className="px-4 py-2 text-sm text-white/70 hover:text-white transition">Cancelar</button>
                  <button onClick={handleSendResponse} disabled={isResponding} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-50">
                    {isResponding ? 'Enviando...' : 'Enviar y Cerrar Reclamo'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {!isReadOnly && detail.email ? (
                    <button onClick={() => setResponseFormOpen(true)} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium transition hover:bg-white/10 text-white/80">
                      <Mail className="h-4 w-4" /> Responder Oficialmente
                    </button>
                  ) : (
                    <div />
                  )}
                  {isReadOnly ? (
                    <p className="text-red-400 font-bold text-xs flex items-center justify-center text-center">Este caso está cerrado y no admite modificaciones.</p>
                  ) : (
                    <button onClick={handleSave} className="flex items-center justify-center gap-2 rounded-lg bg-white text-black py-2.5 text-sm font-medium transition hover:bg-white/90">
                      Guardar Cambios
                    </button>
                  )}
                </div>
                {/* Protocolo de Retención */}
                {(isReadOnly || filterArchived === 'true') && (
                  <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
                    {filterArchived === 'false' && (
                      <button onClick={handleArchive} className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 py-2.5 text-sm font-medium transition hover:bg-amber-500/20">
                        <Tag className="h-4 w-4" /> Archivar Expediente (Retención Legal)
                      </button>
                    )}
                    {filterArchived === 'true' && admin.roles.includes('super_admin') && (
                      <button onClick={handlePurge} className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 py-2.5 text-sm font-medium transition hover:bg-red-500/20">
                        <FilterX className="h-4 w-4" /> Purga Física (Destrucción Total)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    };

  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-120px)] font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Gestión de Reclamos</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Libro de reclamaciones</p>
          </div>
        </div>
        <button onClick={loadList} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
        </button>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">Total Activos</span>
          <span className="text-2xl font-bold text-white/90">{metrics?.total_activos || 0}</span>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-red-400/80 font-semibold">Por Vencer (≤ 7 días)</span>
          <span className="text-2xl font-bold text-red-400">{metrics?.por_vencer || 0}</span>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-cyan-400/80 font-semibold">Tiempo Prom. Resolución</span>
          <span className="text-2xl font-bold text-cyan-400">{Number(metrics?.avg_resolution_days || 0).toFixed(1)} días</span>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        
        {/* Panel Izquierdo: Lista */}
        <AdminPanel className="flex max-h-[calc(100vh-190px)] flex-col overflow-hidden lg:max-h-none">
          <div className="border-b border-white/5 px-5 py-4 flex flex-col gap-4 bg-white/[0.01]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Reclamos</span>
              <span className="bg-white/5 text-white/70 text-[10px] px-2 py-0.5 rounded font-medium">{total}</span>
            </div>
            
            {/* Filter Bar */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadList()}
                  className="w-full rounded-md border border-white/10 bg-black/50 pl-9 pr-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                <select
                  value={filterUrgency}
                  onChange={(e) => setFilterUrgency(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Cualquier Urgencia (SLA)</option>
                  <option value="vencido">Vencidos</option>
                  <option value="proximo">Próximos a vencer (≤ 7 días)</option>
                  <option value="en_plazo">En plazo (&gt; 7 días)</option>
                </select>
                <select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Cualquier Tipo</option>
                  <option value="b2b">B2B (Empresas)</option>
                  <option value="b2c">B2C (Consumidores)</option>
                  <option value="reclamo">Reclamos</option>
                  <option value="queja">Quejas</option>
                </select>
                <select
                  value={filterOrigin}
                  onChange={(e) => setFilterOrigin(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Cualquier Origen</option>
                  <option value="nacional">Nacional (PE)</option>
                  <option value="internacional">Internacional</option>
                </select>
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-cyan-500/50"
                >
                  {adminsList.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <select
                  value={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-cyan-500/50"
                >
                  <option value="false">Activos</option>
                  <option value="true">Archivados</option>
                </select>
                <button
                  onClick={loadList}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10"
                >
                  <FilterX className="h-3 w-3" /> Filtrar
                </button>
              </div>
            </div>
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
                    <div className="flex gap-1.5 flex-wrap">
                      {item.claim_type === 'Reclamo' && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-medium text-red-400 border border-red-500/30 uppercase">Reclamo</span>}
                      {item.claim_type === 'Queja' && <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-medium text-orange-400 border border-orange-500/30 uppercase">Queja</span>}
                      
                      {(item.tipo_doc === 'RUC' || item.person_type === 'company') ? (
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-medium text-blue-400 border border-blue-500/30 uppercase">B2B</span>
                      ) : (
                        <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-medium text-purple-400 border border-purple-500/30 uppercase">B2C</span>
                      )}

                      {item.telefono?.startsWith('+51') ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 border border-emerald-500/30 uppercase">Nacional PE</span>
                      ) : (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 border border-amber-500/30 uppercase">Internacional</span>
                      )}
                    </div>
                    <span className="flex items-center gap-1.5 text-[10px] text-white/30 mt-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span className="font-medium text-white/40">{formatLocalDate(item.created_at, 'date-medium')}</span>
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 justify-start">
                    <span className="h-fit rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/60 whitespace-nowrap">
                      {statusLabel(item.status)}
                    </span>
                    {item.priority && priorityBadge(item.priority, item.priority_name!)}
                    {item.assigned_to === admin.id ? (
                      <span className="h-fit rounded-md bg-[#06CFD6]/10 px-2 py-0.5 text-[10px] text-[#06CFD6] whitespace-nowrap flex items-center gap-1 border border-[#06CFD6]/20 shadow-[0_0_8px_rgba(6,207,214,0.15)]" title="Asignado a ti">
                        <UserCheck className="w-3 h-3" /> Mío
                      </span>
                    ) : item.assigned_to ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-white/30" title="Asignado a otro">
                        <UserCheck className="h-3 w-3" />
                      </span>
                    ) : null}
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
