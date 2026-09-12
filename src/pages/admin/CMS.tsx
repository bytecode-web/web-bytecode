import React, { useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Globe, MoreVertical, RefreshCw, Save, Edit2, Settings2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import AdminPanel from '../../components/admin/AdminPanel';
import PaginationControl from '../../components/ui/PaginationControl';
import CustomDropdown from '../../components/ui/CustomDropdown';

const PAGE_SIZE = 9;

type CMSPage = {
  id: string;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  status: string;
  status_name?: string;
  updated_at: string;
};
//comentario para desplegar de nuev
type CmsStatus = { id: string; code: string; name: string };

type ActionMenuState = {
  id: string;
  top: number;
  left: number;
  placement: 'bottom' | 'top';
};

const AdminCMS: React.FC = () => {
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [pages, setPages] = useState<CMSPage[]>([]);
  const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CMSPage>>({});
  const [actionsMenu, setActionsMenu] = useState<ActionMenuState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState<CmsStatus[]>([]);

  const loadPages = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ data: CMSPage[]; total: number }>(`/admin/cms/pages?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`);
      if (res.data.length === 0 && res.total > 0 && page > 1) { setPage(page - 1); return; }
      setPages(res.data);
      setTotal(res.total);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cargar paginas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPages();
  }, [page]);

  useEffect(() => {
    apiRequest<{ items: CmsStatus[] }>('/catalog/statuses?domain=cms')
      .then((result) => setStatuses(result.items))
      .catch((requestError: unknown) => addToast(requestError instanceof Error ? requestError.message : 'Error al cargar estados CMS', 'error'));
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setActionsMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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

  const handleEdit = (page: CMSPage) => {
    setEditingId(page.id);
    setFormData(page);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/cms/pages/${editingId}`, {
        method: 'PATCH',
        json: {
          title: formData.title,
          meta_title: formData.meta_title,
          meta_description: formData.meta_description,
          status: formData.status,
        },
      });
      setIsModalOpen(false);
      setEditingId(null);
      await loadPages();
    addToast('Operación completada con éxito', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al guardar pagina', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Gestor de Contenido (CMS)</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Administracion de paginas y SEO</p>
          </div>
        </div>
        <button onClick={loadPages} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
        </button>
      </div>

      
      <div className="flex flex-col gap-6">
        <AdminPanel className="flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Pagina</th>
                  <th className="px-6 py-4 font-medium">Slug</th>
                  <th className="px-6 py-4 font-medium">Meta titulo</th>
                  <th className="px-6 py-4 font-medium">Meta descripcion</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Ultima mod.</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {pages.map((page) => (
                  <tr key={page.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-medium">{page.title}</td>
                    <td className="px-6 py-4 font-mono text-xs text-white/50">/{page.slug}</td>
                    <td className="px-6 py-4 max-w-[220px] truncate text-white/60" title={page.meta_title ?? ''}>{page.meta_title || '-'}</td>
                    <td className="px-6 py-4 max-w-[280px] truncate text-white/50" title={page.meta_description ?? ''}>{page.meta_description || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${page.status === 'published' ? 'bg-green-500/10 border-green-500/20 text-green-400' : page.status === 'archived' ? 'bg-white/5 border-white/10 text-white/45' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
                        <Globe className="h-3 w-3" /> {page.status_name || page.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/40 text-xs">{formatDate(page.updated_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={(e) => handleOpenActions(e, page.id)} className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {pages.length === 0 && !loading && (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-white/30 text-sm">No hay paginas configuradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
        </AdminPanel>
      </div>

      <AnimatePresence>
        {actionsMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'top' ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'top' ? 10 : -10 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'absolute', top: actionsMenu.top, left: actionsMenu.left }}
            onClick={(e) => e.stopPropagation()}
            className="w-52 bg-[#121212] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="py-1 px-1 flex flex-col gap-1">
              <button
                onClick={() => {
                  const page = pages.find(p => p.id === actionsMenu.id);
                  if (page) handleEdit(page);
                  setActionsMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Edit2 className="h-4 w-4" /> Editar
              </button>
              {pages.find((page) => page.id === actionsMenu.id)?.slug === 'portafolio' && (
                <button
                  onClick={() => {
                    navigate('/admin/portafolio');
                    setActionsMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Settings2 className="h-4 w-4" /> Gestionar Contenido
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
              <h2 className="text-lg font-semibold text-white/90">
                Editar sección / metadatos: <span className="font-mono text-white/50 text-sm">/{formData.slug}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            
            <div className="flex flex-col gap-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Titulo principal</label>
                <input type="text" value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">SEO: Meta titulo</label>
                <input type="text" value={formData.meta_title || ''} onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">SEO: Meta descripcion</label>
                <textarea rows={3} value={formData.meta_description || ''} onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors custom-scrollbar resize-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Estado</label>
                <CustomDropdown
                  value={formData.status || ''}
                  placeholder="Seleccionar estado..."
                  onChange={(status) => setFormData({ ...formData, status })}
                  options={statuses.map((status) => ({ value: status.code, label: status.name }))}
                />
                <p className="mt-2 text-[11px] leading-5 text-white/40">El estado define si esta sección o bloque será visible en la web pública.</p>
              </div>
              <div className="mt-4 flex gap-3 pt-4 border-t border-white/5">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 transition-colors">Cancelar</button>
                <button onClick={handleSave} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black py-2.5 text-sm font-medium transition-colors hover:bg-white/90 disabled:opacity-50">
                  <Save className="h-4 w-4" /> {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCMS;
