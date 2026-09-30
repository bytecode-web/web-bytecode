import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useToastStore } from '../../../stores/toastStore';
import CustomDropdown from '../../ui/CustomDropdown';
import AnimatedSubmitButton from '../../ui/AnimatedSubmitButton';
import { apiRequest } from '../../../lib/api';
import { IconBrandWhatsapp, IconBrandFacebook, IconBrandInstagram, IconBrandLinkedin, IconWorld, IconMail, IconPhone, IconShield } from '@tabler/icons-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id?: string) => void;
}

const channelIconMap: Record<string, any> = {
  web: IconWorld,
  whatsapp: IconBrandWhatsapp,
  email: IconMail,
  linkedin: IconBrandLinkedin,
  phone: IconPhone,
  facebook: IconBrandFacebook,
  instagram: IconBrandInstagram,
  admin: IconShield
};

export function CreateContactModal({ isOpen, onClose, onSuccess }: Props) {
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);

  const [customers, setCustomers] = useState<{ value: string, label: string, organization_ids: string[] }[]>([]);
  const [organizations, setOrganizations] = useState<{ value: string, label: string }[]>([]);
  const [channels, setChannels] = useState<{ value: string, label: string, icon?: React.ReactNode }[]>([]);
  const [categories, setCategories] = useState<{ value: string, label: string }[]>([]);

  const [formData, setFormData] = useState({
    customer_id: '',
    organization_id: '',
    source_channel_id: '',
    category_id: '',
    subject: '',
    message: ''
  });

  useEffect(() => {
    if (!isOpen) return;
    const loadData = async () => {
      try {
        const [custRes, orgRes, chanRes, catRes] = await Promise.all([
          apiRequest<{ items: any[] }>('/admin/customers?limit=1000').catch(() => ({ items: [] })),
          apiRequest<{ items: any[] }>('/admin/organizations?limit=1000').catch(() => ({ items: [] })),
          apiRequest<{ items: any[] }>('/catalog/channels').catch(() => ({ items: [] })),
          apiRequest<{ items: any[] }>('/catalog/categories').catch(() => ({ items: [] })),
        ]);
        
        const uniqueCustomers = Array.from(new Map(custRes.items.map(c => {
          const orgIdsStr = c.organizations?.map((o: any) => o.id).sort().join(',') || '';
          return [
            `${c.first_name} ${c.last_name || ''} ${c.primary_email || ''} ${orgIdsStr}`.trim().toLowerCase() || c.id, 
            c
          ];
        })).values());
        
        setCustomers(uniqueCustomers.map(c => ({ 
          value: c.id, 
          label: `${c.first_name} ${c.last_name || ''} (${c.primary_email || 'Sin correo'})`.trim(),
          organization_ids: c.organizations?.map((o: any) => o.id) || []
        })).sort((a, b) => a.label.localeCompare(b.label)));
        
        setOrganizations(orgRes.items.map(o => {
          const name = o.legal_name || o.commercial_name || o.name;
          const docNumber = o.primary_document?.document_number || o.document_number;
          return {
            value: o.id,
            label: docNumber ? `${name} (RUC: ${docNumber})` : name
          };
        }).sort((a, b) => a.label.localeCompare(b.label)));
        
        setChannels(chanRes.items.map(c => {
          const IconComp = channelIconMap[c.code];
          return {
            value: c.id, 
            label: c.name,
            icon: IconComp ? <IconComp size={16} color={c.color_hex || '#06CFD6'} /> : undefined
          };
        }));

        setCategories(catRes.items.map(c => ({ value: c.value, label: c.label })));
      } catch (e) {
        console.error(e);
        addToast('Error al cargar datos auxiliares', 'error');
      }
    };
    loadData();
  }, [isOpen, addToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) return addToast('Selecciona un cliente', 'error');
    if (!formData.source_channel_id) return addToast('Selecciona un canal', 'error');
    if (!formData.category_id) return addToast('Selecciona una categoría', 'error');

    setLoading(true);
    try {
      const result = await apiRequest<{ item: { id: string } }>('/admin/contacts', {
        method: 'POST',
        json: {
          ...formData,
          organization_id: formData.organization_id || null,
        }
      });
      addToast('Caso creado exitosamente', 'success');
      setFormData({ customer_id: '', organization_id: '', source_channel_id: '', category_id: '', subject: '', message: '' });
      onSuccess(result.item.id);
      onClose();
    } catch (e: any) {
      addToast(e.message || 'Error al crear caso', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ customer_id: '', organization_id: '', source_channel_id: '', category_id: '', subject: '', message: '' });
    onClose();
  };

  if (!isOpen) return null;

  const filteredCustomers = customers.filter(c => {
    if (formData.organization_id) return c.organization_ids.includes(formData.organization_id);
    return !c.organization_ids || c.organization_ids.length === 0;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="flex min-h-screen items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8">
          
          <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
            <h2 className="text-lg font-semibold text-white/90">
              Registrar Nuevo Ticket Manual
            </h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-1.5 z-40">
                <span className="text-xs uppercase tracking-wider text-white/40">Empresa / B2B</span>
                <CustomDropdown
                  value={formData.organization_id}
                  onChange={(val) => {
                    setFormData({ ...formData, organization_id: val, customer_id: '' });
                  }}
                  options={[
                    { value: '', label: 'Cliente Independiente (Sin Empresa)' },
                    ...organizations
                  ]}
                  placeholder="Seleccionar empresa..."
                />
              </label>

              <label className="grid gap-1.5 z-40">
                <span className="text-xs uppercase tracking-wider text-white/40">Cliente *</span>
                <CustomDropdown
                  value={formData.customer_id}
                  onChange={(val) => setFormData({ ...formData, customer_id: val })}
                  options={filteredCustomers}
                  placeholder={formData.organization_id ? "Selecciona un empleado..." : "Selecciona un cliente..."}
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-1.5 z-30">
                <span className="text-xs uppercase tracking-wider text-white/40">Canal de Origen *</span>
                <CustomDropdown
                  value={formData.source_channel_id}
                  onChange={(val) => setFormData({ ...formData, source_channel_id: val })}
                  options={channels}
                  placeholder="Selecciona un canal"
                />
              </label>

              <label className="grid gap-1.5 z-30">
                <span className="text-xs uppercase tracking-wider text-white/40">Categoría *</span>
                <CustomDropdown
                  value={formData.category_id}
                  onChange={(val) => setFormData({ ...formData, category_id: val })}
                  options={categories}
                  placeholder="Selecciona una categoría"
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-xs uppercase tracking-wider text-white/40">Asunto del caso *</span>
              <input
                value={formData.subject}
                onChange={e => setFormData({...formData, subject: e.target.value})}
                required
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30"
                placeholder="Ej. Problemas con la cotización #123"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs uppercase tracking-wider text-white/40">Mensaje / Detalle inicial *</span>
              <textarea
                value={formData.message}
                onChange={e => setFormData({...formData, message: e.target.value})}
                required
                rows={4}
                className="resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30 custom-scrollbar"
                placeholder="Escribe la queja, solicitud o consulta del cliente..."
              />
            </label>

            <div className="mt-4 flex justify-end gap-3 border-t border-white/5 pt-5">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancelar
              </button>
              <AnimatedSubmitButton
                type="submit"
                isLoading={loading}
                text="Crear Ticket"
                loadingText="Creando..."
                className="rounded-lg border border-[#06CFD6]/30 bg-[#06CFD6]/10 px-6 py-2 text-sm font-medium text-[#06CFD6] transition-colors hover:bg-[#06CFD6]/20 disabled:opacity-50"
              />
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
