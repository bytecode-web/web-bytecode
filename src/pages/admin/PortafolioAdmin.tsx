import React, { useEffect, useMemo, useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { ImageUp, Plus, RefreshCw, Save, Trash2, ArrowLeft, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminPanel from '../../components/admin/AdminPanel';
import { apiRequest, type AdminPortfolioItemData, type PortfolioTechnologyData } from '../../lib/api';
import CustomDropdown from '../../components/ui/CustomDropdown';
import { ConfirmModal, type ConfirmModalProps } from '../../components/ui/ConfirmModal';

type PortfolioForm = {
  name: string;
  websiteUrl: string;
  isFeatured: boolean;
  status: string;
  technologyIds: string[];
};

const emptyForm: PortfolioForm = {
  name: '',
  websiteUrl: '',
  isFeatured: true,
  status: 'draft',
  technologyIds: [],
};

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : '-';

const toForm = (item: AdminPortfolioItemData): PortfolioForm => ({
  name: item.name,
  websiteUrl: item.website_url ?? '',
  isFeatured: item.is_featured,
  status: item.status,
  technologyIds: item.technologies.map((technology) => technology.id),
});

const normalizeWebsiteUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.${trimmed}`;
};

const AdminPortafolio: React.FC = () => {
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<AdminPortfolioItemData[]>([]);
  const [technologies, setTechnologies] = useState<PortfolioTechnologyData[]>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PortfolioForm>(emptyForm);
  const [newTechnology, setNewTechnology] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
    const [confirmModal, setConfirmModal] = useState<Omit<ConfirmModalProps, 'isOpen' | 'onCancel'> | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, technologiesRes, statusesRes] = await Promise.all([
        apiRequest<{ items: AdminPortfolioItemData[] }>('/admin/portfolio'),
        apiRequest<{ items: PortfolioTechnologyData[] }>('/admin/portfolio/technologies'),
        apiRequest<{ items: Array<{ id: string; code: string; name: string }> }>('/catalog/statuses?domain=cms'),
      ]);
      setItems(itemsRes.items);
      setTechnologies(technologiesRes.items);
      setStatuses(statusesRes.items);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo cargar el portafolio.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const openId = searchParams.get('id');
    if (openId && items.length > 0) {
      setSelectedId(openId);
    }
  }, [searchParams, items]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const handleSelect = (item: AdminPortfolioItemData) => {
    setSelectedId(item.id);
    setForm(toForm(item));
    setImageFile(null);
    setImageAlt(item.alt_text ?? '');
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setImageFile(null);
    setImageAlt('');
  };

  const toggleTechnology = (technologyId: string) => {
    setForm((current) => ({
      ...current,
      technologyIds: current.technologyIds.includes(technologyId)
        ? current.technologyIds.filter((id) => id !== technologyId)
        : [...current.technologyIds, technologyId],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalizedWebsiteUrl = normalizeWebsiteUrl(form.websiteUrl);
      const payload = {
        name: form.name,
        websiteUrl: normalizedWebsiteUrl || undefined,
        isFeatured: form.isFeatured,
        status: form.status,
        technologyIds: form.technologyIds,
      };

      let response: { item: AdminPortfolioItemData };

      if (selectedId) {
        response = await apiRequest<{ item: AdminPortfolioItemData }>(`/admin/portfolio/${selectedId}`, {
          method: 'PATCH',
          json: payload,
        });

        if (imageFile) {
          const imageFormData = new FormData();
          imageFormData.append('image', imageFile);
          imageFormData.append('altText', imageAlt || form.name);

          response = await apiRequest<{ item: AdminPortfolioItemData }>(`/admin/portfolio/${selectedId}/image`, {
            method: 'POST',
            body: imageFormData,
          });
        }
      } else {
        const formData = new FormData();
        formData.append('name', form.name);
        if (normalizedWebsiteUrl) formData.append('websiteUrl', normalizedWebsiteUrl);
        formData.append('isFeatured', String(form.isFeatured));
        formData.append('status', form.status);
        formData.append('technologyIds', JSON.stringify(form.technologyIds));
        formData.append('altText', imageAlt || form.name);
        if (imageFile) formData.append('image', imageFile);

        response = await apiRequest<{ item: AdminPortfolioItemData }>('/admin/portfolio', {
          method: 'POST',
          body: formData,
        });
      }

      setSelectedId(response.item.id);
      setForm(toForm(response.item));
      setItems((current) => {
        const exists = current.some((item) => item.id === response.item.id);
        return exists
          ? current.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...current];
      });
      setImageFile(null);
      setImageAlt(response.item.alt_text ?? '');
      addToast('Proyecto guardado con éxito', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo guardar el proyecto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (newTechnology) {
      handleCreateTechnology();
    }
  }, [newTechnology]);

  const handleCreateTechnology = async () => {
    if (!newTechnology.trim()) return;
    setSaving(true);
    try {
      const response = await apiRequest<{ item: PortfolioTechnologyData }>('/admin/portfolio/technologies', {
        method: 'POST',
        json: { name: newTechnology.trim(), sortOrder: technologies.length * 10 + 10 },
      });
      setTechnologies((current) => {
        const exists = current.some((technology) => technology.id === response.item.id);
        return exists
          ? current.map((technology) => (technology.id === response.item.id ? response.item : technology))
          : [...current, response.item];
      });
      setForm((current) => ({
        ...current,
        technologyIds: current.technologyIds.includes(response.item.id)
          ? current.technologyIds
          : [...current.technologyIds, response.item.id],
      }));
      setNewTechnology('');
      setTechSearch('');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo crear la tecnologia.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!selectedId) return;
    setConfirmModal({
      title: 'Eliminar Proyecto',
      message: '¿Eliminar este proyecto del portafolio?',
      type: 'danger',
      onConfirm: async () => {
        setSaving(true);
        try {
          await apiRequest(`/admin/portfolio/${selectedId}`, { method: 'DELETE' });
          setItems((current) => current.filter((item) => item.id !== selectedId));
          handleNew();
        } catch (err) {
          addToast(err instanceof Error ? err.message : 'No se pudo eliminar el proyecto.', 'error');
        } finally {
          setSaving(false);
          setConfirmModal(null);
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex flex-col gap-4 border-b border-white/5 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin/cms')} className="flex items-center justify-center rounded-lg bg-white/5 border border-white/10 p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white" aria-label="Volver al CMS">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Portafolio</h1>
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-white/40">Proyectos, imagenes y tecnologias del carrusel publico</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleNew} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10">
            <Plus className="h-4 w-4" /> Nuevo
          </button>
          <button onClick={loadData} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <AdminPanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.01] px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Proyectos</span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70">{items.length}</span>
          </div>
          <div className="max-h-[620px] divide-y divide-white/5 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-white/30">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-white/30">No hay proyectos creados.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedItem(item.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (!draggedItem || draggedItem === item.id) return;
                    
                    const newItems = [...items];
                    const draggedIdx = newItems.findIndex(i => i.id === draggedItem);
                    const dropIdx = newItems.findIndex(i => i.id === item.id);
                    
                    const [removed] = newItems.splice(draggedIdx, 1);
                    newItems.splice(dropIdx, 0, removed);
                    
                    setItems(newItems);
                    setDraggedItem(null);
                    
                    try {
                      await apiRequest('/admin/portfolio/reorder', {
                        method: 'PATCH',
                        json: { items: newItems.map(i => i.id) }
                      });
                      addToast('Orden actualizado con éxito', 'success');
                    } catch(err) {
                      addToast('Error actualizando orden', 'error');
                    }
                  }}
                  onClick={() => handleSelect(item)}
                  className={`grid w-full grid-cols-[74px_1fr] gap-4 px-5 py-4 text-left transition duration-200 border-l-2 cursor-grab active:cursor-grabbing ${draggedItem === item.id ? 'opacity-50' : ''} ${selectedId === item.id ? 'bg-white/5 border-white/40' : 'border-transparent hover:bg-white/[0.03]'}`}
                >
                  <div className="h-16 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/20">
                        <ImageUp className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white/85">{item.name}</p>
                    <p className="truncate text-xs text-white/40">{item.item_code}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.technologies.slice(0, 3).map((technology) => (
                        <span key={technology.id} className="rounded border border-[#06CFD6]/30 px-1.5 py-0.5 text-[10px] text-[#06CFD6]">
                          {technology.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </AdminPanel>

        <AdminPanel className="p-6">
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white/90">{selectedId ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
                <p className="mt-1 text-xs text-white/40">{selectedItem ? `Actualizado: ${formatDate(selectedItem.updated_at)}` : 'Completa los datos y la imagen antes de guardar.'}</p>
              </div>
              {selectedId && (
                <button onClick={handleDelete} disabled={saving} className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Nombre de la web</span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30" />
              </label>
              <label className="grid gap-1.5 md:col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-white/40">URL publica</span>
                <input value={form.websiteUrl} onBlur={() => setForm((current) => ({ ...current, websiteUrl: normalizeWebsiteUrl(current.websiteUrl) }))} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} placeholder="bytebox.pe" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30" />
              </label>
              <div className="grid gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Estado</span>
                <CustomDropdown
                  value={form.status}
                  placeholder="Seleccionar estado..."
                  onChange={(status) => setForm({ ...form, status })}
                  options={statuses.map((status) => ({ value: status.code, label: status.name }))}
                />
              </div>
              <div className="flex items-end gap-5">
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })} />
                  Destacado
                </label>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/5 pt-5 relative">
              <div className="text-xs font-semibold uppercase tracking-widest text-white/50">Tecnologías Utilizadas</div>
              <div className="relative">
                <input 
                  value={techSearch} 
                  onChange={(e) => setTechSearch(e.target.value)} 
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && techSearch.trim()) {
                      e.preventDefault();
                      const existing = technologies.find(t => t.name.toLowerCase() === techSearch.trim().toLowerCase());
                      if (existing) {
                        if (!form.technologyIds.includes(existing.id)) toggleTechnology(existing.id);
                        setTechSearch('');
                      } else {
                        setNewTechnology(techSearch.trim());
                      }
                    }
                  }}
                  placeholder="Buscar o crear tecnología y presionar Enter..." 
                  className="w-full bg-white rounded-full px-6 py-[0.6rem] shadow-sm transition-all text-[#333] placeholder:text-gray-400 outline-none ring-0 focus:ring-2 focus:ring-[#06CFD6]" 
                />
                
                {techSearch && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-100 shadow-xl rounded-xl z-[100] max-h-[207.5px] overflow-y-auto custom-scrollbar">
                    {technologies.filter(t => t.name.toLowerCase().includes(techSearch.toLowerCase()) && !form.technologyIds.includes(t.id)).map(t => (
                      <button key={t.id} type="button" onClick={() => { toggleTechnology(t.id); setTechSearch(''); }} className="w-full text-left px-6 py-2 transition-colors text-[14px] text-gray-600 hover:bg-gray-200 hover:text-gray-900">
                        {t.name}
                      </button>
                    ))}
                    {!technologies.find(t => t.name.toLowerCase() === techSearch.trim().toLowerCase()) && (
                      <div className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100">Presiona Enter para crear: <span className="font-semibold text-gray-800">{techSearch}</span></div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {form.technologyIds.map(id => {
                  const t = technologies.find(tech => tech.id === id);
                  if (!t) return null;
                  return (
                    <span key={id} className="flex items-center gap-1.5 rounded-full bg-[#06CFD6]/10 border border-[#06CFD6]/30 px-3 py-1 text-xs font-medium text-[#06CFD6]">
                      {t.name}
                      <button type="button" onClick={() => toggleTechnology(id)} className="text-[#06CFD6]/50 hover:text-[#06CFD6]"><X className="h-3 w-3"/></button>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/5 pt-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">Imagen del carrusel</h3>
                <p className="mt-2 text-xs text-white/35">Selecciona una imagen y revisa la miniatura antes de guardar.</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {imagePreviewUrl || selectedItem?.image_url ? (
                    <img src={imagePreviewUrl || selectedItem?.image_url || ''} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white/20">
                      <ImageUp className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="grid gap-3">
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-black" />
                  <input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Texto alternativo" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30" />
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-white/5 pt-5">
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50">
                <Save className="h-4 w-4" /> Guardar proyecto
              </button>
            </div>
          </div>
        </AdminPanel>
      </section>
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

export default AdminPortafolio;
