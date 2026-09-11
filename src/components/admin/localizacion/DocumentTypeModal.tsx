import { useState, useMemo } from 'react';
import { X, CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest } from '../../../lib/api';

interface DocumentTypeModalProps {
  documentType?: any;
  countries: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function DocumentTypeModal({ documentType, countries, onClose, onSuccess }: DocumentTypeModalProps) {
  const isEditing = !!documentType;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    country_id: documentType?.country_id || '',
    name: documentType?.name || '',
    code: documentType?.code || '',
    validation_regex: documentType?.validation_regex || '',
    min_length: documentType?.min_length || '',
    max_length: documentType?.max_length || '',
    placeholder: documentType?.placeholder || '',
    is_company_document: documentType ? documentType.is_company_document : false,
    is_active: documentType ? documentType.is_active : true,
  });

  const [testValue, setTestValue] = useState('');

  // Live Tester
  const testResult = useMemo(() => {
    if (!testValue) return null;
    try {
      const regex = new RegExp(`^${formData.validation_regex}$`);
      const isValid = regex.test(testValue);
      const minLengthValid = formData.min_length ? testValue.length >= Number(formData.min_length) : true;
      const maxLengthValid = formData.max_length ? testValue.length <= Number(formData.max_length) : true;
      return isValid && minLengthValid && maxLengthValid;
    } catch (e) {
      return false; // Invalid regex
    }
  }, [testValue, formData.validation_regex, formData.min_length, formData.max_length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate RegEx parses correctly
    try {
      if (formData.validation_regex) {
        new RegExp(formData.validation_regex);
      }
    } catch (e) {
      setError('La Expresión Regular ingresada es inválida');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        min_length: formData.min_length ? parseInt(String(formData.min_length)) : null,
        max_length: formData.max_length ? parseInt(String(formData.max_length)) : null,
      };

      if (isEditing) {
        await apiRequest(`/admin/localization/document-types/${documentType.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/admin/localization/document-types', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al guardar el documento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

        <div className="relative w-full max-w-lg transform overflow-hidden rounded-xl bg-[#121212] border border-white/10 p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-white/90">
              {isEditing ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}
            </h3>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-white/70 mb-1">País</label>
                <select
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all [&>option]:bg-[#121212]"
                  value={formData.country_id}
                  onChange={e => setFormData({ ...formData, country_id: e.target.value })}
                >
                  <option value="">Selecciona un país...</option>
                  {countries.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Código Corto</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ej. NIT"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Número de Id..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Placeholder</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.placeholder}
                  onChange={e => setFormData({ ...formData, placeholder: e.target.value })}
                  placeholder="000.000.000-0"
                />
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 mt-2">
              <h4 className="text-sm font-medium text-white/90 mb-2">Reglas de Validación</h4>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Mínimo de caracteres</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                    value={formData.min_length}
                    onChange={e => setFormData({ ...formData, min_length: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Máximo de caracteres</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                    value={formData.max_length}
                    onChange={e => setFormData({ ...formData, max_length: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Expresión Regular (RegEx)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[#06CFD6] font-mono placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.validation_regex}
                  onChange={e => setFormData({ ...formData, validation_regex: e.target.value })}
                  placeholder="[0-9]{8,15}"
                />
                <p className="text-xs text-white/40 mt-1.5">No incluyas ^ o $ (se añaden automáticamente).</p>
              </div>

              {/* LIVE TESTER */}
              <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <label className="block text-xs font-semibold text-white/80 mb-2">Live Tester (Prueba en vivo)</label>
                <div className="relative">
                  <input
                    type="text"
                    className={`w-full pl-4 pr-10 py-2 bg-[#121212] border rounded-lg text-sm text-white focus:outline-none transition-all ${
                      !testValue ? 'border-white/10 focus:border-white/30' :
                      testResult 
                        ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500' 
                        : 'border-rose-500/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                    }`}
                    value={testValue}
                    onChange={e => setTestValue(e.target.value)}
                    placeholder="Escribe un número para probar la regla..."
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    {testValue && (
                      testResult 
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        : <XCircle className="h-5 w-5 text-rose-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 mt-4 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={formData.is_company_document}
                    onChange={e => setFormData({ ...formData, is_company_document: e.target.checked })}
                  />
                  <div className={`block w-10 h-6 rounded-full transition-colors ${formData.is_company_document ? 'bg-indigo-500' : 'bg-white/10'}`}></div>
                  <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.is_company_document ? 'translate-x-4' : ''}`}></div>
                </div>
                <span className="text-sm text-white/80">Documento B2B (Empresarial)</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <div className={`block w-10 h-6 rounded-full transition-colors ${formData.is_active ? 'bg-[#06CFD6]' : 'bg-white/10'}`}></div>
                  <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.is_active ? 'translate-x-4' : ''}`}></div>
                </div>
                <span className="text-sm text-white/80">Activo</span>
              </label>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-black bg-[#06CFD6] hover:bg-[#06CFD6]/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
