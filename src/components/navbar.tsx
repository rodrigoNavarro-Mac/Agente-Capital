'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { useSidebar } from '@/contexts/sidebar-context';

export function Navbar() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const { sidebarOpen } = useSidebar();

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
      className={`fixed top-0 right-0 z-10 h-16 border-b bg-white transition-all duration-300 ease-in-out ${
        sidebarOpen ? 'left-64' : 'left-0'
      }`}
    >
      <div className="flex h-full items-center justify-between px-8">
        {/* Breadcrumb o título */}
        <div>
          <h2 className="text-lg font-semibold navy-text">
            Capital Plus - Agente de IA
          </h2>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {user && (
            <div className="text-sm text-muted-foreground opacity-60 hover:opacity-100 transition-opacity duration-200">
              {user.name}
            </div>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            title="Notificaciones"
            className="opacity-60 hover:opacity-100 transition-opacity duration-200"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLogout}
            title="Cerrar sesión"
            className="opacity-60 hover:opacity-100 transition-opacity duration-200"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

