/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - UTILITY FUNCTIONS
 * =====================================================
 * Funciones de utilidad para el frontend
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { logger } from '@/lib/logger';

/**
 * Combina clases de Tailwind con merge inteligente
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea una fecha en español
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Formatea una fecha relativa (hace X minutos)
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
  return `Hace ${days} día${days > 1 ? 's' : ''}`;
}

/**
 * Formatea bytes a tamaño legible
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Trunca texto a longitud máxima
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Capitaliza primera letra
 */
export function capitalize(text: string): string {
  if (!text || text.trim().length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Normaliza el nombre de un desarrollo para mostrar (capitaliza primera letra)
 * Esta función asegura que los nombres de desarrollos siempre se muestren
 * con la primera letra en mayúscula, independientemente de cómo estén guardados
 * en la base de datos o en Zoho.
 * 
 * También maneja casos especiales:
 * - "qroo" y "P. Quintana Roo" se normalizan a "P. Quintana Roo"
 * 
 * Ejemplos:
 * - "fuego" -> "Fuego"
 * - "FUEGO" -> "Fuego"
 * - "hazul" -> "Hazul"
 * - "hazúl" -> "Hazúl"
 * - "11-11-11" -> "11-11-11" (números no se modifican)
 * - "111" -> "111" (números no se modifican)
 * - "qroo" -> "P. Quintana Roo"
 * - "Qroo" -> "P. Quintana Roo"
 * - "P. Quintana Roo" -> "P. Quintana Roo" (ya tiene mayúscula)
 */
export function normalizeDevelopmentDisplay(name: string): string {
  if (!name || typeof name !== 'string') return name;
  const trimmed = name.trim();
  if (trimmed.length === 0) return trimmed;
  
  // Caso especial: "qroo" (en cualquier variación) se normaliza a "P. Quintana Roo"
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed === 'qroo' || lowerTrimmed === 'p. quintana roo' || lowerTrimmed === 'p quintana roo') {
    return 'P. Quintana Roo';
  }
  
  // Si el nombre comienza con un número, no capitalizar (ej: "111", "777", "11-11-11")
  if (/^\d/.test(trimmed)) {
    return trimmed;
  }
  
  // Capitalizar primera letra y dejar el resto en minúsculas
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Normaliza un nombre de desarrollo para filtrado en backend (convierte a lowercase)
 * Esto es lo opuesto a normalizeDevelopmentDisplay - convierte de UI a BD
 */
export function normalizeDevelopmentForFilter(name: string): string {
  if (!name || typeof name !== 'string') return name;
  const trimmed = name.trim();
  if (trimmed.length === 0) return trimmed;

  // Caso especial: "P. Quintana Roo" -> "p. quintana roo"
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed === 'p. quintana roo') {
    return 'p. quintana roo';
  }

  // Para otros casos, convertir a lowercase para matching case-insensitive
  return trimmed.toLowerCase();
}

/**
 * Convierte snake_case a Title Case
 */
export function snakeToTitle(text: string): string {
  return text
    .split('_')
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Copia texto al portapapeles
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    logger.error('Error copiando al portapapeles', error, {}, 'utils');
    return false;
  }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Valida si es un email válido
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Genera un ID único
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

