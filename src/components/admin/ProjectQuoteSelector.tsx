import React, { useEffect, useMemo, useState } from 'react';
import { Eye, FileText, X } from 'lucide-react';
import CustomDropdown from '../ui/CustomDropdown';
import ShineBorder from '../ui/shine-border';
import { fetchProjectQuotesByEmail, type ProjectQuoteOption } from '../../lib/api';
import { formatCurrencyValue } from '../../hooks/useQuoterState';

type Props = {
  email: string;
  value: string;
  onChange: (quote: ProjectQuoteOption | null) => void;
};

const ProjectQuoteSelector: React.FC<Props> = ({ email, value, onChange }) => {
  const [quotes, setQuotes] = useState<ProjectQuoteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const selectedQuote = useMemo(() => quotes.find((quote) => quote.id === value) ?? null, [quotes, value]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuotes([]);
    setViewerOpen(false);
    if (!email) return () => { active = false; };
    setLoading(true);
    fetchProjectQuotesByEmail(email)
      .then((items) => {
        if (active) {
          const validQuotes = items.filter((q: any) => {
            const isInvalidStatus = ['expired', 'rejected'].includes(q.status);
            const isAdenda = q.items?.some((item: any) => ['revision_basic', 'revision_custom', 'revision_mid'].includes(item.item_code));
            return !isInvalidStatus && !isAdenda;
          });
          setQuotes(validQuotes);
        }
      })
      .catch(() => { if (active) setQuotes([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [email]);

  const unavailable = !email || loading || quotes.length === 0;
  const options = [
    { value: '__none__', label: 'Sin cotización asociada' },
    ...quotes.map((quote) => ({
      value: quote.id,
      label: `${quote.quote_code} - ${formatCurrencyValue(Number(quote.total_amount), quote.currency_code)}`,
    })),
  ];

  return (
    <>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wider text-white/45">Cotización Asociada</span>
          {selectedQuote && <button type="button" onClick={() => setViewerOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200"><Eye className="h-3.5 w-3.5" />Ver detalles</button>}
        </div>
        <CustomDropdown
          value={value || '__none__'}
          onChange={(quoteId) => onChange(quoteId === '__none__' ? null : quotes.find((quote) => quote.id === quoteId) ?? null)}
          placeholder={loading ? 'Cargando cotizaciones...' : 'Seleccionar cotización...'}
          options={options}
          disabled={unavailable}
        />
        {!email && <p className="text-xs text-white/35">Selecciona primero un cliente.</p>}
        {email && !loading && quotes.length === 0 && <p className="text-xs text-amber-300/70">Este cliente no tiene cotizaciones válidas registradas</p>}
      </div>

      {viewerOpen && selectedQuote && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewerOpen(false); }}>
          <ShineBorder
            borderRadius={16}
            borderWidth={1.5}
            color={['#06CFD6', '#3b82f6', '#06CFD6']}
            className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-[0_0_50px_-12px_rgba(6,207,214,0.18)] md:p-8"
          >
            <div className="mb-6 flex items-start justify-between border-b border-white/5 pb-4">
              <div className="flex gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-lg font-semibold text-white/90">{selectedQuote.quote_code}</h2>
                  <p className="mt-1 text-xs text-white/40">Vista de solo lectura · {selectedQuote.status_name}</p>
                </div>
              </div>
              <button type="button" onClick={() => setViewerOpen(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/5">
                <X className="h-5 w-5" />
              </button>
            </div>
            <fieldset disabled className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/40">Cliente</span><input value={`${selectedQuote.first_name} ${selectedQuote.last_name ?? ''}`.trim()} readOnly className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-white/65" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/40">Correo</span><input value={selectedQuote.primary_email} readOnly className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-white/65" /></label>
                <label className="grid gap-1.5"><span className="text-xs uppercase tracking-wider text-white/40">Total</span><input value={formatCurrencyValue(Number(selectedQuote.total_amount), selectedQuote.currency_code)} readOnly className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-white/75" /></label>
              </div>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
                    <tr><th className="px-4 py-3">Elemento</th><th className="px-4 py-3 text-center">Cantidad</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {selectedQuote.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-white/70">{item.name}<span className="ml-2 text-[10px] uppercase text-white/30">{item.recurrence !== 'none' ? item.recurrence : ''}</span></td>
                        <td className="px-4 py-3 text-center text-white/55">{item.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono text-white/55">{formatCurrencyValue(Number(item.unit_price), selectedQuote.currency_code)}</td>
                        <td className="px-4 py-3 text-right font-mono text-white/75">{formatCurrencyValue(Number(item.subtotal), selectedQuote.currency_code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedQuote.items.length === 0 && <p className="p-6 text-center text-sm text-white/35">Sin elementos registrados.</p>}
              </div>
              {selectedQuote.payment_policy && (
                <label className="grid gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-white/40">Políticas y observaciones</span>
                  <textarea value={selectedQuote.payment_policy} readOnly rows={4} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55" />
                </label>
              )}
            </fieldset>
            <div className="mt-6 flex justify-end border-t border-white/5 pt-5">
              <button type="button" onClick={() => setViewerOpen(false)} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/70 hover:bg-white/5 transition-colors">Cerrar</button>
            </div>
          </ShineBorder>
        </div>
      )}
    </>
  );
};

export default ProjectQuoteSelector;
