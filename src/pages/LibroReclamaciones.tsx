import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ContactFooter from '../components/layout/ContactFooter';
import LazyGalaxyBackground from '../components/effects/LazyGalaxyBackground';
import CustomDropdown, { type DropdownOption } from '../components/ui/CustomDropdown';
import AnimatedCheckbox from '../components/ui/AnimatedCheckbox';
import AnimatedSubmitButton from '../components/ui/AnimatedSubmitButton';
import PhoneInputGroup from '../components/ui/PhoneInputGroup';
import CurrencyInputGroup from '../components/ui/CurrencyInputGroup';
import { Label } from '../components/ui/Label';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import Radio from '../components/ui/Radio';
import { createComplaint, apiRequest, fetchCountries, fetchServices, fetchDocumentTypes, type CountryData, type DocumentTypeData } from '../lib/api';

// --- COMPONENTE PRINCIPAL ---
const LibroReclamaciones: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    domicilio: '',
    tipoDoc: '',
    numeroDoc: '',
    prefijoTelefono: '+51',
    telefono: '',
    email: '',
    personType: 'natural',
    goodType: 'producto',
    montoCuantificable: '',
    descripcion: '',
    nombreUnidad: '',
    opcionBien: '',
    claimType: 'queja',
    tipoReclamo: '',
    detalle: '',
    pedido: '',
    aceptaTerminos: false,
    aceptaPoliticaDatos: false,
    invoiceNumber: '',
    currencyCode: 'PEN',
    countryId: 'default',
  });
  
  const [archivosAdjuntos, setArchivosAdjuntos] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCountryData, setSelectedCountryData] = useState<CountryData>({ id: 'default', iso: 'PE', name: 'Perú', dialCode: '+51', maxLength: 9 });
  const [allDocumentTypes, setAllDocumentTypes] = useState<DocumentTypeData[]>([]);
  const [selectedDocData, setSelectedDocData] = useState<DocumentTypeData | null>(null);
  const [taxIdError, setTaxIdError] = useState('');
  
  // Estados para la animación del botón
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [complaintTypes, setComplaintTypes] = useState<{ id: string, code: string, name: string, legal_description?: string }[]>([]);
  const [serviceOptions, setServiceOptions] = useState<DropdownOption[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [allCountries, setAllCountries] = useState<CountryData[]>([]);

  useEffect(() => {
    const loadAllCatalogs = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [complaintsRes, servicesData, docTypesData, countriesData] = await Promise.all([
          apiRequest<{ items: { id: string, code: string, name: string }[] }>('/catalog/complaint-types'),
          fetchServices(),
          fetchDocumentTypes(),
          fetchCountries(),
        ]);
        
        setComplaintTypes(complaintsRes.items);
        if (complaintsRes.items.length > 0) {
          setFormData(prev => (
            !prev.claimType || !complaintsRes.items.find((ct) => ct.code === prev.claimType)
              ? { ...prev, claimType: complaintsRes.items[0].code }
              : prev
          ));
        }

        setServiceOptions(servicesData.map(s => ({ value: s.code, label: s.name })));

        setAllDocumentTypes(docTypesData);
        setAllCountries(countriesData);
        
        const peCountry = countriesData.find((c: CountryData) => c.iso === 'PE');
        if (peCountry) {
          setSelectedCountryData(peCountry);
          const peCompDoc = docTypesData.find((dt: any) => 
            (dt.countryId === peCountry.id || dt.country_id === peCountry.id) && 
            (dt.isCompanyDocument === true || dt.is_company_document === true)
          );
          setFormData(prev => ({ 
            ...prev, 
            countryId: peCountry.id,
            tipoDoc: prev.personType === 'empresa' && !prev.tipoDoc
              ? (peCompDoc?.code || 'RUC')
              : prev.tipoDoc
          }));
        }
      } catch (error) {
        console.error('Error fetching catalogs:', error);
      } finally {
        setIsLoadingCatalogs(false);
      }
    };
    loadAllCatalogs();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  };

  const handleCustomDropdown = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const activeCompanyDoc = allDocumentTypes.find(
    (dt: any) => 
      (dt.countryId === selectedCountryData?.id || dt.country_id === selectedCountryData?.id) && 
      (dt.isCompanyDocument === true || dt.is_company_document === true)
  );

  const isDocNumberDisabled = formData.personType === 'natural' && !formData.tipoDoc;

  const handleSmartValidation = (value: string, trigger: 'change' | 'blur', targetElement: HTMLInputElement, currentPersonType: 'natural' | 'empresa') => {
    if (!value) {
      setTaxIdError('');
      targetElement.setCustomValidity('');
      return;
    }

    const isCompany = currentPersonType === 'empresa';
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

    setFormData((prev) => ({ ...prev, numeroDoc: inputValue }));

    // Smart Validation
    handleSmartValidation(inputValue, 'change', e.target, formData.personType as 'natural' | 'empresa');
  };

  const handleDocumentBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    handleSmartValidation(e.target.value, 'blur', e.target, formData.personType as 'natural' | 'empresa');
  };

  const processFiles = (newFiles: File[]) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    const validFiles: File[] = [];
    let hasInvalidTypeOrSize = false;

    newFiles.forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const isAllowedExt = ext ? ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext) : false;
      const isAllowedMime = allowedTypes.includes(file.type);

      if ((isAllowedMime || isAllowedExt) && file.size <= 10 * 1024 * 1024) {
        validFiles.push(file);
      } else {
        hasInvalidTypeOrSize = true;
      }
    });

    if (hasInvalidTypeOrSize) {
      setSubmitError('Algunos archivos no fueron añadidos porque exceden los 10MB o no son PDF/PNG/JPG/WEBP.');
    } else {
      setSubmitError('');
    }

    setArchivosAdjuntos((prev) => {
      const combined = [...prev, ...validFiles];
      if (combined.length > 5) {
        setSubmitError('Solo se permite adjuntar hasta un máximo de 5 archivos.');
        return combined.slice(0, 5);
      }
      return combined;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (index: number) => {
    setArchivosAdjuntos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCountrySelect = (country: CountryData) => {
    setSelectedCountryData(country);
    setSelectedDocData(null);
    const newActiveCompanyDoc = allDocumentTypes.find(
      (dt: any) => (dt.countryId === country.id || dt.country_id === country.id) && (dt.isCompanyDocument === true || dt.is_company_document === true)
    );
    setFormData((prev) => ({
      ...prev,
      countryId: country.id,
      prefijoTelefono: country.dialCode,
      numeroDoc: '',
      tipoDoc: prev.personType === 'empresa' ? (newActiveCompanyDoc?.code || (country.iso === 'PE' ? 'RUC' : '')) : '',
    }));
    setTaxIdError('');
  };

  const handlePersonTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'natural' | 'empresa';
    const compDoc = allDocumentTypes.find(
      (dt: any) => 
        (dt.countryId === selectedCountryData?.id || dt.country_id === selectedCountryData?.id) && 
        (dt.isCompanyDocument === true || dt.is_company_document === true)
    );
    setFormData((prev) => ({
      ...prev,
      personType: newType,
      numeroDoc: '',
      tipoDoc: newType === 'empresa' ? (compDoc?.code || activeCompanyDoc?.code || 'RUC') : '',
    }));
    setSelectedDocData(null);
    setTaxIdError('');
  };

  const filteredCountries = React.useMemo(() => {
    return allCountries.filter(c => 
      allDocumentTypes.some((d: any) => {
        const dCountryId = d.countryId !== undefined ? d.countryId : d.country_id;
        return dCountryId === c.id && d.isCompanyDocument === (formData.personType === 'empresa');
      })
    );
  }, [allCountries, allDocumentTypes, formData.personType]);

  const filteredDocs = React.useMemo(() => {
    return allDocumentTypes.filter((dt: any) => {
      const dbCountryId = dt.countryId !== undefined ? dt.countryId : dt.country_id;
      const matchesType = formData.personType === 'empresa' ? dt.isCompanyDocument : !dt.isCompanyDocument;
      if (dbCountryId === null || dbCountryId === undefined) return matchesType;
      return matchesType && String(dbCountryId) === String(selectedCountryData?.id);
    });
  }, [allDocumentTypes, selectedCountryData, formData.personType]);

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

    const finalTipoDoc = formData.personType === 'empresa' && !formData.tipoDoc
      ? (activeCompanyDoc?.code || 'RUC')
      : formData.tipoDoc;

    const payload = new FormData();
    Object.entries({ ...formData, tipoDoc: finalTipoDoc }).forEach(([key, value]) => {
      payload.append(key, String(value));
    });
    if (archivosAdjuntos.length > 0) {
      archivosAdjuntos.forEach(file => {
        payload.append('archivosAdjuntos', file);
      });
    }

    try {
      await createComplaint(payload);
      setIsLoading(false);
      setIsSuccess(true);
      
      setTimeout(() => {
        navigate('/confirmacion?source=reclamo');
      }, 1200);
    } catch (error) {
      setIsLoading(false);
      setSubmitError(error instanceof Error ? error.message : 'No se pudo enviar el reclamo.');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-sansation">
      {/* Fondo espacio */}
      <div className="fixed inset-0" style={{ backgroundColor: '#040e1f' }}>
        <LazyGalaxyBackground luminousPoints />
        <div className="absolute inset-0 bg-[#040e1f]/40" />
        <div className="absolute inset-0 bg-[#040e1f]/70" />
        <div className="absolute inset-0 opacity-70 mix-blend-screen" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }} />
        <div className="absolute inset-0 opacity-50 rotate-180 mix-blend-screen" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }} />
        <div className="absolute inset-0 bg-[#040e1f]/50" />
      </div>

      <div className="relative z-10 max-w-[1100px] md:max-w-[800px] lg:max-w-[1100px] mx-auto px-6 py-10 md:py-16 lg:py-24 pointer-events-auto">  
        {/* Título */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-[clamp(2.25rem,4.5vw,3.5rem)] font-black text-[#0CA3C6] tracking-tight mb-2">
            Libro de reclamaciones
          </h1>
          <p className="text-center text-white/75 text-[16px] md:text-[18px] lg:text-[20px] leading-relaxed max-w-4xl mx-auto">
            Conforme a lo establecido en el Código de Protección y Defensa del Consumidor, esta institución cuenta con un <span className="text-[#06CFD6] font-semibold">Libro de Reclamaciones a tu disposición.</span>
          </p>
        </motion.div>

        {/* Info 3 columnas */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.1 }}
          className="flex flex-row items-center justify-between mb-7 max-w-4xl mx-auto w-full px-2"
        >
          {/* Columna 1 */}
          <div className="flex-1 text-center">
            <p className="text-white font-bold text-[15px] sm:text-[20px] md:text-[24px] tracking-wide">
              Bytecode
            </p>
          </div>
          
          {/* Columna 2 */}
          <div className="flex-[1.2] md:flex-[1.5] text-center py-3 sm:py-5 md:py-8 border-x border-white px-2 sm:px-6">
            <p className="text-white font-semibold text-[15px] sm:text-[18px] md:text-[20px] tracking-wide drop-shadow-md leading-tight">
              R.U.C. <br className="block md:hidden" /> 20601850225
            </p>
          </div>
          
          {/* Columna 3  */}
          <div className="flex-1 text-center">
            <p className="text-white font-medium text-[15px] sm:text-[20px] md:text-[24px] tracking-wide">
              {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </p>
          </div>
        </motion.div>

        <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} onSubmit={handleSubmit} className="space-y-10">
          {/* ── Sección 1 ── */}
          <div className="space-y-5">
            <h2 className="text-white font-bold text-[24px] md:text-[30px] tracking-wide mb-4">
              Identificación del consumidor reclamante
            </h2>

            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-6 mb-4 px-2">
              <Radio name="personType" value="natural" label="Persona Natural" checked={formData.personType === 'natural'} onChange={handlePersonTypeChange} />
              <Radio name="personType" value="empresa" label="Empresa" checked={formData.personType === 'empresa'} onChange={handlePersonTypeChange} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><Label text={formData.personType === 'empresa' ? 'Razón Social' : 'Nombres'} required /><Input name="nombres" type="text" placeholder={formData.personType === 'empresa' ? 'Nombre legal de la empresa' : 'Nombres Completos'} value={formData.nombres} onChange={handleChange} required minLength={2} maxLength={160} /></div>
              <div><Label text={formData.personType === 'empresa' ? 'Representante Legal' : 'Apellidos'} required /><Input name="apellidos" type="text" placeholder={formData.personType === 'empresa' ? 'Nombres y apellidos' : 'Apellidos Completos'} value={formData.apellidos} onChange={handleChange} required minLength={2} maxLength={160} /></div>
            </div>

            <div><Label text="Domicilio" required /><Input name="domicilio" type="text" placeholder="Dirección completa" value={formData.domicilio} onChange={handleChange} required minLength={4} maxLength={240} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label text="Tipo de Documento" required />
                {formData.personType === 'empresa' ? (
                  <div className="w-full bg-white/60 rounded-full px-5 py-[0.6rem] text-[#333] border border-gray-200 shadow-sm opacity-80 cursor-not-allowed">
                    <span className="text-[18px] md:text-[20px] font-semibold text-gray-700">{activeCompanyDoc?.name || 'Identificación Corporativa'}</span>
                  </div>
                ) : (
                  <CustomDropdown variant="public" value={formData.tipoDoc} placeholder={isLoadingCatalogs ? '⏳ Cargando documentos...' : 'Seleccione tipo...'} options={docDropdownOptions} onChange={(val) => { const doc = filteredDocs.find((d: any) => (d.code || d.value) === val); if (doc) { setFormData({ ...formData, tipoDoc: doc.code, numeroDoc: '' }); setSelectedDocData(doc); setTaxIdError(''); } }} />
                )}
              </div>
              <div className="relative">
                <Label text={formData.personType === 'empresa' ? (activeCompanyDoc?.name || 'Identificación Corporativa') : 'Número de Documento'} required />
                <input
                  name="numeroDoc"
                  type="text"
                  placeholder={
                    formData.personType === 'empresa'
                      ? (activeCompanyDoc?.placeholder || 'Ingrese su identificación fiscal')
                      : isDocNumberDisabled
                        ? 'Número de documento'
                        : (selectedDocData?.placeholder || 'Número de documento')
                  }
                  value={formData.numeroDoc}
                  onChange={handleDocumentChange}
                  onBlur={handleDocumentBlur}
                  disabled={isDocNumberDisabled}
                  className={`w-full rounded-full px-5 lg:px-6 py-[0.6rem] transition-all text-[18px] md:text-[20px] shadow-sm focus:outline-none ${
                    isDocNumberDisabled
                      ? 'bg-white/70 text-gray-700 placeholder:text-gray-600 placeholder:opacity-100 cursor-not-allowed border border-gray-200'
                      : taxIdError 
                        ? 'bg-white text-[#333] placeholder-gray-400 ring-2 ring-red-400 focus:ring-red-400' 
                        : 'bg-white text-[#333] placeholder-gray-400 focus:ring-2 focus:ring-[#06CFD6]'
                  }`}
                  required
                  maxLength={formData.personType === 'empresa' ? (activeCompanyDoc?.maxLength || 40) : (selectedDocData?.maxLength || 40)}
                />
                {taxIdError && !isDocNumberDisabled && (
                  <span className="absolute -bottom-5 left-4 text-xs font-bold text-red-400">
                    {taxIdError}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="mb-2 md:mb-0">
                <Label text="Número de celular" required />
                <PhoneInputGroup value={formData.telefono} onChange={(e: any) => { const value = e?.target ? e.target.value : e; const onlyNumbers = value.replace(/\D/g, ''); setFormData({ ...formData, telefono: onlyNumbers }); }} onCountrySelect={handleCountrySelect} countriesRegistry={filteredCountries} isLoading={isLoadingCatalogs} />
              </div>
              <div><Label text="Correo Electrónico" required /><Input name="email" type="email" placeholder="ejemplo@correo.com" value={formData.email} onChange={handleChange} required maxLength={180}/></div>
            </div>
          </div>

          {/* ── Sección 2 ── */}
          <div className="space-y-5">
            <h2 className="text-white font-bold text-[24px] md:text-[30px] tracking-wide mb-4">
              Identificación del bien contratado
            </h2>

            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-6 mb-4 px-2">
              <Radio name="goodType" value="producto" label="Producto" checked={formData.goodType === 'producto'} onChange={handleChange} />
              <Radio name="goodType" value="servicio" label="Servicio" checked={formData.goodType === 'servicio'} onChange={handleChange} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label text="Monto Reclamado (Opcional)" />
                <CurrencyInputGroup
                  currencyValue={formData.currencyCode}
                  amountValue={formData.montoCuantificable}
                  onCurrencyChange={(val) => setFormData((prev) => ({ ...prev, currencyCode: val }))}
                  onAmountChange={handleChange}
                  placeholder="Ej: 1500.00"
                />
              </div>
              <div><Label text="Comprobante de Pago (Factura/Boleta)" /><Input name="invoiceNumber" type="text" placeholder="N° de comprobante (Opcional)" value={formData.invoiceNumber} onChange={handleChange} maxLength={50} /></div>
            </div>
            <div><Label text="Descripción" required /><Input name="descripcion" type="text" placeholder="Descripción del producto o servicio" value={formData.descripcion} onChange={handleChange} required minLength={2} maxLength={240} /></div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><Label text="Nombre del proyecto/unidad" /><Input name="nombreUnidad" type="text" placeholder="Ej: Landing Page Corporativa" value={formData.nombreUnidad} onChange={handleChange} maxLength={160} /></div>
              <div>
                <Label text="Categoría" />
                <CustomDropdown variant="public" value={formData.opcionBien} placeholder={isLoadingCatalogs ? "⏳ Cargando opciones..." : "Seleccione una opción"} onChange={(val) => handleCustomDropdown('opcionBien', val)} options={serviceOptions} required={false} />
              </div>
            </div>
          </div>

          {/* ── Sección 3 ── */}
          <div className="space-y-5">
            <h2 className="text-white font-bold text-[24px] md:text-[30px] tracking-wide mb-4">
              Sobre el problema
            </h2>

            <div className="flex flex-col sm:flex-row gap-6 mb-4 px-2">
              {complaintTypes.length > 0 ? complaintTypes.map((ct) => (
                <Radio key={ct.id} name="claimType" value={ct.code} label={ct.name} checked={formData.claimType === ct.code} onChange={handleChange} />
              )) : (
                <>
                  <Radio name="claimType" value="queja" label="Queja" checked={formData.claimType === 'queja'} onChange={handleChange} />
                  <Radio name="claimType" value="reclamo" label="Reclamo" checked={formData.claimType === 'reclamo'} onChange={handleChange} />
                </>
              )}
            </div>
            <div className="mb-4 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <p className="text-sm text-blue-200">
                <strong className="text-blue-300 capitalize">{formData.claimType}:</strong>{' '}
                {complaintTypes.find(ct => ct.code === formData.claimType)?.legal_description || (
                  formData.claimType === 'reclamo' 
                    ? 'Disconformidad relacionada a los productos o servicios contratados.' 
                    : 'Disconformidad no relacionada a los productos o servicios, o malestar respecto a la atención al público.'
                )}
              </p>
            </div>

            <div><Label text="Motivo" required /><Input name="tipoReclamo" type="text" placeholder="Ej: Incumplimiento de plazos" value={formData.tipoReclamo} onChange={handleChange} required minLength={2} maxLength={160} /></div>
            <div><Label text="Detalle de la queja/reclamo" required /><Textarea name="detalle" placeholder="Explique detalladamente lo sucedido..." rows={4} value={formData.detalle} onChange={handleChange} required minLength={10} maxLength={3000} /></div>
            <div><Label text="Pedido (Solución esperada)" required /><Textarea name="pedido" placeholder="¿Qué solución espera de nuestra parte?" rows={3} value={formData.pedido} onChange={handleChange}required minLength={5} maxLength={2000} /></div>

          {/* ── Adjuntar Archivo ── */}
            <div className="pt-4">
              <Label text="Adjuntar documento o evidencia (Opcional)" />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center w-full min-h-[7.5rem] mt-2 border-2 border-dashed rounded-2xl cursor-pointer transition-all p-5 select-none ${
                  isDragging
                    ? 'border-[#06CFD6] bg-[#06CFD6]/20 shadow-[0_0_25px_rgba(6,207,214,0.35)] scale-[1.01]'
                    : 'border-[#06CFD6]/30 bg-white/5 lg:hover:bg-white/10 lg:hover:border-[#06CFD6]/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                />
                <div className="flex flex-col items-center justify-center text-center pointer-events-none">
                  <svg
                    className={`w-8 h-8 mb-2 transition-transform duration-200 ${
                      isDragging ? 'text-[#06CFD6] scale-125' : 'text-[#06CFD6]'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mb-1 text-base text-white/80">
                    {isDragging ? (
                      <span className="font-bold text-[#06CFD6]">Suelte los archivos aquí</span>
                    ) : (
                      <>
                        <span className="font-semibold text-[#06CFD6]">Haga clic para subir</span> o arrastre los archivos
                      </>
                    )}
                  </p>
                  <p className="text-xs md:text-sm text-white/50">
                    PDF, JPG, PNG o WEBP (Máx. 10MB por archivo, hasta 5 archivos)
                  </p>
                </div>
              </div>

              {/* Lista de archivos adjuntos (Separada de la dropzone para hover independiente) */}
              {archivosAdjuntos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {archivosAdjuntos.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 bg-[#06CFD6]/10 border border-[#06CFD6]/30 rounded-xl px-3 py-1.5 text-xs md:text-sm text-white/90 backdrop-blur-sm shadow-sm"
                    >
                      <svg className="w-4 h-4 text-[#06CFD6] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate max-w-[200px] font-medium" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[11px] text-white/40 shrink-0">
                        ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        title="Eliminar archivo"
                        className="ml-1 p-1 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/20 transition-all focus:outline-none"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Advertencia Legal (Esta SÍ mantiene su caja contenedora) ── */}
          <div className="border border-[#06CFD6]/20 rounded-2xl p-5 md:p-6 bg-[#06CFD6]/5 mt-4">
            <p className="text-white/70 text-[14px] md:text-[15px] lg:text-[16px] leading-relaxed text-justify">
              <strong className="text-[#06CFD6]">Nota legal:</strong> La presentación de un reclamo no le impide recurrir a otros medios de solución de controversias, ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor deberá responder al reclamo en un plazo no mayor a quince (15) días hábiles, pudiendo ampliar el plazo hasta treinta (30) días más, previa comunicación al consumidor.
            </p>
          </div>

          {/* ── Checkboxes de Consentimiento ── */}
          <div className="space-y-4 pt-2">
            <div>
              <AnimatedCheckbox
                name="aceptaTerminos"
                checked={formData.aceptaTerminos}
                onChange={(checked) => setFormData({ ...formData, aceptaTerminos: checked })}
                required
                textSizeClassName="text-[15px] md:text-[17px]"
                label={
                  <>
                    Declaro que los datos consignados son correctos y <span className="font-bold">acepto estar de acuerdo con el contenido</span> de mi reclamo o queja.
                  </>
                }
              />
            </div>
            <div className="border-t border-[#06CFD6]/20 pt-4">
              <AnimatedCheckbox
                name="aceptaPoliticaDatos"
                checked={formData.aceptaPoliticaDatos}
                onChange={(checked) => setFormData({ ...formData, aceptaPoliticaDatos: checked })}
                required
                textSizeClassName="text-[15px] md:text-[17px]"
                label={
                  <>
                    He leído y acepto la <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-bold underline text-[#06CFD6] hover:text-[#0CA3C6] transition-colors" onClick={(e) => e.stopPropagation()}>Política de Protección de Datos Personales (Ley N° 29733)</a>. Autorizo el tratamiento de mis datos para la gestión de este requerimiento.
                  </>
                }
              />
            </div>
          </div>

          {/* ── Submit ── */}
          <div className="pt-4">
            {submitError && (
              <p className="mb-4 rounded-2xl bg-red-500/15 px-5 py-3 text-center text-red-100">
                {submitError}
              </p>
            )}
            <AnimatedSubmitButton
              type="submit"
              isLoading={isLoading}
              isSuccess={isSuccess}
              text={isLoadingCatalogs ? "Conectando..." : "Enviar Reclamo"}
              loadingText="Enviando reclamo..."
              successText="¡Reclamo Enviado!"
              disabled={!formData.aceptaTerminos || !formData.aceptaPoliticaDatos || isLoadingCatalogs}
              className={`w-full text-white py-4 rounded-full text-[24px] md:text-[30px] font-bold shadow-[0_0_20px_rgba(6,207,214,0.3)] disabled:opacity-50 transition-all duration-300 ${isSuccess ? 'bg-[#0CA3C6] shadow-[0_0_30px_rgba(12,163,198,0.6)]' : 'bg-[#06CFD6] lg:hover:shadow-[0_0_30px_rgba(6,207,214,0.6)] lg:disabled:hover:shadow-none lg:disabled:hover:scale-100'}`}
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

export default LibroReclamaciones;
