import React, { useEffect, useState, useMemo } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { Settings, Save, RefreshCw, Cloud, Calendar, Mail, ToggleLeft, ArrowRight } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import AdminPanel from '../../components/admin/AdminPanel';
import SystemHolidaysModal, { type HolidayItem } from '../../components/admin/configuracion/SystemHolidaysModal';

type SettingItem = {
  setting_key: string;
  setting_value: unknown;
  description: string;
  is_sensitive: boolean;
};

const defaultSettings = {
  contact_info: { email: '', phone_1: '', phone_2: '', address: '' },
  smtp_config: { host: '', port: '', user: '', pass: '' },
  cloudinary_config: { cloud_name: '', api_key: '', api_secret: '' },
  features: { enable_chat: false, enable_quotes: true },
};

const asRecord = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const readString = (value: unknown, fallback: string) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};
const readBoolean = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const AdminConfiguracion: React.FC = () => {
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
    
  const [contactInfo, setContactInfo] = useState(defaultSettings.contact_info);
  const [smtpConfig, setSmtpConfig] = useState(defaultSettings.smtp_config);
  const [cloudinaryConfig, setCloudinaryConfig] = useState(defaultSettings.cloudinary_config);
  const [features, setFeatures] = useState(defaultSettings.features);

  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [countryIdPE, setCountryIdPE] = useState<string>('');
  const [isHolidaysModalOpen, setIsHolidaysModalOpen] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: SettingItem[] }>('/admin/settings');
      const holidaysRes = await apiRequest<{ items: HolidayItem[] }>('/admin/system-holidays');
      setHolidays(holidaysRes.items);
      const peHoliday = holidaysRes.items.find(h => h.country_code === 'PE');
      if (peHoliday) setCountryIdPE(peHoliday.country_id);

      // Populate local state
      res.items.forEach(item => {
        const value = asRecord(item.setting_value);

        if (item.setting_key === 'contact_info') {
          setContactInfo({
            email: readString(value.email, defaultSettings.contact_info.email),
            phone_1: readString(value.phone_1, defaultSettings.contact_info.phone_1),
            phone_2: readString(value.phone_2, defaultSettings.contact_info.phone_2),
            address: readString(value.address, defaultSettings.contact_info.address),
          });
        }

        if (item.setting_key === 'smtp_config') {
          setSmtpConfig({
            host: readString(value.host, defaultSettings.smtp_config.host),
            port: readString(value.port, defaultSettings.smtp_config.port),
            user: readString(value.user, defaultSettings.smtp_config.user),
            pass: readString(value.pass, defaultSettings.smtp_config.pass),
          });
        }

        if (item.setting_key === 'cloudinary_config') {
          setCloudinaryConfig({
            cloud_name: readString(value.cloud_name, defaultSettings.cloudinary_config.cloud_name),
            api_key: readString(value.api_key, defaultSettings.cloudinary_config.api_key),
            api_secret: readString(value.api_secret, defaultSettings.cloudinary_config.api_secret),
          });
        }

        if (item.setting_key === 'features') {
          setFeatures({
            enable_chat: readBoolean(value.enable_chat, defaultSettings.features.enable_chat),
            enable_quotes: readBoolean(value.enable_quotes, defaultSettings.features.enable_quotes),
          });
        }
      });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al cargar configuración', 'error');
    } finally {
      setLoading(false);
    }
  };

  const refreshHolidays = async () => {
    try {
      const holidaysRes = await apiRequest<{ items: HolidayItem[] }>('/admin/system-holidays');
      setHolidays(holidaysRes.items);
      const peHoliday = holidaysRes.items.find(h => h.country_code === 'PE');
      if (peHoliday) setCountryIdPE(peHoliday.country_id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al actualizar feriados', 'error');
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  // Próximo feriado calculado
  const upcomingHoliday = useMemo(() => {
    if (!holidays || holidays.length === 0) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const datedHolidays = holidays.map(h => {
      let year = h.year;
      if (!year) {
        if (h.month > currentMonth || (h.month === currentMonth && h.day >= currentDay)) {
          year = currentYear;
        } else {
          year = currentYear + 1;
        }
      }
      return {
        ...h,
        dateObj: new Date(year, h.month - 1, h.day),
        targetYear: year,
      };
    });

    const todayStart = new Date(currentYear, currentMonth - 1, currentDay);
    const future = datedHolidays
      .filter(h => h.dateObj >= todayStart)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    return future.length > 0 ? future[0] : datedHolidays[0];
  }, [holidays]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest('/admin/settings', {
        method: 'PATCH',
        json: {
          settings: [
            { setting_key: 'contact_info', setting_value: contactInfo, description: 'Información de contacto pública', is_sensitive: false },
            { setting_key: 'smtp_config', setting_value: smtpConfig, description: 'Configuración de servidor SMTP', is_sensitive: true },
            { setting_key: 'cloudinary_config', setting_value: cloudinaryConfig, description: 'Almacenamiento Multimedia Cloudinary', is_sensitive: true },
            { setting_key: 'features', setting_value: features, description: 'Activación de módulos', is_sensitive: false },
          ]
        }
      });
      addToast('Configuración guardada exitosamente.', 'success');
      await loadSettings();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al guardar configuración', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sansation">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Configuración</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Variables del sistema</p>
          </div>
        </div>
        <button
          onClick={loadSettings}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card 1: Contact Info */}
          <AdminPanel className="p-6 lg:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/80">
                  <Mail className="h-4.5 w-4.5 text-[#06CFD6]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-white/90">Información de Contacto</h2>
                  <p className="text-xs text-white/40">Datos públicos mostrados en la plataforma</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={contactInfo.email}
                    onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                      WhatsApp Principal
                    </label>
                    <input
                      type="text"
                      value={contactInfo.phone_1}
                      onChange={e => setContactInfo({ ...contactInfo, phone_1: e.target.value })}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                      WhatsApp Secundario
                    </label>
                    <input
                      type="text"
                      value={contactInfo.phone_2}
                      onChange={e => setContactInfo({ ...contactInfo, phone_2: e.target.value })}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    Dirección Física
                  </label>
                  <input
                    type="text"
                    value={contactInfo.address}
                    onChange={e => setContactInfo({ ...contactInfo, address: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                  />
                </div>
              </div>
            </div>
          </AdminPanel>

          {/* Right Column: Features + Holiday Summary Card */}
          <div className="flex flex-col gap-6">
            {/* Features Toggle */}
            <AdminPanel className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/80">
                  <ToggleLeft className="h-4.5 w-4.5 text-[#06CFD6]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white/90">Módulos del Sistema</h2>
                  <p className="text-xs text-white/40">Activar o pausar funciones públicas</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 cursor-pointer group hover:bg-white/[0.04] transition-colors">
                  <input
                    type="checkbox"
                    checked={features.enable_chat}
                    onChange={e => setFeatures({ ...features, enable_chat: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20"
                  />
                  <div>
                    <span className="block text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                      Chat en vivo
                    </span>
                    <span className="text-[11px] text-white/40 leading-tight block mt-0.5">
                      Widget de atención al cliente
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 cursor-pointer group hover:bg-white/[0.04] transition-colors">
                  <input
                    type="checkbox"
                    checked={features.enable_quotes}
                    onChange={e => setFeatures({ ...features, enable_quotes: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20"
                  />
                  <div>
                    <span className="block text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                      Cotizador Público
                    </span>
                    <span className="text-[11px] text-white/40 leading-tight block mt-0.5">
                      Cálculo de cotizaciones online
                    </span>
                  </div>
                </label>
              </div>
            </AdminPanel>

            {/* Feriados Summary Card */}
            <AdminPanel className="p-6 flex flex-col justify-between flex-1">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#06CFD6]/10 border border-[#06CFD6]/20 text-[#06CFD6]">
                      <Calendar className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-white/90">Feriados del Sistema</h2>
                      <p className="text-xs text-white/40">Cálculo de plazos legales y días hábiles</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-[#06CFD6]/10 border border-[#06CFD6]/20 px-2.5 py-1 text-xs font-semibold text-[#06CFD6]">
                    {holidays.length} fechas
                  </span>
                </div>

                {upcomingHoliday ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 mb-4">
                    <span className="block text-[11px] font-medium uppercase tracking-wider text-white/40">
                      Próximo Feriado Calendario
                    </span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-semibold text-white/90 truncate mr-2">
                        {upcomingHoliday.description}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#06CFD6] shrink-0">
                        {String(upcomingHoliday.day).padStart(2, '0')}/
                        {String(upcomingHoliday.month).padStart(2, '0')}
                        {upcomingHoliday.year ? `/${upcomingHoliday.year}` : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3.5 text-xs text-white/40 mb-4">
                    Sin feriados registrados en el calendario.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsHolidaysModalOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white transition-all hover:bg-white/10 hover:border-white/30 active:scale-[0.99]"
              >
                <Calendar className="h-4 w-4 text-[#06CFD6]" />
                <span>Gestionar Calendario de Feriados</span>
                <ArrowRight className="h-3.5 w-3.5 text-white/50" />
              </button>
            </AdminPanel>
          </div>

          {/* Row 2: SMTP Config */}
          <AdminPanel className="p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/80">
                <Mail className="h-4.5 w-4.5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white/90">Servidor de Correos (SMTP)</h2>
                <p className="text-xs text-white/40">Despacho de notificaciones transaccionales</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Servidor (Host)
                </label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Puerto
                </label>
                <input
                  type="text"
                  value={smtpConfig.port}
                  onChange={e => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Usuario (Correo)
                </label>
                <input
                  type="text"
                  value={smtpConfig.user}
                  onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Contraseña
                </label>
                <input
                  type="password"
                  placeholder="********"
                  value={smtpConfig.pass}
                  onChange={e => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
                <p className="mt-1 text-[10px] text-white/30 uppercase tracking-widest">
                  Dejar en blanco si no se cambia
                </p>
              </div>
            </div>
          </AdminPanel>

          {/* Row 2: Cloudinary Config */}
          <AdminPanel className="p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/80">
                <Cloud className="h-4.5 w-4.5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white/90">Almacenamiento Multimedia</h2>
                <p className="text-xs text-white/40">Cloudinary API para archivos y comprobantes</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    Cloud Name
                  </label>
                  <input
                    type="text"
                    value={cloudinaryConfig.cloud_name}
                    onChange={e => setCloudinaryConfig({ ...cloudinaryConfig, cloud_name: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    API Key
                  </label>
                  <input
                    type="text"
                    value={cloudinaryConfig.api_key}
                    onChange={e => setCloudinaryConfig({ ...cloudinaryConfig, api_key: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                  API Secret
                </label>
                <input
                  type="password"
                  placeholder="********"
                  value={cloudinaryConfig.api_secret}
                  onChange={e => setCloudinaryConfig({ ...cloudinaryConfig, api_secret: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
                <p className="mt-1 text-[10px] text-white/30 uppercase tracking-widest">
                  Dejar en blanco si no se cambia
                </p>
              </div>
            </div>
          </AdminPanel>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{loading ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </div>
      </form>

      {/* Modal de Gestión de Feriados */}
      <SystemHolidaysModal
        isOpen={isHolidaysModalOpen}
        onClose={() => setIsHolidaysModalOpen(false)}
        holidays={holidays}
        onRefresh={refreshHolidays}
        countryIdPE={countryIdPE}
      />
    </div>
  );
};

export default AdminConfiguracion;
