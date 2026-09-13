import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { Calculator, Edit, MoreVertical, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminPanel from '../../components/admin/AdminPanel';
import DynamicQuoter from '../../components/admin/DynamicQuoter';
import { apiRequest } from '../../lib/api';
import { useTerminalState } from '../../hooks/useTerminalState';
import CustomDropdown from '../../components/ui/CustomDropdown';
import StatusHistoryTimeline from '../../components/admin/StatusHistoryTimeline';
import type { StatusCatalogItem, StatusHistoryRecord } from '../../types/status';
import PaginationControl from '../../components/ui/PaginationControl';
import { ConfirmModal, type ConfirmModalProps } from '../../components/ui/ConfirmModal';
import { useLocation } from 'react-router-dom';
import { formatCurrencyValue, useQuoterState, type EditableQuoteItemData, type PreparedQuotePayload, type PricingCatalogItem } from '../../hooks/useQuoterState';

const PAGE_SIZE = 9;

export interface Quote {
  id: string;
  quote_code: string;
  total_amount: string;
  currency_code?: string;
  acquisitionChannel?: string;
  organization_id?: string | null;
  status: string;
  isTerminal?: boolean;
  status_name?: string;
  created_at: string;
  first_name: string;
  primary_email: string;
}

type QuoteDetailResponse = {
  quote: Quote & {
    payment_policy?: string | null;
  };
  items: EditableQuoteItemData[];
};

type ActionMenuState = {
  quoteId: string;
  top: number;
  left: number;
  placement: 'bottom' | 'top';
};

const AdminCotizador: React.FC = () => {
  const { addToast } = useToastStore();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [catalog, setCatalog] = useState<PricingCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionsMenu, setActionsMenu] = useState<ActionMenuState | null>(null);
  const [confirmModal, setConfirmModal] = useState<Omit<ConfirmModalProps, 'isOpen' | 'onCancel'> | null>(null);
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    notes: '',
    organizationId: null as string | null,
    acquisitionChannel: 'web_form',
    currencyCode: 'PEN',
    status: 'draft',
    isTerminal: false,
  });
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; ruc?: string; tax_name?: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; email: string; name: string; organization_ids: string[] }>>([]);
  const [exchangeRates, setExchangeRates] = useState<{ USD: number; EUR: number; PEN: number }>({ USD: 3.75, EUR: 4.05, PEN: 1 });
  const [statuses, setStatuses] = useState<StatusCatalogItem[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const setCatalogInStore = useQuoterState((state) => state.setCatalog);
  const loadQuoteForEditing = useQuoterState((state) => state.loadQuoteForEditing);
  const resetQuoter = useQuoterState((state) => state.resetQuoter);
  const editingQuoteId = useQuoterState((state) => state.editingQuoteId);
  const { isReadOnly } = useTerminalState({ isTerminal: formData.isTerminal });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [quotesRes, catalogRes, statusesRes, optionsRes] = await Promise.all([
        apiRequest<{ data: Quote[]; total: number }>(`/admin/quotes?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
        apiRequest<{ items: PricingCatalogItem[] }>('/admin/catalog/pricing'),
        apiRequest<{ items: StatusCatalogItem[] }>('/catalog/statuses?domain=quote'),
        apiRequest<{ organizations: Array<{ id: string; name: string; ruc?: string; tax_name?: string }>; customers: Array<{ id: string; email: string; name: string; organization_ids: string[] }>; exchangeRates?: { USD: number; EUR: number; PEN: number } }>('/admin/quotes/options'),
      ]);
      if (quotesRes.data.length === 0 && quotesRes.total > 0 && page > 1) { setPage(page - 1); return; }
      setQuotes(quotesRes.data);
      setTotal(quotesRes.total);
      setCatalog(catalogRes.items);
      setStatuses(statusesRes.items);
      setOrganizations(optionsRes.organizations || []);
      setCustomers(optionsRes.customers || []);
      if (optionsRes.exchangeRates) setExchangeRates(optionsRes.exchangeRates);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cargar cotizaciones', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, setCatalog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!actionsMenu) return;

    const closeActionsMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-quote-actions]')) return;
      setActionsMenu(null);
    };
    const closeActionsMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsMenu(null);
    };
    const closeActionsMenuOnLayoutChange = () => setActionsMenu(null);

    document.addEventListener('click', closeActionsMenu);
    document.addEventListener('keydown', closeActionsMenuOnEscape);
    window.addEventListener('resize', closeActionsMenuOnLayoutChange);
    window.addEventListener('scroll', closeActionsMenuOnLayoutChange, true);
    return () => {
      document.removeEventListener('click', closeActionsMenu);
      document.removeEventListener('keydown', closeActionsMenuOnEscape);
      window.removeEventListener('resize', closeActionsMenuOnLayoutChange);
      window.removeEventListener('scroll', closeActionsMenuOnLayoutChange, true);
    };
  }, [actionsMenu]);

  const openNewQuote = () => {
    setCatalogInStore(catalog);
    resetQuoter();
    setFormData({ customerName: '', customerEmail: '', notes: '', organizationId: null, acquisitionChannel: 'web_form', currencyCode: 'PEN', status: statuses[0]?.code ?? 'draft', isTerminal: false });
    setStatusHistory([]);
    setIsModalOpen(true);
  };

  const handleEditQuote = async (quoteId: string) => {
    setActionsMenu(null);
    setLoading(true);
    try {
      setCatalogInStore(catalog);
      const [detail, historyResult] = await Promise.all([
        apiRequest<QuoteDetailResponse>(`/admin/quotes/${quoteId}`),
        apiRequest<{ items: StatusHistoryRecord[] }>(`/admin/quotes/${quoteId}/history`),
      ]);
      const quoteRate = detail.quote.currency_code === 'USD' ? exchangeRates.USD : detail.quote.currency_code === 'EUR' ? exchangeRates.EUR : 1;
      const normalizedItems = detail.items.map((item) => ({
        ...item,
        unit_price: item.unit_price !== null && item.unit_price !== undefined ? Number(item.unit_price) * quoteRate : item.unit_price,
      }));
      loadQuoteForEditing({ id: detail.quote.id }, normalizedItems);
      setFormData({
        customerName: detail.quote.first_name || '',
        customerEmail: detail.quote.primary_email || '',
        notes: detail.quote.payment_policy || '',
        organizationId: detail.quote.organization_id ?? null,
        acquisitionChannel: detail.quote.acquisitionChannel ?? 'web_form',
        currencyCode: detail.quote.currency_code ?? 'PEN',
        status: detail.quote.status,
        isTerminal: Boolean(detail.quote.isTerminal),
      });
      setStatusHistory(historyResult.items);
      setIsModalOpen(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cargar cotizacion', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuote = (quote: Quote) => {
    setActionsMenu(null);
    setConfirmModal({
      title: 'Eliminar Cotización',
      message: `¿Eliminar la cotizacion ${quote.quote_code}? Esta accion no se mostrara en el historial.`,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          await apiRequest(`/admin/quotes/${quote.id}`, { method: 'DELETE' });
          if (editingQuoteId === quote.id) {
            resetQuoter();
            setIsModalOpen(false);
          }
          await loadData();
        addToast('Operación completada con éxito', 'success');
    } catch (err) {
          addToast(err instanceof Error ? err.message : 'Error al eliminar cotizacion', 'error');
        } finally {
          setLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const handleCreate = async (payload: PreparedQuotePayload) => {
    if (!payload.baseCatalogItemId || payload.items.length === 0) {
      addToast('No se encontro el lienzo base de la cotizacion.', 'error');
      return;
    }

    setLoading(true);
    try {
      const activeRate = formData.currencyCode === 'USD' ? exchangeRates.USD : formData.currencyCode === 'EUR' ? exchangeRates.EUR : 1;
      await apiRequest('/admin/quotes', {
        method: 'POST',
        json: {
          editingQuoteId: payload.editingQuoteId,
          organizationId: formData.organizationId || null,
          acquisitionChannel: formData.acquisitionChannel || 'web_form',
          currencyCode: formData.currencyCode || 'PEN',
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          notes: formData.notes,
          status: formData.status,
          projectCategory: payload.projectCategory,
          legalNotes: payload.legalNotes,
          items: payload.items.map((item) => ({
            catalog_item_id: item.catalog_item_id,
            quantity: item.pricing_model === 'per_unit' ? Math.max(1, item.billable_quantity) : item.quantity,
            unit_price: Number((Math.abs(item.pricing_model === 'per_unit' && item.billable_quantity === 0 ? 0 : item.unit_price) / activeRate).toFixed(4)),
            discount_amount: Number(((item.discount_amount ?? 0) / activeRate).toFixed(4)),
            recurrence: item.recurrence,
            custom_name: item.pricing_model === 'per_unit' && item.free_included_quantity > 0
              ? `${item.name} (${item.quantity} solicitados, ${item.free_included_quantity} incluidos)`
              : item.name,
          })),
        },
      });
      setIsModalOpen(false);
      setFormData({ customerName: '', customerEmail: '', notes: '', organizationId: null, acquisitionChannel: 'web_form', currencyCode: 'PEN', status: statuses[0]?.code ?? 'draft', isTerminal: false });
      resetQuoter();
      await loadData();
    addToast('Operación completada con éxito', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al generar cotizacion', 'error');
    } finally {
      setLoading(false);
    }
  };

  const location = useLocation();
  const processedAutoOpenId = useRef<string | null>(null);

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && 'autoOpenId' in location.state) {
      const stateObj = location.state as { autoOpenId: string, notificationTimestamp?: number };
      const autoOpenId = stateObj.autoOpenId;
      const uniqueId = stateObj.notificationTimestamp ? `${autoOpenId}-${stateObj.notificationTimestamp}` : autoOpenId;
      
      if (autoOpenId && uniqueId !== processedAutoOpenId.current && catalog.length > 0 && !loading) {
        processedAutoOpenId.current = uniqueId;
        void (async () => {
          await loadData();
          await handleEditQuote(autoOpenId);
        })();
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, catalog.length, loading, loadData]);

  const formatDate = (val: string) =>
    new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(val));

  const openActionsMenu = (quoteId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 88;
    const gap = 8;
    const viewportPadding = 8;
    const hasSpaceBelow = rect.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;

    setActionsMenu((current) => current?.quoteId === quoteId
      ? null
      : {
        quoteId,
        left: Math.max(viewportPadding, rect.right - menuWidth),
        top: hasSpaceBelow ? rect.bottom + gap : rect.top - menuHeight - gap,
        placement: hasSpaceBelow ? 'bottom' : 'top',
      });
  };

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Cotizador</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-white/40">Generacion dinamica de cotizaciones</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Actualizar</span>
          </button>
          <button
            type="button"
            onClick={openNewQuote}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva Cotizacion</span>
          </button>
        </div>
      </div>

      <AdminPanel className="flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed whitespace-nowrap text-left text-sm">
            <thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="w-[16%] px-6 py-4 font-medium">Codigo</th>
                <th className="w-[16%] px-6 py-4 font-medium">Cliente</th>
                <th className="w-[16%] px-6 py-4 text-right font-medium">Monto Total</th>
                <th className="w-[16%] px-6 py-4 text-center font-medium">Estado</th>
                <th className="w-[16%] px-6 py-4 text-center font-medium">Fecha</th>
                <th className="w-[20%] px-6 py-4 text-center font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {quotes.map((quote) => (
                <tr key={quote.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-6 py-4 font-medium">
                    <span className="block truncate">{quote.quote_code}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="truncate font-medium">{quote.first_name || 'Desconocido'}</p>
                    <p className="truncate text-xs text-white/40">{quote.primary_email}</p>
                  </td>
                  <td className="px-6 py-4 text-right font-mono">{formatCurrencyValue(Number(quote.total_amount), quote.currency_code)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="rounded border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-white/60">
                      {quote.status_name || quote.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-xs text-white/40">
                    <span className="block truncate">{formatDate(quote.created_at)}</span>
                  </td>
                  <td className="relative px-6 py-4 text-center" data-quote-actions>
                    <button
                      type="button"
                      onClick={(event) => openActionsMenu(quote.id, event)}
                      className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                      aria-haspopup="menu"
                      aria-expanded={actionsMenu?.quoteId === quote.id}
                      aria-label={`Acciones para ${quote.quote_code}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                  </td>
                </tr>
              ))}
              {quotes.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-white/30">
                    No hay cotizaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControl currentPage={page} totalItems={total} itemsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      </AdminPanel>

      <AnimatePresence>
        {actionsMenu && (
          <motion.div
            role="menu"
            data-quote-actions
            initial={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'bottom' ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: actionsMenu.placement === 'bottom' ? 6 : -6 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-[100] w-36 overflow-hidden rounded-xl border border-white/10 bg-[#121212] text-left shadow-xl ${
              actionsMenu.placement === 'bottom' ? 'origin-top-right' : 'origin-bottom-right'
            }`}
            style={{ top: actionsMenu.top, left: actionsMenu.left }}
          >
            <div className="flex flex-col gap-1 px-1 py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleEditQuote(actionsMenu.quoteId)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Edit className="h-4 w-4" />
                Editar
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const quote = quotes.find((item) => item.id === actionsMenu.quoteId);
                  if (quote) void handleDeleteQuote(quote);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl md:p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-semibold text-white/90">{editingQuoteId ? 'Editar Cotizacion' : 'Nueva Cotizacion'}</h2>
              <button
                type="button"
                onClick={() => {
                  resetQuoter();
                  setIsModalOpen(false);
                }}
                className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <DynamicQuoter
              isReadOnly={isReadOnly}
              initialCatalog={catalog}
              customerName={formData.customerName}
              customerEmail={formData.customerEmail}
              notes={formData.notes}
              organizationId={formData.organizationId}
              acquisitionChannel={formData.acquisitionChannel}
              currencyCode={formData.currencyCode}
              exchangeRates={exchangeRates}
              organizations={organizations}
              customers={customers}
              loading={loading}
              error={''}
              primaryFieldsAfter={(
                <div className="mb-2 mt-2 space-y-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/50">Estado</label>
                    <CustomDropdown
                      value={formData.status}
                      placeholder="Seleccionar estado..."
                      onChange={(status) => setFormData({ ...formData, status })}
                      options={statuses
                        .filter((item) => editingQuoteId || !['expired', 'rejected'].includes(item.code))
                        .map((item) => ({ value: item.code, label: item.name }))}
                      disabled={isReadOnly}
                    />
                  </div>
                  {editingQuoteId && <StatusHistoryTimeline records={statusHistory} />}
                </div>
              )}
              onCustomerNameChange={(customerName) => setFormData((prev) => ({ ...prev, customerName }))}
              onCustomerEmailChange={(customerEmail) => setFormData((prev) => ({ ...prev, customerEmail }))}
              onNotesChange={(nextNotes) => setFormData((prev) => ({ ...prev, notes: nextNotes }))}
              onOrganizationChange={(organizationId) => setFormData((prev) => ({ ...prev, organizationId }))}
              onAcquisitionChannelChange={(acquisitionChannel) => setFormData((prev) => ({ ...prev, acquisitionChannel }))}
              onCurrencyCodeChange={(currencyCode) => setFormData((prev) => ({ ...prev, currencyCode }))}
              onCancel={() => {
                resetQuoter();
                setIsModalOpen(false);
              }}
              onGenerate={handleCreate}
            />
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          onCancel={() => setConfirmModal(null)}
          {...confirmModal}
        />
      )}
    </div>
  );
};

export default AdminCotizador;
