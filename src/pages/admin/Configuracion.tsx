import React, { useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toastStore';
import { Settings, Save, RefreshCw, Cloud, Calendar, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';

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

import AdminPanel from '../../components/admin/AdminPanel';

const AdminConfiguracion: React.FC = () => {
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
    
  const [contactInfo, setContactInfo] = useState(defaultSettings.contact_info);
  const [smtpConfig, setSmtpConfig] = useState(defaultSettings.smtp_config);
  const [cloudinaryConfig, setCloudinaryConfig] = useState(defaultSettings.cloudinary_config);
  const [features, setFeatures] = useState(defaultSettings.features);

  const [holidays, setHolidays] = useState<any[]>([]);
  const [newHoliday, setNewHoliday] = useState({ month: 1, day: 1, year: '' as string | number, description: '' });
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [countryIdPE, setCountryIdPE] = useState<string>('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: SettingItem[] }>('/admin/settings');
      const holidaysRes = await apiRequest<{ items: any[] }>('/admin/system-holidays');
      setHolidays(holidaysRes.items);
      const peHoliday = holidaysRes.items.find((h: any) => h.country_code === 'PE');
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

  useEffect(() => {
    void loadSettings();
  }, []);

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

  const handleAddHoliday = async () => {
    if (!newHoliday.description.trim()) return;
    setAddingHoliday(true);
    try {
      let cid = countryIdPE;
      if (!cid) {
        // Fallback: we need to find PE country id if no holidays exist yet
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
          description: newHoliday.description
        }
      });
      addToast('Feriado agregado.', 'success');
      setNewHoliday({ month: 1, day: 1, year: '', description: '' });
      await loadSettings();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al agregar feriado', 'error');
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await apiRequest(`/admin/system-holidays/${id}`, { method: 'DELETE' });
      addToast('Feriado eliminado.', 'success');
      await loadSettings();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error al eliminar feriado', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sansation">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-[#06CFD6]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-white/90">Configuración</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Variables del sistema</p>
          </div>
        </div>
        <button onClick={loadSettings} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          <RefreshCw className="h-4 w-4" /> <span>Actualizar</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-2">
        {/* Contact Info */}
        <AdminPanel className="p-6 lg:p-8">
          <h2 className="text-lg font-medium mb-6 text-white/90">Información de Contacto</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Correo Electrónico</label>
              <input
                type="email"
                value={contactInfo.email}
                onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Teléfono 1 (WhatsApp Principal)</label>
                <input
                  type="text"
                  value={contactInfo.phone_1}
                  onChange={e => setContactInfo({ ...contactInfo, phone_1: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Teléfono 2 (WhatsApp Secundario)</label>
                <input
                  type="text"
                  value={contactInfo.phone_2}
                  onChange={e => setContactInfo({ ...contactInfo, phone_2: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Dirección Física</label>
              <input
                type="text"
                value={contactInfo.address}
                onChange={e => setContactInfo({ ...contactInfo, address: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>
        </AdminPanel>

        {/* Features Toggle */}
        <AdminPanel className="p-6 lg:p-8">
          <h2 className="text-lg font-medium mb-6 text-white/90">Módulos del Sistema</h2>
          <div className="flex flex-col gap-6">
            <label className="flex items-center gap-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={features.enable_chat}
                onChange={e => setFeatures({ ...features, enable_chat: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20 focus:ring-offset-black"
              />
              <div>
                <span className="block text-sm font-medium text-white/90 group-hover:text-white transition-colors">Chat en vivo</span>
                <span className="text-xs text-white/40">Habilitar el widget de atención al cliente</span>
              </div>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={features.enable_quotes}
                onChange={e => setFeatures({ ...features, enable_quotes: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20 focus:ring-offset-black"
              />
              <div>
                <span className="block text-sm font-medium text-white/90 group-hover:text-white transition-colors">Cotizador Público</span>
                <span className="text-xs text-white/40">Permitir a los usuarios generar cotizaciones automáticas</span>
              </div>
            </label>
          </div>
        </AdminPanel>

        {/* SMTP Config */}
        <AdminPanel className="p-6 lg:p-8 lg:col-span-2">
          <h2 className="text-lg font-medium mb-6 text-white/90">Servidor de Correos (SMTP)</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Servidor (Host)</label>
              <input
                type="text"
                value={smtpConfig.host}
                onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Puerto</label>
              <input
                type="text"
                value={smtpConfig.port}
                onChange={e => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Usuario (Correo)</label>
              <input
                type="text"
                value={smtpConfig.user}
                onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Contraseña</label>
              <input
                type="password"
                placeholder="********"
                value={smtpConfig.pass}
                onChange={e => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
              <p className="mt-1.5 text-[10px] text-white/30 uppercase tracking-widest">Dejar en blanco si no se cambia</p>
            </div>
          </div>
        </AdminPanel>

        {/* Cloudinary Config */}
        <AdminPanel className="p-6 lg:p-8 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <Cloud className="h-5 w-5 text-white/70" />
            <h2 className="text-lg font-medium text-white/90">Almacenamiento Multimedia (Cloudinary)</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Cloud Name</label>
              <input
                type="text"
                value={cloudinaryConfig.cloud_name}
                onChange={e => setCloudinaryConfig({ ...cloudinaryConfig, cloud_name: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">API Key</label>
              <input
                type="text"
                value={cloudinaryConfig.api_key}
                onChange={e => setCloudinaryConfig({ ...cloudinaryConfig, api_key: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">API Secret</label>
              <input
                type="password"
                placeholder="********"
                value={cloudinaryConfig.api_secret}
                onChange={e => setCloudinaryConfig({ ...cloudinaryConfig, api_secret: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/30 transition-colors"
              />
              <p className="mt-1.5 text-[10px] text-white/30 uppercase tracking-widest">Dejar en blanco si no se cambia</p>
            </div>
          </div>
        </AdminPanel>

        {/* System Holidays */}
        <AdminPanel className="p-6 lg:p-8 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-white/70" />
              <div>
                <h2 className="text-lg font-medium text-white/90">Feriados del Sistema</h2>
                <p className="text-white/40 text-xs mt-1">Utilizado para calcular plazos en días hábiles</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="grid grid-cols-3 gap-4 flex-1">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Día</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={newHoliday.day}
                  onChange={e => setNewHoliday({ ...newHoliday, day: Number(e.target.value) })}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-4 py-2 text-sm text-white/90 outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Mes</label>
                <select
                  value={newHoliday.month}
                  onChange={e => setNewHoliday({ ...newHoliday, month: Number(e.target.value) })}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-4 py-2 text-sm text-white/90 outline-none focus:border-white/30"
                >
                  <option value={1}>Enero</option>
                  <option value={2}>Febrero</option>
                  <option value={3}>Marzo</option>
                  <option value={4}>Abril</option>
                  <option value={5}>Mayo</option>
                  <option value={6}>Junio</option>
                  <option value={7}>Julio</option>
                  <option value={8}>Agosto</option>
                  <option value={9}>Septiembre</option>
                  <option value={10}>Octubre</option>
                  <option value={11}>Noviembre</option>
                  <option value={12}>Diciembre</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Año</label>
                <input
                  type="number"
                  placeholder="Recurrente"
                  value={newHoliday.year}
                  onChange={e => setNewHoliday({ ...newHoliday, year: e.target.value })}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-4 py-2 text-sm text-white/90 outline-none focus:border-white/30"
                />
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">Descripción</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ej. Año Nuevo"
                  value={newHoliday.description}
                  onChange={e => setNewHoliday({ ...newHoliday, description: e.target.value })}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-4 py-2 text-sm text-white/90 outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={handleAddHoliday}
                  disabled={addingHoliday || !newHoliday.description.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Agregar
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-left text-sm text-white/70">
              <thead className="bg-white/5 text-xs uppercase text-white/40">
                <tr>
                  <th className="px-6 py-3 font-medium tracking-wider">Fecha</th>
                  <th className="px-6 py-3 font-medium tracking-wider">Descripción</th>
                  <th className="px-6 py-3 font-medium tracking-wider">Tipo</th>
                  <th className="px-6 py-3 font-medium tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {holidays.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-white/40">
                      No hay feriados registrados
                    </td>
                  </tr>
                ) : (
                  holidays.map((holiday) => (
                    <tr key={holiday.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        {String(holiday.day).padStart(2, '0')}/{String(holiday.month).padStart(2, '0')}
                        {holiday.year ? `/${holiday.year}` : ''}
                      </td>
                      <td className="px-6 py-4 text-white/90">{holiday.description}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/80">
                          {holiday.year ? 'Específico' : 'Recurrente'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteHoliday(holiday.id)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
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
          </div>
        </AdminPanel>

        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50">
            <Save className="h-4 w-4" /> {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminConfiguracion;
