import React, { useState, useEffect } from 'react';
import { Download, ExternalLink, HardDrive, Search, File as FileIcon, FileText, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { Link, useOutletContext } from 'react-router-dom';
import type { AdminUser } from '../../components/admin/AdminLayout';
import { ConfirmModal, type ConfirmModalProps } from '../../components/ui/ConfirmModal';
import { useToastStore } from '../../stores/toastStore';

interface FileOrigin {
  label: string;
  url: string | null;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-bytecode-primary" />
            Gestor Maestro de Archivos
          </h1>
          <p className="text-gray-400 mt-1">Administra de manera centralizada todos los archivos y evidencias de la empresa.</p>
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
            <div key={asset.id} className="bg-bytecode-surface rounded-xl border border-white/10 overflow-hidden flex flex-col group hover:border-bytecode-primary/50 transition-colors">
              <div className="p-4 border-b border-white/5 flex items-start gap-4">
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
                  <span className="text-xs font-medium text-gray-400 block mb-1">Origen:</span>
                  <div className="flex items-center gap-2">
                    {asset.origin.url && (
                      <Link 
                        to={asset.origin.url} 
                        target="_blank"
                        className="p-2 text-bytecode-primary hover:bg-bytecode-primary/10 rounded-full transition-colors group relative"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          Ir al origen
                        </span>
                      </Link>
                    )}
                    <a 
                      href={asset.public_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      download={asset.original_name}
                      className="p-2 text-white bg-bytecode-primary/20 hover:bg-bytecode-primary/40 rounded-full transition-colors group relative"
                    >
                      <Download className="w-4 h-4" />
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        Descargar
                      </span>
                    </a>
                    {canManage && (
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
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-colors group relative ml-1"
                      >
                        {deletingId === asset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          Eliminar
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
