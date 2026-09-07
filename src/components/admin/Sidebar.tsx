import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Calculator,
  ClipboardList,
  Database,
  FolderKanban,
  Images,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  X,
  BellRing,
  BookUser,
} from 'lucide-react';
import type { AdminUser } from './AdminLayout';
import { apiRequest } from '../../lib/api';

type SidebarProps = {
  admin: AdminUser | null;
  onClose?: () => void;
};

type MenuItem = {
  id: string;
  label: string;
  url: string;
  icon_name: string | null;
  permission_code: string | null;
};

const iconMap = {
  Calculator,
  ClipboardList,
  Database,
  FolderKanban,
  Images,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  BellRing,
  BookUser,
};

const Sidebar: React.FC<SidebarProps> = ({ admin, onClose }) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    if (!admin) return;

    apiRequest<{ items: MenuItem[] }>('/admin/menu')
      .then((result) => setMenuItems(result.items))
      .catch(() => setMenuItems([]));
  }, [admin]);

  return (
    <aside className="w-64 border-r border-white/5 bg-[#0a0a0a] flex flex-col h-full shadow-2xl lg:shadow-none">
      <div className="p-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <img src="/vectors/designs/logo_en_blanco.svg" alt="Bytecode Logo" className="h-8" />
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const Icon = iconMap[item.icon_name as keyof typeof iconMap] ?? (item.label === 'Directorio' ? BookUser : LayoutDashboard);

          return (
            <NavLink
              key={item.id}
              to={item.url}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm group ${
                  isActive ? 'bg-white/10 text-white font-medium' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="group-hover:text-[#06CFD6] group-hover:[text-shadow:0_0_8px_rgba(6,207,214,0.4)] transition-all">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
