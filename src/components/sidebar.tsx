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
  DollarSign,
} from 'lucide-react';
import type { UserRole } from '@/types/documents';
import { useSidebar } from '@/contexts/sidebar-context';
import { checkPermission } from '@/lib/api';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  allowedRoles?: UserRole[];
  requiresPermission?: string; // Nombre del permiso requerido (ej: 'upload_documents')
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
    icon: Upload,
    requiresPermission: 'upload_documents' // Requiere permiso upload_documents
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
    title: 'ZOHO CRM', 
    href: '/dashboard/zoho', 
    icon: Building2,
    allowedRoles: ['admin', 'ceo', 'sales_manager', 'post_sales', 'legal_manager', 'marketing_manager'] as UserRole[]
  },
  { 
    title: 'Comisiones', 
    href: '/dashboard/commissions', 
    icon: DollarSign,
    allowedRoles: ['admin', 'ceo'] as UserRole[]
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
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
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

    // Verificar permisos necesarios para los items del menú
    const checkPermissions = async () => {
      const permissionsToCheck: string[] = [];
      
      // Recopilar todos los permisos requeridos por los items
      NAV_ITEMS.forEach(item => {
        if (item.requiresPermission) {
          permissionsToCheck.push(item.requiresPermission);
        }
      });

      // Verificar cada permiso
      const permissionResults: Record<string, boolean> = {};
      for (const permission of permissionsToCheck) {
        try {
          const hasPermission = await checkPermission(permission as any);
          permissionResults[permission] = hasPermission;
        } catch (error) {
          console.error(`Error verificando permiso ${permission}:`, error);
          permissionResults[permission] = false;
        }
      }

      setUserPermissions(permissionResults);
    };

    checkPermissions();
  }, []);

  // Filtrar items según el rol del usuario y permisos
  const filteredItems = NAV_ITEMS.filter((item) => {
    // Si requiere un permiso específico, verificar que el usuario lo tenga
    if (item.requiresPermission) {
      const hasPermission = userPermissions[item.requiresPermission];
      if (!hasPermission) {
        return false; // Ocultar el item si no tiene el permiso
      }
    }

    // Si no hay restricciones, todos pueden verlo
    if (!item.adminOnly && !item.allowedRoles && !item.requiresPermission) {
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
      {/* Overlay para móviles cuando el sidebar está abierto */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity duration-300"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <aside 
        className={cn(
          'fixed left-0 top-0 h-screen bg-[#153356] text-white transition-all duration-300 ease-in-out z-40',
          // En móviles: overlay que se desliza desde la izquierda
          // En desktop: sidebar fijo
          'md:fixed md:z-20',
          sidebarOpen 
            ? 'w-64 translate-x-0' 
            : 'w-0 -translate-x-full md:w-0'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b border-[#1e3d5c] px-6 min-w-[256px] transition-opacity duration-300',
          !sidebarOpen && 'opacity-0 pointer-events-none'
        )}>
          <h1 className="text-xl font-bold font-heading">
            Capital <span className="text-[#fdc23e] text-xl">Plus</span>
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
        <nav className={cn(
          'flex-1 space-y-1 p-4 min-w-[256px] transition-opacity duration-300 overflow-y-auto',
          !sidebarOpen && 'opacity-0 pointer-events-none'
        )}>
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // En móviles, cerrar el sidebar al hacer click en un enlace
                  if (window.innerWidth < 768) {
                    toggleSidebar();
                  }
                }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors text-white',
                  isActive
                    ? 'bg-[#fdc23e] text-[#153356]'
                    : 'hover:bg-[#1e3d5c] text-white'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0 text-white" />
                <span className="truncate text-white">{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={cn(
          'border-t border-[#1e3d5c] p-4 min-w-[256px] transition-opacity duration-300',
          !sidebarOpen && 'opacity-0 pointer-events-none'
        )}>
          <p className="text-xs text-white/60">© 2026 Capital Plus</p>
        </div>
      </aside>

      {/* Botón flotante para mostrar sidebar cuando está oculto - solo en desktop */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="hidden md:flex fixed left-0 top-20 z-20 h-10 w-10 rounded-r-md bg-[#153356] text-[#fdc23e] shadow-lg hover:bg-[#1e3d5c] transition-all duration-300 items-center justify-center border border-[#1e3d5c]"
          aria-label="Mostrar sidebar"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

