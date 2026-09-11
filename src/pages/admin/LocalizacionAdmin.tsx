import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Globe, FileText, Loader2, Trash2, MoreVertical, Edit, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '../../lib/api';
import AdminPanel from '../../components/admin/AdminPanel';
import PaginationControl from '../../components/ui/PaginationControl';
import CustomDropdown from '../../components/ui/CustomDropdown';

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

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountryFilter, setSelectedCountryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 9;

  const handleTabChange = (tab: 'countries' | 'documents') => {
    setActiveTab(tab);
    setSearchTerm('');
    setSelectedCountryFilter('all');
    setPage(1);
  };

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

  const [actionsMenu, setActionsMenu] = useState<{ id: string, type: 'country' | 'doc', top: number, left: number, placement: string } | null>(null);

  const handleOpenActions = (e: React.MouseEvent, id: string, type: 'country' | 'doc') => {
    e.stopPropagation();
    if (actionsMenu?.id === id) {
      setActionsMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownHeight = 110;
    const padding = 16;
    let top = rect.bottom + window.scrollY;
    let left = rect.left - 100 + window.scrollX;
    let placement: 'top' | 'bottom' = 'bottom';
    if (top + dropdownHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - dropdownHeight - padding;
      placement = 'top';
    }
    setActionsMenu({ id, type, top, left, placement });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-org-actions]')) {
        setActionsMenu(null);
      }
    };
    if (actionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionsMenu]);

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

  const filteredCountries = countries.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.iso2 || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.dial_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const paginatedCountries = filteredCountries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filteredDocs = documents.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          d.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (d.country_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCountry = selectedCountryFilter === 'all' || d.country_id === selectedCountryFilter;
    return matchesSearch && matchesCountry;
  });
  const paginatedDocs = filteredDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-2">
        <div className="flex space-x-1 rounded-xl bg-white/5 p-1 w-fit border border-white/10">
          <button
            onClick={() => handleTabChange('countries')}
            className={`flex items-center justify-center space-x-2 rounded-lg py-2 px-6 text-sm font-medium transition-all ${
              activeTab === 'countries' 
                ? 'bg-white text-black shadow' 
                : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Globe size={16} />
            <span>Países</span>
          </button>
          <button
            onClick={() => handleTabChange('documents')}
            className={`flex items-center justify-center space-x-2 rounded-lg py-2 px-6 text-sm font-medium transition-all ${
              activeTab === 'documents' 
                ? 'bg-white text-black shadow' 
                : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <FileText size={16} />
            <span>Tipos de Documento</span>
          </button>
        </div>
      </div>

      <AdminPanel className="flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
          <div className="flex items-center space-x-3 w-full max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder={activeTab === 'countries' ? "Buscar país..." : "Buscar documento..."}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all"
              />
            </div>
            {activeTab === 'documents' && (
              <div className="w-48 z-10">
                <CustomDropdown
                  value={selectedCountryFilter}
                  onChange={(val) => { setSelectedCountryFilter(val); setPage(1); }}
                  placeholder="Todos los países"
                  variant="admin"
                  options={[
                    { value: 'all', label: 'Todos los países' },
                    ...countries.map(c => ({
                      value: c.id,
                      label: c.name,
                      icon: <img src={`https://flagcdn.com/w20/${(c.iso2 || '').toLowerCase()}.png`} alt={c.iso2} className="w-4 h-3 object-cover rounded-[2px]" />
                    }))
                  ]}
                />
              </div>
            )}
          </div>
          {canManage && (
            activeTab === 'countries' ? (
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
            )
          )}
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'countries' && (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">País</th>
                  <th className="px-6 py-4 font-medium">ISO2</th>
                  <th className="px-6 py-4 font-medium">Dial Code</th>
                  <th className="px-6 py-4 font-medium text-center">Estado</th>
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#06CFD6]" /></td></tr>
                ) : paginatedCountries.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30">No hay países que coincidan con la búsqueda.</td></tr>
                ) : (
                  paginatedCountries.map((c: any) => (
                    <tr key={c.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-white/90 font-medium">
                        <div className="flex items-center gap-3">
                          <img src={`https://flagcdn.com/w20/${(c.iso2 || '').toLowerCase()}.png`} alt={c.iso2} className="w-5 h-3.5 object-cover rounded-[2px]" />
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/60">{c.iso2}</td>
                      <td className="px-6 py-4 text-white/60">{c.dial_code || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${c.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {c.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="relative px-6 py-4 text-center" data-org-actions>
                        {canManage && (
                          <button 
                            onClick={(e) => handleOpenActions(e, c.id, 'country')} 
                            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                            aria-haspopup="menu"
                            aria-expanded={actionsMenu?.id === c.id}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
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
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#06CFD6]" /></td></tr>
                ) : paginatedDocs.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30">No hay documentos que coincidan con la búsqueda.</td></tr>
                ) : (
                  paginatedDocs.map((d: any) => (
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
                      <td className="relative px-6 py-4 text-center" data-org-actions>
                        {canManage && (
                          <button 
                            onClick={(e) => handleOpenActions(e, d.id, 'doc')} 
                            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                            aria-haspopup="menu"
                            aria-expanded={actionsMenu?.id === d.id}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <PaginationControl
          currentPage={page}
          totalItems={activeTab === 'countries' ? filteredCountries.length : filteredDocs.length}
          itemsPerPage={PAGE_SIZE}
          onPageChange={setPage}
          disabled={loading}
        />
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

      <AnimatePresence>
        {actionsMenu && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'bottom' ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'bottom' ? 6 : -6 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'fixed', top: actionsMenu.top, left: actionsMenu.left }}
            className={`fixed z-[100] w-36 overflow-hidden rounded-xl border border-white/10 bg-[#121212] text-left shadow-xl ${
              actionsMenu.placement === 'bottom' ? 'origin-top-right' : 'origin-bottom-right'
            }`}
          >
            <div className="flex flex-col gap-1 px-1 py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (actionsMenu.type === 'country') {
                    const c = countries.find(x => x.id === actionsMenu.id);
                    setEditingCountry(c);
                    setIsCountryModalOpen(true);
                  } else {
                    const d = documents.find(x => x.id === actionsMenu.id);
                    setEditingDoc(d);
                    setIsDocModalOpen(true);
                  }
                  setActionsMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Edit className="h-4 w-4" />
                Editar
              </button>
              
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (actionsMenu.type === 'country') {
                    handleDeleteCountry(actionsMenu.id);
                  } else {
                    handleDeleteDoc(actionsMenu.id);
                  }
                  setActionsMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
