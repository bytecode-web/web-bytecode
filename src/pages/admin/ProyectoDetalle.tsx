import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTerminalState } from '../../hooks/useTerminalState';
import { formatCurrencyValue } from '../../hooks/useQuoterState';
import { ArrowLeft, ExternalLink, Pencil, Trash2, UserPlus, X, DollarSign, Plus, GitCommitHorizontal, AlertTriangle } from 'lucide-react';
import { useNavigate, useOutletContext, useParams, useLocation } from 'react-router-dom';
import AdminPanel from '../../components/admin/AdminPanel';
import ShineBorder from '../../components/ui/shine-border';
import type { AdminUser } from '../../components/admin/AdminLayout';
import RoleGuard from '../../components/admin/RoleGuard';
import ProjectQuoteSelector from '../../components/admin/ProjectQuoteSelector';
import ProjectEnvironmentsHub from '../../components/admin/ProjectEnvironmentsHub';
import StatusHistoryTimeline from '../../components/admin/StatusHistoryTimeline';
import CustomDropdown from '../../components/ui/CustomDropdown';
import Timeline from '../../components/ui/Timeline';
import { ConfirmModal, type ConfirmModalProps } from '../../components/ui/ConfirmModal';
import {
  apiRequest,
  assignProjectUser,
  deleteProject,
  fetchProject,
  fetchProjectAssignmentOptions,
  fetchProjectAssignments,
  fetchProjectCommits,
  fetchProjectMilestones,
  fetchProjectStatusHistory,
  updateProject,
  updateProjectMilestone,
  createProjectMilestone,
  createMilestonePayment,
  type Project,
  type ProjectAssignment,
  type ProjectAssignmentOption,
  type ProjectCommit,
  type ProjectMilestone,
} from '../../lib/api';
import type { StatusCatalogItem, StatusHistoryRecord } from '../../types/status';
import { useToastStore } from '../../stores/toastStore';

type Tab = 'general' | 'milestones' | 'environments' | 'activity' | 'history';
type ProjectEditForm = { name: string; description: string; githubRepo: string; quoteId: string; totalBudget: number; currencyCode: string };

