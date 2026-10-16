import React, { useEffect, useState, useRef, useMemo } from 'react';
import { IconBrandWhatsapp, IconBrandFacebook, IconBrandInstagram, IconBrandLinkedin, IconWorld, IconMail, IconPhone, IconShield } from '@tabler/icons-react';
import { useToastStore } from '../../stores/toastStore';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Mail, MessageSquareText, RefreshCw, Tag, X, UserCheck, Megaphone, Search, FilterX, Paperclip, FileText, Eye, EyeOff, Trash2, Download, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { apiRequest, apiUrl } from '../../lib/api';
import { forceDownload } from '../../lib/download';
import { formatLocalDate, formatLegalDualDate, alignLegalDueDate } from '../../lib/dateFormatter';
import StatusHistoryTimeline from '../../components/admin/StatusHistoryTimeline';
import Timeline from '../../components/ui/Timeline';
import type { StatusHistoryRecord } from '../../types/status';
import PaginationControl from '../../components/ui/PaginationControl';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import ShineBorder from '../../components/ui/shine-border';
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
  b2_type?: string;
  organization_id?: string;
  legal_name?: string;
  legal_response_due_at?: string;
  deleted_at?: string;
  country_id?: string | null;
  country_name?: string | null;
  country_iso2?: string | null;
  country_dial_code?: string | null;
}

export const isComplaintB2B = (item: {
  b2_type?: string;
  person_type?: string;
  tipo_doc?: string;
  organization_id?: string | null;
}): boolean => {
  if (item.b2_type === 'B2B') return true;
  if (item.b2_type === 'B2C') return false;
  return Boolean(
    item.organization_id ||
    item.person_type === 'empresa' ||
    item.person_type === 'company' ||
    item.person_type === 'company_contact' ||
    item.tipo_doc === 'RUC'
  );
};

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

interface CatalogCache {
  statuses: { value: string; label: string }[];
  globalHolidays: { month: number; day: number; year: number | null }[];
  priorities: { value: string; label: string }[];
  adminsList: { value: string; label: string }[];
  timestamp: number;
}

let catalogCache: CatalogCache | null = null;
const CATALOG_TTL_MS = 15 * 60 * 1000;

interface ComplaintFullResponse {
  item: DetailItem;
  page?: number;
  history: StatusHistoryRecord[];
  assignmentHistory: AssignmentHistoryItem[];
  timeEvents: any[];
  responses: any[];
  evidences: any[];
  notes: any[];
}

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

const formatPhone = (phone?: string | null, dialCode?: string | null): React.ReactNode => {
  if (!phone) return '-';
  let rawPhone = String(phone).trim();
  if (!rawPhone) return '-';

  let prefix = dialCode ? dialCode.trim() : '';

  const match = rawPhone.match(/^(\+\d{1,4})\s*(.*)$/);
  if (match) {
    prefix = match[1];
    rawPhone = match[2];
  } else if (prefix) {
    const dialDigits = prefix.replace(/\D/g, '');
    if (dialDigits && rawPhone.startsWith(dialDigits)) {
      rawPhone = rawPhone.substring(dialDigits.length).trim();
    }
  }

  if (prefix) {
    const formattedPrefix = prefix.startsWith('(') ? prefix : `(${prefix.startsWith('+') ? prefix : `+${prefix}`})`;
    return (
      <>
        <span className="text-white/45 font-normal mr-1.5">{formattedPrefix}</span>
        <span>{rawPhone}</span>
      </>
    );
  }

  return rawPhone;
};

