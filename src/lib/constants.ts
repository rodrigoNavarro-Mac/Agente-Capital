/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - CONSTANTS
 * =====================================================
 * Constantes y configuraciones del frontend
 */

// =====================================================
// ZONAS Y DESARROLLOS
// =====================================================

export const ZONES = [
  { value: 'yucatan', label: 'Yucatán' },
  { value: 'puebla', label: 'Puebla' },
  { value: 'quintana_roo', label: 'Quintana Roo' },
] as const;

export const DEVELOPMENTS: Record<string, { value: string; label: string }[]> = {
  yucatan: [
    { value: 'amura', label: 'Amura' },
    { value: 'm2', label: 'M2' },
    { value: 'alya', label: 'Alya' },
    { value: "c2b", label: "C-2B" },
    { value: "c2a", label: "C-2A" },
    {value: "d1a", label: "D-1A" },

  ],
  puebla: [
    { value: '777', label: '777' },
    { value: '111', label: '111' },
    { value: 'qroo', label: 'Quintana Roo' },
  ],
  quintana_roo: [
    { value: 'fuego', label: 'Fuego' },
    { value: 'hazul', label: 'Hazul' },
  ],
};

// =====================================================
// TIPOS DE DOCUMENTOS
// =====================================================

export const DOCUMENT_TYPES = [
  { value: 'brochure', label: 'Brochure / Folleto' },
  { value: 'ficha_tecnica', label: 'Ficha Técnica' },
  { value: 'policy', label: 'Políticas' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'floor_plan', label: 'Planos' },
  { value: 'amenities', label: 'Amenidades' },
  { value: 'legal', label: 'Legal' },
  { value: 'faq', label: 'FAQ' },
  { value: 'general', label: 'General' },
] as const;

// =====================================================
// FORMATOS DE ARCHIVO
// =====================================================

export const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// =====================================================
// ROLES Y PERMISOS
// =====================================================
 
export const ROLES = [
  { value: 'ceo', label: 'CEO', color: 'blue' },
  { value: 'admin', label: 'Administrador', color: 'purple' },
  { value: 'sales_manager', label: 'Gerente de Ventas', color: 'green' },
  { value: 'sales_agent', label: 'Agente de Ventas', color: 'yellow' },
  { value: 'post_sales', label: 'Post-Venta', color: 'pink' },
  { value: 'legal_manager', label: 'Gerente Legal', color: 'orange' },
  { value: 'marketing_manager', label: 'Gerente de Marketing', color: 'brown' },

] as const;

// =====================================================
// CONFIGURACIÓN
// =====================================================

export const DEFAULT_CONFIG = {
  temperature: 0.2,
  top_k: 5,
  chunk_size: 500,
  chunk_overlap: 50,
  max_tokens: 2048,
};

export const TEMPERATURE_MARKS = [
  { value: 0, label: '0' },
  { value: 0.5, label: '0.5' },
  { value: 1, label: '1' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: '2' },
];

// =====================================================
// NAVEGACIÓN
// =====================================================

export const NAV_ITEMS = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: 'LayoutDashboard',
    badge: null,
  },
  {
    title: 'Subir Documentos',
    href: '/dashboard/upload',
    icon: 'Upload',
    badge: null,
  },
  {
    title: 'Consultar Agente',
    href: '/dashboard/agent',
    icon: 'MessageSquare',
    badge: null,
  },
  {
    title: 'Documentos',
    href: '/dashboard/documents',
    icon: 'FileText',
    badge: null,
  },
  {
    title: 'Configuración',
    href: '/dashboard/config',
    icon: 'Settings',
    badge: null,
  },
  {
    title: 'Logs',
    href: '/dashboard/logs',
    icon: 'Activity',
    badge: null,
  },
  {
    title: 'Usuarios',
    href: '/dashboard/users',
    icon: 'Users',
    badge: 'Admin',
    adminOnly: true,
  },
] as const;

// =====================================================
// API ENDPOINTS
// =====================================================

export const API_ENDPOINTS = {
  upload: '/api/upload',
  query: '/api/rag-query',
  feedback: '/api/rag-feedback',
  developments: '/api/developments',
  config: '/api/agent-config',
  documents: '/api/documents',
  logs: '/api/logs',
  users: '/api/users',
} as const;

// =====================================================
// MENSAJES
// =====================================================

export const MESSAGES = {
  uploadSuccess: '✅ Documento subido y procesado exitosamente',
  uploadError: '❌ Error al subir el documento',
  querySuccess: '✅ Consulta procesada',
  queryError: '❌ Error al procesar la consulta',
  configSuccess: '✅ Configuración guardada',
  configError: '❌ Error al guardar la configuración',
  copySuccess: '📋 Copiado al portapapeles',
  copyError: '❌ Error al copiar',
  deleteSuccess: '🗑️ Eliminado exitosamente',
  deleteError: '❌ Error al eliminar',
} as const;

