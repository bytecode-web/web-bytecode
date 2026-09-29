import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { apiRequest } from '../../../lib/api';
import { useToastStore } from '../../../stores/toastStore';

interface CreateContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateContactModal: React.FC<CreateContactModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<{ id: string, name: string }[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string, name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string, name: string }[]>([]);
  
  const [formData, setFormData] = useState({
    customer_id: '',
    organization_id: '',
    category_id: '',
    source_channel_id: '',
    subject: '',
    message: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [custRes, orgRes, catRes, chanRes] = await Promise.all([
        apiRequest<{ items: any[] }>('/admin/customers?limit=1000'),
        apiRequest<{ items: any[] }>('/admin/organizations?limit=1000'),
        // apiRequest no falla si la ruta no existe, pero devolvemos catch array vacío por si acaso
        apiRequest<{ items: any[] }>('/catalog/categories').catch(() => ({ items: [] })),
        apiRequest<{ items: any[] }>('/catalog/channels').catch(() => ({ items: [] }))
      ]);
      
      setCustomers(custRes.items.map(c => ({ id: c.id, name: c.first_name + ' ' + (c.last_name || '') })));
      setOrganizations(orgRes.items.map(o => ({ id: o.id, name: o.legal_name || o.commercial_name })));
      setCategories(catRes.items.map(c => ({ id: c.id, name: c.name })));
      setChannels(chanRes.items.map(c => ({ id: c.id, name: c.name })));
    } catch (e) {
      console.error(e);
      addToast('Error al cargar datos auxiliares', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) {
      addToast('El cliente (Customer) es requerido', 'error');
      return;
    }
    
    setLoading(true);
    try {
      await apiRequest('/admin/contacts', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          organization_id: formData.organization_id || null,
          category_id: formData.category_id || null,
          source_channel_id: formData.source_channel_id || null,
        })
      });
      addToast('Caso creado exitosamente', 'success');
      onSuccess();
      onClose();
    } catch (e: any) {
      addToast(e.message || 'Error al crear caso', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#0B1120] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <h2 className="text-lg font-semibold text-white/90">Nuevo Caso de Contacto</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <form id="create-contact-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-white/50">Cliente (Customer) *</span>
                  <select 
                    required 
                    value={formData.customer_id} 
                    onChange={e => setFormData({...formData, customer_id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:border-[#06CFD6] focus:ring-1 focus:ring-[#06CFD6] outline-none"
                  >
                    <option value="">Seleccionar cliente...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-white/50">Empresa B2B (Opcional)</span>
                  <select 
                    value={formData.organization_id} 
                    onChange={e => setFormData({...formData, organization_id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:border-[#06CFD6] focus:ring-1 focus:ring-[#06CFD6] outline-none"
                  >
                    <option value="">Ninguna / B2C</option>
                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
                
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-white/50">Categoría del Caso</span>
                  <select 
                    value={formData.category_id} 
                    onChange={e => setFormData({...formData, category_id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:border-[#06CFD6] focus:ring-1 focus:ring-[#06CFD6] outline-none"
                  >
                    <option value="">Sin Categoría</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-white/50">Canal de Origen</span>
                  <select 
                    value={formData.source_channel_id} 
                    onChange={e => setFormData({...formData, source_channel_id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:border-[#06CFD6] focus:ring-1 focus:ring-[#06CFD6] outline-none"
                  >
                    <option value="">Canal no especificado</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs uppercase tracking-wider text-white/50">Asunto Breve</span>
                <input 
                  type="text" 
                  value={formData.subject} 
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                  placeholder="Ej. Problema con la base de datos"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:border-[#06CFD6] focus:ring-1 focus:ring-[#06CFD6] outline-none placeholder:text-white/20"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs uppercase tracking-wider text-white/50">Mensaje / Descripción (Opcional)</span>
                <textarea 
                  value={formData.message} 
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  rows={4}
                  placeholder="Descripción detallada del caso..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:border-[#06CFD6] focus:ring-1 focus:ring-[#06CFD6] outline-none placeholder:text-white/20 resize-none"
                />
              </label>
            </form>
          </div>
          
          <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3">
            <button onClick={onClose} disabled={loading} className="px-5 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button form="create-contact-form" type="submit" disabled={loading} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#06CFD6]/10 text-[#06CFD6] border border-[#06CFD6]/20 font-medium text-sm hover:bg-[#06CFD6]/20 transition-colors disabled:opacity-50">
              <Send className="w-4 h-4" />
              <span>{loading ? 'Creando...' : 'Crear Caso'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
