import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CountryData } from '../../lib/api'; // Adjust relative path if necessary

export interface PhoneInputProps { 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  onCountryChange?: (dialCode: string) => void;
  onCountrySelect?: (country: CountryData) => void; 
  countriesRegistry?: CountryData[]; 
  isLoading?: boolean; 
}

const defaultPeru: CountryData = { id: 'default', iso: 'PE', name: 'Perú', dialCode: '+51', maxLength: 9 };

const PhoneInputGroup: React.FC<PhoneInputProps> = ({ value, onChange, onCountryChange, onCountrySelect, countriesRegistry = [], isLoading }) => {
  const countries = countriesRegistry.length > 0 ? countriesRegistry : [defaultPeru];
  const [selectedCountry, setSelectedCountry] = useState<CountryData>(defaultPeru);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (countriesRegistry.length > 0) {
      const peru = countriesRegistry.find(c => c.iso === 'PE') || countriesRegistry[0];
      setSelectedCountry(peru); 
      if (onCountryChange) onCountryChange(peru.dialCode);
      if (onCountrySelect) onCountrySelect(peru);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countriesRegistry]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    e.target.value = val;
    onChange(e);
    if (selectedCountry && val.length > 0 && val.length !== selectedCountry.maxLength) setError(`El número debe tener ${selectedCountry.maxLength} dígitos`);
    else setError('');
  };

  const handleSelectCountry = (country: CountryData) => {
    setSelectedCountry(country);
    setIsDropdownOpen(false);
    if (onCountryChange) onCountryChange(country.dialCode);
    if (onCountrySelect) onCountrySelect(country);
    setError(''); 
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className={`flex items-center w-full bg-white rounded-full overflow-visible transition-all shadow-sm ${error ? 'ring-2 ring-red-400' : 'focus-within:ring-2 focus-within:ring-[#06CFD6]'}`}>
        
        <div 
          onClick={() => { if (!isLoading) setIsDropdownOpen(!isDropdownOpen); }}
          className={`shrink-0 flex items-center gap-1.5 md:gap-2 pl-4 md:pl-6 pr-2 md:pr-3 py-[0.6rem] border-r border-gray-200 bg-white rounded-l-full select-none ${isLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer lg:hover:bg-gray-50'}`}
        >
          {isLoading ? (
            <span className="text-[18px] md:text-[20px] font-semibold text-gray-400">⏳</span>
          ) : (
            <img
              src={`https://flagcdn.com/w20/${selectedCountry.iso.toLowerCase()}.png`}
              srcSet={`https://flagcdn.com/w40/${selectedCountry.iso.toLowerCase()}.png 2x`}
              alt={selectedCountry.name}
              className="w-6 h-auto object-contain rounded-sm"
              title={selectedCountry.name}
            />
          )}
          <span className="text-[18px] md:text-[20px] font-semibold text-gray-600">{isLoading ? '...' : selectedCountry.dialCode}</span>
          <svg className={`w-3 h-3 text-gray-400 transition-transform duration-200 shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <input
          type="tel"
          name={value !== undefined ? undefined : "telefono"} // Avoid naming conflicts if passed loosely, rely on onChange
          placeholder={isLoading ? 'Despertando servidor...' : (selectedCountry?.phone_format ? `Ej: ${selectedCountry.phone_format.replace(selectedCountry.dialCode, '').trim()}` : "Ej: 987654321")}
          className="flex-1 bg-transparent px-4 py-[0.6rem] text-[#333] placeholder-gray-400 focus:outline-none text-[18px] md:text-[20px] rounded-r-full"
          required
          maxLength={selectedCountry.maxLength}
          value={value}
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </div>

      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformOrigin: "top left" }}
            className="absolute top-full left-0 mt-2 w-[280px] bg-white border border-gray-100 shadow-xl rounded-xl overflow-hidden z-[100]"
          >
            <div className="max-h-[240px] overflow-y-auto py-2 custom-scrollbar overscroll-contain">
              {countries.map((country) => (
                <div
                  key={country.id}
                  onClick={() => handleSelectCountry(country)}
                  className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors ${
                    selectedCountry.id === country.id 
                      ? 'bg-[#06CFD6]/15 text-[#0CA3C6] font-bold' 
                      : 'text-gray-600 lg:hover:bg-gray-200 lg:hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://flagcdn.com/w20/${country.iso.toLowerCase()}.png`}
                      srcSet={`https://flagcdn.com/w40/${country.iso.toLowerCase()}.png 2x`}
                      alt={country.name}
                      className="w-5 h-auto object-contain rounded-sm shadow-sm"
                    />
                    <span className="font-bold text-[0.9rem]">{country.name}</span>
                  </div>
                  <span className="text-sm font-semibold">{country.dialCode}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <span className="absolute -bottom-5 left-4 text-xs font-bold text-red-400">{error}</span>}
    </div>
  );
};

export default PhoneInputGroup;
