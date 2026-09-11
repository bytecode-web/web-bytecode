import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Globe, FileText, Loader2, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import AdminPanel from '../../components/admin/AdminPanel';

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
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Localización</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Países y tipos de documentos</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-white/10 mt-2">
        <button
          onClick={() => setActiveTab('countries')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
            ${activeTab === 'countries' 
              ? 'border-[#06CFD6] text-[#06CFD6]' 
              : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'}`}
        >
          <Globe size={16} />
          Países
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
            ${activeTab === 'documents' 
              ? 'border-[#06CFD6] text-[#06CFD6]' 
              : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'}`}
        >
          <FileText size={16} />
          Tipos de Documento
        </button>
      </div>

      <AdminPanel className="flex flex-col overflow-hidden">
        {canManage && (
          <div className="p-4 border-b border-white/5 flex justify-end items-center bg-white/[0.01]">
            {activeTab === 'countries' ? (
              <button 
                onClick={() => { setEditingCountry(null); setIsCountryModalOpen(true); }}
                className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
              >
                <Plus size={16} />
                <span>Nuevo País</span>
              </button>
            ) : (
              <button 
                onClick={() => { setEditingDoc(null); setIsDocModalOpen(true); }}
                className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
              >
                <Plus size={16} />
                <span>Nuevo Documento</span>
              </button>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          {activeTab === 'countries' && (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">País</th>
                  <th className="px-6 py-4 font-medium">ISO2</th>
                  <th className="px-6 py-4 font-medium">Dial Code</th>
                  <th className="px-6 py-4 font-medium text-center">Estado</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#06CFD6]" /></td></tr>
                ) : countries.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30">No hay países registrados.</td></tr>
                ) : (
                  countries.map((c: any) => (
                    <tr key={c.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-white/90 font-medium">{c.name}</td>
                      <td className="px-6 py-4 text-white/60">{c.iso2}</td>
                      <td className="px-6 py-4 text-white/60">{c.dial_code || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        {c.is_active 
                          ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3.5 h-3.5" /> Activo</span>
                          : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><XCircle className="w-3.5 h-3.5" /> Inactivo</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setEditingCountry(c); setIsCountryModalOpen(true); }} className="p-2 text-white/40 hover:text-white transition-colors" title="Editar">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDeleteCountry(c.id)} className="p-2 text-white/40 hover:text-red-400 transition-colors" title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'documents' && (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Documento</th>
                  <th className="px-6 py-4 font-medium">País</th>
                  <th className="px-6 py-4 font-medium text-center">Uso</th>
                  <th className="px-6 py-4 font-medium">Validación Regex</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#06CFD6]" /></td></tr>
                ) : documents.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30">No hay documentos registrados.</td></tr>
                ) : (
                  documents.map((d: any) => (
                    <tr key={d.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white/90">{d.code}</div>
                        <div className="text-xs text-white/50 mt-0.5">{d.name}</div>
                      </td>
                      <td className="px-6 py-4 text-white/60">{d.country_name}</td>
                      <td className="px-6 py-4 text-center">
                        {d.is_company_document 
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">B2B</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#06CFD6]/10 text-[#06CFD6] border border-[#06CFD6]/20">B2C</span>}
                      </td>
                      <td className="px-6 py-4 text-white/40 font-mono text-xs">
                        {d.validation_regex ? `/${d.validation_regex}/` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setEditingDoc(d); setIsDocModalOpen(true); }} className="p-2 text-white/40 hover:text-white transition-colors" title="Editar">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDeleteDoc(d.id)} className="p-2 text-white/40 hover:text-red-400 transition-colors" title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </AdminPanel>

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
