import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';

const VerifyAccount: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Enlace inválido o token no proporcionado.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const verifyToken = async () => {
      try {
        await apiRequest(`/auth/verify-email?token=${token}`);
        if (isMounted) {
          setSuccess(true);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error al verificar la cuenta.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    verifyToken();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 font-sansation text-white/90 admin-scope">
      <div className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0a0a0a] p-8 shadow-2xl text-center">
        <div className="mb-6 flex justify-center">
          <img src="/vectors/designs/logo_en_blanco.svg" alt="Bytecode" className="h-10 opacity-90" />
        </div>
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
            <p className="mt-6 text-sm text-white/60">Verificando tu cuenta de administrador...</p>
          </div>
        ) : success ? (
          <div className="animate-in fade-in zoom-in duration-500">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-400">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h2 className="mb-3 text-xl font-bold tracking-wide text-white">¡Cuenta Verificada Exitosamente!</h2>
            <p className="mb-8 text-sm leading-relaxed text-white/60">
              Tu dirección de correo ha sido confirmada. Ya puedes acceder al panel de administración de Bytecode.
            </p>
            <button
              onClick={() => navigate('/admin/login')}
              className="w-full rounded-lg bg-cyan-500 py-3 text-sm font-bold tracking-wide text-black transition-all hover:bg-cyan-400 hover:shadow-[0_0_15px_rgba(6,207,214,0.4)]"
            >
              Ir al Inicio de Sesión
            </button>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in duration-500">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <XCircle className="h-8 w-8" />
            </div>
            <h2 className="mb-3 text-xl font-bold tracking-wide text-white">Error de Verificación</h2>
            <p className="mb-8 text-sm leading-relaxed text-white/60">{error}</p>
            <button
              onClick={() => navigate('/admin/login')}
              className="w-full rounded-lg bg-white/10 py-3 text-sm font-medium tracking-wide text-white transition-colors hover:bg-white/20"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
    </main>
  );
};

export default VerifyAccount;