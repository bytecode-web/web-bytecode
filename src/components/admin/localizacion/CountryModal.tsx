import { useState } from 'react';
import { X } from 'lucide-react';
import { apiRequest } from '../../../lib/api';

interface CountryModalProps {
  country?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CountryModal({ country, onClose, onSuccess }: CountryModalProps) {
  const isEditing = !!country;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: country?.name || '',
    iso2: country?.iso2 || '',
    dial_code: country?.dial_code || '',
    phone_max_length: country?.phone_max_length || '',
    phone_regex: country?.phone_regex || '',
    phone_format: country?.phone_format || '',
    is_active: country ? country.is_active : true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        phone_max_length: formData.phone_max_length ? parseInt(formData.phone_max_length) : null,
      };

      if (isEditing) {
        await apiRequest(`/admin/localization/countries/${country.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/admin/localization/countries', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al guardar el país');
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
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all"
                  value={formData.dial_code}
                  onChange={e => setFormData({ ...formData, dial_code: e.target.value })}
                  placeholder="+57"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Formato Telefónico</label>
              <input
                type="text"
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/30 focus:border-[#06CFD6]/50 transition-all font-mono"
                value={formData.phone_format}
                onChange={e => setFormData({ ...formData, phone_format: e.target.value })}
                placeholder="### ### ####"
              />
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
