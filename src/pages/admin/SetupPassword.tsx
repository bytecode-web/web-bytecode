import React, { useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import ToastContainer from '../../components/ui/ToastContainer';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SetupPassword: React.FC = () => {
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 font-sansation text-white/90">
      <ToastContainer />
        <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-[#0a0a0a] p-8 text-center">
          <h2 className="text-xl text-red-400 mb-2">Solicitud Inválida</h2>
          <p className="text-sm text-white/60 mb-6">No se proporcionó un identificador de usuario válido.</p>
          <button onClick={() => navigate('/admin/login')} className="w-full rounded-lg bg-white/10 py-3 text-sm text-white hover:bg-white/20">
            Volver al inicio
          </button>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.newPassword.length < 8) {
      addToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      addToast('Las nuevas contraseñas no coinciden.', 'error');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/auth/first-password-change', {
        method: 'POST',
        json: {
          userId,
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        }
      });
      setSuccess(true);
      setTimeout(() => navigate('/admin/login'), 3000);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cambiar la contraseña.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 font-sansation text-white/90">
      <ToastContainer />
        <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-[#0a0a0a] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Contraseña Actualizada</h2>
          <p className="text-sm text-white/60 mb-6">Tu contraseña se ha configurado correctamente. Redirigiendo al inicio de sesión...</p>
          <button onClick={() => navigate('/admin/login')} className="w-full rounded-lg bg-cyan-500 py-3 text-sm font-bold text-black hover:bg-cyan-400">
            Ir ahora
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 font-sansation text-white/90">
      <ToastContainer />
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
             <img src="/vectors/designs/logo_en_blanco.svg" alt="Bytecode" className="h-8 opacity-90" />
          </div>
          <h1 className="text-lg font-semibold tracking-wide">Configuración de Contraseña</h1>
          <p className="text-xs text-white/50 mt-2">Es tu primer inicio de sesión, debes establecer una nueva contraseña de acceso.</p>
        </div>
        
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Contraseña Temporal</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={formData.currentPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 pr-10"
                required
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors flex items-center justify-center w-5 h-5" tabIndex={-1}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={showCurrent ? 'off' : 'on'} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </motion.div>
                </AnimatePresence>
              </button>
            </div>
          </div>
          <div className="mt-2">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Nueva Contraseña</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={formData.newPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 pr-10"
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors flex items-center justify-center w-5 h-5" tabIndex={-1}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={showNew ? 'off' : 'on'} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </motion.div>
                </AnimatePresence>
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Confirmar Contraseña</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 pr-10"
                required
                minLength={8}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors flex items-center justify-center w-5 h-5" tabIndex={-1}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={showConfirm ? 'off' : 'on'} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </motion.div>
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
        
        <button disabled={loading} className="mt-6 w-full rounded-lg bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50">
          {loading ? 'Guardando...' : 'Guardar y Continuar'}
        </button>
      </form>
    </main>
  );
};

export default SetupPassword;