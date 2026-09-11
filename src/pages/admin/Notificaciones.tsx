import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useToastStore } from '../../stores/toastStore';
import { BellRing, ShieldCheck, Loader2, Info } from 'lucide-react';
import RoleGuard from '../../components/admin/RoleGuard';
import AdminPanel from '../../components/admin/AdminPanel';

interface Role {
  id: string;
  code: string;
  name: string;
}

interface NotificationRule {
  id: string;
  event_type: string;
  role_id: string;
  is_active: boolean;
  role_code?: string;
  role_name?: string;
}

// Lista de eventos disponibles en el sistema (Triggers)
const AVAILABLE_EVENTS = [
  { id: 'contact_created', label: 'Nuevo Lead de Contacto', description: 'Cuando un usuario llena el formulario de contacto web' },
  { id: 'complaint_created', label: 'Nuevo Reclamo Registrado', description: 'Cuando un usuario ingresa una queja en el Libro de Reclamaciones' },
  { id: 'quote_created', label: 'Nueva Cotización', description: 'Cuando se genera una nueva cotización' },
  { id: 'quote_sent', label: 'Cotización Enviada', description: 'Cuando una cotización se marca como enviada al cliente' },
  { id: 'quote_accepted', label: 'Cotización Aceptada', description: 'Cuando una cotización pasa a estado Aceptada y debe iniciar proyecto' },
  { id: 'quote_rejected', label: 'Cotización Rechazada', description: 'Cuando una cotización es declinada' },
  { id: 'quote_expired', label: 'Cotización Expirada', description: 'Cuando una cotización expira por caducidad' },
];

const NotificacionesAdmin: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rolesRes, rulesRes] = await Promise.all([
        apiRequest<{ data: Role[] }>('/admin/roles'),
        apiRequest<NotificationRule[]>('/admin/notification-rules')
      ]);
      setRoles(rolesRes.data || []);
      setRules(rulesRes || []);
    } catch (error) {
      addToast('Error cargando configuración', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleRule = async (eventType: string, roleId: string, currentRuleId?: string) => {
    try {
      setSaving(true);
      if (currentRuleId) {
        // Desactivar / Eliminar regla
        await apiRequest(`/admin/notification-rules/${currentRuleId}`, { method: 'DELETE' });
        setRules(prev => prev.filter(r => r.id !== currentRuleId));
        addToast('Regla desactivada', 'success');
      } else {
        // Crear regla
        const newRule = await apiRequest<NotificationRule>('/admin/notification-rules', {
          method: 'POST',
          json: { event_type: eventType, role_id: roleId }
        });
        setRules(prev => [...prev, newRule]);
        addToast('Regla activada', 'success');
      }
    } catch (error) {
      addToast('Error al modificar regla', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard requiredPermission="admin.notificaciones.view">
      <div className="flex flex-col gap-6 font-sansation">
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <BellRing className="h-6 w-6 text-[#06CFD6]" />
            <div>
              <h1 className="text-2xl font-semibold tracking-wide text-white/90">Reglas de Notificación In-App</h1>
              <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Configura alertas por roles</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#06CFD6]" />
          </div>
        ) : (
          <AdminPanel className="flex flex-col overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="p-4 border-b border-white/10 bg-[#050505] font-semibold text-white/80 w-1/3">
                      Evento Disparador
                    </th>
                    {roles.map(role => (
                      <th key={role.id} className="p-4 border-b border-white/10 border-l border-white/5 bg-[#050505] font-medium text-white/70 text-center min-w-[120px]">
                        <div className="flex items-center justify-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-[#06CFD6]/50" />
                          {role.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AVAILABLE_EVENTS.map(event => (
                    <tr key={event.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                      <td className="p-4">
                        <div className="font-medium text-white/90 mb-1">{event.label}</div>
                        <div className="text-xs text-white/40 flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>{event.description}</span>
                        </div>
                      </td>
                      
                      {roles.map(role => {
                        const activeRule = rules.find(r => r.event_type === event.id && r.role_id === role.id);
                        return (
                          <td key={role.id} className="p-4 border-l border-white/5 text-center align-middle">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                disabled={saving}
                                checked={!!activeRule}
                                onChange={() => handleToggleRule(event.id, role.id, activeRule?.id)}
                              />
                              <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#06CFD6] opacity-80 peer-disabled:opacity-50"></div>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminPanel>
        )}
      </div>
    </RoleGuard>
  );
};

export default NotificacionesAdmin;
