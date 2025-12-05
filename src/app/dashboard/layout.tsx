'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { decodeAccessToken } from '@/lib/auth';
import { Loading } from '@/components/loading';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = () => {
      // Obtener token del localStorage
      const token = localStorage.getItem('accessToken');

      if (!token) {
        setIsAuthenticated(false);
        router.push('/login');
        return;
      }

      // Decodificar token (verificación básica en cliente)
      const payload = decodeAccessToken(token);
      
      if (!payload) {
        // Token inválido o expirado, limpiar y redirigir
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
        router.push('/login');
        return;
      }
      setIsAuthenticated(true);
    };

    checkAuth();
  }, [router, pathname]);

  // Mostrar loading mientras verifica autenticación
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  // Si no está autenticado, no renderizar nada (ya se redirigió)
  if (!isAuthenticated) {
    return null;
  }

  // Si está autenticado, renderizar el layout completo con sidebar y navbar
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}

// Componente interno que usa el contexto del sidebar
function DashboardContent({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div 
        className={cn(
          'flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out',
          // En móviles no hay margen (sidebar es overlay)
          // En desktop: margen izquierdo cuando sidebar está abierto
          'ml-0',
          sidebarOpen ? 'md:ml-64' : 'md:ml-0'
        )}
      >
        <Navbar />
        <main className="flex-1 overflow-hidden pt-16">
          <div className="h-full p-3 sm:p-4 md:p-6 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
