'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Upload,
  MessageSquare,
  FileText,
  Settings,
  Activity,
  Users,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  BookOpen,
} from 'lucide-react';
import type { UserRole } from '@/types/documents';
import { useSidebar } from '@/contexts/sidebar-context';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  allowedRoles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { 
    title: 'Dashboard', 
    href: '/dashboard', 
    icon: LayoutDashboard 
  },
  { 
    title: 'Subir Documentos', 
    href: '/dashboard/upload', 
    icon: Upload 
    // Disponible para todos pero requiere permiso can_upload desde panel de usuarios
  },
  { 
    title: 'Consultar Agente', 
    href: '/dashboard/agent', 
    icon: MessageSquare 
  },
  { 
    title: 'Documentos', 
    href: '/dashboard/documents', 
    icon: FileText 
  },
  { 
    title: 'Guía de Usuario', 
    href: '/dashboard/guia', 
    icon: BookOpen
    // Disponible para todos los usuarios
  },
  { 
    title: 'ZOHO CRM (En Desarrollo)', 
    href: '/dashboard/zoho', 
    icon: Building2,
    allowedRoles: ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'] as UserRole[]
  },
  { 
    title: 'Mi Perfil', 
    href: '/dashboard/profile', 
    icon: User,
    // Todos los usuarios pueden acceder a su perfil
  },
  { 
    title: 'Configuración', 
    href: '/dashboard/config', 
    icon: Settings,
    allowedRoles: ['admin'] as UserRole[] // Solo ADMIN
  },
  { 
    title: 'Logs', 
    href: '/dashboard/logs', 
    icon: Activity,
    allowedRoles: ['admin', 'ceo'] as UserRole[] // Solo ADMIN y CEO
  },
  { 
    title: 'Usuarios', 
    href: '/dashboard/users', 
    icon: Users, 
    allowedRoles: ['admin', 'ceo'] as UserRole[]
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { sidebarOpen, toggleSidebar } = useSidebar();

  useEffect(() => {
    // Obtener rol del usuario desde localStorage o token
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role || null);
      } catch (error) {
        console.error('Error parsing user:', error);
      }
    } else {
      // Si no hay usuario en localStorage, intentar obtener del token
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          // Decodificar token para obtener el rol
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserRole(payload.role || null);
        } catch (error) {
          console.error('Error decoding token:', error);
        }
      }
    }
  }, []);

  // Filtrar items según el rol del usuario
  const filteredItems = NAV_ITEMS.filter((item) => {
    // Si no hay restricciones, todos pueden verlo
    if (!item.adminOnly && !item.allowedRoles) {
      return true;
    }

    // Si requiere admin y el usuario es admin o ceo
    if (item.adminOnly) {
      return userRole === 'admin' || userRole === 'ceo';
    }

    // Si tiene roles permitidos específicos
    if (item.allowedRoles) {
      return userRole && item.allowedRoles.includes(userRole);
    }

    return false;
  });

  return (
    <>
      <aside 
        className={`fixed left-0 top-0 h-screen capital-gradient text-white transition-all duration-300 ease-in-out z-20 ${
          sidebarOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
      >
        {/* Logo */}
        <div className={`flex h-16 items-center border-b border-white/10 px-6 min-w-[256px] transition-opacity duration-300 ${
          !sidebarOpen && 'opacity-0 pointer-events-none'
        }`}>
          <h1 className="text-xl font-bold">
            Capital Plus <span className="gold-accent">AI</span>
          </h1>
          {/* Botón para plegar sidebar */}
          <button
            onClick={toggleSidebar}
            className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Ocultar sidebar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 space-y-1 p-4 min-w-[256px] transition-opacity duration-300 ${
          !sidebarOpen && 'opacity-0 pointer-events-none'
        }`}>
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-capital-gold text-capital-navy'
                    : 'hover:bg-white/10'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/10 p-4 min-w-[256px] transition-opacity duration-300 ${
          !sidebarOpen && 'opacity-0 pointer-events-none'
        }`}>
          <p className="text-xs text-white/60">© 2026 Capital Plus</p>
        </div>
      </aside>

      {/* Botón flotante para mostrar sidebar cuando está oculto */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed left-0 top-20 z-20 h-10 w-10 rounded-r-md bg-capital-navy text-white shadow-lg hover:bg-capital-navy/90 transition-all duration-300 flex items-center justify-center"
          aria-label="Mostrar sidebar"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

