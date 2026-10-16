import React, { useState, useMemo } from 'react';
import { X, Calendar, Plus, Trash2, Search, Loader2, Sparkles } from 'lucide-react';
import ShineBorder from '../../ui/shine-border';
import PaginationControl from '../../ui/PaginationControl';
import { ConfirmModal } from '../../ui/ConfirmModal';
import CustomDropdown from '../../ui/CustomDropdown';
import { apiRequest } from '../../../lib/api';
import { useToastStore } from '../../../stores/toastStore';

export interface HolidayItem {
  id: string;
  country_id: string;
  month: number;
  day: number;
  year: number | null;
  description: string;
  country_code?: string;
  country_name?: string;
}

interface SystemHolidaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  holidays: HolidayItem[];
  onRefresh: () => Promise<void>;
  countryIdPE: string;
}

const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

const MONTH_OPTIONS = MONTHS.map(m => ({
  value: String(m.value),
  label: m.label,
}));

export const SystemHolidaysModal: React.FC<SystemHolidaysModalProps> = ({
  isOpen,
  onClose,
  holidays,
  onRefresh,
  countryIdPE,
}) => {
  const { addToast } = useToastStore();
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'recurring' | 'specific'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;

  // New holiday form
  const [newHoliday, setNewHoliday] = useState({
    day: 1,
    month: 1,
    year: '' as string | number,
    description: '',
  });

  // Delete confirmation
  const [holidayToDelete, setHolidayToDelete] = useState<HolidayItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filtered and sorted holidays
  const filteredHolidays = useMemo(() => {
    let result = [...holidays];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        h =>
          h.description.toLowerCase().includes(term) ||
          String(h.day).includes(term) ||
          (MONTHS.find(m => m.value === h.month)?.label.toLowerCase().includes(term) ?? false) ||
          (h.year && String(h.year).includes(term))
      );
    }

    // Type filter
    if (typeFilter === 'recurring') {
      result = result.filter(h => !h.year);
    } else if (typeFilter === 'specific') {
      result = result.filter(h => !!h.year);
    }

    // Sort chronologically by month and day
    return result.sort((a, b) => {
      if (a.month !== b.month) return a.month - b.month;
      return a.day - b.day;
    });
  }, [holidays, searchTerm, typeFilter]);

  // Paginated holidays
  const paginatedHolidays = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredHolidays.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredHolidays, currentPage]);

  if (!isOpen) return null;

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday.description.trim()) return;

    setAdding(true);
    try {
      let cid = countryIdPE;
      if (!cid) {
        const locRes = await apiRequest<{ items: any[] }>('/admin/localization/countries');
        const pe = locRes.items.find(c => c.iso2 === 'PE');
        if (pe) cid = pe.id;
      }
      if (!cid) throw new Error('No se pudo determinar el ID de Perú.');

      await apiRequest('/admin/system-holidays', {
        method: 'POST',
        json: {
          country_id: cid,
          month: Number(newHoliday.month),
          day: Number(newHoliday.day),
          year: newHoliday.year ? Number(newHoliday.year) : null,
          description: newHoliday.description.trim(),
        },
      });

      addToast('Feriado agregado exitosamente.', 'success');
      setNewHoliday({ day: 1, month: 1, year: '', description: '' });
      await onRefresh();
      setCurrentPage(1);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al agregar feriado', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!holidayToDelete) return;
    setDeleting(true);
    try {
      await apiRequest(`/admin/system-holidays/${holidayToDelete.id}`, { method: 'DELETE' });
      addToast('Feriado eliminado exitosamente.', 'success');
      setHolidayToDelete(null);
      await onRefresh();

      // If last item on page was deleted, adjust page
      if (paginatedHolidays.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al eliminar feriado', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        onMouseDown={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <ShineBorder
          borderRadius={16}
          borderWidth={1.5}
          color={['#06CFD6', '#3b82f6', '#06CFD6']}
          className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-[#0a0a0a] shadow-[0_0_50px_-12px_rgba(6,207,214,0.18)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#06CFD6]/10 text-[#06CFD6] border border-[#06CFD6]/20">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-wide text-white/95">
                    Feriados del Sistema
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-[#06CFD6]">
                    {holidays.length} fechas
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  Cálculo de plazos legales y días hábiles no laborables
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              title="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Formulario de Alta Rápida */}
            <form
              onSubmit={handleAddHoliday}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4.5"
            >
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                <Sparkles className="h-3.5 w-3.5 text-[#06CFD6]" />
                <span>Registrar Nuevo Feriado</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/50">
                    Día
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={newHoliday.day}
                    onChange={e =>
                      setNewHoliday({ ...newHoliday, day: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none transition-colors focus:border-[#06CFD6]/50 focus:ring-1 focus:ring-[#06CFD6]/30"
                    required
                  />
                </div>

                <div className="sm:col-span-3 relative z-30">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/50">
                    Mes
                  </label>
                  <CustomDropdown
                    value={String(newHoliday.month)}
                    onChange={val =>
                      setNewHoliday({ ...newHoliday, month: Number(val) })
                    }
                    options={MONTH_OPTIONS}
                    placeholder="Seleccionar mes..."
                    variant="admin"
                    triggerClassName="!py-2 !px-3"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/50">
                    Año
                  </label>
                  <input
                    type="number"
                    placeholder="Recurrente"
                    value={newHoliday.year}
                    onChange={e => setNewHoliday({ ...newHoliday, year: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#06CFD6]/50 focus:ring-1 focus:ring-[#06CFD6]/30"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/50">
                    Descripción
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Año Nuevo"
                    value={newHoliday.description}
                    onChange={e =>
                      setNewHoliday({ ...newHoliday, description: e.target.value })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#06CFD6]/50 focus:ring-1 focus:ring-[#06CFD6]/30"
                    required
                  />
                </div>

                <div className="flex items-end sm:col-span-2">
                  <button
                    type="submit"
                    disabled={adding || !newHoliday.description.trim()}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#06CFD6] px-3 py-2 text-sm font-semibold text-black transition-all hover:bg-[#06CFD6]/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {adding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                Deja el campo <strong className="text-white/60">Año</strong> vacío para feriados que se repiten anualmente de forma recurrente.
              </p>
            </form>

            {/* Barra de Filtros y Búsqueda */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 h-4 w-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar por nombre o fecha..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/20"
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === 'all'
                      ? 'bg-white/15 text-white'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  Todos ({holidays.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('recurring');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === 'recurring'
                      ? 'bg-white/15 text-white'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  Recurrentes ({holidays.filter(h => !h.year).length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('specific');
                    setCurrentPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === 'specific'
                      ? 'bg-white/15 text-white'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  Específicos ({holidays.filter(h => !!h.year).length})
                </button>
              </div>
            </div>

            {/* Tabla de Feriados */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <table className="w-full text-left text-sm text-white/70">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-white/40">
                  <tr>
                    <th className="px-5 py-3 font-medium tracking-wider">Fecha</th>
                    <th className="px-5 py-3 font-medium tracking-wider">Descripción</th>
                    <th className="px-5 py-3 font-medium tracking-wider">Tipo</th>
                    <th className="px-5 py-3 text-right font-medium tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedHolidays.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-white/40">
                        {searchTerm.trim() || typeFilter !== 'all'
                          ? 'No se encontraron feriados con los filtros aplicados'
                          : 'No hay feriados registrados'}
                      </td>
                    </tr>
                  ) : (
                    paginatedHolidays.map(holiday => (
                      <tr
                        key={holiday.id}
                        className="transition-colors hover:bg-white/[0.02]"
                      >
                          <td className="px-5 py-3.5 font-mono text-xs">
                            <span className="font-semibold text-white/95">
                              {String(holiday.day).padStart(2, '0')}/
                              {String(holiday.month).padStart(2, '0')}
                            </span>
                            {holiday.year ? (
                              <span className="text-white/50">/{holiday.year}</span>
                            ) : (
                              <span className="ml-1.5 text-[10px] text-[#06CFD6]/80 font-sans">
                                (anual)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-medium text-white/90">
                            {holiday.description}
                          </td>
                          <td className="px-5 py-3.5">
                            {holiday.year ? (
                              <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                                Específico ({holiday.year})
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-[#06CFD6]/20 bg-[#06CFD6]/10 px-2 py-0.5 text-xs font-medium text-[#06CFD6]">
                                Recurrente
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setHolidayToDelete(holiday)}
                              className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                              title="Eliminar feriado"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
              </table>

              {/* Paginación */}
              {filteredHolidays.length > PAGE_SIZE && (
                <PaginationControl
                  currentPage={currentPage}
                  totalItems={filteredHolidays.length}
                  itemsPerPage={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 bg-white/[0.01]">
            <p className="text-xs text-white/40">
              Total: {filteredHolidays.length} feriados {typeFilter !== 'all' ? 'filtrados' : ''}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/10 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Cerrar
            </button>
          </div>
        </ShineBorder>
      </div>

      {/* Confirmación para eliminar */}
      <ConfirmModal
        isOpen={!!holidayToDelete}
        title="Eliminar Feriado del Sistema"
        message={`¿Estás seguro de eliminar el feriado "${holidayToDelete?.description}" (${String(holidayToDelete?.day).padStart(2, '0')}/${String(holidayToDelete?.month).padStart(2, '0')}${holidayToDelete?.year ? `/${holidayToDelete.year}` : ''})? Esta fecha dejará de ser considerada no laborable en los plazos legales.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setHolidayToDelete(null)}
        type="danger"
        confirmText={deleting ? 'Eliminando...' : 'Eliminar Feriado'}
        cancelText="Cancelar"
      />
    </>
  );
};

export default SystemHolidaysModal;
