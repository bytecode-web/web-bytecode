import React, { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { ClipboardList, RefreshCw, Eye, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  admin_name: string | null;
  admin_email: string | null;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, any>;
};

type AuditLogsResponse = {
  items: AuditLog[];
  total: number;
  limit: number;
  offset: number;
};

import AdminPanel from '../../components/admin/AdminPanel';
import PaginationControl from '../../components/ui/PaginationControl';

// ... (skip to component)

const PAGE_SIZE = 9;

const Auditoria: React.FC = () => {
  const { addToast } = useToastStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
    const [selectedDetails, setSelectedDetails] = useState<Record<string, any> | null>(null);

  const loadLogs = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const offset = (targetPage - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const result = await apiRequest<AuditLogsResponse>(`/admin/logs?${params.toString()}`);

      if (result.items.length === 0 && result.total > 0 && targetPage > 1) {
        setPage(targetPage - 1);
        return;
      }

      setLogs(result.items);
      setTotal(result.total);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cargar los logs.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    queueMicrotask(() => {
      if (isCurrent) {
        void loadLogs(page);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [loadLogs, page]);

  const formatUserAgent = (ua: string | undefined) => {
    if (!ua) return '-';
    
    let os = 'Unknown OS';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/mac os x/i.test(ua) || /macintosh/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/linux/i.test(ua)) os = 'Linux';
    
    let browser = 'Unknown Browser';
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/opr|opera/i.test(ua)) browser = 'Opera';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    
    return `${os} • ${browser}`;
  };

  const formatDate = (val: string) => 
    new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(val));

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Auditoría</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Registro de eventos del sistema</p>
          </div>
        </div>
        <button
          onClick={() => void loadLogs(page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
        </button>
      </div>

      <AdminPanel className="flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium text-center">Acción</th>
                <th className="px-6 py-4 font-medium text-center">Entidad</th>
                <th className="px-6 py-4 font-medium text-center">ID Entidad</th>
                <th className="px-6 py-4 font-medium">Contexto</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-white/5 text-white/80 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
              {logs.map(log => (
                <tr key={log.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-6 py-4 text-white/50 text-xs">{formatDate(log.created_at)}</td>
                  <td className="px-6 py-4">
                    {log.admin_name ? (
                      <div>
                        <p className="font-medium text-white/90">{log.admin_name}</p>
                        <p className="text-[10px] text-white/40">{log.admin_email}</p>
                      </div>
                    ) : (
                      <span className="text-white/30 italic">Sistema</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="rounded bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60 uppercase tracking-widest">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/80 text-center">{log.entity_type}</td>
                  
                  <td className="px-6 py-4 text-xs font-mono text-white/30 text-center">
                    {log.entity_id ? (
                      <span title={log.entity_id}>
                        {log.entity_id}
                      </span>
                    ) : log.action === 'batch_update' ? (
                      <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest whitespace-nowrap">
                        Múltiples (Ver Detalles)
                      </span>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-white/70 text-[11px] font-mono">{log.ip_address || '-'}</span>
                      <span className="text-white/40 text-[10px] truncate max-w-[120px]" title={log.user_agent}>{formatUserAgent(log.user_agent)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <button
                        onClick={() => setSelectedDetails(log.details!)}
                        className="inline-flex items-center gap-1.5 rounded bg-white/5 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors border border-white/5"
                        title="Ver Detalles"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Detalles</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-white/20 italic">-</span>
                    )}
                  </td>

                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-white/30 text-sm">No hay registros de auditoría.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      
      </AdminPanel>

      {/* Details Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
              <h3 className="text-lg font-medium text-white/90 font-sansation tracking-wide">Detalles de Auditoría</h3>
              <button 
                onClick={() => setSelectedDetails(null)}
                className="text-white/50 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <pre className="bg-black/40 text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed border border-white/5 shadow-inner">
                <code>
                  {JSON.stringify(selectedDetails, null, 2)}
                </code>
              </pre>
            </div>
            <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
              <button 
                onClick={() => setSelectedDetails(null)}
                className="px-4 py-2 rounded-lg bg-white/10 text-white/80 text-sm font-medium hover:bg-white/20 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auditoria;
