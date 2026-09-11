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
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        <div className="relative w-full max-w-md transform overflow-hidden rounded-xl bg-white p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-gray-900">
              {isEditing ? 'Editar País' : 'Nuevo País'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del País</label>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej. Colombia"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">ISO2</label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  className="mt-1 block w-full uppercase rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={formData.iso2}
                  onChange={e => setFormData({ ...formData, iso2: e.target.value.toUpperCase() })}
                  placeholder="CO"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Dial Code</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={formData.dial_code}
                  onChange={e => setFormData({ ...formData, dial_code: e.target.value })}
                  placeholder="+57"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Formato Telefónico</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
                value={formData.phone_format}
                onChange={e => setFormData({ ...formData, phone_format: e.target.value })}
                placeholder="### ### ####"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                País Activo
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
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
