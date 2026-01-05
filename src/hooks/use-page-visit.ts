/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - PAGE VISIT HOOK
 * =====================================================
 * Hook para rastrear automáticamente las visitas a páginas
 * Registra cuando un usuario visita un módulo del dashboard
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { recordPageVisit } from '@/lib/api';

// Mapeo de rutas a nombres de módulos y páginas
const PAGE_MAPPING: Record<string, { module: string; name: string }> = {
  '/dashboard': { module: 'dashboard', name: 'Dashboard Principal' },
  '/dashboard/documents': { module: 'documents', name: 'Documentos' },
  '/dashboard/upload': { module: 'upload', name: 'Subir Documentos' },
  '/dashboard/commissions': { module: 'commissions', name: 'Comisiones' },
  '/dashboard/zoho': { module: 'zoho', name: 'Zoho CRM' },
  '/dashboard/logs': { module: 'logs', name: 'Logs del Sistema' },
  '/dashboard/users': { module: 'users', name: 'Usuarios' },
  '/dashboard/config': { module: 'config', name: 'Configuración' },
  '/dashboard/profile': { module: 'profile', name: 'Perfil' },
  '/dashboard/agent': { module: 'agent', name: 'Agente' },
  '/dashboard/guia': { module: 'guia', name: 'Guía' },
};

/**
 * Hook para rastrear visitas a páginas
 * Se debe usar en el layout del dashboard
 */
export function usePageVisit() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const visitStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Solo rastrear rutas del dashboard
    if (!pathname.startsWith('/dashboard')) {
      return;
    }

    // Evitar registrar la misma página múltiples veces en el mismo render
    if (lastPathRef.current === pathname) {
      return;
    }

    // Registrar el tiempo de inicio de la visita
    visitStartTimeRef.current = Date.now();
    lastPathRef.current = pathname;

    // Obtener información del módulo desde el mapeo
    const pageInfo = PAGE_MAPPING[pathname] || {
      module: pathname.split('/')[2] || 'unknown',
      name: pathname.split('/').pop() || 'Página Desconocida',
    };

    // Registrar la visita de forma asíncrona (no bloquea la UI)
    recordPageVisit({
      page_path: pathname,
      page_name: pageInfo.name,
      module_name: pageInfo.module,
    });

    // Limpiar cuando el componente se desmonte o cambie la ruta
    return () => {
      // Calcular duración si es posible (para uso futuro)
      if (visitStartTimeRef.current) {
        // const duration = Math.floor((Date.now() - visitStartTimeRef.current) / 1000);
        // Opcional: registrar la duración cuando se sale de la página
        // Por ahora solo registramos la entrada
      }
      visitStartTimeRef.current = null;
    };
  }, [pathname]);
}





