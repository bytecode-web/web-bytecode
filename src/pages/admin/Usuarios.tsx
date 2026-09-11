import React, { useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Plus, RefreshCw, Save, UserCheck, UserX, X, MoreVertical, Trash2, UserCog } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import AdminPanel from '../../components/admin/AdminPanel';
import CustomDropdown from '../../components/ui/CustomDropdown';
import PaginationControl from '../../components/ui/PaginationControl';
import { ConfirmModal, type ConfirmModalProps } from '../../components/ui/ConfirmModal';

const PAGE_SIZE = 9;

type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type RoleOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type ActionMenuState = {
  id: string;
  top: number;
  left: number;
  placement: 'bottom' | 'top';
};

const emptyForm = {
  id: '',
  email: '',
  name: '',
  password: '',
  role: '',
  isActive: true,
};

const Usuarios: React.FC = () => {
  const { addToast } = useToastStore();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [actionsMenu, setActionsMenu] = useState<ActionMenuState | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [confirmModal, setConfirmModal] = useState<Omit<ConfirmModalProps, 'isOpen' | 'onCancel'> | null>(null);

  const roleOptions = roles.map((role) => ({ value: role.code, label: role.name }));

  const loadUsers = async () => {
    const result = await apiRequest<{ data: AdminUserRow[]; total: number }>(`/admin/users?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&status=${statusFilter}`);
    if (result.data.length === 0 && result.total > 0 && page > 1) { setPage(page - 1); return; }
    setUsers(result.data);
    setTotal(result.total);
  };

  const loadRoles = async () => {
    const result = await apiRequest<{ data: RoleOption[]; total: number }>('/admin/roles?limit=100&offset=0');
    setRoles(result.data.filter((role) => role.is_active));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadUsers(), loadRoles()]);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [page, statusFilter]);

  const handleDelete = (user: AdminUserRow) => {
    setActionsMenu(null);
    setConfirmModal({
      title: 'Eliminar Usuario',
      message: `¿Estás seguro de eliminar permanentemente a ${user.name}? Esta acción no se puede deshacer.`,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          await apiRequest(`/admin/users/${user.id}`, { method: 'DELETE' });
          await loadUsers();
        addToast('Operación completada con éxito', 'success');
    } catch (err) {
          addToast(err instanceof Error ? err.message : 'Error al eliminar usuario', 'error');
        } finally {
          setLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  useEffect(() => {
    const handleClickOutside = () => setActionsMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const defaultRole = () => roles.find((role) => role.code !== 'super_admin')?.code ?? roles[0]?.code ?? '';

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({ ...emptyForm, role: defaultRole() });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AdminUserRow) => {
    setIsEditing(true);
    setFormData({
      id: user.id,
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      isActive: user.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (isEditing) {
        const updatePayload: Record<string, unknown> = {
          name: formData.name,
          role: formData.role,
          isActive: formData.isActive,
        };

        if (formData.password.trim()) {
          updatePayload.password = formData.password;
        }

        await apiRequest(`/admin/users/${formData.id}`, {
          method: 'PATCH',
          json: updatePayload,
        });
      } else {
        await apiRequest('/admin/users', {
          method: 'POST',
          json: {
            email: formData.email,
            name: formData.name,
            password: formData.password,
            role: formData.role,
          },
        });
      }

      setIsModalOpen(false);
      await loadUsers();
    addToast('Operación completada con éxito', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al guardar usuario', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = (user: AdminUserRow) => {
    setActionsMenu(null);
    setConfirmModal({
      title: user.is_active ? 'Desactivar Usuario' : 'Activar Usuario',
      message: `Confirmas ${user.is_active ? 'desactivar' : 'activar'} a ${user.name}?`,
      type: 'warning',
      onConfirm: async () => {
        setLoading(true);
        try {
          await apiRequest(`/admin/users/${user.id}`, {
            method: 'PATCH',
            json: { isActive: !user.is_active },
          });
          await loadUsers();
        addToast('Operación completada con éxito', 'success');
    } catch (err) {
          addToast(err instanceof Error ? err.message : 'Error al cambiar estado', 'error');
        } finally {
          setLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const handleOpenActions = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceBelow < 150 ? 'top' : 'bottom';
    setActionsMenu({
      id,
      top: placement === 'bottom' ? rect.bottom + window.scrollY : rect.top + window.scrollY - 100,
      left: rect.left + window.scrollX - 120,
      placement,
    });
  };

  const formatDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Nunca';

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <UserCog className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Usuarios Administradores</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Control de accesos</p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/10 mr-2">
            <button onClick={() => { setStatusFilter('all'); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}>Todos</button>
            <button onClick={() => { setStatusFilter('active'); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === 'active' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}>Activos</button>
            <button onClick={() => { setStatusFilter('inactive'); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === 'inactive' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}>Inactivos</button>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
            <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
          </button>
          <button onClick={handleOpenCreate} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90">
            <Plus className="h-4 w-4" /> <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      <AdminPanel className="flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Nombre</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 text-center font-medium">Rol</th>
                <th className="px-6 py-4 text-center font-medium">Estado</th>
                <th className="px-6 py-4 text-center font-medium">Ultimo Login</th>
                <th className="px-6 py-4 text-center font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {users.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-6 py-4 font-medium">{user.name}</td>
                  <td className="px-6 py-4 text-white/60 max-w-[220px] truncate" title={user.email}>{user.email}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="rounded bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] text-white/70">
                      {roles.find((role) => role.code === user.role)?.name ?? user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium border ${user.is_active ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-white/40 text-xs">{formatDate(user.last_login_at)}</td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={(e) => handleOpenActions(e, user.id)} className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-white/30 text-sm">No hay usuarios registrados.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      </AdminPanel>

      <AnimatePresence>
        {actionsMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'top' ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'top' ? 10 : -10 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'absolute', top: actionsMenu.top, left: actionsMenu.left }}
            onClick={(e) => e.stopPropagation()}
            className="w-40 bg-[#121212] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="py-1 px-1 flex flex-col gap-1">
              <button
                onClick={() => {
                  const user = users.find(u => u.id === actionsMenu.id);
                  if (user) handleOpenEdit(user);
                  setActionsMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Edit2 className="h-4 w-4" /> Editar
              </button>
              <button
                onClick={() => {
                  const user = users.find(u => u.id === actionsMenu.id);
                  if (user) handleToggleStatus(user);
                  setActionsMenu(null);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  users.find(u => u.id === actionsMenu.id)?.is_active 
                    ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10' 
                    : 'text-green-400 hover:text-green-300 hover:bg-green-400/10'
                }`}
              >
                {users.find(u => u.id === actionsMenu.id)?.is_active ? (
                  <><UserX className="h-4 w-4" /> Desactivar</>
                ) : (
                  <><UserCheck className="h-4 w-4" /> Activar</>
                )}
              </button>
              {!users.find(u => u.id === actionsMenu.id)?.is_active && (
                <button
                  onClick={() => {
                    const user = users.find(u => u.id === actionsMenu.id);
                    if (user) handleDelete(user);
                    setActionsMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors mt-1 border-t border-white/5 pt-2"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 md:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white/90">{isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {!isEditing && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60 uppercase tracking-wider">Correo Electronico</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/60 uppercase tracking-wider">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-white/60 uppercase tracking-wider">
                  <span>{isEditing ? 'Nueva Contrasena' : 'Contrasena Temporal'}</span>
                  {isEditing && <span className="text-[10px] text-white/40 normal-case">(Opcional)</span>}
                </label>
                <input
                  type="password"
                  required={!isEditing}
                  minLength={8}
                  placeholder={isEditing ? 'Dejar en blanco para mantener la actual' : ''}
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/60 uppercase tracking-wider">Rol de Acceso</label>
                <CustomDropdown
                  value={formData.role}
                  placeholder="Seleccionar rol..."
                  onChange={(value) => setFormData({ ...formData, role: value })}
                  options={roleOptions}
                />
              </div>

              {isEditing && (
                <label className="flex items-center gap-3 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20 focus:ring-offset-black"
                  />
                  Usuario activo
                </label>
              )}

              <div className="flex gap-3 mt-1.5 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !formData.role} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black py-2.5 text-sm font-medium transition-colors hover:bg-white/90 disabled:opacity-50">
                  <Save className="h-4 w-4" /> {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          onCancel={() => setConfirmModal(null)}
          {...confirmModal}
        />
      )}
    </div>
  );
};
export default Usuarios;