const Reclamos: React.FC = () => {
  const { addToast } = useToastStore();
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const { isReadOnly } = useTerminalState({ isTerminal: Boolean(detail?.isTerminal ?? detail?.is_terminal) });
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
  const [responseFiles, setResponseFiles] = useState<File[]>([]);
  const responseFileInputRef = useRef<HTMLInputElement>(null);
  const [isResponding, setIsResponding] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleResponseFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const incoming = Array.from(e.target.files);
    
    if (responseFiles.length + incoming.length > 5) {
      addToast('Puede adjuntar un máximo de 5 archivos a la respuesta oficial.', 'error');
      e.target.value = '';
      return;
    }

    for (const f of incoming) {
      if (f.size > 8 * 1024 * 1024) {
        addToast(`El archivo "${f.name}" supera el límite máximo de 8MB.`, 'error');
        e.target.value = '';
        return;
      }

      if (responseFiles.some(existing => existing.name === f.name && existing.size === f.size)) {
        addToast(`El archivo "${f.name}" ya está seleccionado en la lista de adjuntos.`, 'error');
        e.target.value = '';
        return;
      }

      if (evidences.some(ev => ev.original_name && ev.original_name.toLowerCase() === f.name.toLowerCase())) {
        addToast(`El archivo "${f.name}" ya fue adjuntado como evidencia por el reclamante. Adjunte un archivo diferente.`, 'error');
        e.target.value = '';
        return;
      }
    }

    setResponseFiles(prev => [...prev, ...incoming]);
    e.target.value = '';
  };

  const handleRemoveResponseFile = (index: number) => {
    setResponseFiles(prev => prev.filter((_, i) => i !== index));
  };
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState({ total_activos: 0, por_vencer: 0, avg_resolution_days: 0 });

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterArchived, setFilterArchived] = useState('false');

  // Retention & Purge Modals state
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeConfirmCode, setPurgeConfirmCode] = useState('');
  const [purgePassword, setPurgePassword] = useState('');
  const [showPurgePassword, setShowPurgePassword] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const [adminsList, setAdminsList] = useState<{ value: string, label: string }[]>([]);
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canAssign = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.reclamos.assign') === true;

  const statusLabel = (statusCode: string) => statuses.find((item) => item.value === statusCode)?.label ?? statusCode;

  const detailStatusOptions = useMemo(() => {
    return statuses.filter((item) => Boolean(item.value) && item.value !== 'founded' && item.value !== 'unfounded');
  }, [statuses]);

  const urgencyOptions = useMemo(() => [
    { value: '', label: 'Cualquier Urgencia' },
    { value: 'vencido', label: 'Vencidos' },
    { value: 'proximo', label: 'Por vencer (≤ 7d)' },
    { value: 'en_plazo', label: 'En plazo (> 7d)' },
  ], []);

  const tipoOptions = useMemo(() => [
    { value: '', label: 'Cualquier Tipo' },
    { value: 'b2b', label: 'B2B (Empresas)' },
    { value: 'b2c', label: 'B2C (Consumidores)' },
    { value: 'reclamo', label: 'Reclamos' },
    { value: 'queja', label: 'Quejas' },
  ], []);

  const originOptions = useMemo(() => [
    { value: '', label: 'Cualquier Origen' },
    { value: 'nacional', label: 'Nacional (PE)' },
    { value: 'internacional', label: 'Internacional' },
  ], []);

  const agentOptions = useMemo(() => {
    if (!adminsList || adminsList.length === 0) {
      return [{ value: '', label: 'Cualquier Agente' }];
    }
    return adminsList.map(a => ({
      value: a.value,
      label: a.value === '' ? 'Cualquier Agente' : a.label
    }));
  }, [adminsList]);

  const archivedOptions = useMemo(() => [
    { value: 'false', label: 'Casos Activos' },
    { value: 'true', label: 'Casos Archivados' },
  ], []);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    filterUrgency ||
    filterTipo ||
    filterOrigin ||
    filterAgent ||
    filterArchived === 'true'
  );

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setFilterUrgency('');
    setFilterTipo('');
    setFilterOrigin('');
    setFilterAgent('');
    setFilterArchived('false');
  };

  const loadCatalogs = async () => {
    if (catalogCache && Date.now() - catalogCache.timestamp < CATALOG_TTL_MS) {
      setStatuses(catalogCache.statuses);
      setGlobalHolidays(catalogCache.globalHolidays);
      setPriorities(catalogCache.priorities);
      setAdminsList(catalogCache.adminsList);
      return;
    }
    try {
      const [res, holRes, prioRes, adminRes] = await Promise.all([
        apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/statuses?domain=complaint'),
        apiRequest<{ items: { month: number, day: number, year: number | null }[] }>('/catalog/system-holidays'),
        apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/priorities'),
        apiRequest<{ data: { id: string, name: string }[] }>('/admin/cases/assignment-options?domain=complaint')
      ]);

      const formattedStatuses = res.items.map(s => ({ value: s.code, label: s.name }));
      const formattedPriorities = prioRes.items.map(s => ({ value: s.code, label: s.name }));
      const formattedAdmins = [
        { value: '', label: 'Cualquier agente' },
        ...adminRes.data.map(a => ({ value: a.id, label: a.name }))
      ];

      setStatuses(formattedStatuses);
      setGlobalHolidays(holRes.items);
      setPriorities(formattedPriorities);
      setAdminsList(formattedAdmins);

      catalogCache = {
        statuses: formattedStatuses,
        globalHolidays: holRes.items,
        priorities: formattedPriorities,
        adminsList: formattedAdmins,
        timestamp: Date.now(),
      };
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
      const activeSearch = debouncedSearchQuery.trim();
      if (activeSearch) queryParams.append('search', activeSearch);
      if (filterUrgency) queryParams.append('urgency', filterUrgency);
      if (filterTipo) queryParams.append('tipo', filterTipo);
      if (filterOrigin) queryParams.append('origin', filterOrigin);
      if (filterAgent) queryParams.append('agent', filterAgent);

      const [result, metricsRes] = await Promise.all([
        apiRequest<{ data: ComplaintItem[]; total: number }>(`/admin/complaints?${queryParams.toString()}`),
        apiRequest<{ data: any }>('/admin/complaints/metrics')
      ]);
      if (result.data.length === 0 && result.total > 0 && page > 1) { setPage(page - 1); return; }
      const uniqueComplaints = Array.from(new Map(result.data.map((item) => [item.id, item])).values());
      setComplaints(uniqueComplaints);
      setTotal(result.total);
      setMetrics(metricsRes.data);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo cargar la lista.', 'error');
    } finally {
      setListLoading(false);
    }
  };

  const loadDetail = async (id: string, syncPage = false) => {
    setSelectedId(id);
    try {
      const result = await apiRequest<ComplaintFullResponse>(`/admin/complaints/${id}/full?limit=${PAGE_SIZE}`);
      setDetail(result.item);
      if (syncPage && result.page && result.page !== page) {
        setPage(result.page);
      }
      setStatusHistory(result.history);
      setHistory(result.assignmentHistory);
      setTimeEvents(result.timeEvents);
      setResponses(result.responses);
      setEvidences(result.evidences);
      setComplaintNotes(result.notes);
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

  const isInitialFilterMount = useRef(true);

  useEffect(() => {
    if (isInitialFilterMount.current) {
      isInitialFilterMount.current = false;
      return;
    }
    if (page === 1) {
      void loadList();
    } else {
      setPage(1);
    }
  }, [debouncedSearchQuery, filterUrgency, filterTipo, filterOrigin, filterAgent, filterArchived]);

  useEffect(() => {
    const queryId = searchParams.get('id');
    if (queryId && queryId !== processedAutoOpenId.current) {
      processedAutoOpenId.current = queryId;
      void loadDetail(queryId, true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && 'autoOpenId' in location.state) {
      const stateObj = location.state as { autoOpenId: string, notificationTimestamp?: number };
      const autoOpenId = stateObj.autoOpenId;
      const uniqueId = stateObj.notificationTimestamp ? `${autoOpenId}-${stateObj.notificationTimestamp}` : autoOpenId;
      
      if (autoOpenId && uniqueId !== processedAutoOpenId.current) {
        processedAutoOpenId.current = uniqueId;
        void loadDetail(autoOpenId, true);
        window.history.replaceState({}, '');
      }
    }
  }, [location.state]);

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      const payload: Record<string, any> = {
        adminNotes: notes,
        priority,
      };
      if (status && !['founded', 'unfounded'].includes(status)) {
        payload.status = status;
      }
      const result = await apiRequest<{ item: DetailItem }>(`/admin/complaints/${selectedId}`, {
        method: 'PATCH',
        json: payload,
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

    if (files.length > 5) {
      addToast('Puede adjuntar un máximo de 5 evidencias a la vez.', 'error');
      e.target.value = '';
      return;
    }

    const seenNames = new Set<string>();
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) {
        addToast(`El archivo "${f.name}" supera el límite máximo de 8MB.`, 'error');
        e.target.value = '';
        return;
      }

      if (seenNames.has(f.name.toLowerCase())) {
        addToast(`El archivo "${f.name}" se encuentra duplicado entre los archivos seleccionados.`, 'error');
        e.target.value = '';
        return;
      }
      seenNames.add(f.name.toLowerCase());

      if (evidences.some(ev => ev.original_name && ev.original_name.toLowerCase() === f.name.toLowerCase())) {
        addToast(`El archivo "${f.name}" ya se encuentra vinculado como evidencia en este reclamo.`, 'error');
        e.target.value = '';
        return;
      }
    }

    const payload = new FormData();
    files.forEach(f => payload.append('archivosAdjuntos', f));

    setIsUploadingEvidences(true);
    try {
      await apiRequest(`/admin/complaints/${selectedId}/evidences`, {
        method: 'POST',
        body: payload,
      });
      addToast('Evidencias subidas exitosamente.', 'success');
      await loadDetail(selectedId);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al subir evidencias.', 'error');
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
      const payload = new FormData();
      payload.append('response_body', responseBody);
      payload.append('final_status_code', resolutionType);
      responseFiles.forEach(f => {
        payload.append('archivosAdjuntos', f);
      });

      await apiRequest(`/admin/complaints/${selectedId}/responses`, {
        method: 'POST',
        body: payload,
      });
      addToast('Respuesta enviada y reclamo cerrado exitosamente.', 'success');
      setResponseFormOpen(false);
      setResponseBody('');
      setResponseFiles([]);
      await loadList();
      await loadDetail(selectedId);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al enviar la respuesta.', 'error');
    } finally {
      setIsResponding(false);
    }
  };

  const handleOpenArchive = () => {
    if (!selectedId) return;
    setArchiveModalOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (!selectedId) return;
    setIsArchiving(true);
    try {
      await apiRequest(`/admin/complaints/${selectedId}/archive`, { method: 'POST' });
      addToast('Expediente archivado en custodia de retención legal.', 'success');
      setArchiveModalOpen(false);
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al archivar', 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleOpenPurge = () => {
    if (!selectedId || !detail?.code) return;
    setPurgeConfirmCode('');
    setPurgePassword('');
    setShowPurgePassword(false);
    setPurgeModalOpen(true);
  };

  const handleConfirmPurge = async () => {
    if (!selectedId || !detail?.code) return;
    if (purgeConfirmCode.trim().toUpperCase() !== String(detail.code).trim().toUpperCase()) {
      addToast(`El código de confirmación no coincide con ${detail.code}.`, 'error');
      return;
    }
    if (!purgePassword) {
      addToast('Ingrese su contraseña de Super Administrador para autorizar la purga.', 'error');
      return;
    }

    setIsPurging(true);
    try {
      await apiRequest(`/admin/complaints/${selectedId}/purge`, { 
        method: 'DELETE',
        json: { 
          password: purgePassword,
          confirm_code: purgeConfirmCode.trim()
        }
      });
      addToast('Expediente purgado y destruido físicamente de la base de datos.', 'success');
      setPurgeModalOpen(false);
      setPurgeConfirmCode('');
      setPurgePassword('');
      setSelectedId(null);
      setDetail(null);
      setSearchQuery('');
      setDebouncedSearchQuery('');
      await loadList();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al purgar el reclamo.', 'error');
    } finally {
      setIsPurging(false);
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

    const isTerminal = Boolean(detail.isTerminal ?? detail.is_terminal) || ['founded', 'unfounded', 'closed', 'rejected', 'resolved'].includes(String(detail.status).toLowerCase());
    const isArchived = Boolean(detail.archived_at || detail.deleted_at);

    const officialResponseDate = (() => {
      const timeEv = timeEvents.find(te => te.event_type === 'OFFICIAL_RESPONSE_SENT');
      if (timeEv?.created_at) return new Date(timeEv.created_at);
      if (timeEv?.metadata?.sent_at) return new Date(timeEv.metadata.sent_at);
      if (responses && responses.length > 0 && responses[0]?.created_at) {
        return new Date(responses[0].created_at);
      }
      if (detail.updated_at) return new Date(String(detail.updated_at));
      return null;
    })();

    const dueDate = detail.legal_response_due_at ? alignLegalDueDate(new Date(String(detail.legal_response_due_at))) : null;
    const now = new Date();
    const isOverdue = dueDate ? now > dueDate : false;
    const isAttendedOnTime = Boolean(
      isTerminal && (!dueDate || !officialResponseDate || officialResponseDate.getTime() <= dueDate.getTime())
    );

    let slaColorClass = 'bg-white/5 text-white/50 border-white/10';
    let slaLabel = 'Cerrado / Respondido';

    if (isTerminal) {
      slaColorClass = 'bg-white/5 text-white/50 border-white/10';
      slaLabel = 'Cerrado / Respondido';
    } else if (dueDate) {
      // Anclar el cálculo de días hábiles restantes al calendario oficial de Perú (America/Lima)
      const getLimaCal = (d: Date) => {
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).formatToParts(d).map(p => [p.type, p.value])
        );
        return new Date(Date.UTC(parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10), 12, 0, 0));
      };

      const nowCal = getLimaCal(now);
      const dueCal = getLimaCal(dueDate);

      let diffDays = 0;
      const startCalc = isOverdue ? new Date(dueCal) : new Date(nowCal);
      const endCalc = isOverdue ? new Date(nowCal) : new Date(dueCal);

      let current = new Date(startCalc);
      while (current < endCalc) {
        current.setUTCDate(current.getUTCDate() + 1);
        const day = current.getUTCDay();
        const y = current.getUTCFullYear();
        const m = current.getUTCMonth() + 1;
        const d = current.getUTCDate();

        const isHoliday = (day !== 0 && day !== 6) && globalHolidays.some(h => h.month === m && h.day === d && (h.year === null || h.year === y));

        if (day !== 0 && day !== 6 && !isHoliday) {
          diffDays++;
        }
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
              <div className="flex items-center gap-2 flex-wrap">
                <div className={"w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border " + slaColorClass}>
                  {slaLabel}
                </div>
                {isArchived && (
                  <div className="w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    Archivado (Custodia Legal)
                  </div>
                )}
                {detail.legal_response_due_at && (
                  <span className="text-xs text-white/50 flex items-center gap-1.5 flex-wrap" title="Fecha límite legal según horario oficial de Perú (UTC-5)">
                    <span>
                      Vencimiento Legal: <strong className="text-amber-400 font-semibold">{formatLegalDualDate(detail.legal_response_due_at, false, true).peruText}</strong>
                    </span>
                    {isTerminal ? (
                      isAttendedOnTime ? (
                        <span 
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full"
                          title={officialResponseDate ? `Atendido el ${formatLegalDualDate(officialResponseDate.toISOString(), false).peruText}` : 'Atendido dentro del plazo legal'}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Cumplido en plazo
                        </span>
                      ) : (
                        <span 
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full"
                          title={officialResponseDate ? `Atendido el ${formatLegalDualDate(officialResponseDate.toISOString(), false).peruText}` : 'Atendido fuera del plazo legal'}
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Atendido fuera de plazo
                        </span>
                      )
                    ) : (
                      isOverdue ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          Plazo legal vencido
                        </span>
                      ) : null
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(detail.country_iso2 || detail.country_iso) && (
                <span
                  className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wider font-semibold border border-white/10 text-white/90"
                  title={detail.country_name ? String(detail.country_name) : String(detail.country_iso2 || detail.country_iso)}
                >
                  <img
                    src={`https://flagcdn.com/w20/${String(detail.country_iso2 || detail.country_iso).toLowerCase()}.png`}
                    srcSet={`https://flagcdn.com/w40/${String(detail.country_iso2 || detail.country_iso).toLowerCase()}.png 2x`}
                    alt={String(detail.country_iso2 || detail.country_iso)}
                    className="w-4 h-auto object-contain rounded-sm shadow-sm"
                  />
                  <span>{String(detail.country_iso2 || detail.country_iso).toUpperCase()}</span>
                </span>
              )}

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
                {isComplaintB2B(detail as any) ? (
                  <span className="inline-flex items-center gap-1.5 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/30 uppercase tracking-wide">
                    B2B {String(detail.tipo_doc) === 'RUC' || !detail.tipo_doc ? '- Empresa Local' : '- Entidad Extranjera'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/30 uppercase tracking-wide">
                    B2C Consumidor
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {isComplaintB2B(detail as any) ? (
                  <>
                    <div><p className="text-[10px] uppercase text-white/40 mb-1">Razón Social</p><p className="text-sm text-white/80 font-medium">{detail.nombres || detail.legal_name || 'No especificado'}</p></div>
                    <div><p className="text-[10px] uppercase text-white/40 mb-1">Representante Legal</p><p className="text-sm text-white/80 font-medium">{detail.apellidos || 'No especificado'}</p></div>
                    <div><p className="text-[10px] uppercase text-white/40 mb-1">Identificación Fiscal</p><p className="text-sm text-white/80">{detail.tipo_doc ? `${detail.tipo_doc}: ` : ''}{detail.numero_doc}</p></div>
                  </>
                ) : (
                  <>
                    <div><p className="text-[10px] uppercase text-white/40 mb-1">Nombre / Consumidor</p><p className="text-sm text-white/80 font-medium">{detail.nombres} {detail.apellidos}</p></div>
                    <div><p className="text-[10px] uppercase text-white/40 mb-1">Documento de Identidad</p><p className="text-sm text-white/80">{detail.tipo_doc ? `${detail.tipo_doc}: ` : ''}{detail.numero_doc}</p></div>
                  </>
                )}
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Email</p><p className="text-sm text-white/80">{detail.email}</p></div>
                <div><p className="text-[10px] uppercase text-white/40 mb-1">Teléfono</p><p className="text-sm text-white/80">{formatPhone(detail.telefono ? String(detail.telefono) : '', detail.prefijo_telefono ? String(detail.prefijo_telefono) : (detail.country_dial_code ? String(detail.country_dial_code) : null))}</p></div>
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
                        <span className="text-[10px] text-white/40 mt-0.5" title={formatLocalDate(ev.created_at, 'datetime-12h-seconds')}>
                          {formatLocalDate(ev.created_at, 'datetime-12h')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(ev.mime_type?.startsWith('image/') || ev.mime_type === 'application/pdf') && (
                          <button 
                            type="button"
                            onClick={() => window.open(ev.public_url || apiUrl(`/admin/complaints/${selectedId}/attachment?fileId=${ev.id}`), '_blank')} 
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 bg-cyan-950/40 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400/50 px-2.5 py-1 rounded-md shadow-sm transition-all active:scale-95 cursor-pointer"
                            title="Ver archivo en nueva pestaña"
                          >
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                            Ver
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={() => forceDownload(ev.public_url || apiUrl(`/admin/complaints/${selectedId}/attachment?fileId=${ev.id}`), ev.original_name)} 
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-white/80 bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-md shadow-sm transition-all active:scale-95 cursor-pointer"
                          title="Descargar archivo"
                        >
                          <Download className="w-3.5 h-3.5 text-white/60" />
                          Descargar
                        </button>
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
                  placeholder={statusLabel(status) || "Seleccionar estado..."}
                  onChange={(val) => setStatus(val)}
                  options={detailStatusOptions}
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
                      <span className="text-[10px] text-white/40" title={formatLocalDate(note.created_at, 'datetime-12h-seconds')}>
                        {formatLocalDate(note.created_at, 'datetime-12h')}
                      </span>
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
                            {(() => {
                              const baseDual = formatLegalDualDate(te.metadata.base_date || te.created_at, true);
                              const dueDual = formatLegalDualDate(te.metadata.calculated_due_date, true, true);
                              return (
                                <>
                                  <div className="mb-1.5">
                                    <strong className="text-white/90">Registro Oficial:</strong> {baseDual.peruText}
                                    {baseDual.isDifferentTimezone && (
                                      <span className="block text-[11px] text-cyan-400/80 font-sans mt-0.5">↳ {baseDual.localText}</span>
                                    )}
                                  </div>
                                  <p><strong className="text-white/90">Plazo (Días Hábiles):</strong> {te.metadata.business_days_allotted || 15}</p>
                                  <p><strong className="text-white/90">Fines de Semana (Saltados):</strong> {te.metadata.skipped_weekends || 0}</p>
                                  <p><strong className="text-white/90">Feriados (Saltados):</strong> {Array.isArray(te.metadata.skipped_holidays) && te.metadata.skipped_holidays.length > 0 ? te.metadata.skipped_holidays.join(', ') : 'Ninguno'}</p>
                                  <div className="mt-2 pt-2 border-t border-white/10">
                                    <span className="text-amber-400 font-bold uppercase tracking-wider">
                                      Vencimiento: {dueDual.peruText || 'N/A'}
                                    </span>
                                    {dueDual.isDifferentTimezone && (
                                      <span className="block text-[11px] text-amber-300/80 font-sans mt-0.5 font-normal">↳ {dueDual.localText}</span>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                        {te.metadata && te.event_type === 'OFFICIAL_RESPONSE_SENT' && (
                          <div className="bg-white/5 border border-white/10 rounded-md p-3 text-xs text-white/70 font-mono mt-1">
                            <p><strong className="text-white/90">Tipo de Resolución:</strong> {te.metadata.resolution_type === 'founded' ? 'Fundado' : te.metadata.resolution_type === 'unfounded' ? 'Infundado' : te.metadata.resolution_type || 'Concluido'}</p>
                            {te.metadata.sent_at && (() => {
                              const sentDual = formatLegalDualDate(te.metadata.sent_at, true);
                              return (
                                <div className="mt-1.5 pt-1.5 border-t border-white/10">
                                  <strong className="text-white/90">Notificado Oficial:</strong> {sentDual.peruText}
                                  {sentDual.isDifferentTimezone && (
                                    <span className="block text-[11px] text-cyan-400/80 font-sans mt-0.5">↳ {sentDual.localText}</span>
                                  )}
                                </div>
                              );
                            })()}
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
                        <span className="text-[10px] text-white/40" title={formatLocalDate(r.created_at, 'datetime-12h-seconds')}>
                          {formatLocalDate(r.created_at, 'datetime-12h')}
                        </span>
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
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white/90">Respuesta Oficial al Reclamante</h4>
                  <span className="text-[11px] text-cyan-400 font-medium">Resolución Definitiva</span>
                </div>
                <p className="text-xs text-white/50 -mt-1">
                  Esta respuesta será notificada automáticamente al correo del reclamante y al equipo de Super Admin y Legal Reviewer con valor legal.
                </p>
                <div className="grid grid-cols-2 gap-4 my-1">
                  <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition">
                    <input type="radio" checked={resolutionType === 'founded'} onChange={() => setResolutionType('founded')} className="accent-cyan-500" />
                    <span>Fundado <span className="text-xs text-green-400 font-medium">(Procede)</span></span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition">
                    <input type="radio" checked={resolutionType === 'unfounded'} onChange={() => setResolutionType('unfounded')} className="accent-cyan-500" />
                    <span>Infundado <span className="text-xs text-red-400 font-medium">(No Procede)</span></span>
                  </label>
                </div>
                <textarea
                  value={responseBody}
                  onChange={(e) => setResponseBody(e.target.value)}
                  placeholder="Detalle de la resolución oficial a enviar al cliente..."
                  className="min-h-[120px] w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-y custom-scrollbar"
                />

                {/* Selector de Archivos Adjuntos a la Respuesta */}
                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/70">Documentos o Pruebas Adjuntas (Opcional)</span>
                    <button
                      type="button"
                      onClick={() => responseFileInputRef.current?.click()}
                      disabled={responseFiles.length >= 5 || isResponding}
                      className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-40 transition"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>{responseFiles.length >= 5 ? 'Límite alcanzado (5)' : 'Adjuntar archivo'}</span>
                    </button>
                    <input
                      ref={responseFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={handleResponseFilesChange}
                      className="hidden"
                    />
                  </div>

                  {responseFiles.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {responseFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-xs">
                          <div className="flex items-center gap-2 truncate mr-2">
                            <FileText className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                            <span className="text-white/90 truncate" title={f.name}>{f.name}</span>
                            <span className="text-[10px] text-white/40 shrink-0">({formatFileSize(f.size)})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveResponseFile(idx)}
                            disabled={isResponding}
                            className="text-white/40 hover:text-red-400 p-0.5 transition"
                            title="Eliminar adjunto"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setResponseFormOpen(false);
                      setResponseFiles([]);
                    }} 
                    className="px-4 py-2 text-sm text-white/70 hover:text-white transition"
                  >
                    Cancelar
                  </button>
                  <button onClick={handleSendResponse} disabled={isResponding} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-50">
                    {isResponding ? 'Enviando...' : 'Enviar y Cerrar Reclamo'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {!isReadOnly && !detail.isTerminal && !detail.is_terminal && detail.email ? (
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
                {(isReadOnly || isTerminal || isArchived) && (
                  <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
                    {!isArchived && isTerminal && (
                      <button onClick={handleOpenArchive} className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 py-2.5 text-sm font-medium transition hover:bg-amber-500/20">
                        <Tag className="h-4 w-4" /> Archivar Expediente (Retención Legal)
                      </button>
                    )}
                    {isArchived && admin.roles.includes('super_admin') && (
                      <button onClick={handleOpenPurge} className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 py-2.5 text-sm font-medium transition hover:bg-red-500/20">
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 pointer-events-none" />
                <input
                  type="text"
                  name="complaints_search_filter"
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  placeholder="Buscar por código, nombre, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setDebouncedSearchQuery(searchQuery);
                    }
                  }}
                  className="w-full rounded-md border border-white/10 bg-black/50 pl-8.5 pr-8 py-1.5 text-xs text-white placeholder-white/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 p-0.5 rounded transition cursor-pointer"
                    title="Borrar búsqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <CustomDropdown
                  value={filterUrgency}
                  options={urgencyOptions}
                  onChange={(val) => setFilterUrgency(val)}
                  placeholder="Urgencia"
                  size="sm"
                  variant="admin"
                />
                <CustomDropdown
                  value={filterTipo}
                  options={tipoOptions}
                  onChange={(val) => setFilterTipo(val)}
                  placeholder="Tipo"
                  size="sm"
                  variant="admin"
                />
                <CustomDropdown
                  value={filterOrigin}
                  options={originOptions}
                  onChange={(val) => setFilterOrigin(val)}
                  placeholder="Origen"
                  size="sm"
                  variant="admin"
                />
                <CustomDropdown
                  value={filterAgent}
                  options={agentOptions}
                  onChange={(val) => setFilterAgent(val)}
                  placeholder="Agente"
                  size="sm"
                  variant="admin"
                />
                <CustomDropdown
                  value={filterArchived}
                  options={archivedOptions}
                  onChange={(val) => {
                    setFilterArchived(val);
                    setSelectedId(null);
                    setDetail(null);
                    setPage(1);
                  }}
                  placeholder="Estado archivo"
                  size="sm"
                  variant="admin"
                  className={hasActiveFilters ? '' : 'col-span-2'}
                />
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-white/5 border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer w-full h-full min-h-[30px]"
                    title="Limpiar todos los filtros"
                  >
                    <FilterX className="h-3 w-3 text-cyan-400" />
                    <span>Limpiar filtros</span>
                  </button>
                )}
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
                  className={`w-full flex flex-col gap-2 px-5 py-3.5 text-left transition-colors duration-200 border-l-2 ${
                    selectedId === item.id ? 'bg-white/5 border-white/40' : 'border-transparent hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Bloque superior e intermedio: Info a la izquierda, Fecha y Agente a la derecha */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {/* Segmento B2B/B2C y Nombre del Reclamante o Razón Social */}
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap border ${
                            isComplaintB2B(item)
                              ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {isComplaintB2B(item) ? 'B2B' : 'B2C'}
                        </span>
                        <p className={`truncate text-sm font-medium transition-colors ${selectedId === item.id ? 'text-white' : 'text-white/80'}`}>
                          {isComplaintB2B(item)
                            ? (item.legal_name || [item.nombres, item.apellidos].filter(Boolean).join(' ') || 'Empresa sin razón social')
                            : ([item.nombres, item.apellidos].filter(Boolean).join(' ') || 'Sin nombre')}
                        </p>
                      </div>

                      {/* Código de caso y Tipo de Reclamo / Bien */}
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-white/40">
                        {item.code && (
                          <span className="shrink-0 font-mono text-[11px] text-white/35">
                            #{item.code} ·
                          </span>
                        )}
                        <Tag className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.tipo_reclamo || 'Tipo no especificado'}</span>
                      </div>
                    </div>

                    {/* Columna derecha: Fecha arriba con el formato de Contactos + Badge de Agente debajo */}
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <span className="flex items-center justify-end gap-1 text-[10px] text-white/30 whitespace-nowrap self-end">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        {formatLocalDate(item.created_at, 'date-medium')}
                      </span>
                      {item.assigned_to === admin.id ? (
                        <span className="flex items-center gap-1 rounded-md border border-[#06CFD6]/20 bg-[#06CFD6]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#06CFD6] shadow-[0_0_8px_rgba(6,207,214,0.15)] whitespace-nowrap self-end" title="Asignado a ti">
                          <UserCheck className="h-3 w-3" /> Mío
                        </span>
                      ) : item.assigned_to ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-white/30 whitespace-nowrap self-end" title="Asignado a otro">
                          <UserCheck className="h-3 w-3" />
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Fila 3: Badges de Estado, Prioridad y Clasificación (Reclamo/Queja) en línea */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="h-fit rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/60 whitespace-nowrap">
                      {statusLabel(item.status)}
                    </span>
                    {item.priority && priorityBadge(item.priority, item.priority_name!)}
                    {item.claim_type === 'Reclamo' && (
                      <span className="h-fit rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/30 whitespace-nowrap uppercase">
                        Reclamo
                      </span>
                    )}
                    {item.claim_type === 'Queja' && (
                      <span className="h-fit rounded-md bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-400 border border-orange-500/30 whitespace-nowrap uppercase">
                        Queja
                      </span>
                    )}
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

      {/* Modal de Confirmación con ShineBorder para Archivar Reclamo */}
      <ConfirmModal
        isOpen={archiveModalOpen}
        title="¿Archivar Expediente?"
        message={`¿Está seguro de archivar el reclamo ${detail?.code ? `"${detail.code}"` : 'seleccionado'}? Se ocultará de la lista principal y se resguardará bajo custodia de retención legal (900 días).`}
        confirmText={isArchiving ? 'Archivando...' : 'Archivar'}
        cancelText="Cancelar"
        type="warning"
        onConfirm={handleConfirmArchive}
        onCancel={() => {
          if (!isArchiving) setArchiveModalOpen(false);
        }}
      />

      {/* Modal Blindado con ShineBorder para Purga Física */}
      {purgeModalOpen && detail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <ShineBorder
            borderRadius={16}
            borderWidth={1.5}
            color={['#ef4444', '#991b1b', '#ef4444']}
            className="w-full max-w-md bg-[#0a0a0a] shadow-[0_0_50px_-12px_rgba(239,68,68,0.35)]"
          >
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmPurge();
              }}
              autoComplete="off"
              className="p-6 text-left w-full flex flex-col gap-4"
            >
              {/* Señuelo anti-autocompletado para atrapar credenciales de navegadores y gestores de contraseñas */}
              <input type="text" name="prevent_autofill_username" className="hidden" tabIndex={-1} aria-hidden="true" autoComplete="username" />

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-500/10 border border-red-500/25 text-red-500">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white/95">Purga Física de Expediente</h2>
                  <p className="text-xs text-red-400 font-semibold tracking-wide uppercase">Acción Destructiva Irreversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-200/90 leading-relaxed flex flex-col gap-1.5">
                <p>
                  Esta operación ejecutará la <strong>destrucción física permanente</strong> del expediente <strong>{detail.code}</strong> en la base de datos (junto con notas, historial de estados y archivos adjuntos).
                </p>
                <p className="text-[11px] text-red-300/70">
                  Acción de alta seguridad exclusiva para Super Administradores con registro inmutable en auditoría forense.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    1. Ingrese el código exacto <span className="font-mono text-red-400 font-bold select-all">{detail.code}</span> para desbloquear:
                  </label>
                  <input
                    type="text"
                    name="complaint_purge_code_confirmation"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-bwignore="true"
                    value={purgeConfirmCode}
                    onChange={(e) => setPurgeConfirmCode(e.target.value)}
                    placeholder={String(detail.code || '')}
                    disabled={isPurging}
                    className="w-full rounded-lg border border-white/10 bg-black/50 px-3.5 py-2 text-sm text-white font-mono placeholder:text-white/20 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    2. Contraseña de Super Administrador:
                  </label>
                  <div className="relative">
                    <input
                      type={showPurgePassword ? 'text' : 'password'}
                      name="purge_superadmin_password"
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-bwignore="true"
                      value={purgePassword}
                      onChange={(e) => setPurgePassword(e.target.value)}
                      placeholder="Ingrese su contraseña maestra"
                      disabled={isPurging}
                      className="w-full rounded-lg border border-white/10 bg-black/50 pl-3.5 pr-10 py-2 text-sm text-white placeholder:text-white/20 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPurgePassword(!showPurgePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors flex items-center justify-center w-5 h-5"
                      tabIndex={-1}
                      aria-label={showPurgePassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={showPurgePassword ? 'eye-off' : 'eye'}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.15 }}
                        >
                          {showPurgePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </motion.div>
                      </AnimatePresence>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isPurging) {
                      setPurgeModalOpen(false);
                      setPurgeConfirmCode('');
                      setPurgePassword('');
                    }
                  }}
                  disabled={isPurging}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isPurging ||
                    purgeConfirmCode.trim().toUpperCase() !== String(detail.code).trim().toUpperCase() ||
                    !purgePassword
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors shadow-lg shadow-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPurging ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Destruyendo...</span>
                    </>
                  ) : (
                    <>
                      <FilterX className="h-4 w-4" />
                      <span>Destruir Expediente Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </ShineBorder>
        </div>
      )}
    </div>
  );
};

export default Reclamos;
