import { useState, useMemo } from 'react';
import { X, CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest } from '../../../lib/api';
import { useToastStore } from '../../../stores/toastStore';

interface CountryModalProps {
  country?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CountryModal({ country, onClose, onSuccess }: CountryModalProps) {
  const isEditing = !!country;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  const [formData, setFormData] = useState({
    name: country?.name || '',
    iso2: country?.iso2 || '',
    dial_code: country?.dial_code || '',
    phone_max_length: country?.phone_max_length || '',
    phone_regex: country?.phone_regex || '',
    phone_format: country?.phone_format || '',
    is_active: country ? country.is_active : true,
  });

  const [testValue, setTestValue] = useState('');

  const isValidRegex = useMemo(() => {
    if (!formData.phone_regex || !testValue) return false;
    try {
      const regex = new RegExp(`^${formData.phone_regex}$`);
      return regex.test(testValue);
    } catch {
      return false;
    }
  }, [formData.phone_regex, testValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (formData.phone_regex) {
        new RegExp(`^${formData.phone_regex}$`);
      }
    } catch (e) {
      const msg = 'La Expresión Regular ingresada es inválida';
      setError(msg);
      addToast(msg, 'error');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        phone_max_length: formData.phone_max_length ? parseInt(String(formData.phone_max_length)) : null,
      };

      if (isEditing) {
        await apiRequest(`/admin/localization/countries/${country.id}`, { method: 'PUT', json: payload });
        addToast('País actualizado correctamente', 'success');
      } else {
        await apiRequest('/admin/localization/countries', { method: 'POST', json: payload });
        addToast('País creado correctamente', 'success');
      }
      onSuccess();
    } catch (err: any) {
      const msg = err.message || 'Error al guardar el país';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

        <div className="relative w-full max-w-md transform overflow-hidden rounded-xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-white/90">
              {isEditing ? 'Editar País' : 'Nuevo País'}
            </h3>
            <button onClick={onClose} className="text-white/40 hover:text-white/70">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Nombre del País</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej. Colombia"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">ISO2</label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  className="w-full uppercase px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.iso2}
                  onChange={e => setFormData({ ...formData, iso2: e.target.value.toUpperCase() })}
                  placeholder="CO"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Dial Code</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.dial_code}
                  onChange={e => setFormData({ ...formData, dial_code: e.target.value })}
                  placeholder="+57"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Formato Telefónico</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all font-mono"
                  value={formData.phone_format}
                  onChange={e => setFormData({ ...formData, phone_format: e.target.value })}
                  placeholder="Ej. 91112345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Max Length</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="20"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.phone_max_length}
                  onChange={e => setFormData({ ...formData, phone_max_length: e.target.value })}
                  placeholder="Ej. 10"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Regex Telefónico
                  <span className="block text-[11px] text-white/40 font-normal mt-0.5">
                    No incluyas ^ o $ (se añaden automáticamente).
                  </span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all font-mono"
                  value={formData.phone_regex}
                  onChange={e => setFormData({ ...formData, phone_regex: e.target.value })}
                  placeholder="Ej. 9?\d{10}"
                />
              </div>

              {formData.phone_regex && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <label className="block text-xs font-medium text-white/50 mb-2">
                    Prueba en vivo (Live Tester)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={testValue}
                      onChange={(e) => setTestValue(e.target.value)}
                      placeholder="Ingresa un teléfono en crudo para probar..."
                      className={`w-full px-4 py-2 pr-10 bg-black/20 border rounded-md text-sm outline-none transition-colors ${
                        testValue
                          ? isValidRegex
                            ? 'border-emerald-500/30 text-emerald-100 focus:border-emerald-500/50'
                            : 'border-rose-500/30 text-rose-100 focus:border-rose-500/50'
                          : 'border-white/5 text-white/90 focus:border-[#06CFD6]/30'
                      }`}
                    />
                    {testValue && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isValidRegex ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        )}
                      </div>
                    )}
                  </div>
                  {testValue && (
                    <p className={`mt-2 text-[11px] ${isValidRegex ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                      {isValidRegex ? '¡El formato coincide!' : 'El formato no coincide con la expresión regular'}
                    </p>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none mt-2">
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
              <span className="text-sm text-white/80">País Activo</span>
            </label>

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
