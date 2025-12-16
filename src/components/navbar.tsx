'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';

export function Navbar() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const { sidebarOpen, toggleSidebar } = useSidebar();

  useEffect(() => {
    // Obtener información del usuario del localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (error) {
        console.error('Error parsing user:', error);
      }
    }
  }, []);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await logout(token);
      }
      
      // Limpiar localStorage
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      
      toast({
        title: 'Sesión cerrada',
        description: 'Has cerrado sesión exitosamente',
      });
      
      // Redirigir al login
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error en logout:', error);
      // Limpiar de todas formas
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      router.push('/login');
    }
  };

  return (
    <header 
      className={cn(
        'fixed top-0 right-0 z-10 h-16 border-b border-[#1e3d5c] bg-[#153356] transition-all duration-300 ease-in-out',
        // En móviles siempre ocupa todo el ancho, en desktop se ajusta según sidebar
        'left-0 md:left-0',
        sidebarOpen && 'md:left-64'
      )}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-8">
        {/* Botón hamburguesa para móviles + Título */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Botón hamburguesa - solo visible en móviles */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="md:hidden text-white hover:text-white"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5 text-white" />
          </Button>
          
          {/* Título - responsive */}
        <div>

          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Nombre del usuario - oculto en móviles pequeños */}
          {user && (
            <div className="hidden sm:block text-sm text-white opacity-60 hover:opacity-100 transition-opacity duration-200 truncate max-w-[120px] md:max-w-none">
              {user.name}
            </div>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            title="Notificaciones"
            className="opacity-60 hover:opacity-100 transition-opacity duration-200 text-white hover:text-white"
          >
            <Bell className="h-5 w-5 text-white" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLogout}
            title="Cerrar sesión"
            className="opacity-60 hover:opacity-100 transition-opacity duration-200 text-white hover:text-white"
          >
            <LogOut className="h-5 w-5 text-white" />
          </Button>
        </div>
      </div>
    </header>
  );
}

