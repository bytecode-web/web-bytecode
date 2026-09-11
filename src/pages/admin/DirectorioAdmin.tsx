import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { Users, Building2, Search, Plus, MoreVertical, RefreshCw, Edit, Trash2 } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import AdminPanel from '../../components/admin/AdminPanel';
import PaginationControl from '../../components/ui/PaginationControl';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import OrganizationModal from '../../components/admin/directorio/OrganizationModal';
import CustomerModal from '../../components/admin/directorio/CustomerModal';
import OrganizationContactsModal from '../../components/admin/directorio/OrganizationContactsModal';
import { fetchCountries, fetchDocumentTypes } from '../../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_SIZE = 9;

export default function DirectorioAdmin() {
  const [activeTab, setActiveTab] = useState<'empresas' | 'personas'>('empresas');
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const addToast = useToastStore((state) => state.addToast);
  const [actionsMenu, setActionsMenu] = useState<{ id: string, top: number, left: number, placement: string } | null>(null);

  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [isCustModalOpen, setIsCustModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<any>(null);
  const [confirmModalState, setConfirmModalState] = useState<{isOpen: boolean; id: string; type: 'empresa'|'persona'} | null>(null);

  const [isOrgContactsModalOpen, setIsOrgContactsModalOpen] = useState(false);
  const [selectedOrgForContacts, setSelectedOrgForContacts] = useState<any>(null);

  const [countries, setCountries] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);
  const [allOrgs, setAllOrgs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetchCountries(),
      fetchDocumentTypes(),
      apiRequest<{items: any[]}>('/admin/organizations?limit=1000').catch(() => ({items: []}))
    ]).then(([cRes, dRes, orgRes]) => {
      setCountries(cRes);
      setDocumentTypes(dRes);
      setAllOrgs(orgRes.items);
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [page, activeTab, statusFilter]);

  useEffect(() => {
    const handleGlobalClick = () => setActionsMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setActionsMenu(null);
    try {
      if (activeTab === 'empresas') {
        const [res, allOrgsRes] = await Promise.all([
          apiRequest<{ items: any[], total: number }>(`/admin/organizations?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&status=${statusFilter}`),
          apiRequest<{items: any[]}>('/admin/organizations?limit=1000').catch(() => ({items: []}))
        ]);
        if (res.items.length === 0 && res.total > 0 && page > 1) { setPage(page - 1); return; }
        setOrganizations(res.items || []);
        setTotal(res.total || 0);
        setAllOrgs(allOrgsRes.items || []);
      } else {
        const res = await apiRequest<{ items: any[], total: number }>(`/admin/customers?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&status=${statusFilter}`);
        if (res.items.length === 0 && res.total > 0 && page > 1) { setPage(page - 1); return; }
        setCustomers(res.items || []);
        setTotal(res.total || 0);
      }
    } catch (err: any) {
      addToast(err.message || 'Error cargando directorio', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: 'empresas' | 'personas') => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleOpenActions = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (actionsMenu?.id === id) {
      setActionsMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownHeight = 140;
    const padding = 16;
    let top = rect.bottom + window.scrollY;
    let left = rect.left - 100 + window.scrollX;
    let placement: 'top' | 'bottom' = 'bottom';
    if (top + dropdownHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - dropdownHeight - padding;
      placement = 'top';
    }
    setActionsMenu({
      id,
      top,
      left,
      placement,
    });
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

  const handleDelete = async () => {
    if (!confirmModalState) return;
    try {
      const endpoint = confirmModalState.type === 'empresa' ? `/admin/organizations/${confirmModalState.id}` : `/admin/customers/${confirmModalState.id}`;
      await apiRequest(endpoint, { method: 'DELETE' });
      addToast('Registro eliminado correctamente', 'success');
      setConfirmModalState(null);
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Error al eliminar', 'error');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const endpoint = activeTab === 'empresas' ? `/admin/organizations/${id}/restore` : `/admin/customers/${id}/restore`;
      await apiRequest(endpoint, { method: 'PATCH' });
      addToast('Registro restaurado correctamente', 'success');
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Error al restaurar', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Directorio CRM</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Gestión centralizada de Empresas y Contactos</p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
            <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Controles: Tabs y Filtros */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex space-x-1 rounded-xl bg-white/5 p-1 w-fit border border-white/10">
          <button
            onClick={() => handleTabChange('empresas')}
            className={`flex items-center justify-center space-x-2 rounded-lg py-2 px-6 text-sm font-medium transition-all ${
              activeTab === 'empresas' 
                ? 'bg-white text-black shadow' 
                : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Building2 size={16} />
            <span>Empresas</span>
          </button>
          <button
            onClick={() => handleTabChange('personas')}
            className={`flex items-center justify-center space-x-2 rounded-lg py-2 px-6 text-sm font-medium transition-all ${
              activeTab === 'personas' 
                ? 'bg-white text-black shadow' 
                : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users size={16} />
            <span>Personas</span>
          </button>
        </div>

        {/* Filtros de Estado */}
        <div className="flex space-x-1 bg-white/5 p-1 rounded-lg border border-white/10">
          <button onClick={() => { setStatusFilter('all'); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}>Todos</button>
          <button onClick={() => { setStatusFilter('active'); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === 'active' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}>Activos</button>
          <button onClick={() => { setStatusFilter('inactive'); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === 'inactive' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}>Inactivos</button>
        </div>
      </div>

      <AdminPanel className="flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input 
              type="text" 
              placeholder={activeTab === 'empresas' ? "Buscar empresa..." : "Buscar persona..."}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all"
            />
          </div>
          <button 
            onClick={() => {
              setEditingId(null);
              setEditingData(null);
              if (activeTab === 'empresas') setIsOrgModalOpen(true);
              else setIsCustModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
          >
            <Plus size={16} />
            <span>{activeTab === 'empresas' ? 'Nueva Empresa' : 'Nuevo Contacto'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'empresas' ? (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Razón Social / Comercial</th>
                  <th className="px-6 py-4 font-medium">Identificación</th>
                  <th className="px-6 py-4 font-medium">País</th>
                  <th className="px-6 py-4 font-medium">Industria</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 text-center font-medium">Contactos</th>
                  <th className="px-6 py-4 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-white/30 text-sm">Cargando empresas...</td></tr>
                ) : organizations.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-white/30 text-sm">No hay empresas registradas.</td></tr>
                ) : (
                  organizations.map(org => (
                    <tr key={org.id} className={`transition-colors hover:bg-white/[0.02] ${!org.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{org.legal_name}</div>
                        {org.trade_name && org.trade_name !== org.legal_name && (
                          <div className="text-xs text-white/40 mt-1">{org.trade_name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-white/50 text-xs">{org.primary_document?.document_number || org.ruc}</td>
                      <td className="px-6 py-4">
                        {org.country_iso ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={`https://flagcdn.com/w20/${org.country_iso.toLowerCase()}.png`}
                              srcSet={`https://flagcdn.com/w40/${org.country_iso.toLowerCase()}.png 2x`}
                              alt={org.country_name || org.country_iso}
                              className="w-5 h-auto object-contain rounded-sm shadow-sm"
                              title={org.country_name}
                            />
                            <span className="text-white/80 text-xs font-medium">{org.country_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-white/30 italic">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border bg-white/5 border-white/10 text-white/70">
                          {org.industry || 'No especificada'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${org.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {org.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center space-x-1 text-white/50">
                          <Users size={12} />
                          <span className="text-xs">{org.contacts_count}</span>
                        </div>
                      </td>
                      <td className="relative px-6 py-4 text-center" data-org-actions>
                        <button 
                          onClick={(e) => handleOpenActions(e, org.id)} 
                          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                          aria-haspopup="menu"
                          aria-expanded={actionsMenu?.id === org.id}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] text-white/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre y Correo</th>
                  <th className="px-6 py-4 font-medium">Documento</th>
                  <th className="px-6 py-4 font-medium">País</th>
                  <th className="px-6 py-4 font-medium">Teléfono</th>
                  <th className="px-6 py-4 font-medium">Empresa (B2B)</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-white/30 text-sm">Cargando personas...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-white/30 text-sm">No hay personas registradas.</td></tr>
                ) : (
                  customers.map(cust => (
                    <tr key={cust.id} className={`transition-colors hover:bg-white/[0.02] ${!cust.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{cust.display_name}</div>
                        <div className="text-xs text-white/50 mt-1">{cust.primary_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {cust.document_number ? (
                          <div className="flex flex-col">
                            <span className="text-white text-sm font-mono">{cust.document_number}</span>
                            <span className="text-white/40 text-[10px] uppercase tracking-wider mt-0.5">{cust.document_type_name || 'DOC'}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-white/30 italic">Sin documento</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {cust.country_iso ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={`https://flagcdn.com/w20/${cust.country_iso.toLowerCase()}.png`}
                              srcSet={`https://flagcdn.com/w40/${cust.country_iso.toLowerCase()}.png 2x`}
                              alt={cust.country_name || cust.country_iso}
                              className="w-5 h-auto object-contain rounded-sm shadow-sm"
                              title={cust.country_name}
                            />
                            <span className="text-white/80 text-xs font-medium">{cust.country_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-white/30 italic">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-white/60 text-xs font-mono">{cust.primary_phone || '-'}</td>
                      <td className="px-6 py-4">
                        {cust.organizations && cust.organizations.length > 0 ? (
                          <div className="flex items-center space-x-1.5 text-white/70">
                            <Building2 size={12} className="text-white/40" />
                            <span className="text-xs truncate max-w-[200px]" title={cust.organizations[0].name}>{cust.organizations[0].name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-white/30 italic">No asociado</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${cust.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {cust.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="relative px-6 py-4 text-center" data-org-actions>
                        <button 
                          onClick={(e) => handleOpenActions(e, cust.id)} 
                          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                          aria-haspopup="menu"
                          aria-expanded={actionsMenu?.id === cust.id}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      </AdminPanel>

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
                  const item = activeTab === 'empresas' ? organizations.find(o => o.id === actionsMenu.id) : customers.find(c => c.id === actionsMenu.id);
                  setEditingId(actionsMenu.id);
                  setEditingData(item);
                  if (activeTab === 'empresas') setIsOrgModalOpen(true);
                  else setIsCustModalOpen(true);
                  setActionsMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Edit className="h-4 w-4" />
                Editar
              </button>
              
              {activeTab === 'empresas' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const item = organizations.find(o => o.id === actionsMenu.id);
                    setSelectedOrgForContacts(item);
                    setIsOrgContactsModalOpen(true);
                    setActionsMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Users className="h-4 w-4" />
                  Contactos
                </button>
              )}
              {(() => {
                const item = activeTab === 'empresas' ? organizations.find(o => o.id === actionsMenu.id) : customers.find(c => c.id === actionsMenu.id);
                const isActive = item?.is_active ?? true;
                
                return !isActive ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      handleRestore(actionsMenu.id);
                      setActionsMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Restaurar
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setConfirmModalState({ isOpen: true, id: actionsMenu.id, type: activeTab === 'empresas' ? 'empresa' : 'persona' });
                      setActionsMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <OrganizationModal
        isOpen={isOrgModalOpen}
        onClose={() => setIsOrgModalOpen(false)}
        onSuccess={() => {
          setIsOrgModalOpen(false);
          addToast(editingId ? 'Empresa actualizada' : 'Empresa guardada', 'success');
          fetchData();
        }}
        editingId={editingId}
        initialData={editingData}
        countries={countries}
        documentTypes={documentTypes}
      />

      <CustomerModal
        isOpen={isCustModalOpen}
        onClose={() => setIsCustModalOpen(false)}
        onSuccess={() => {
          setIsCustModalOpen(false);
          addToast(editingId ? 'Contacto actualizado' : 'Contacto guardado', 'success');
          fetchData();
        }}
        editingId={editingId}
        initialData={editingData}
        countries={countries}
        documentTypes={documentTypes}
        organizations={allOrgs}
      />

      <OrganizationContactsModal
        isOpen={isOrgContactsModalOpen}
        onClose={() => {
          setIsOrgContactsModalOpen(false);
          setSelectedOrgForContacts(null);
          // Refrescar data para reflejar contador de contactos actualizado
          fetchData();
        }}
        organization={selectedOrgForContacts}
      />

      <ConfirmModal
        isOpen={confirmModalState?.isOpen || false}
        title="Eliminar Registro"
        message="¿Estás seguro de que deseas eliminar este registro? La acción preservará el historial de operaciones relacionadas (soft-delete)."
        type="danger"
        confirmText="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmModalState(null)}
      />
    </div>
  );
}