const ProyectoDetalle: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canAssign = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.proyectos.assign') === true;
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [commits, setCommits] = useState<ProjectCommit[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [assignmentOptions, setAssignmentOptions] = useState<ProjectAssignmentOption[]>([]);
  const [adendas, setAdendas] = useState<{ id: string; quote_code: string; title?: string; total_amount: string; currency_code: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignmentRole, setAssignmentRole] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [statuses, setStatuses] = useState<StatusCatalogItem[]>([]);
  const { isReadOnly } = useTerminalState({ isTerminal: Boolean(project?.isTerminal) });
  const [projectStatuses, setProjectStatuses] = useState<StatusCatalogItem[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRecord[]>([]);
  const [updatingProjectStatus, setUpdatingProjectStatus] = useState(false);
  const [killFeeConfirmOpen, setKillFeeConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteMilestoneConfirmOpen, setDeleteMilestoneConfirmOpen] = useState<string | null>(null);
  const [milestoneDetailsOpen, setMilestoneDetailsOpen] = useState<ProjectMilestone | null>(null);
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState<ProjectEditForm>({ name: '', description: '', githubRepo: '', quoteId: '', totalBudget: 0, currencyCode: 'PEN' });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [activeMilestoneId, setActiveMilestoneId] = useState('');
  const [paymentForm, setPaymentForm] = useState<{ amount: number; method: string; reference: string; date: string; receipt: File | null; splitRemaining: boolean }>({ amount: 0, method: 'transfer', reference: '', date: new Date().toISOString().split('T')[0], receipt: null, splitRemaining: false });
  const [savingPayment, setSavingPayment] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [addMilestoneForm, setAddMilestoneForm] = useState({ title: '', due_date: '', payment_percentage: 0, status_id: '', quote_id: '' });
  const [savingMilestone, setSavingMilestone] = useState(false);

  const loadMilestones = async () => {
    const isRestrictedDeveloper = admin.roles.includes('developer') && !admin.roles.includes('super_admin') && !admin.roles.includes('admin');
    if (isRestrictedDeveloper) {
      setMilestones([]);
      return;
    }
    setMilestones(await fetchProjectMilestones(id).catch(() => []));
  };

  const getMilestoneRawAmount = (milestone: ProjectMilestone) => {
    let amount = 0;
    let currency = milestone.currency_code || 'USD';
    
    if (milestone.quote_id && project && milestone.quote_id !== project.quote_id) {
      const adenda = adendas.find((a) => a.id === milestone.quote_id);
      if (adenda) {
        amount = Number(adenda.total_amount);
        currency = milestone.currency_code || adenda.currency_code;
      }
    }
    
    if (!amount && project) {
      amount = Number(project.total_budget);
      currency = milestone.currency_code || project.currency_code;
    }
    
    if (!amount) return { amount: 0, currency };
    const rawAmount = (amount * Number(milestone.payment_percentage)) / 100;
    let expected = Math.round(rawAmount * 100) / 100;

    const totalPaid = (milestone.payments || []).reduce((sum, p) => sum + Number(p.amount_paid), 0);
    if (totalPaid > 0 && Math.abs(totalPaid - expected) < 1.00) {
      if (milestone.status === 'completed' || totalPaid >= expected) {
        expected = totalPaid;
      }
    }

    return { amount: expected, currency };
  };

  const getMilestoneAmountString = (milestone: ProjectMilestone) => {
    const { amount, currency } = getMilestoneRawAmount(milestone);
    if (!amount) return '';
    return `(${formatCurrencyValue(amount, currency)})`;
  };

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const isRestrictedDeveloper = admin.roles.includes('developer') && !admin.roles.includes('super_admin') && !admin.roles.includes('admin');
      const [projectResult, milestoneResult, commitResult, assignmentResult, adendasResult, statusResult, projectStatusResult, historyResult] = await Promise.all([
        fetchProject(id),
        isRestrictedDeveloper ? Promise.resolve([]) : fetchProjectMilestones(id).catch(() => []),
        fetchProjectCommits(id).catch(() => []),
        fetchProjectAssignments(id),
        isRestrictedDeveloper ? Promise.resolve({ items: [] }) : apiRequest<{ items: { id: string; quote_code: string; title?: string; total_amount: string; currency_code: string }[] }>(`/admin/projects/${id}/adendas`).catch(() => ({ items: [] })),
        apiRequest<{ items: StatusCatalogItem[] }>('/catalog/statuses?domain=milestone'),
        apiRequest<{ items: StatusCatalogItem[] }>('/catalog/statuses?domain=project'),
        fetchProjectStatusHistory<StatusHistoryRecord>(id).catch(() => []),
      ]);
      setProject(projectResult);
      setMilestones(milestoneResult);
      setCommits(commitResult);
      setAssignments(assignmentResult);
      setAdendas(adendasResult.items);
      setStatuses(statusResult.items);
      setProjectStatuses(projectStatusResult.items);
      setStatusHistory(historyResult);
    } catch (requestError: unknown) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo cargar el proyecto.', 'error');
    } finally {
      setLoading(false);
    }
    if (canAssign) {
      fetchProjectAssignmentOptions().then(setAssignmentOptions).catch(() => setAssignmentOptions([]));
    }
  }, [id, canAssign]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const location = useLocation();
  const processedAutoOpenId = useRef<string | null>(null);

  useEffect(() => {
    if (location.state && typeof location.state === 'object') {
      const stateObj = location.state as { autoOpenId?: string, notificationTimestamp?: number };
      const autoOpenId = stateObj.autoOpenId;
      const timestamp = stateObj.notificationTimestamp;
      
      const uniqueId = timestamp ? `${autoOpenId || 'refresh'}-${timestamp}` : autoOpenId;
      
      if (uniqueId && uniqueId !== processedAutoOpenId.current) {
        processedAutoOpenId.current = uniqueId;
        
        if (!autoOpenId) {
          // Desasignado, volver a lista
          navigate('/admin/proyectos');
        } else if (autoOpenId !== id) {
          // Asignado a OTRO proyecto
          navigate(`/admin/proyectos/${autoOpenId}`);
        } else {
          // Actualización de ESTE proyecto
          void loadData();
        }
        
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, navigate, id, loadData]);

  const changeMilestoneStatus = async (milestoneId: string, status: string) => {
    try {
      await updateProjectMilestone(id, milestoneId, status);
      await loadMilestones();
    addToast('Operación completada con éxito', 'success');
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el hito.', 'error');
    }
  };

  const confirmDeleteMilestone = async () => {
    if (!deleteMilestoneConfirmOpen) return;
    try {
      await apiRequest(`/admin/projects/${id}/milestones/${deleteMilestoneConfirmOpen}`, { method: 'DELETE' });
      await Promise.all([loadMilestones(), loadData()]);
      setDeleteMilestoneConfirmOpen(null);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el hito.', 'error');
    }
  };

  const changeProjectStatus = async (status: string, applyKillFee = false) => {
    const isFullyPaid = milestones.reduce((sum, m) => sum + Number(m.payment_percentage), 0) >= 100 && milestones.every(m => ['completed', 'cancelled'].includes(m.status));
    if (status === 'cancelled' && !applyKillFee && !cancelModalOpen && !isFullyPaid) {
       setCancelModalOpen(true);
       return;
    }
    setUpdatingProjectStatus(true);
    try {
      await apiRequest(`/admin/projects/${id}`, {
        method: 'PATCH',
        json: { status, applyKillFee },
      });
      setProject(prev => prev ? ({ ...prev, status }) : null);
      if (applyKillFee) await loadMilestones();
      setStatusHistory(await fetchProjectStatusHistory<StatusHistoryRecord>(id));
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el estado.', 'error');
    } finally {
      setUpdatingProjectStatus(false);
      setCancelModalOpen(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setAssigning(true);
    try {
      await assignProjectUser(id, selectedUserId, assignmentRole || undefined);
      setAssignments(await fetchProjectAssignments(id));
      setSelectedUserId('');
      setAssignmentRole('');
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo asignar el integrante.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const [confirmModal, setConfirmModal] = useState<Omit<ConfirmModalProps, 'isOpen' | 'onCancel'> | null>(null);

  const handleRemoveAssignment = async (userId: string) => {
    setConfirmModal({
      title: 'Desasignar integrante',
      message: '¿Estás seguro de que deseas remover a este integrante del equipo del proyecto? Esta acción notificará al usuario.',
      type: 'danger',
      confirmText: 'Sí, desasignar',
      onConfirm: async () => {
        try {
          await apiRequest(`/admin/projects/${id}/assignments/${userId}`, { method: 'DELETE' });
          setAssignments(await fetchProjectAssignments(id));
        } catch (requestError) {
          addToast(requestError instanceof Error ? requestError.message : 'No se pudo desasignar el integrante.', 'error');
        } finally {
          setConfirmModal(null);
        }
      },
    });
  };

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeMilestoneId) return;
    setSavingPayment(true);
    
    try {
      const formData = new FormData();
      formData.append('amountPaid', paymentForm.amount.toString());
      formData.append('paymentMethod', paymentForm.method);
      formData.append('paidAt', paymentForm.date);
      if (paymentForm.reference) formData.append('referenceNumber', paymentForm.reference);
      if (paymentForm.receipt) formData.append('receipt', paymentForm.receipt);
      if (paymentForm.splitRemaining) formData.append('splitRemaining', 'true');

      await createMilestonePayment(id, activeMilestoneId, formData);
      await loadMilestones();
      setPaymentModalOpen(false);
      setActiveMilestoneId('');
      setPaymentForm({ amount: 0, method: 'transfer', reference: '', date: new Date().toISOString().split('T')[0], receipt: null, splitRemaining: false });
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo registrar el pago.', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const submitMilestone = async (cancelPending: boolean = false) => {
    setSavingMilestone(true);
    try {
      await createProjectMilestone(id, {
        title: addMilestoneForm.title,
        dueDate: addMilestoneForm.due_date,
        paymentPercentage: addMilestoneForm.payment_percentage,
        statusId: addMilestoneForm.status_id,
        quoteId: addMilestoneForm.quote_id || undefined,
        cancelPending,
      });
      await Promise.all([loadMilestones(), loadData()]);
      setAddMilestoneOpen(false);
      setAddMilestoneForm({ title: '', due_date: '', payment_percentage: 0, status_id: statuses[0]?.id || '', quote_id: '' });
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo crear el hito.', 'error');
    } finally {
      setSavingMilestone(false);
    }
  };

  const handleAddMilestoneSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const isKillFee = addMilestoneForm.title.toLowerCase().includes('kill fee') || addMilestoneForm.title.toLowerCase().includes('compensación');
    
    if (isKillFee) {
      setKillFeeConfirmOpen(true);
      return;
    }
    
    await submitMilestone(false);
  };

  const openEdit = () => {
    if (!project) return;
    setEditForm({
      name: project.name,
      description: project.description ?? '',
      githubRepo: project.github_repo ?? '',
      quoteId: project.quote_id ?? '',
      totalBudget: Number(project.total_budget),
      currencyCode: project.currency_code ?? 'PEN',
    });
    setEditOpen(true);
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProject(id, {
        name: editForm.name,
        description: editForm.description || null,
        githubRepo: editForm.githubRepo || null,
        quoteId: editForm.quoteId || null,
        totalBudget: editForm.totalBudget,
      });
      setProject(updated);
      setEditOpen(false);
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el proyecto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteProject(id);
      navigate('/admin/proyectos', { replace: true });
    } catch (requestError) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el proyecto.', 'error');
      setDeleting(false);
    }
  };

  if (loading) return <p className="p-8 text-sm text-white/40">Cargando proyecto...</p>;
  if (!project) return <p className="p-8 text-sm text-red-300">Proyecto no encontrado.</p>;

  const link = (label: string, url: string | null) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><p className="text-xs uppercase tracking-wider text-white/35">{label}</p>{url ? <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 break-all text-sm text-cyan-300 hover:text-cyan-200">{url}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : <p className="mt-2 text-sm text-white/30">No configurado</p>}</div>
  );

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4"><div className="flex items-center gap-4"><button type="button" onClick={() => navigate('/admin/proyectos')} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-2xl font-semibold text-white/90">{project.name}</h1><p className="mt-1 text-xs text-white/40">{project.project_code} · {project.customer_name || 'Cliente sin nombre'} · {project.status_name || project.status}</p></div></div><RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>{(admin.roles.includes('super_admin') || admin.roles.includes('admin')) && !isReadOnly && (<div className="flex gap-2"><button type="button" onClick={openEdit} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 hover:bg-white/10"><Pencil className="h-4 w-4" />Editar</button><button type="button" disabled={deleting} onClick={() => setDeleteConfirmOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-40"><Trash2 className="h-4 w-4" />{deleting ? 'Eliminando...' : 'Eliminar'}</button></div>)}</RoleGuard></div>
      
      <div className="flex flex-wrap gap-2 mb-6">
          {[
            ['general', 'General'],
            ...(admin.roles.includes('super_admin') || admin.roles.includes('admin') ? [['milestones', 'Hitos']] : []),
            ['environments', 'Entornos'],
            ['activity', 'Actividad (GitHub)'],
            ['history', 'Historial de Estados']
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value as Tab)} className={`rounded-lg px-4 py-2 text-sm transition ${tab === value ? 'bg-white text-black' : 'bg-white/5 text-white/55 hover:text-white'}`}>{label}</button>
          ))}
        </div>

      {tab === 'general' && <div className="grid gap-6"><AdminPanel className="p-6 lg:p-8"><div className="grid gap-5 md:grid-cols-2"><div><p className="text-xs uppercase tracking-wider text-white/35">Cliente</p><p className="mt-2 text-white/80">{project.customer_name}</p></div><div><p className="text-xs uppercase tracking-wider text-white/35">Servicio</p><p className="mt-2 text-white/80">{project.service_name}</p></div><div><p className="text-xs uppercase tracking-wider text-white/35">Fecha Inicio</p><p className="mt-2 text-white/80">{project.start_date ? new Date(project.start_date).toISOString().slice(0, 10) : '-'}</p></div><div><p className="text-xs uppercase tracking-wider text-white/35">Fin Estimado</p><p className="mt-2 text-white/80">{project.estimated_end_date ? new Date(project.estimated_end_date).toISOString().slice(0, 10) : '-'}</p></div><div><p className="text-xs uppercase tracking-wider text-white/35">Fin Real (Auto)</p><p className="mt-2 text-white/80">{project.actual_end_date ? new Date(project.actual_end_date).toISOString().slice(0, 10) : '-'}</p></div><div><p className="mb-1.5 text-xs uppercase tracking-wider text-white/35">Estado del Proyecto</p><RoleGuard requiredPermission="admin.proyectos.manage" fallback={<div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/55">{project.status_name || project.status}</div>}>{(admin.roles.includes('super_admin') || admin.roles.includes('admin')) ? <CustomDropdown value={project.status} onChange={(status) => void changeProjectStatus(status)} placeholder="Seleccionar estado..." disabled={updatingProjectStatus || isReadOnly} options={projectStatuses.map((status) => ({ value: status.code, label: status.name }))} /> : <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/55">{project.status_name || project.status}</div>}</RoleGuard></div><div className="md:col-span-2"><p className="text-xs uppercase tracking-wider text-white/35">Descripción</p><p className="mt-2 text-sm leading-6 text-white/60">{project.description || 'Sin descripción.'}</p></div>{link('Repositorio GitHub', project.github_repo)}</div></AdminPanel><AdminPanel className="p-6 lg:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-sm font-semibold uppercase tracking-wider text-white/75">Equipo asignado</h2><p className="mt-1 text-xs text-white/35">Integrantes con acceso operativo al proyecto.</p></div>{(admin.roles.includes('super_admin') || admin.roles.includes('admin')) && <div className="flex flex-wrap items-end gap-2"><div className="min-w-52"><CustomDropdown disabled={isReadOnly} value={selectedUserId} onChange={setSelectedUserId} placeholder="Seleccionar integrante..." options={assignmentOptions.map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }))} /></div><input value={assignmentRole} disabled={isReadOnly} onChange={(event) => setAssignmentRole(event.target.value)} placeholder="Rol en el proyecto" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />{!isReadOnly && <button type="button" disabled={!selectedUserId || assigning} onClick={() => void handleAssign()} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"><UserPlus className="h-4 w-4" />{assigning ? 'Asignando...' : 'Asignar'}</button>}</div>}</div><div className="mt-5 grid gap-2">{assignments.length ? assignments.map((assignment) => <div key={assignment.user_id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"><div><p className="text-sm text-white/80">{assignment.name}</p><p className="text-xs text-white/35">{assignment.email}</p></div><div className="flex items-center gap-3"><span className="text-xs text-white/50">{assignment.role || 'Integrante'}</span>{(admin.roles.includes('super_admin') || admin.roles.includes('admin')) && !isReadOnly && (<div className="flex items-center gap-1"><button type="button" onClick={() => { setSelectedUserId(assignment.user_id); setAssignmentRole(assignment.role || ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-1.5 text-white/40 hover:text-white" title="Editar Rol"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void handleRemoveAssignment(assignment.user_id)} className="p-1.5 text-white/40 hover:text-red-400" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></div>) : <p className="py-3 text-sm text-white/30">No hay integrantes asignados.</p>}</div></AdminPanel></div>}

      {tab === 'milestones' && <AdminPanel className="divide-y divide-white/5"><div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/[0.02]"><div><h2 className="text-sm font-semibold uppercase tracking-wider text-white/75">Hitos del Proyecto</h2></div><RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>{(admin.roles.includes('super_admin') || admin.roles.includes('admin')) && !isReadOnly && project?.status !== 'cancelled' && <button type="button" onClick={() => { setAddMilestoneForm(prev => ({ ...prev, status_id: statuses[0]?.id || '' })); setAddMilestoneOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"><Plus className="h-4 w-4" />Añadir Hito</button>}</RoleGuard></div>{milestones.length ? milestones.map((milestone) => {
        const totalPaid = (milestone.payments || []).reduce((sum, p) => sum + Number(p.amount_paid), 0);
        const { amount: expectedAmount, currency } = getMilestoneRawAmount(milestone);
        const remaining = expectedAmount - totalPaid;
        const canPay = !['completed', 'canceled'].includes(milestone.status) && Math.round(remaining * 100) > 0;
        
        return (
          <div key={milestone.id} className="grid gap-4 p-5 md:grid-cols-[1fr_180px_auto] md:items-center">
            <div>
              <h3 className="font-medium text-white/85">{milestone.title} <span className="text-white/45 font-normal ml-1">{getMilestoneAmountString(milestone)}</span></h3>
              <p className="mt-1 text-xs text-white/35">Vence {new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(milestone.due_date))} · {parseFloat(Number(milestone.payment_percentage).toFixed(2))}%</p>
              {milestone.payments && milestone.payments.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  <button type="button" onClick={() => setMilestoneDetailsOpen(milestone)} className="mt-1 w-fit rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors">Ver detalle de {milestone.payments.length === 1 ? 'pago' : `pagos (${milestone.payments.length})`}</button>
                </div>
              )}
              {Math.round(remaining * 100) > 0 && !['canceled', 'completed'].includes(milestone.status) && (
                <p className="text-xs text-yellow-300/80 mt-1.5 font-medium">Saldo pendiente: {currency} {Math.max(0, remaining).toFixed(2)}</p>
              )}
            </div>

            {(admin.roles.includes('super_admin') || admin.roles.includes('admin')) && !isReadOnly ? (
              <>
                <CustomDropdown value={milestone.status} onChange={(status) => void changeMilestoneStatus(milestone.id, status)} disabled={false} placeholder="Estado..." options={statuses.map((status) => ({ value: status.code, label: status.name }))} />
                <div className="flex gap-2">
                  {canPay && (
                    <button type="button" onClick={() => { setActiveMilestoneId(milestone.id); setPaymentModalOpen(true); }} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-emerald-400 transition-colors" title="Registrar Pago">
                      <DollarSign className="h-4 w-4" />
                    </button>
                  )}
                  {(milestone.payments?.length ?? 0) === 0 && (
                      <button type="button" onClick={() => setDeleteMilestoneConfirmOpen(milestone.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-red-400 transition-colors" title="Eliminar Hito">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/55" aria-label="Estado de solo lectura">{milestone.status_name || milestone.status}</div>
                <div></div>
              </>
            )}
          </div>
        );
      }) : <p className="p-8 text-center text-sm text-white/30">No hay hitos registrados.</p>}</AdminPanel>}

      {tab === 'environments' && <ProjectEnvironmentsHub projectId={id} isAdmin={admin.roles.includes('super_admin') || admin.roles.includes('admin')} />}

      {tab === 'activity' && <AdminPanel className="p-6 lg:p-8"><Timeline heading="Actividad de GitHub" emptyMessage="No hay commits registrados." items={commits.map((commit) => ({ date: commit.committed_at || commit.created_at || new Date(0).toISOString(), icon: <GitCommitHorizontal className="h-4 w-4" />, title: <><span className="font-medium text-white/90">{commit.author_name || commit.author_email || 'GitHub'}</span><span className="block text-white/65">{commit.message}</span><span className="mt-1 block font-mono text-[10px] text-white/35">{commit.branch || 'branch'} · {commit.commit_hash.slice(0, 7)}</span>{commit.github_url && <a href={commit.github_url} target="_blank" rel="noreferrer" className="pointer-events-auto mt-2 block text-cyan-300">Ver commit</a>}</> }))} /></AdminPanel>}

      {tab === 'history' && <AdminPanel className="p-6 lg:p-8"><StatusHistoryTimeline records={statusHistory} /></AdminPanel>}

      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <form onSubmit={handleUpdate} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                <div><h2 className="text-lg font-semibold text-white/90">Editar proyecto</h2><p className="mt-1 text-xs text-white/35">Información general y cotización asociada.</p></div>
                <button type="button" onClick={() => setEditOpen(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/5"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid gap-5">
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Nombre</span><input required minLength={2} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <ProjectQuoteSelector email={project.customer_email ?? ''} value={editForm.quoteId} onChange={(quote) => setEditForm({ ...editForm, quoteId: quote?.id ?? '', totalBudget: quote ? Number(quote.total_amount) : editForm.totalBudget, currencyCode: quote ? quote.currency_code : editForm.currencyCode })} />
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Presupuesto ({editForm.currencyCode})</span><input type="number" min={0} step="0.01" required value={editForm.totalBudget} onChange={(event) => setEditForm({ ...editForm, totalBudget: Number(event.target.value) })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Descripción</span><textarea rows={4} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Repositorio GitHub</span><input type="url" value={editForm.githubRepo} onChange={(event) => setEditForm({ ...editForm, githubRepo: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5"><button type="button" onClick={() => setEditOpen(false)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65">Cancelar</button><button disabled={saving} className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar cambios'}</button></div>
            </form>
          </div>
        )}
      </RoleGuard>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {paymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <form onSubmit={handlePaymentSubmit} className="max-h-[92vh] w-full max-w-md overflow-visible rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                <div><h2 className="text-lg font-semibold text-white/90">Registrar Pago</h2></div>
                <button type="button" onClick={() => { setPaymentModalOpen(false); setPaymentForm({ amount: 0, method: 'transfer', reference: '', date: new Date().toISOString().split('T')[0], receipt: null, splitRemaining: false }); }} className="rounded-lg p-2 text-white/50 hover:bg-white/5"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid gap-5">
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Monto</span><input type="number" min={0.01} step="0.01" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Método de pago</span>
                    <div className="min-w-48">
                      <CustomDropdown
                        value={paymentForm.method}
                        onChange={(method) => setPaymentForm({ ...paymentForm, method })}
                        placeholder="Método de pago"
                        options={[
                          { value: 'transfer', label: 'Transferencia' },
                          { value: 'cash', label: 'Efectivo' },
                          { value: 'credit_card', label: 'Tarjeta' },
                          { value: 'paypal', label: 'PayPal' },
                        ]}
                      />
                    </div>
                </label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Referencia (Opcional)</span><input type="text" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Fecha de pago</span><input type="date" required value={paymentForm.date} onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Comprobante (Opcional)</span><input type="file" accept="image/*,.pdf" onChange={(event) => setPaymentForm({ ...paymentForm, receipt: event.target.files?.[0] || null })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white text-sm" /></label>
                <label className="flex items-center gap-3 mt-2"><input type="checkbox" checked={paymentForm.splitRemaining} onChange={(e) => setPaymentForm({ ...paymentForm, splitRemaining: e.target.checked })} className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900" /><span className="text-sm text-white/70">Pago incompleto. Cerrar este hito y generar uno nuevo por el saldo restante.</span></label>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5"><button type="button" onClick={() => { setPaymentModalOpen(false); setPaymentForm({ amount: 0, method: 'transfer', reference: '', date: new Date().toISOString().split('T')[0], receipt: null, splitRemaining: false }); }} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65">Cancelar</button><button disabled={savingPayment} className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{savingPayment ? 'Registrando...' : 'Registrar'}</button></div>
            </form>
          </div>
        )}
      </RoleGuard>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {addMilestoneOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <form onSubmit={handleAddMilestoneSubmit} className="max-h-[92vh] w-full max-w-md overflow-visible rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                <div><h2 className="text-lg font-semibold text-white/90">Añadir Hito</h2></div>
                <button type="button" onClick={() => { setAddMilestoneOpen(false); setAddMilestoneForm({ title: '', due_date: '', payment_percentage: 0, status_id: statuses[0]?.id || '', quote_id: '' }); }} className="rounded-lg p-2 text-white/50 hover:bg-white/5"><X className="h-5 w-5" /></button>
              </div>
              {(() => {
                const currentQuoteMilestones = milestones.filter(m => {
                  if (addMilestoneForm.quote_id) return m.quote_id === addMilestoneForm.quote_id;
                  return m.quote_id === project?.quote_id || !m.quote_id;
                });
                const hasAnticipo = currentQuoteMilestones.some(m => m.title.includes('Anticipo (50%)'));
                const hasDiseno = currentQuoteMilestones.some(m => m.title.includes('Aprobación de Diseño'));
                const hasEntrega = currentQuoteMilestones.some(m => m.title.includes('Entrega Final (20%)'));
                const hasKillFee = currentQuoteMilestones.some(m => m.title.includes('Compensación') || m.title.includes('Kill Fee') || m.title.includes('Cancelación'));
                const isFullyConfigured = currentQuoteMilestones.reduce((sum, m) => sum + Number(m.payment_percentage), 0) >= 100;
                const isFullyPaid = isFullyConfigured && currentQuoteMilestones.every(m => ['completed', 'cancelled'].includes(m.status));
                
                const hasAnticipoAdenda = currentQuoteMilestones.some(m => m.title.includes('Anticipo Adenda'));
                const hasFinalAdenda = currentQuoteMilestones.some(m => m.title.includes('Entrega Final Adenda'));

                return (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {!addMilestoneForm.quote_id ? (
                      <>
                        <button type="button" disabled={hasAnticipo || hasKillFee || isFullyConfigured} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Anticipo (50%)', payment_percentage: 50 })} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none">50% Inicial</button>
                        <button type="button" disabled={!hasAnticipo || hasDiseno || hasKillFee || isFullyConfigured} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Aprobación de Diseño (30%)', payment_percentage: 30 })} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none">30% Diseño</button>
                        <button type="button" disabled={!hasAnticipo || !hasDiseno || hasEntrega || hasKillFee || isFullyConfigured} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Entrega Final (20%)', payment_percentage: 20 })} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none">20% Entrega</button>
                        <button type="button" disabled={hasKillFee || isFullyPaid} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Compensación por Cancelación', payment_percentage: 20 })} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-30 disabled:pointer-events-none">Kill Fee (20%)</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={hasAnticipoAdenda || hasKillFee || isFullyConfigured} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Anticipo Adenda (50%)', payment_percentage: 50 })} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none">50% Inicial Adenda</button>
                        <button type="button" disabled={!hasAnticipoAdenda || hasFinalAdenda || hasKillFee || isFullyConfigured} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Entrega Final Adenda (50%)', payment_percentage: 50 })} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none">50% Final Adenda</button>
                        <button type="button" disabled={hasKillFee || isFullyPaid} onClick={() => setAddMilestoneForm({ ...addMilestoneForm, title: 'Kill Fee Cancelación Adenda', payment_percentage: 20 })} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-30 disabled:pointer-events-none">Kill Fee (20%)</button>
                      </>
                    )}
                  </div>
                );
              })()}
              <div className="grid gap-5">
                <label className="grid gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-white/45">Cotización (Adendas - Opcional)</span>
                  <CustomDropdown
                    options={[
                      { value: '', label: 'Dejar en blanco para usar la original' },
                      ...adendas.map((a) => ({ value: a.id, label: `${a.quote_code} - ${formatCurrencyValue(Number(a.total_amount), a.currency_code)}` }))
                    ]}
                    value={addMilestoneForm.quote_id}
                    onChange={(val) => setAddMilestoneForm({ ...addMilestoneForm, quote_id: val, title: '', payment_percentage: 0 })}
                    placeholder="Seleccionar Adenda..."
                  />
                </label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Título</span><input required minLength={2} value={addMilestoneForm.title} onChange={(event) => setAddMilestoneForm({ ...addMilestoneForm, title: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Fecha de vencimiento</span><input type="date" required value={addMilestoneForm.due_date} onChange={(event) => setAddMilestoneForm({ ...addMilestoneForm, due_date: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Porcentaje de pago (%)</span><input type="number" min={0} max={100} step="0.01" required readOnly value={addMilestoneForm.payment_percentage} onChange={(event) => setAddMilestoneForm({ ...addMilestoneForm, payment_percentage: Number(event.target.value) })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white opacity-60 cursor-not-allowed" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/45">Estado</span>
                    <div className="min-w-48">
                      <CustomDropdown
                        value={addMilestoneForm.status_id}
                        onChange={(status_id) => setAddMilestoneForm({ ...addMilestoneForm, status_id })}
                        placeholder="Seleccionar estado"
                        options={statuses.map(s => ({ value: s.id, label: s.name }))}
                      />
                    </div>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-5"><button type="button" onClick={() => { setAddMilestoneOpen(false); setAddMilestoneForm({ title: '', due_date: '', payment_percentage: 0, status_id: statuses[0]?.id || '', quote_id: '' }); }} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65">Cancelar</button><button disabled={savingMilestone} className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{savingMilestone ? 'Guardando...' : 'Crear Hito'}</button></div>
            </form>
          </div>
        )}
      </RoleGuard>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {cancelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <ShineBorder borderRadius={16} borderWidth={1.5} color={["#ef4444", "#991b1b", "#ef4444"]} className="w-full max-w-sm bg-[#0a0a0a] shadow-[0_0_50px_-12px_rgba(239,68,68,0.25)]">
              <div className="p-6 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                  <AlertTriangle className="h-7 w-7 text-red-500" />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-white/90">Proyecto Cancelado</h2>
                <p className="mb-6 text-sm text-white/60">Has marcado el proyecto como cancelado. ¿Deseas liberar los hitos pendientes y generar automáticamente el hito de Compensación por Cancelación (Kill Fee)?</p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => void changeProjectStatus('cancelled', true)} className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors">Sí, aplicar Kill Fee y cancelar</button>
                  <button onClick={() => void changeProjectStatus('cancelled', false)} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 transition-colors">No, solo cancelar proyecto</button>
                  <button onClick={() => setCancelModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-white/40 hover:text-white/60 transition-colors">Cancelar acción</button>
                </div>
              </div>
            </ShineBorder>
          </div>
        )}
      </RoleGuard>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {killFeeConfirmOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <ShineBorder borderRadius={16} borderWidth={1.5} color={["#ef4444", "#991b1b", "#ef4444"]} className="w-full max-w-md bg-[#0a0a0a] shadow-[0_0_50px_-12px_rgba(239,68,68,0.25)]">
              <div className="p-6 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                  <AlertTriangle className="h-7 w-7 text-red-500" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">¿Añadir Kill Fee?</h3>
                <p className="mb-6 text-sm text-white/60">
                  Esto cancelará automáticamente todos los hitos pendientes asociados a esta cotización. 
                  Si esta es la cotización principal del proyecto, el <strong>proyecto entero será cancelado</strong>.
                  ¿Deseas continuar?
                </p>
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={() => setKillFeeConfirmOpen(false)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65 hover:bg-white/5 transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => { setKillFeeConfirmOpen(false); void submitMilestone(true); }} className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors">
                    Sí, proceder y cancelar
                  </button>
                </div>
              </div>
            </ShineBorder>
          </div>
        )}
      </RoleGuard>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {milestoneDetailsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white/90">Desglose de Pagos</h2>
                  <p className="mt-1 text-xs text-white/40">{milestoneDetailsOpen.title}</p>
                </div>
                <button type="button" onClick={() => setMilestoneDetailsOpen(null)} className="rounded-lg p-2 text-white/50 hover:bg-white/5 transition-colors"><X className="h-5 w-5" /></button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto pr-1">
                <div className="grid gap-3">
                  {milestoneDetailsOpen.payments?.map((payment, index) => (
                    <div key={payment.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-sm font-medium text-white/80">Pago #{index + 1}</p>
                          <p className="text-xs text-white/40">{new Date(payment.created_at || Date.now()).toLocaleString('es-PE')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-green-400">{payment.currency_code} {Number(payment.amount_paid).toFixed(2)}</p>
                          <p className="text-xs text-white/40 capitalize">{payment.payment_method}</p>
                          {payment.reference_number && (
                            <p className="text-xs font-mono text-white/30 mt-0.5" title="Número de Operación">Ref: {payment.reference_number}</p>
                          )}
                        </div>
                      </div>
                      
                      {payment.receipt_url ? (
                        <div className="mt-3 border-t border-white/5 pt-3">
                          <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver comprobante adjunto
                          </a>
                        </div>
                      ) : (
                        <div className="mt-3 border-t border-white/5 pt-3">
                          <p className="text-xs text-white/30">Sin comprobante adjunto</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex justify-end border-t border-white/5 pt-5">
                <button type="button" onClick={() => setMilestoneDetailsOpen(null)} className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors">Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </RoleGuard>
      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {deleteConfirmOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <ShineBorder borderRadius={16} borderWidth={1.5} color={["#ef4444", "#991b1b", "#ef4444"]} className="w-full max-w-md bg-[#0a0a0a] shadow-[0_0_50px_-12px_rgba(239,68,68,0.25)]">
              <div className="p-6 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                  <Trash2 className="h-7 w-7 text-red-500" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">¿Eliminar Proyecto?</h3>
                <p className="mb-6 text-sm text-white/60">
                  ¿Seguro que deseas eliminar el proyecto <strong className="text-white/90">{project?.name}</strong>? 
                  Esta acción lo retirará del panel de forma irreversible.
                </p>
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={() => setDeleteConfirmOpen(false)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65 hover:bg-white/5 transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void executeDelete()} className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors">
                    Sí, eliminar proyecto
                  </button>
                </div>
              </div>
            </ShineBorder>
          </div>
        )}
      </RoleGuard>

      <RoleGuard requiredPermission="admin.proyectos.manage" fallback={null}>
        {deleteMilestoneConfirmOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <ShineBorder borderRadius={16} borderWidth={1.5} color={["#ef4444", "#991b1b", "#ef4444"]} className="w-full max-w-md bg-[#0a0a0a] shadow-[0_0_50px_-12px_rgba(239,68,68,0.25)]">
              <div className="p-6 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                  <Trash2 className="h-7 w-7 text-red-500" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">¿Eliminar Hito?</h3>
                <p className="mb-6 text-sm text-white/60">
                  ¿Estás seguro que deseas eliminar este hito? 
                  Esta acción es irreversible.
                </p>
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={() => setDeleteMilestoneConfirmOpen(null)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/65 hover:bg-white/5 transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void confirmDeleteMilestone()} className="rounded-lg bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                    Sí, eliminar hito
                  </button>
                </div>
              </div>
            </ShineBorder>
          </div>
        )}
      </RoleGuard>

      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          title={confirmModal.title}
          message={confirmModal.message}
          type={confirmModal.type}
          confirmText={confirmModal.confirmText}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
};

export default ProyectoDetalle;
