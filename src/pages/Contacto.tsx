import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SEO from '../components/shared/SEO';
import LazyGalaxyBackground from '../components/effects/LazyGalaxyBackground';
import ContactFooter from '../components/layout/ContactFooter';
import CustomDropdown, { type DropdownOption } from '../components/ui/CustomDropdown';
import AnimatedCheckbox from '../components/ui/AnimatedCheckbox';
import AnimatedSubmitButton from '../components/ui/AnimatedSubmitButton';
import PhoneInputGroup from '../components/ui/PhoneInputGroup';
import { Label } from '../components/ui/Label';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { createContactSubmission, fetchCountries, fetchServices, fetchDocumentTypes, type CountryData, type DocumentTypeData } from '../lib/api';

const stripDigits = (value: string) => value.replace(/\d/g, '');
const stripSymbols = (value: string) => value.replace(/[^\p{L}\p{N}\s]/gu, '');

const Contacto: React.FC = () => {
  const navigate = useNavigate();
  const [personType, setPersonType] = useState<'individual' | 'company'>('company');
  const [formData, setFormData] = useState({
    countryId: '',
    nombre: '',
    apellido: '',
    cargo: '',
    email: '',
    celular: '',
    empresa: '',
    ruc: '',
    documentType: '',
    documentNumber: '',
    servicio: '',
    mensaje: '',
    aceptaTerminos: false,
    aceptaMarketing: false,
  });
  
  const [selectedCountryData, setSelectedCountryData] = useState<CountryData>({ id: 'default', iso: 'PE', name: 'Perú', dialCode: '+51', maxLength: 9 });
  const [allCountries, setAllCountries] = useState<CountryData[]>([]);
  const [allDocumentTypes, setAllDocumentTypes] = useState<DocumentTypeData[]>([]);
  const [allServices, setAllServices] = useState<DropdownOption[]>([]);
  const [selectedDocData, setSelectedDocData] = useState<DocumentTypeData | null>(null);
  const [taxIdError, setTaxIdError] = useState('');

  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  // 1. Fetch de Catálogos al montar el componente
  useEffect(() => {
    const loadCatalogs = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [countriesData, docTypesData, servicesData] = await Promise.all([
          fetchCountries(),
          fetchDocumentTypes(),
          fetchServices(),
        ]);
        setAllCountries(countriesData);
        setAllDocumentTypes(docTypesData);
        
        setAllServices(servicesData.map(s => ({ value: s.code, label: s.name })));
      } catch (error) {
        console.error('Error fetching catalogs:', error);
      } finally {
        setIsLoadingCatalogs(false);
      }
    };
    loadCatalogs();
  }, []);

  // Agregamos el estado de éxito a nuestra lógica
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleTextOnlyChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: stripDigits(e.target.value) });
  };

  const handleAlphanumericChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: stripSymbols(e.target.value) });
  };

  const activeCompanyDoc = allDocumentTypes.find(
    (dt) => dt.countryId === selectedCountryData?.id && dt.isCompanyDocument === true
  );

  const handleSmartValidation = (value: string, trigger: 'change' | 'blur', targetElement: HTMLInputElement, currentPersonType: 'individual' | 'company' = personType) => {
    if (!value) {
      setTaxIdError('');
      targetElement.setCustomValidity('');
      return;
    }

    const isCompany = currentPersonType === 'company';
    const activeDocDefinition = isCompany ? activeCompanyDoc : selectedDocData;

    const pattern = activeDocDefinition?.validationRegex || '^[\\w-]{4,40}$';
    const limit = activeDocDefinition?.maxLength || 40;

    const regex = new RegExp(pattern, 'i');
    const isValid = regex.test(value);

    if (isValid) {
      setTaxIdError('');
      targetElement.setCustomValidity('');
    } else {
      if (trigger === 'blur' || value.length >= limit) {
        const errorMsg = `Formato de ${activeDocDefinition?.name || 'documento'} inválido`;
        setTaxIdError(errorMsg);
        targetElement.setCustomValidity(errorMsg);
      } else {
        setTaxIdError('');
        targetElement.setCustomValidity('');
      }
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value.trim().toUpperCase();

    if (personType === 'individual') {
      setFormData({ ...formData, documentNumber: inputValue });
    } else {
      setFormData({ ...formData, ruc: inputValue, documentNumber: inputValue });
    }

    handleSmartValidation(inputValue, 'change', e.target, personType);
  };

  const handleDocumentBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    handleSmartValidation(e.target.value, 'blur', e.target, personType);
  };

  const handleCountrySelect = (country: CountryData) => {
    setSelectedCountryData(country);
    setSelectedDocData(null); // Purge legacy validation state
    setFormData((current) => ({
      ...current,
      countryId: country.id === 'default' ? '' : country.id,
      celular: '',
      ruc: '',
      documentType: '',
      documentNumber: '',
    }));
    setTaxIdError('');
  };

  const filteredCountries = React.useMemo(() => {
    return allCountries.filter(c => 
      allDocumentTypes.some((d: any) => {
        const dCountryId = d.countryId !== undefined ? d.countryId : d.country_id;
        return dCountryId === c.id && d.isCompanyDocument === (personType === 'company');
      })
    );
  }, [allCountries, allDocumentTypes, personType]);

  const filteredDocs = React.useMemo(() => {
    return allDocumentTypes.filter((dt: any) => {
      const dbCountryId = dt.countryId !== undefined ? dt.countryId : dt.country_id;
      if (dbCountryId === null || dbCountryId === undefined) return true;
      if (personType === 'company') return dt.isCompanyDocument && String(dbCountryId) === String(selectedCountryData?.id);
      return !dt.isCompanyDocument && String(dbCountryId) === String(selectedCountryData?.id);
    });
  }, [allDocumentTypes, selectedCountryData, personType]);

  const docDropdownOptions = React.useMemo(() => {
    return filteredDocs.map((doc: any) => ({
      value: doc.code || doc.value,
      label: doc.name || doc.label
    }));
  }, [filteredDocs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);
    setSubmitError('');

    try {
      const payload: Record<string, any> = { 
        ...formData, 
        personType,
        celular: `${selectedCountryData.dialCode} ${formData.celular}`.trim()
      };
      
      if (selectedCountryData.id && selectedCountryData.id !== 'default') {
        payload.countryId = selectedCountryData.id;
      } else {
        const defaultCountry = allCountries.find(c => c.iso === selectedCountryData.iso);
        payload.countryId = defaultCountry ? defaultCountry.id : null;
      }

      await createContactSubmission(payload);
      setIsLoading(false);
      setIsSuccess(true);
      
      setTimeout(() => {
        navigate('/confirmacion?source=contacto');
      }, 1200);
    } catch (error) {
      setIsLoading(false);
      setSubmitError(error instanceof Error ? error.message : 'No se pudo enviar el formulario.');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-sansation select-none">
      <SEO 
        title="Contacto" 
        description="Ponte en contacto con Bytecode para iniciar tu proyecto de transformación digital hoy mismo."
      />
      
      {/* Fondo espacio */}
      <div className="fixed inset-0" style={{ backgroundColor: '#040e1f' }}>
        <LazyGalaxyBackground /> 
        <div className="absolute inset-0" style={{ background: 'rgba(4,14,31,0.30)' }} />
        <div className="absolute inset-0 bg-[#040e1f]/70" />

        <div
          className="absolute inset-0 opacity-70 mix-blend-screen"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }}
        />
        <div
          className="absolute inset-0 opacity-50 rotate-180 mix-blend-screen"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[750px] mx-auto px-6 py-10 lg:py-20 pointer-events-auto flex flex-col items-center">
        {/* Título Centrado */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[clamp(2.25rem,4.5vw,3.5rem)] font-bold mb-10 text-center tracking-tight"
        >
          <span className="block md:inline text-[#0CA3C6]">Conecta</span>
          <span className="hidden md:inline"> </span>
          <span className="block md:inline text-white font-light -mt-[15px]">con tu marca</span>
        </motion.h1>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-4"
        >
          <div className="flex justify-center gap-4 mb-4">
            <button
              type="button"
              onClick={() => setPersonType('company')}
              className={`px-6 py-2 rounded-full font-bold transition-all border ${personType === 'company' ? 'bg-[#06CFD6] text-[#040e1f] border-[#06CFD6]' : 'bg-transparent text-white border-white/30 hover:border-[#06CFD6]'}`}
            >
              Empresa
            </button>
            <button
              type="button"
              onClick={() => setPersonType('individual')}
              className={`px-6 py-2 rounded-full font-bold transition-all border ${personType === 'individual' ? 'bg-[#06CFD6] text-[#040e1f] border-[#06CFD6]' : 'bg-transparent text-white border-white/30 hover:border-[#06CFD6]'}`}
            >
              Independiente
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label text="Nombre" />
              <Input
                type="text"
                name="nombre"
                placeholder="Nombre"
                required
                minLength={2}
                maxLength={120}
                value={formData.nombre}
                onChange={handleTextOnlyChange}
              />
            </div>

            <div>
              <Label text="Apellido" />
              <Input
                type="text"
                name="apellido"
                placeholder="Apellido"
                required
                minLength={2}
                maxLength={120}
                value={formData.apellido}
                onChange={handleTextOnlyChange}
              />
            </div>
          </div>

          {personType === 'company' && (
            <div>
              <Label text="Cargo" />
              <Input
                type="text"
                name="cargo"
                placeholder="Cargo"
                required={personType === 'company'}
                minLength={2}
                maxLength={160}
                value={formData.cargo}
                onChange={handleTextOnlyChange}
              />
            </div>
          )}

          <div>
            <Label text="Email" />
            <Input
              type="email"
              name="email"
              placeholder="Correo"
              required
              minLength={2}
              maxLength={160}
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div>
            <Label text="Número de celular" />
            <PhoneInputGroup 
              value={formData.celular} 
              onChange={(val: any) => {
                const value = val?.target ? val.target.value : val; 
                const onlyNumbers = value.replace(/\D/g, ''); 
                setFormData({ ...formData, celular: onlyNumbers });
              }} 
              onCountrySelect={handleCountrySelect} 
              countriesRegistry={filteredCountries} 
              isLoading={isLoadingCatalogs} 
            />
          </div>

          {personType === 'company' ? (
            <>
              <div>
                <Label text="Empresa" />
                <Input
                  type="text"
                  name="empresa"
                  placeholder="Empresa"
                  required={personType === 'company'}
                  minLength={2}
                  maxLength={160}
                  value={formData.empresa}
                  onChange={handleAlphanumericChange}
                />
              </div>

              <div className="relative mb-2">
                <Label text={activeCompanyDoc?.name || 'Identificación Corporativa'} />
                <input
                  name="ruc"
                  type="text"
                  placeholder={activeCompanyDoc?.placeholder || 'Ingrese su identificación fiscal'}
                  value={formData.ruc}
                  onChange={handleDocumentChange}
                  onBlur={handleDocumentBlur}
                  className={`w-full bg-white rounded-full px-5 lg:px-6 py-[0.6rem] text-[#333] placeholder-gray-400 focus:outline-none transition-all text-[18px] md:text-[20px] shadow-sm ${
                    taxIdError 
                      ? 'ring-2 ring-red-400 focus:ring-red-400' 
                      : 'focus:ring-2 focus:ring-[#06CFD6]'
                  }`}
                  required={personType === 'company'}
                  maxLength={activeCompanyDoc?.maxLength || 40}
                />
                {taxIdError && (
                  <span className="absolute -bottom-5 left-4 text-xs font-bold text-red-400">
                    {taxIdError}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label text="Tipo de Doc." />
                <CustomDropdown variant="public" value={formData.documentType} placeholder={isLoadingCatalogs ? '⏳ Cargando documentos...' : 'Seleccione tipo...'} options={docDropdownOptions} onChange={(val) => { const doc = filteredDocs.find((d: any) => (d.code || d.value) === val); if (doc) { setFormData({ ...formData, documentType: doc.code, documentNumber: '' }); setSelectedDocData(doc); setTaxIdError(''); } }} />
              </div>
              <div className="relative">
                <Label text="Nro de documento" />
                <input
                  type="text"
                  name="documentNumber"
                  placeholder={selectedDocData?.placeholder || 'Ingrese su documento'}
                  value={formData.documentNumber}
                  onChange={handleDocumentChange}
                  onBlur={handleDocumentBlur}
                  className={`w-full bg-white rounded-full px-5 lg:px-6 py-[0.6rem] text-[#333] placeholder-gray-400 focus:outline-none transition-all text-[18px] md:text-[20px] shadow-sm ${
                    taxIdError 
                      ? 'ring-2 ring-red-400 focus:ring-red-400' 
                      : 'focus:ring-2 focus:ring-[#06CFD6]'
                  }`}
                  required={personType === 'individual'}
                  maxLength={selectedDocData?.maxLength || 40}
                />
                {taxIdError && (
                  <span className="absolute -bottom-5 left-4 text-xs font-bold text-red-400">
                    {taxIdError}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mb-2">
            <Label text="Servicio que requiere" />
            <CustomDropdown variant="public" value={formData.servicio} placeholder={isLoadingCatalogs ? '⏳ Cargando opciones...' : 'Seleccione su servicio'} options={allServices} onChange={(newValue) => setFormData({ ...formData, servicio: newValue })} />
          </div>

          <div>
            <Label text="Mensaje" />
            <Textarea
              name="mensaje"
              placeholder="Cuéntanos brevemente qué necesitas"
              required
              minLength={10}
              maxLength={1200}
              value={formData.mensaje}
              onChange={handleChange}
            />
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <AnimatedCheckbox
              name="aceptaTerminos"
              checked={formData.aceptaTerminos}
              onChange={(checked) => setFormData({ ...formData, aceptaTerminos: checked })}
              required
              label={
                <>
                  He leído y acepto la <a href="/privacidad" target="_blank" className="text-[#06CFD6] hover:underline" onClick={(e) => e.stopPropagation()}>Política de Privacidad</a> respecto al tratamiento de mi solicitud.
                </>
              }
            />
            
            <AnimatedCheckbox
              name="aceptaMarketing"
              checked={formData.aceptaMarketing}
              onChange={(checked) => setFormData({ ...formData, aceptaMarketing: checked })}
              label="Acepto recibir comunicaciones comerciales, boletines e información sobre nuevos servicios de Bytecode."
            />
          </div>

          <div className="pt-6">
            {submitError && (
              <p className="mb-4 rounded-2xl bg-red-500/15 px-5 py-3 text-center text-red-100">
                {submitError}
              </p>
            )}
            <AnimatedSubmitButton
              type="submit"
              isLoading={isLoading}
              isSuccess={isSuccess}
              text={isLoadingCatalogs ? "Conectando..." : "Conectar"}
              loadingText="Enviando..."
              successText="¡Conectado!"
              disabled={isLoadingCatalogs}
              className={`w-full text-white py-2 rounded-3xl text-[30px] font-bold shadow-[0_0_20px_rgba(6,207,214,0.3)] disabled:opacity-90 ${isSuccess ? 'bg-[#0CA3C6] shadow-[0_0_30px_rgba(12,163,198,0.6)]' : 'bg-[#06CFD6] lg:hover:shadow-[0_0_30px_rgba(6,207,214,0.6)] lg:disabled:hover:shadow-[0_0_20px_rgba(6,207,214,0.3)]'}`}
            />
          </div>
        </motion.form>
      </div>

      <div className="relative z-10 pointer-events-auto">
        <ContactFooter />
      </div>
    </div>
  );
};

export default Contacto;
