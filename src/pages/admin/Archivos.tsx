import React, { useState, useEffect } from 'react';
import { Download, ExternalLink, HardDrive, Search, File as FileIcon, FileText, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { Link, useOutletContext } from 'react-router-dom';
import type { AdminUser } from '../../components/admin/AdminLayout';
import { ConfirmModal, type ConfirmModalProps } from '../../components/ui/ConfirmModal';
import { useToastStore } from '../../stores/toastStore';
import { forceDownload } from '../../lib/download';
import { motion, AnimatePresence } from 'framer-motion';
import ShineBorder from '../../components/ui/shine-border';

interface FileOrigin {
  label: string;
  url: string | null;
  allUrls?: string[];
  details?: { label: string; url: string; module: string; recordId: string }[];
}

interface FileAsset {
  id: string;
  original_name: string;
  storage_provider: string;
  public_url: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
  origin: FileOrigin;
}

interface FileAssetsResponse {
  items: FileAsset[];
  totalPages: number;
}

const Archivos: React.FC = () => {
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canManage = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.archivos.manage') === true;
  const { addToast } = useToastStore();

  const [assets, setAssets] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [heavyOnly, setHeavyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<Omit<ConfirmModalProps, 'isOpen' | 'onCancel'> | null>(null);
  const [actionsMenu, setActionsMenu] = useState<{ id: string; top: number; left: number; placement: 'top' | 'bottom' } | null>(null);

  const handleOpenActions = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (actionsMenu?.id === id) {
      setActionsMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownHeight = 140;
    const padding = 16;
    let top = rect.bottom + window.scrollY;
    let left = rect.left - 100 + window.scrollX;
    let placement: 'top' | 'bottom' = 'bottom';
    if (top + dropdownHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - dropdownHeight - padding;
      placement = 'top';
    }
    setActionsMenu({
      id,
      top,
      left,
      placement,
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-file-actions]')) {
        setActionsMenu(null);
      }
    };
    if (actionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionsMenu]);
  const limit = 20;

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiRequest(`/admin/file-assets/${id}`, { method: 'DELETE' });
      addToast('Archivo eliminado exitosamente de la base de datos y Cloudinary', 'success');
      // Recargar lista si estamos en la primera pagina, o cambiar estado si es page 1
      setAssets(assets.filter(a => a.id !== id));
    } catch (err: any) {
      addToast(err.message || 'Error eliminando el archivo', 'error');
    } finally {
      setDeletingId(null);
      setConfirmModal(null);
    }
  };

  const handleDetach = async (id: string, module: string, recordId: string) => {
    try {
      setDeletingId(id);
      await apiRequest(`/admin/file-assets/${id}/detach`, { 
        method: 'DELETE',
        json: { module, recordId }
      });
      addToast('Archivo desvinculado (y eliminado si no tenía más referencias).', 'success');
      await fetchAssets();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Error al desvincular archivo', 'error');
    } finally {
      setDeletingId(null);
      setConfirmModal(null);
    }
  };

  const fetchAssets = async (currentPage = page, currentSearch = search, isHeavy = heavyOnly) => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        ...(currentSearch && { search: currentSearch }),
        ...(isHeavy && { minSize: '5242880' }) // 5 MB en bytes
      });
      
      const response = await apiRequest<FileAssetsResponse>(`/admin/file-assets?${query.toString()}`);
      if (response.items) {
        setAssets(response.items);
        setTotalPages(response.totalPages || 1);
      }
    } catch (error) {
      console.error('Error fetching file assets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Búsqueda reactiva (Debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAssets(1, search, heavyOnly);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [search, heavyOnly]);

  // Paginación
  useEffect(() => {
    // Si page es 1, el debounce ya hizo el fetch. 
    // Para evitar doble fetch, solo disparamos si page > 1
    if (page > 1) {
      fetchAssets(page, search, heavyOnly);
    }
  }, [page]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-bytecode-primary" />;
    if (mimeType === 'application/pdf') return <FileText className="w-8 h-8 text-red-500" />;
    return <FileIcon className="w-8 h-8 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <HardDrive className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Gestor Maestro de Archivos</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Administración de archivos y evidencias</p>
          </div>
        </div>
      </div>

      <div className="bg-bytecode-surface rounded-xl p-4 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Escribe para buscar archivos (automático)..."
            className="w-full pl-9 pr-4 py-2 bg-bytecode-background border border-white/10 rounded-lg text-white focus:border-bytecode-primary focus:ring-1 focus:ring-bytecode-primary transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={heavyOnly}
              onChange={(e) => setHeavyOnly(e.target.checked)}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${heavyOnly ? 'bg-bytecode-primary' : 'bg-gray-700'}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${heavyOnly ? 'translate-x-4' : ''}`}></div>
          </div>
          <span className="text-sm text-gray-300">Mostrar &gt; 5MB (Para depuración)</span>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-bytecode-primary animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <div className="bg-bytecode-surface rounded-xl p-12 text-center border border-white/10">
          <HardDrive className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">No se encontraron archivos</h3>
          <p className="text-gray-400">Prueba con otro término de búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {assets.map((asset) => (
            <ShineBorder 
              key={asset.id} 
              borderRadius={12} 
              borderWidth={2} 
              color={["#024F79", "#026B9B", "#06CFD6"]} 
              className="!p-0 bg-bytecode-surface border-2 border-[#0CA3C6] md:border-transparent overflow-hidden flex flex-col group hover:shadow-[0_0_15px_-3px_rgba(6,207,214,0.3)] transition-all"
            >
              <div className="p-4 border-b border-white/5 flex items-start gap-4 w-full">
                <div className="w-16 h-16 rounded-lg bg-bytecode-background flex items-center justify-center shrink-0 border border-white/5 overflow-hidden">
                  {asset.mime_type.startsWith('image/') && asset.public_url ? (
                    <img src={asset.public_url} alt={asset.original_name} className="w-full h-full object-cover" />
                  ) : (
                    getFileIcon(asset.mime_type)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate" title={asset.original_name}>
                    {asset.original_name}
                  </h3>
                  <div className="text-xs text-gray-400 mt-1 space-y-1">
                    <p>{formatBytes(asset.byte_size)} • {asset.mime_type.split('/')[1]?.toUpperCase()}</p>
                    <p>{new Date(asset.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-bytecode-background/50 flex items-center justify-between mt-auto">
                <div className="flex-1">
                  <span className="text-xs font-medium text-gray-400 block mb-1 truncate max-w-[200px]" title={asset.origin.label}>
                    {asset.origin.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const urls = asset.origin.allUrls || (asset.origin.url ? [asset.origin.url] : []);
                      return urls.map((url, i) => (
                        <Link 
                          key={i}
                          to={url} 
                          title={urls.length > 1 ? `Abrir enlace ${i + 1}` : 'Ir al origen'}
                          className="p-2 text-bytecode-primary hover:bg-white/10 rounded-full transition-colors cursor-pointer relative flex items-center justify-center w-8 h-8"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      ));
                    })()}
                    <button 
                      onClick={() => forceDownload(asset.public_url, asset.original_name)}
                      title="Descargar"
                      className="p-2 text-white hover:text-bytecode-primary hover:bg-white/10 rounded-full transition-colors cursor-pointer relative flex items-center justify-center w-8 h-8"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {canManage && (
                      asset.origin.details && asset.origin.details.length > 1 ? (
                        <div className="relative" data-file-actions>
                          <button
                            onClick={(e) => handleOpenActions(e, asset.id)}
                            disabled={deletingId === asset.id}
                            title="Gestionar eliminación"
                            aria-haspopup="menu"
                            aria-expanded={actionsMenu?.id === asset.id}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-colors cursor-pointer ml-1 flex items-center justify-center w-8 h-8 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                          >
                            {deletingId === asset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmModal({
                              title: '¿Eliminar archivo permanentemente?',
                              message: `Estás a punto de desvincular y eliminar físicamente "${asset.original_name}" de Cloudinary y la base de datos. Si este archivo pertenece a una evidencia legal, se desvinculará por la fuerza. Esta acción es destructiva e irreversible.`,
                              confirmText: 'Sí, eliminar',
                              type: 'danger',
                              onConfirm: () => handleDelete(asset.id),
                            });
                          }}
                          disabled={deletingId === asset.id}
                          title="Eliminar"
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-colors cursor-pointer relative ml-1 flex items-center justify-center w-8 h-8 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingId === asset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </ShineBorder>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-bytecode-surface border border-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/5 transition-colors"
          >
            Anterior
          </button>
          <span className="text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-bytecode-surface border border-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/5 transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}

      <AnimatePresence>
        {actionsMenu && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'bottom' ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'bottom' ? 6 : -6 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'fixed', top: actionsMenu.top, left: actionsMenu.left }}
            className={`fixed z-[100] w-60 overflow-hidden rounded-xl border border-white/10 bg-[#121212] text-left shadow-xl ${
              actionsMenu.placement === 'bottom' ? 'origin-top-right' : 'origin-bottom-right'
            }`}
          >
            {(() => {
              const activeAsset = assets.find(a => a.id === actionsMenu.id);
              if (!activeAsset || !activeAsset.origin.details) return null;
              
              return (
                <div className="flex flex-col gap-1 px-1 py-1">
                  <div className="px-3 py-2 border-b border-white/5 bg-white/5 text-[10px] uppercase font-semibold tracking-wider text-white/50 mb-1">
                    Desvincular orígenes ({activeAsset.origin.details.length})
                  </div>
                  {activeAsset.origin.details.map((det, index) => (
                    <button
                      key={index}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsMenu(null);
                        setConfirmModal({
                          title: `¿Desvincular de ${det.label}?`,
                          message: `El archivo "${activeAsset.original_name}" se desvinculará únicamente de este origen. Si nadie más lo usa, se eliminará permanentemente del servidor.`,
                          confirmText: 'Sí, desvincular',
                          type: 'danger',
                          onConfirm: () => handleDetach(activeAsset.id, det.module, det.recordId),
                        });
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">De {det.label}</span>
                    </button>
                  ))}
                  <div className="mt-1 border-t border-red-500/20 pt-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsMenu(null);
                        setConfirmModal({
                          title: '¿Eliminar de TODAS las ubicaciones?',
                          message: `Estás a punto de eliminar físicamente "${activeAsset.original_name}". Este archivo está siendo utilizado en ${activeAsset.origin.details?.length || 1} ubicación(es) simultáneamente. Si lo eliminas, se romperá el vínculo en TODAS las ubicaciones. Esta acción es destructiva e irreversible.`,
                          confirmText: 'Sí, destruir',
                          type: 'danger',
                          onConfirm: () => handleDelete(activeAsset.id),
                        });
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      Destrucción Total
                    </button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

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

export default Archivos;
