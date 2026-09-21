import React, { useEffect, useState, useCallback } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '../../lib/api';
import { Monitor, Smartphone, Tablet, Trash2, UserCircle, Clock, ShieldCheck } from 'lucide-react';
import AdminPanel from '../../components/admin/AdminPanel';

interface Session {
  id: string;
  ip_address: string;
  deviceType: string;
  osName: string;
  browserName: string;
  created_at: string;
  expires_at: string;
  isCurrentSession: boolean;
  userName: string;
  userEmail: string;
  roleName: string;
  canRevoke: boolean;
}

const AdminPerfil: React.FC = () => {
  const { addToast } = useToastStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchSessions = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const data = await apiRequest<{ sessions: Session[] }>('/auth/me/sessions');
      setSessions(data.sessions);
    } catch (err) {
      if (showSpinner) addToast(err instanceof Error ? err.message : 'Error al actualizar sesiones', 'error');
      else addToast(err instanceof Error ? err.message : 'Error al cargar sesiones', 'error');
    } finally {
      if (showSpinner) setIsRefreshing(false);
      setLoading(false);
    }
  }, [addToast]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast('Las contraseñas nuevas no coinciden.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      addToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    
    setIsChangingPassword(true);
    try {
      const res = await apiRequest<{message: string}>('/auth/me/password', {
        method: 'POST',
        json: { currentPassword, newPassword }
      });
      addToast(res.message || 'Contraseña actualizada correctamente.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Refresh sessions to show others are revoked
      fetchSessions(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cambiar contraseña', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  useEffect(() => {
    void fetchSessions();
    let interval: ReturnType<typeof setInterval>;

    const startPolling = () => {
      interval = setInterval(() => {
        void fetchSessions(false);
      }, 5000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchSessions(false);
        // Reinicia el intervalo al volver para mantener la cadencia exacta de 5s
        clearInterval(interval);
        startPolling();
      } else {
        // Pausa el reloj nativo si la pestaña no es visible
        clearInterval(interval);
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchSessions]);

  const handleRevoke = async (sessionId: string) => {
    // Optimistic UI update
    const previousSessions = [...sessions];
    setSessions(sessions.filter((s) => s.id !== sessionId));

    try {
      await apiRequest(`/auth/me/sessions/${sessionId}/revoke`, { method: 'POST' });
    } catch (err) {
      // Revert if failed
      setSessions(previousSessions);
      addToast(err instanceof Error ? err.message : 'Error al revocar sesión', 'error');
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    if (deviceType === 'mobile') return <Smartphone className="w-8 h-8 text-gray-500" />;
    if (deviceType === 'tablet') return <Tablet className="w-8 h-8 text-gray-500" />;
    return <Monitor className="w-8 h-8 text-gray-500" />;
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  if (loading) {
    return <div className="p-8 text-white flex items-center gap-3"><Clock className="animate-spin w-5 h-5 text-[#06CFD6]" /> Cargando dispositivos...</div>;
  }
  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <UserCircle className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Mi Perfil</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Mis Dispositivos y Sesiones</p>
          </div>
        </div>
        <button
          onClick={() => fetchSessions(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Actualizar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AdminPanel className="p-6">
            <h2 className="text-lg font-medium text-white/90 mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#06CFD6]" /> Seguridad
            </h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Contraseña Actual</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/60">Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isChangingPassword}
                className="w-full rounded-lg bg-[#06CFD6] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#06CFD6]/90 disabled:opacity-50 mt-2"
              >
                {isChangingPassword ? 'Actualizando...' : 'Cambiar Contraseña'}
              </button>
            </form>
          </AdminPanel>
        </div>

        <div className="lg:col-span-2">
          <h2 className="text-lg font-medium text-white/90 mb-4 flex items-center gap-2">
             Sesiones Activas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence>
          {sessions.map((session) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <AdminPanel className="p-6 relative overflow-hidden flex flex-col justify-between h-full">
              <div>
                <div className="flex items-start gap-5">
                  <div className="p-3 bg-white/5 border border-white/5 rounded-lg shrink-0 flex items-center justify-center opacity-70">
                    {getDeviceIcon(session.deviceType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                      <div>
                        <h3 className="text-base font-medium text-white/90 truncate">{session.osName} - {session.browserName}</h3>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-white/50">{session.userName} ({session.userEmail})</p>
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-white/40 uppercase tracking-wider">{session.roleName}</span>
                        </div>
                      </div>
                      {session.isCurrentSession && (
                        <span className="bg-white/10 text-white/90 text-[10px] font-medium px-2 py-1 rounded border border-white/10 shrink-0">
                          Dispositivo Actual
                        </span>
                      )}
                    </div>

                    <div className="mt-5 space-y-2 text-xs text-white/40 font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-white/30 uppercase">IP:</span>
                        <span className="text-white/60">{session.ip_address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-white/30 uppercase">Login:</span>
                        <span className="text-white/60">{formatDate(session.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-white/30 uppercase">Expira:</span>
                        <span className="text-white/60">{formatDate(session.expires_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!session.isCurrentSession && session.canRevoke && (
                <button
                  onClick={() => handleRevoke(session.id)}
                  className="mt-6 flex items-center justify-center sm:justify-start gap-2 text-red-400/80 hover:text-red-400 hover:bg-red-400/10 px-3 py-2 rounded-lg transition-colors font-medium text-xs self-start border border-transparent hover:border-red-400/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Revocar Acceso
                </button>
              )}
              </AdminPanel>
            </motion.div>
          ))}
          </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPerfil;