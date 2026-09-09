import React, { useState, useEffect } from 'react';
import { Download, ExternalLink, HardDrive, Search, File as FileIcon, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { Link } from 'react-router-dom';

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
  const [assets, setAssets] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [heavyOnly, setHeavyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

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
                  {asset.origin.url ? (
                    <Link to={asset.origin.url} className="text-sm text-bytecode-primary hover:underline flex items-center gap-1">
                      {asset.origin.label}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-300">{asset.origin.label}</span>
                  )}
                </div>
                
                <a
                  href={asset.public_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={asset.original_name}
                  className="w-8 h-8 rounded-full bg-bytecode-primary/10 text-bytecode-primary flex items-center justify-center hover:bg-bytecode-primary hover:text-white transition-colors"
                  title="Descargar Archivo"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-bytecode-surface border border-white/10 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5"
          >
            Anterior
          </button>
          <span className="text-gray-400 text-sm">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-bytecode-surface border border-white/10 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default Archivos;
