import React, { useState, useEffect } from 'react';
import { useToastStore } from '../../stores/toastStore';
import ToastContainer from '../../components/ui/ToastContainer';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, ApiError } from '../../lib/api';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Login: React.FC = () => {
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loginLoading, setLoginLoading] = useState(false);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // MFA States
  const [mfaStep, setMfaStep] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setShowVerificationModal(false);
    
    try {
      const res = await apiRequest<any>('/auth/login', {
        method: 'POST',
        json: { ...credentials, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });

      if (res.mfaRequired) {
        setTempToken(res.tempToken);
        setMfaStep(true);
        setResendCooldown(60);
        return;
      }

      navigate(searchParams.get('redirect') || '/admin/dashboard', { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        if (requestError.code === 'EMAIL_NOT_VERIFIED') {
          setShowVerificationModal(true);
        } else if (requestError.code === 'FORCE_PASSWORD_CHANGE') {
          navigate(`/admin/setup-password?userId=${requestError.payload?.userId || ''}`);
        } else {
          addToast(requestError.message, 'error');
        }
      } else {
        addToast(requestError instanceof Error ? requestError.message : 'No se pudo iniciar sesión.', 'error');
      }
    } finally {
      if (!mfaStep) setLoginLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otpCode.length !== 6) return;
    setLoginLoading(true);
    try {
      await apiRequest('/auth/verify-login-otp', {
        method: 'POST',
        json: { tempToken, otpCode, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      navigate(searchParams.get('redirect') || '/admin/dashboard', { replace: true });
    } catch (requestError: any) {
      addToast(requestError instanceof Error ? requestError.message : 'Código inválido.', 'error');
      if (requestError?.message?.includes('expirada')) {
        setMfaStep(false);
        setOtpCode('');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      await apiRequest('/auth/resend-otp', {
        method: 'POST',
        json: { tempToken },
      });
      setResendCooldown(60);
      addToast('Nuevo código enviado', 'success');
    } catch (requestError: any) {
      addToast(requestError instanceof Error ? requestError.message : 'No se pudo reenviar.', 'error');
      if (requestError?.message?.includes('expirada')) {
        setMfaStep(false);
        setOtpCode('');
      }
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 font-sansation text-white/90 relative">
      <ToastContainer />
      
      <AnimatePresence mode="wait">
        {!mfaStep ? (
          <motion.form 
            key="login-form" 
            initial={{ x: -20, opacity: 0 }} 
            animate={{ x: 0, opacity: 1 }} 
            exit={{ x: -20, opacity: 0 }} 
            transition={{ duration: 0.2 }} 
            onSubmit={handleLogin} 
            className="w-full max-w-sm rounded-2xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl z-10 relative"
          >
            <div className="mb-10 text-center">
              <div className="flex justify-center mb-6">
                 <img src="/vectors/designs/logo_en_blanco.svg" alt="Bytecode" className="h-10 opacity-90" />
              </div>
              <h1 className="text-xl font-semibold tracking-wide">Panel Administrativo</h1>
              <p className="text-xs text-white/40 mt-2 uppercase tracking-widest">Acceso Restringido</p>
            </div>
            <div className="flex flex-col gap-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Correo Electrónico</label>
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                  required
                />
              </div>
              <div className="mb-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={credentials.password}
                    onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/90 outline-none focus:border-white/30 transition-colors pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors flex items-center justify-center w-5 h-5"
                    tabIndex={-1}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={showPassword ? 'eye-off' : 'eye'}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </motion.div>
                    </AnimatePresence>
                  </button>
                </div>
              </div>
            </div>
            <button disabled={loginLoading} className="mt-8 w-full rounded-lg bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50">
              {loginLoading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </motion.form>
        ) : (
          <motion.form 
            key="mfa-form" 
            initial={{ x: 20, opacity: 0 }} 
            animate={{ x: 0, opacity: 1 }} 
            exit={{ x: 20, opacity: 0 }} 
            transition={{ duration: 0.2 }} 
            onSubmit={handleVerifyOtp} 
            className="w-full max-w-sm rounded-2xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl z-10 relative text-center"
          >
            <div className="mb-8">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Verificación en 2 Pasos</h2>
              <p className="text-sm text-white/60">Hemos enviado un código de seguridad de 6 dígitos a tu correo electrónico.</p>
            </div>
            
            <div className="mb-8">
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-4 text-center text-3xl font-bold tracking-[0.5em] text-cyan-400 outline-none focus:border-cyan-500/50 transition-colors placeholder:text-white/10"
                placeholder="000000"
                required
              />
            </div>
            
            <button disabled={loginLoading || otpCode.length !== 6} className="w-full rounded-lg bg-cyan-500 py-3 text-sm font-bold text-black transition-colors hover:bg-cyan-400 disabled:opacity-50">
              {loginLoading ? 'Verificando...' : 'Verificar'}
            </button>
            
            <div className="mt-6">
              <button 
                type="button" 
                disabled={resendCooldown > 0} 
                onClick={handleResendOtp} 
                className="text-xs font-medium text-white/40 hover:text-white transition-colors disabled:opacity-50 disabled:hover:text-white/40"
              >
                {resendCooldown > 0 ? `Reenviar código en ${resendCooldown}s` : '¿No recibiste el correo? Reenviar'}
              </button>
            </div>
            
            <div className="mt-4">
               <button 
                type="button" 
                onClick={() => { setMfaStep(false); setLoginLoading(false); setOtpCode(''); }} 
                className="text-xs text-white/30 hover:text-white/60 underline"
              >
                Volver al inicio de sesión
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
      
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-bold text-white">Verificación Requerida</h2>
            <p className="mb-6 text-sm text-white/60">
              Hemos enviado un enlace de confirmación a tu correo electrónico. Por favor revisa tu bandeja de entrada o la carpeta de spam para verificar tu cuenta y continuar.
            </p>
            <button
              onClick={() => setShowVerificationModal(false)}
              className="w-full rounded-lg bg-white/10 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Login;
