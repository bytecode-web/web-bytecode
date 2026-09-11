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
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        <div className="relative w-full max-w-lg transform overflow-hidden rounded-xl bg-white p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-gray-900">
              {isEditing ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">País</label>
                <select
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
                <label className="block text-sm font-medium text-gray-700">Código Corto</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ej. NIT"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Número de Identificación Tributaria"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Placeholder</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={formData.placeholder}
                  onChange={e => setFormData({ ...formData, placeholder: e.target.value })}
                  placeholder="000.000.000-0"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-2">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Reglas de Validación</h4>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Mínimo de caracteres</label>
                  <input
                    type="number"
                    min="1"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.min_length}
                    onChange={e => setFormData({ ...formData, min_length: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Máximo de caracteres</label>
                  <input
                    type="number"
                    min="1"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.max_length}
                    onChange={e => setFormData({ ...formData, max_length: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">Expresión Regular (RegEx)</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono text-indigo-600"
                  value={formData.validation_regex}
                  onChange={e => setFormData({ ...formData, validation_regex: e.target.value })}
                  placeholder="[0-9]{8,15}"
                />
                <p className="text-xs text-gray-500 mt-1">No incluyas ^ o $ (se añaden automáticamente).</p>
              </div>

              {/* LIVE TESTER */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Live Tester (Prueba en vivo)</label>
                <div className="relative">
                  <input
                    type="text"
                    className={`block w-full pr-10 rounded-md shadow-sm sm:text-sm ${
                      !testValue ? 'border-gray-300' :
                      testResult 
                        ? 'border-green-300 focus:border-green-500 focus:ring-green-500' 
                        : 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    }`}
                    value={testValue}
                    onChange={e => setTestValue(e.target.value)}
                    placeholder="Escribe un número para probar la regla..."
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    {testValue && (
                      testResult 
                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                        : <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_company_document"
                  checked={formData.is_company_document}
                  onChange={e => setFormData({ ...formData, is_company_document: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="is_company_document" className="ml-2 block text-sm text-gray-900">
                  Documento B2B (Empresarial)
                </label>
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
                  Activo
                </label>
              </div>
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
