import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const DEFAULT_CURRENCIES: CurrencyOption[] = [
  { code: 'PEN', symbol: 'S/', label: 'PEN (S/)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
];

export interface CurrencyInputGroupProps {
  currencyValue: string;
  amountValue: string;
  onCurrencyChange: (currencyCode: string) => void;
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  placeholder?: string;
  maxLength?: number;
  currencies?: CurrencyOption[];
}

const CurrencyInputGroup: React.FC<CurrencyInputGroupProps> = ({
  currencyValue,
  amountValue,
  onCurrencyChange,
  onAmountChange,
  name = 'montoCuantificable',
  placeholder = 'Ej: 1500.00',
  maxLength = 50,
  currencies = DEFAULT_CURRENCIES,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCurrency =
    currencies.find((c) => c.code === currencyValue) || currencies[0] || {
      code: 'PEN',
      symbol: 'S/',
      label: 'PEN (S/)',
    };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: string) => {
    onCurrencyChange(code);
    setIsDropdownOpen(false);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="flex items-center w-full bg-white rounded-full overflow-visible transition-all shadow-sm focus-within:ring-2 focus-within:ring-[#06CFD6]">
        {/* Selector de moneda */}
        <div
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="shrink-0 flex items-center gap-1.5 md:gap-2 pl-4 md:pl-6 pr-2 md:pr-3 py-[0.6rem] border-r border-gray-200 bg-white rounded-l-full select-none cursor-pointer lg:hover:bg-gray-50"
        >
          <span className="text-[18px] md:text-[20px] font-semibold text-gray-600">
            {selectedCurrency.code}
          </span>
          <span className="text-[14px] md:text-[15px] font-bold text-gray-400">
            ({selectedCurrency.symbol})
          </span>
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-200 shrink-0 ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Input de monto */}
        <input
          type="text"
          name={name}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-4 py-[0.6rem] text-[#333] placeholder-gray-400 focus:outline-none text-[18px] md:text-[20px] rounded-r-full"
          value={amountValue}
          onChange={onAmountChange}
          maxLength={maxLength}
        />
      </div>

      {/* Desplegable de opciones de moneda */}
      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ transformOrigin: 'top left' }}
            className="absolute top-full left-0 mt-2 w-[220px] bg-white border border-gray-100 shadow-xl rounded-xl overflow-hidden z-[100]"
          >
            <div className="py-2">
              {currencies.map((curr) => (
                <div
                  key={curr.code}
                  onClick={() => handleSelect(curr.code)}
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                    selectedCurrency.code === curr.code
                      ? 'bg-[#06CFD6]/15 text-[#0CA3C6] font-bold'
                      : 'text-gray-600 lg:hover:bg-gray-100 lg:hover:text-gray-900'
                  }`}
                >
                  <span className="font-semibold text-[15px]">{curr.label}</span>
                  <span className="text-sm font-bold text-gray-500">{curr.symbol}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CurrencyInputGroup;
