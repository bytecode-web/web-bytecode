import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ContactFooter from '../components/layout/ContactFooter';
import LazyGalaxyBackground from '../components/effects/LazyGalaxyBackground';
import CustomDropdown, { type DropdownOption } from '../components/ui/CustomDropdown';
import AnimatedCheckbox from '../components/ui/AnimatedCheckbox';
import AnimatedSubmitButton from '../components/ui/AnimatedSubmitButton';
import PhoneInputGroup from '../components/ui/PhoneInputGroup';
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
    countryId: 'default',
  });
  
  const [archivoAdjunto, setArchivoAdjunto] = useState<File | null>(null);
  const [selectedCountryData, setSelectedCountryData] = useState<CountryData>({ id: 'default', iso: 'PE', name: 'Perú', dialCode: '+51', maxLength: 9 });
  const [allDocumentTypes, setAllDocumentTypes] = useState<DocumentTypeData[]>([]);
  const [selectedDocData, setSelectedDocData] = useState<DocumentTypeData | null>(null);
  const [taxIdError, setTaxIdError] = useState('');
  
  // Estados para la animación del botón
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [complaintTypes, setComplaintTypes] = useState<{ id: string, code: string, name: string }[]>([]);
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
          setFormData(prev => ({ ...prev, countryId: peCountry.id }));
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
    (dt) => dt.countryId === selectedCountryData?.id && dt.isCompanyDocument === true
  );

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(selectedFile.type) || selectedFile.size > 10 * 1024 * 1024) {
        setArchivoAdjunto(null);
        setSubmitError('Adjunta un archivo PDF, PNG, JPG, JPEG o WEBP de maximo 10MB.');
        e.target.value = '';
        return;
      }

      setSubmitError('');
      setArchivoAdjunto(selectedFile);
    }
  };

  const handleCountrySelect = (country: CountryData) => {
    setSelectedCountryData(country);
    setSelectedDocData(null);
    const newActiveCompanyDoc = allDocumentTypes.find(
      (dt) => dt.countryId === country.id && dt.isCompanyDocument === true
    );
    setFormData((prev) => ({
      ...prev,
      countryId: country.id,
      prefijoTelefono: country.dialCode,
      numeroDoc: '',
      tipoDoc: prev.personType === 'empresa' ? (newActiveCompanyDoc?.code || '') : '',
    }));
    setTaxIdError('');
  };

  const handlePersonTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'natural' | 'empresa';
    setFormData((prev) => ({
      ...prev,
      personType: newType,
      numeroDoc: '',
      tipoDoc: newType === 'empresa' ? (activeCompanyDoc?.code || '') : '',
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
      if (dbCountryId === null || dbCountryId === undefined) return true;
      if (formData.personType === 'empresa') return dt.isCompanyDocument && String(dbCountryId) === String(selectedCountryData?.id);
      return !dt.isCompanyDocument && String(dbCountryId) === String(selectedCountryData?.id);
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

    const payload = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      payload.append(key, String(value));
    });
    if (archivoAdjunto) {
      payload.append('archivoAdjunto', archivoAdjunto);
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
        <LazyGalaxyBackground /> 
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
                  name="numeroDoc" // Usa "documentNumber" en Contacto.tsx
                  type="text"
                  placeholder={formData.personType === 'empresa' ? (activeCompanyDoc?.placeholder || 'Ingrese su identificación fiscal') : (selectedDocData?.placeholder || 'Número')}
                  value={formData.numeroDoc} // Usa formData.documentNumber en Contacto.tsx
                  onChange={handleDocumentChange}
                  onBlur={handleDocumentBlur}
                  className={`w-full bg-white rounded-full px-5 lg:px-6 py-[0.6rem] text-[#333] placeholder-gray-400 focus:outline-none transition-all text-[18px] md:text-[20px] shadow-sm ${
                    taxIdError 
                      ? 'ring-2 ring-red-400 focus:ring-red-400' 
                      : 'focus:ring-2 focus:ring-[#06CFD6]'
                  }`}
                  required
                  maxLength={formData.personType === 'empresa' ? (activeCompanyDoc?.maxLength || 40) : (selectedDocData?.maxLength || 40)}
                />
                {taxIdError && (
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

            <div><Label text="Monto Reclamado (Opcional)" /><Input name="montoCuantificable" type="text" placeholder="Ej: S/ 1500.00" value={formData.montoCuantificable} onChange={handleChange} maxLength={80} /></div>
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
                  <Radio name="claimType" value="queja" label="Queja (Malestar o descontento)" checked={formData.claimType === 'queja'} onChange={handleChange} />
                  <Radio name="claimType" value="reclamo" label="Reclamo (Disconformidad con el servicio)" checked={formData.claimType === 'reclamo'} onChange={handleChange} />
                </>
              )}
            </div>

            <div><Label text="Motivo" required /><Input name="tipoReclamo" type="text" placeholder="Ej: Incumplimiento de plazos" value={formData.tipoReclamo} onChange={handleChange} required minLength={2} maxLength={160} /></div>
            <div><Label text="Detalle de la queja/reclamo" required /><Textarea name="detalle" placeholder="Explique detalladamente lo sucedido..." rows={4} value={formData.detalle} onChange={handleChange} required minLength={10} maxLength={3000} /></div>
            <div><Label text="Pedido (Solución esperada)" required /><Textarea name="pedido" placeholder="¿Qué solución espera de nuestra parte?" rows={3} value={formData.pedido} onChange={handleChange}required minLength={5} maxLength={2000} /></div>

            {/* ── Adjuntar Archivo ── */}
            <div className="pt-4">
              <Label text="Adjuntar documento o evidencia (Opcional)" />
              <div className="relative flex items-center justify-center w-full mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-[#06CFD6]/30 border-dashed rounded-2xl cursor-pointer bg-white/5 transition-colors lg:hover:bg-white/10">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-8 h-8 mb-3 text-[#06CFD6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    <p className="mb-1 text-base text-white/80"><span className="font-semibold text-[#06CFD6]">Haga clic para subir</span> o arrastre el archivo</p>
                    <p className="text-sm text-white/50">{archivoAdjunto ? archivoAdjunto.name : 'PDF, JPG, PNG o WEBP (Máx. 10MB)'}</p>
                  </div>
                  <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" />
                </label>
              </div>
            </div>
          </div>

          {/* ── Advertencia Legal (Esta SÍ mantiene su caja contenedora) ── */}
          <div className="border border-[#06CFD6]/20 rounded-2xl p-5 md:p-6 bg-[#06CFD6]/5 mt-4">
            <p className="text-white/70 text-[14px] md:text-[15px] lg:text-[16px] leading-relaxed text-justify">
              <strong className="text-[#06CFD6]">Nota legal:</strong> La presentación de un reclamo no le impide recurrir a otros medios de solución de controversias, ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor deberá responder al reclamo en un plazo no mayor a quince (15) días hábiles, pudiendo ampliar el plazo hasta treinta (30) días más, previa comunicación al consumidor.
            </p>
          </div>

          {/* ── Checkbox Términos ── */}
          <div className="px-2">
            <AnimatedCheckbox
              name="aceptaTerminos"
              checked={formData.aceptaTerminos}
              onChange={(checked) => setFormData({ ...formData, aceptaTerminos: checked })}
              required
              textSizeClassName="text-[16px] md:text-[18px]"
              label={
                <>
                  Declaro que los datos consignados son correctos y <span className="font-bold">acepto estar de acuerdo con el contenido</span> de mi reclamo o queja.
                </>
              }
            />
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
              disabled={!formData.aceptaTerminos || isLoadingCatalogs}
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
