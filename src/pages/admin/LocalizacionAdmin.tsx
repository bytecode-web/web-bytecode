import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Globe, FileText, Loader2, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api';

// Components
import CountryModal from '../../components/admin/localizacion/CountryModal';
import DocumentTypeModal from '../../components/admin/localizacion/DocumentTypeModal';

interface AdminUser {
  id: string;
  roles: string[];
  permissions?: string[];
}

export default function LocalizacionAdmin() {
  const { admin } = useOutletContext<{ admin: AdminUser }>();
  const canManage = admin.roles.includes('super_admin') || admin.permissions?.includes('admin.localizacion.manage') === true;
  
  const [activeTab, setActiveTab] = useState<'countries' | 'documents'>('countries');

  // Modals state
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any>(null);
  
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);

  const [countries, setCountries] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCountries = async () => {
    try {
      const res = await apiRequest<{ items: any[] }>('/admin/localization/countries');
      setCountries(res.items);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocs = async () => {
    try {
      const res = await apiRequest<{ items: any[] }>('/admin/localization/document-types');
      setDocuments(res.items);
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchCountries(), fetchDocs()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteCountry = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este país?')) return;
    try {
      await apiRequest(`/admin/localization/countries/${id}`, { method: 'DELETE' });
      fetchCountries();
    } catch (err: any) {
      alert(err.message || 'Error eliminando el país');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este documento?')) return;
    try {
      await apiRequest(`/admin/localization/document-types/${id}`, { method: 'DELETE' });
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Error eliminando el documento');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Localización</h1>
          <p className="text-gray-500 mt-1">
            Administra los países soportados y sus tipos de documentos válidos.
          </p>
        </div>
        
        {canManage && (
          <div className="flex gap-3">
            <button
              onClick={() => { setEditingCountry(null); setIsCountryModalOpen(true); }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo País
            </button>
            <button
              onClick={() => { setEditingDoc(null); setIsDocModalOpen(true); }}
              className="flex items-center gap-2 bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Nuevo Documento
            </button>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('countries')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
              ${activeTab === 'countries'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Globe className="w-4 h-4" />
            Países
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
              ${activeTab === 'documents'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <FileText className="w-4 h-4" />
            Tipos de Documento
          </button>
        </nav>
      </div>

      {/* CONTENT */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {activeTab === 'countries' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">País</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ISO2</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dial Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {countries.map((c: any) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {c.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.iso2}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.dial_code || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {c.is_active 
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700"><CheckCircle2 className="w-3 h-3"/> Activo</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700"><XCircle className="w-3 h-3"/> Inactivo</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {canManage && (
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => { setEditingCountry(c); setIsCountryModalOpen(true); }} className="text-indigo-600 hover:text-indigo-900">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteCountry(c.id)} className="text-red-600 hover:text-red-900">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {countries.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">No hay países.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">País</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uso</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Validación</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {documents.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{d.code}</div>
                        <div className="text-xs text-gray-500">{d.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.country_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {d.is_company_document 
                          ? <span className="text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded">B2B (Empresa)</span> 
                          : <span className="text-teal-600 font-medium bg-teal-50 px-2 py-1 rounded">B2C (Persona)</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                        {d.validation_regex ? `/${d.validation_regex}/` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {canManage && (
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => { setEditingDoc(d); setIsDocModalOpen(true); }} className="text-indigo-600 hover:text-indigo-900">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteDoc(d.id)} className="text-red-600 hover:text-red-900">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {documents.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">No hay documentos.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {isCountryModalOpen && (
        <CountryModal
          country={editingCountry}
          onClose={() => setIsCountryModalOpen(false)}
          onSuccess={() => { setIsCountryModalOpen(false); fetchCountries(); }}
        />
      )}

      {isDocModalOpen && (
        <DocumentTypeModal
          documentType={editingDoc}
          countries={countries || []}
          onClose={() => setIsDocModalOpen(false)}
          onSuccess={() => { setIsDocModalOpen(false); fetchDocs(); }}
        />
      )}
    </div>
  );
}
