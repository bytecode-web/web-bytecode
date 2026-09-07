import React, { useEffect, useState, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToastStore } from '../../stores/toastStore';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((state) => state.addToast);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      const data = await apiRequest<Notification[]>('/admin/notifications/unread');
      setNotifications(data);
      setUnreadCount(data.length);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  useEffect(() => {
    // Fetch initial notifications
    void fetchNotifications();

    // Set up Server-Sent Events (SSE) instead of polling
    const sse = new EventSource('/api/admin/notifications/stream', { withCredentials: true });
    
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_unread') {
          void fetchNotifications();
        }
      } catch (e) {
        console.error('Error parsing SSE data', e);
      }
    };

    sse.onerror = (error) => {
      console.error('SSE connection error:', error);
      // EventSource intentará reconectarse automáticamente
    };

    return () => sse.close();
  }, []);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await apiRequest(`/admin/notifications/${id}/read`, { method: 'PUT' });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      addToast('No se pudo marcar como leída', 'error');
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    handleMarkAsRead(notification.id);
    setIsOpen(false);

    let basePath = '';
    if (notification.entity_type === 'quotes') {
      basePath = '/admin/cotizador';
    } else if (notification.entity_type === 'complaints') {
      basePath = '/admin/reclamos';
    } else if (notification.entity_type === 'contact_cases' || notification.entity_type === 'contacts') {
      basePath = '/admin/contactos';
    } else if (notification.entity_type === 'projects') {
      basePath = '/admin/proyectos';
    }

    if (basePath) {
      if (notification.entity_id) {
        navigate(basePath, {
          state: { 
            autoOpenId: notification.entity_id,
            notificationTimestamp: Date.now() 
          }
        });
      } else {
        navigate(basePath);
      }
    }
  };

  const timeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Hace un momento';
    if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} h`;
    return `Hace ${Math.floor(diffInSeconds / 86400)} d`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-white/70 bg-white/5 hover:bg-[#06CFD6]/10 border border-transparent hover:border-[#06CFD6]/20 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[#06CFD6]/50 cursor-pointer flex items-center justify-center group"
        title="Notificaciones"
      >
        <Bell className="w-5 h-5 group-hover:text-[#06CFD6] group-hover:[filter:drop-shadow(0_0_4px_rgba(6,207,214,0.5))] transition-all" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[100] transform transition-all">
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#050505]">
            <h3 className="text-sm font-medium text-white/90">Notificaciones</h3>
            <span className="text-xs bg-[#06CFD6]/10 text-[#06CFD6] py-0.5 px-2 rounded-full border border-[#06CFD6]/20">
              {unreadCount} nuevas
            </span>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-white/40">
                <Bell className="w-8 h-8 mb-3 opacity-20" />
                <p className="text-sm">No tienes notificaciones nuevas</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {notifications.map((notification) => (
                  <div 
                    key={notification.id} 
                    onClick={() => handleNotificationClick(notification)}
                    className="flex items-start p-4 hover:bg-white/5 border-b border-white/5 cursor-pointer transition-colors group relative"
                  >
                    <div className="flex-1 min-w-0 pr-8">
                      <p className="text-sm font-medium text-white/90 mb-1 leading-snug truncate">
                        {notification.title}
                      </p>
                      <p className="text-xs text-white/60 leading-relaxed line-clamp-2">
                        {notification.body}
                      </p>
                      <p className="text-[10px] text-white/40 mt-2 flex items-center gap-1.5">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                    
                    {/* Botón para marcar leída sin navegar */}
                    <button
                      onClick={(e) => handleMarkAsRead(notification.id, e)}
                      className="absolute right-4 top-4 p-1.5 text-white/30 hover:text-green-400 hover:bg-green-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      title="Marcar como leída"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
