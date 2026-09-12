import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useToastStore } from '../../../stores/toastStore';
import AnimatedSubmitButton from '../../ui/AnimatedSubmitButton';
import CustomDropdown from '../../ui/CustomDropdown';
import { apiRequest } from '../../../lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingId?: string | null;
  initialData?: any;
  countries: any[];
  documentTypes: any[];
}

export default function OrganizationModal({ isOpen, onClose, onSuccess, editingId, initialData, countries, documentTypes }: Props) {
  const [formData, setFormData] = useState({
    legal_name: '',
    trade_name: '',
    ruc: '',
    document_type_id: '',
    document_number: '',
    industry: '',
    country_id: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [taxIdError, setTaxIdError] = useState('');
  const addToast = useToastStore((state) => state.addToast);

  const filteredDocs = React.useMemo(() => {
    if (!formData.country_id) return [];
    return documentTypes.filter(d => d.countryId === formData.country_id && d.isCompanyDocument);
  }, [documentTypes, formData.country_id]);

  const activeDoc = React.useMemo(() => {
    return filteredDocs.find(d => d.id === formData.document_type_id);
  }, [filteredDocs, formData.document_type_id]);

  // Si cambia el país, autoseleccionamos el primer documento
  useEffect(() => {
    if (isOpen && !editingId && formData.country_id && filteredDocs.length > 0 && !formData.document_type_id) {
      setFormData(prev => ({ ...prev, document_type_id: filteredDocs[0].id }));
    }
  }, [formData.country_id, filteredDocs, isOpen, editingId]);

  useEffect(() => {
    if (isOpen) {
      if (editingId && initialData) {
        setFormData({
          legal_name: initialData.legal_name || '',
          trade_name: initialData.trade_name || '',
          ruc: initialData.ruc || '',
          document_type_id: initialData.primary_document?.document_type_id || '',
          document_number: initialData.primary_document?.document_number || initialData.ruc || '',
          industry: initialData.industry || '',
          country_id: initialData.country_id || '',
        });
      } else {
        setFormData({ legal_name: '', trade_name: '', ruc: '', document_type_id: '', document_number: '', industry: '', country_id: '' });
      }
      setTaxIdError('');
    }
  }, [isOpen, editingId, initialData]);

  const validateDocument = (val: string) => {
    if (!activeDoc || !activeDoc.validationRegex || !val) {
      setTaxIdError('');
      return true;
    }
    try {
      const regex = new RegExp(activeDoc.validationRegex);
      if (!regex.test(val)) {
        setTaxIdError(`Formato inválido. Esperado: ${activeDoc.placeholder || 'Documento'}`);
        return false;
      }
      setTaxIdError('');
      return true;
    } catch {
      return true;
    }
  };

  const handleDocumentBlur = () => {
    validateDocument(formData.document_number);
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase();
    setFormData(prev => ({ ...prev, document_number: val }));
    if (taxIdError) validateDocument(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!validateDocument(formData.document_number)) {
      addToast(`El identificador no tiene un formato válido.`, 'error');
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        country_id: formData.country_id || null,
        document_type_id: formData.document_type_id || null,
      };
      
      if (editingId) {
        await apiRequest(`/admin/organizations/${editingId}`, {
          method: 'PUT',
          json: payload
        });
      } else {
        await apiRequest('/admin/organizations', {
          method: 'POST',
          json: payload
        });
      }
      onSuccess();
    } catch (err: any) {
      addToast(err.message || 'Error al guardar empresa', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8" onClick={(e) => e.stopPropagation()}>
          <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
          <h2 className="text-lg font-semibold text-white/90">
            {editingId ? 'Editar Empresa' : 'Nueva Empresa'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-xs uppercase tracking-wider text-white/40">Razón Social (Legal) *</span>
              <input
                name="legal_name"
                value={formData.legal_name}
                onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                required
                placeholder="Ej. TechCorp S.A.C."
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30"
              />
            </label>
            
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-xs uppercase tracking-wider text-white/40">Nombre Comercial (Opcional)</span>
              <input
                name="trade_name"
                value={formData.trade_name}
                onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                placeholder="Ej. TechCorp"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30"
              />
            </label>

            <div className="grid gap-1.5">
              <span className="text-xs uppercase tracking-wider text-white/40">País de Facturación</span>
              <CustomDropdown
                value={formData.country_id}
                onChange={(val) => {
                  if (val !== formData.country_id) {
                    setFormData({ ...formData, country_id: val || '', document_type_id: '', document_number: '' });
                  }
                }}
                placeholder="Seleccionar país"
                options={[
                  { value: '', label: 'Seleccionar país...' },
                  ...countries.map(c => ({ 
                    value: c.id, 
                    label: c.name,
                    icon: c.iso2 ? <img src={`https://flagcdn.com/w20/${c.iso2.toLowerCase()}.png`} alt="" className="w-5 h-auto object-contain rounded-sm" /> : undefined
                  }))
                ]}
              />
            </div>

            <div className="grid gap-1.5 md:col-span-1">
              <span className="text-xs uppercase tracking-wider text-white/40">{activeDoc?.name || 'Identificación'} *</span>
              <div className="flex gap-2">
                 <div className="w-[35%]">
                    <CustomDropdown
                      variant="admin"
                      value={formData.document_type_id}
                      placeholder="Doc."
                      options={filteredDocs.map(d => ({ value: d.id, label: d.code, icon: null }))}
                      onChange={(val) => { setFormData(p => ({ ...p, document_type_id: val, document_number: '' })); setTaxIdError(''); }}
                    />
                 </div>
                 <div className="relative w-[65%]">
                    <input
                      name="document_number"
                      value={formData.document_number}
                      onChange={handleDocumentChange}
                      onBlur={handleDocumentBlur}
                      required
                      maxLength={activeDoc?.maxLength || 50}
                      placeholder={activeDoc?.placeholder || 'Ingrese número'}
                      className={`w-full rounded-lg border bg-white/5 px-4 py-[0.6rem] text-sm text-white/90 outline-none transition ${taxIdError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-white/30'}`}
                    />
                    {taxIdError && (
                      <span className="absolute -bottom-5 left-1 text-[10px] text-red-400">
                        {taxIdError}
                      </span>
                    )}
                 </div>
              </div>
            </div>

            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-xs uppercase tracking-wider text-white/40">Industria / Sector</span>
              <input
                name="industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                placeholder="Ej. Desarrollo de Software"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none transition focus:border-white/30"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end gap-3 border-t border-white/5 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </button>
            <AnimatedSubmitButton
              type="submit"
              isLoading={isLoading}
              text="Guardar Empresa"
              loadingText="Guardando..."
              className="rounded-lg border border-[#06CFD6]/30 bg-[#06CFD6]/10 px-6 py-2 text-sm font-medium text-[#06CFD6] transition-colors hover:bg-[#06CFD6]/20 disabled:opacity-50"
            />
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
