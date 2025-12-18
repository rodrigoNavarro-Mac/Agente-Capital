/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - VALIDATION HELPERS
 * =====================================================
 * Utilidades para validación y sanitización de inputs
 * usando Zod para validación de esquemas
 */

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// =====================================================
// CONSTANTES DE LÍMITES
// =====================================================

export const VALIDATION_LIMITS = {
  // Texto
  QUERY_MIN_LENGTH: 3,
  QUERY_MAX_LENGTH: 2000,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  DESCRIPTION_MAX_LENGTH: 5000,
  TEXT_MAX_LENGTH: 10000,
  
  // Números
  USER_ID_MIN: 1,
  USER_ID_MAX: Number.MAX_SAFE_INTEGER,
  PERCENTAGE_MIN: 0,
  PERCENTAGE_MAX: 100,
  AMOUNT_MIN: 0,
  AMOUNT_MAX: Number.MAX_SAFE_INTEGER,
  
  // Archivos
  FILE_MAX_SIZE_MB: 50,
  FILE_MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  
  // Arrays
  ARRAY_MAX_LENGTH: 1000,
} as const;

// =====================================================
// FUNCIONES DE SANITIZACIÓN
// =====================================================

/**
 * Sanitiza un string removiendo caracteres peligrosos
 * y normalizando espacios
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .replace(/\s+/g, ' ') // Normalizar espacios múltiples
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remover caracteres de control
}

/**
 * Sanitiza un string opcional/nullable
 * Retorna null/undefined si el input es null/undefined
 */
function _sanitizeOptionalString(input: string | null | undefined): string | null | undefined {
  if (input === null || input === undefined) {
    return input;
  }
  return sanitizeString(input);
}

/**
 * Sanitiza un string para prevenir XSS básico
 * (Nota: Para protección completa, usar librerías como DOMPurify en el frontend)
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Valida y sanitiza un email
 */
export function sanitizeEmail(email: string): string {
  return sanitizeString(email).toLowerCase();
}

// =====================================================
// SCHEMAS COMUNES CON ZOD
// =====================================================

/**
 * Schema para validar emails
 */
export const emailSchema = z
  .string()
  .min(1, 'El email es requerido')
  .max(VALIDATION_LIMITS.EMAIL_MAX_LENGTH, `El email no puede exceder ${VALIDATION_LIMITS.EMAIL_MAX_LENGTH} caracteres`)
  .email('El formato del email no es válido')
  .transform(sanitizeEmail);

/**
 * Schema para validar passwords
 */
export const passwordSchema = z
  .string()
  .min(VALIDATION_LIMITS.PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${VALIDATION_LIMITS.PASSWORD_MIN_LENGTH} caracteres`)
  .max(VALIDATION_LIMITS.PASSWORD_MAX_LENGTH, `La contraseña no puede exceder ${VALIDATION_LIMITS.PASSWORD_MAX_LENGTH} caracteres`);

/**
 * Schema para validar nombres
 */
export const nameSchema = z
  .string()
  .min(VALIDATION_LIMITS.NAME_MIN_LENGTH, `El nombre debe tener al menos ${VALIDATION_LIMITS.NAME_MIN_LENGTH} caracteres`)
  .max(VALIDATION_LIMITS.NAME_MAX_LENGTH, `El nombre no puede exceder ${VALIDATION_LIMITS.NAME_MAX_LENGTH} caracteres`)
  .transform(sanitizeString);

/**
 * Schema para validar queries de RAG
 */
export const querySchema = z
  .string()
  .min(VALIDATION_LIMITS.QUERY_MIN_LENGTH, `La consulta debe tener al menos ${VALIDATION_LIMITS.QUERY_MIN_LENGTH} caracteres`)
  .max(VALIDATION_LIMITS.QUERY_MAX_LENGTH, `La consulta no puede exceder ${VALIDATION_LIMITS.QUERY_MAX_LENGTH} caracteres`)
  .transform(sanitizeString);

/**
 * Schema para validar IDs de usuario
 */
export const userIdSchema = z
  .number()
  .int('El ID de usuario debe ser un número entero')
  .min(VALIDATION_LIMITS.USER_ID_MIN, 'El ID de usuario debe ser mayor a 0')
  .max(VALIDATION_LIMITS.USER_ID_MAX, 'El ID de usuario excede el límite máximo');

/**
 * Schema para validar zonas
 */
export const zoneSchema = z.enum(['norte', 'sur', 'centro'], {
  errorMap: () => ({ message: 'La zona debe ser: norte, sur o centro' }),
});

/**
 * Schema para validar tipos de documento
 */
export const documentTypeSchema = z.enum(['general', 'precios', 'especificaciones', 'legal', 'marketing'], {
  errorMap: () => ({ message: 'El tipo de documento debe ser: general, precios, especificaciones, legal o marketing' }),
});

/**
 * Schema para validar porcentajes
 */
export const percentageSchema = z
  .number()
  .min(VALIDATION_LIMITS.PERCENTAGE_MIN, `El porcentaje debe ser mayor o igual a ${VALIDATION_LIMITS.PERCENTAGE_MIN}`)
  .max(VALIDATION_LIMITS.PERCENTAGE_MAX, `El porcentaje debe ser menor o igual a ${VALIDATION_LIMITS.PERCENTAGE_MAX}`);

/**
 * Schema para validar montos
 */
export const amountSchema = z
  .number()
  .min(VALIDATION_LIMITS.AMOUNT_MIN, `El monto debe ser mayor o igual a ${VALIDATION_LIMITS.AMOUNT_MIN}`)
  .max(VALIDATION_LIMITS.AMOUNT_MAX, 'El monto excede el límite máximo');

// =====================================================
// HELPER PARA VALIDAR REQUESTS
// =====================================================

/**
 * Valida el body de una request usando un schema de Zod
 * @param schema - Schema de Zod para validar
 * @param data - Datos a validar
 * @param logScope - Scope para logging
 * @returns Datos validados o null si hay error
 */
export function validateRequest<T>(
  schema: z.ZodType<T, z.ZodTypeDef, any>,
  data: unknown,
  logScope: string = 'validation'
): { success: true; data: T } | { success: false; error: string; status: number } {
  try {
    const result = schema.safeParse(data);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => {
        const path = err.path.join('.');
        return path ? `${path}: ${err.message}` : err.message;
      }).join(', ');
      
      logger.warn('Validation failed', { errors: result.error.errors, data }, logScope);
      
      return {
        success: false,
        error: `Error de validación: ${errors}`,
        status: 400,
      };
    }
    
    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    logger.error('Validation error', error, { data }, logScope);
    return {
      success: false,
      error: 'Error al validar los datos',
      status: 400,
    };
  }
}

/**
 * Wrapper para validar y retornar respuesta de error si falla
 * @param schema - Schema de Zod
 * @param data - Datos a validar
 * @param logScope - Scope para logging
 * @returns Datos validados o NextResponse con error
 */
export function validateRequestOrRespond<T>(
  schema: z.ZodType<T, z.ZodTypeDef, any>,
  data: unknown,
  logScope: string = 'validation'
): T | NextResponse {
  const validation = validateRequest(schema, data, logScope);
  
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: validation.error,
      },
      { status: validation.status }
    );
  }
  
  return validation.data;
}

// =====================================================
// SCHEMAS PARA ENDPOINTS ESPECÍFICOS
// =====================================================

/**
 * Schema para RAG Query Request
 */
export const ragQueryRequestSchema = z.object({
  query: querySchema,
  zone: zoneSchema,
  development: z
    .string()
    .min(1, 'El desarrollo es requerido')
    .max(100, 'El nombre del desarrollo no puede exceder 100 caracteres')
    .transform(sanitizeString),
  type: documentTypeSchema.optional(),
  userId: userIdSchema.optional(),
  skipCache: z.boolean().optional(),
});

/**
 * Schema para Login Request
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Schema para Register/Create User Request
 */
export const createUserRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema.optional(), // Opcional si se crea sin contraseña
  name: nameSchema,
  role: z.enum(['user', 'admin', 'ceo', 'sales']).optional(),
  active: z.boolean().optional(),
});

/**
 * Schema para Change Password Request
 */
export const changePasswordRequestSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

/**
 * Schema para Reset Password Request
 */
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'El token es requerido'),
  password: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

/**
 * Schema para Forgot Password Request
 */
export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

/**
 * Schema para Commission Rule Input
 */
export const commissionRuleInputSchema = z.object({
  desarrollo: z.string().min(1, 'El desarrollo es requerido').max(100).transform(sanitizeString),
  rule_name: z.string().min(1, 'El nombre de la regla es requerido').max(100).transform(sanitizeString),
  periodo_type: z.enum(['trimestre', 'mensual', 'anual'], {
    errorMap: () => ({ message: 'El tipo de período debe ser: trimestre, mensual o anual' }),
  }),
  periodo_value: z.string().min(1, 'El valor del período es requerido'),
  operador: z.enum(['=', '>=', '<='], {
    errorMap: () => ({ message: 'El operador debe ser: =, >= o <=' }),
  }),
  unidades_vendidas: z.number().int().min(1, 'Las unidades vendidas deben ser mayores a 0'),
  porcentaje_comision: percentageSchema,
}).refine((data) => {
  // Validar formato de periodo_value según periodo_type
  // IMPORTANTE: Para trimestres, periodo_value es solo el año (ej: "2025")
  // La regla se aplica a todos los trimestres de ese año
  if (data.periodo_type === 'trimestre') {
    // Aceptar solo el año (ej: "2025")
    return /^\d{4}$/.test(data.periodo_value);
  }
  if (data.periodo_type === 'mensual') {
    return /^\d{4}-\d{2}$/.test(data.periodo_value);
  }
  if (data.periodo_type === 'anual') {
    return /^\d{4}$/.test(data.periodo_value);
  }
  return true;
}, {
  message: 'El formato del período no es válido',
  path: ['periodo_value'],
});

/**
 * Schema para Commission Sale Input
 */
export const commissionSaleInputSchema = z.object({
  zoho_deal_id: z.string().min(1, 'El ID del deal de Zoho es requerido'),
  cliente_nombre: z.string().min(1, 'El nombre del cliente es requerido').max(200).transform(sanitizeString),
  desarrollo: z.string().min(1, 'El desarrollo es requerido').max(100).transform(sanitizeString),
  propietario_deal: z.string().min(1, 'El propietario del deal es requerido').max(200).transform(sanitizeString),
  metros_cuadrados: z.number().positive('Los metros cuadrados deben ser mayores a 0'),
  valor_total: z.number().positive('El valor total debe ser mayor a 0'),
  precio_por_m2: z.number().positive().optional(),
  fecha_firma: z.string().min(1, 'La fecha de firma es requerida'), // ISO date string
  fecha_cierre: z.string().optional(), // ISO date string
});

/**
 * Schema para Agent Config Update
 */
export const agentConfigUpdateSchema = z.object({
  key: z.string().min(1, 'La clave es requerida'),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]),
}).refine((data) => {
  // Validación específica por key
  switch (data.key) {
    case 'temperature':
      return typeof data.value === 'number' && data.value >= 0 && data.value <= 2;
    case 'top_k':
      return typeof data.value === 'number' && data.value >= 1 && data.value <= 20;
    case 'chunk_size':
      return typeof data.value === 'number' && data.value >= 100 && data.value <= 2000;
    case 'chunk_overlap':
      return typeof data.value === 'number' && data.value >= 0 && data.value <= 500;
    case 'max_tokens':
      return typeof data.value === 'number' && data.value >= 100 && data.value <= 8192;
    case 'system_prompt':
      return typeof data.value === 'string' && data.value.length >= 50;
    case 'restrictions':
      return Array.isArray(data.value) && data.value.every(v => typeof v === 'string');
    case 'llm_provider':
      return typeof data.value === 'string' && (data.value === 'lmstudio' || data.value === 'openai');
    default:
      return true;
  }
}, {
  message: 'El valor no es válido para esta clave',
  path: ['value'],
});

/**
 * Schema para RAG Feedback Request
 */
export const ragFeedbackRequestSchema = z.object({
  query_log_id: z.number().int().positive('El ID del log de consulta debe ser un número positivo'),
  rating: z.number().int().min(1, 'El rating debe ser al menos 1').max(5, 'El rating no puede ser mayor a 5'),
  comment: z.string().max(1000, 'El comentario no puede exceder 1000 caracteres').nullable().optional().transform((val) => val ? sanitizeString(val) : val),
});

/**
 * Schema para Create User Request (con role_id)
 */
export const createUserWithRoleIdRequestSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role_id: z.number().int().positive('El ID del rol debe ser un número positivo'),
  password: passwordSchema.optional(),
});

/**
 * Schema para Update User Request
 */
export const updateUserRequestSchema = z.object({
  email: emailSchema.optional(),
  name: nameSchema.optional(),
  role_id: z.number().int().positive('El ID del rol debe ser un número positivo').optional(),
  is_active: z.boolean().optional(),
});

/**
 * Schema para Admin Change Password Request
 */
export const adminChangePasswordRequestSchema = z.object({
  password: passwordSchema,
});

/**
 * Schema para User Development Request
 */
export const userDevelopmentRequestSchema = z.object({
  zone: zoneSchema,
  development: z.string().min(1, 'El desarrollo es requerido').max(100).transform(sanitizeString),
  can_upload: z.boolean().optional().default(false),
  can_query: z.boolean().optional().default(true),
});

/**
 * Schema para Update User Development Request
 */
export const updateUserDevelopmentRequestSchema = z.object({
  can_upload: z.boolean(),
  can_query: z.boolean(),
});

/**
 * Schema para Development Request
 */
export const developmentRequestSchema = z.object({
  zone: zoneSchema,
  development: z.string().min(1, 'El desarrollo es requerido').max(100).transform(sanitizeString),
  userId: userIdSchema.optional(),
});

/**
 * Schema para Commission Adjustment Input
 */
export const commissionAdjustmentInputSchema = z.object({
  distribution_id: z.number().int().positive('El ID de distribución debe ser un número positivo'),
  sale_id: z.number().int().positive('El ID de venta debe ser un número positivo'),
  adjustment_type: z.enum(['percent_change', 'amount_change', 'role_change'], {
    errorMap: () => ({ message: 'El tipo de ajuste debe ser: percent_change, amount_change o role_change' }),
  }),
  old_value: z.number().nullable().optional(),
  new_value: z.number(),
  old_role_type: z.string().nullable().optional(),
  new_role_type: z.string().nullable().optional(),
  amount_impact: z.number(),
  reason: z.string().max(500, 'La razón no puede exceder 500 caracteres').optional().transform((val) => val ? sanitizeString(val) : val),
  notes: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional().transform((val) => val ? sanitizeString(val) : val),
});

/**
 * Schema para Commission Config Input (simplificado - validación compleja se hace en función)
 */
export const commissionConfigInputSchema = z.object({
  desarrollo: z.string().min(1, 'El desarrollo es requerido').max(100).transform(sanitizeString),
  base_commission_percent: percentageSchema.optional(),
  roles: z.record(z.string(), percentageSchema).optional(),
  // Otros campos opcionales se validan en la función validateCommissionConfig
}).passthrough(); // Permite campos adicionales que se validan en la función

/**
 * Schema para Update Commission Distribution
 */
export const updateCommissionDistributionSchema = z.object({
  sale_id: z.number().int().positive('El ID de venta debe ser un número positivo'),
  commission_percent: percentageSchema.optional(),
  recalculate: z.boolean().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'paid']).optional(),
  notes: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional().transform((val) => val ? sanitizeString(val) : val),
});

/**
 * Schema para Update Commission Rule
 */
export const updateCommissionRuleSchema = z.object({
  id: z.number().int().positive('El ID de la regla debe ser un número positivo'),
  desarrollo: z.string().min(1, 'El desarrollo es requerido').max(100).transform(sanitizeString).optional(),
  rule_name: z.string().min(1, 'El nombre de la regla es requerido').max(100).transform(sanitizeString).optional(),
  periodo_type: z.enum(['trimestre', 'mensual', 'anual']).optional(),
  periodo_value: z.string().min(1, 'El valor del período es requerido').optional(),
  operador: z.enum(['=', '>=', '<=']).optional(),
  unidades_vendidas: z.number().int().min(1, 'Las unidades vendidas deben ser mayores a 0').optional(),
  porcentaje_comision: percentageSchema.optional(),
}).refine((data) => {
  // Validar formato de periodo_value según periodo_type solo si ambos están presentes
  // IMPORTANTE: Para trimestres, periodo_value es solo el año (ej: "2025")
  // La regla se aplica a todos los trimestres de ese año
  if (data.periodo_type && data.periodo_value) {
    if (data.periodo_type === 'trimestre') {
      // Aceptar solo el año (ej: "2025")
      return /^\d{4}$/.test(data.periodo_value);
    }
    if (data.periodo_type === 'mensual') {
      return /^\d{4}-\d{2}$/.test(data.periodo_value);
    }
    if (data.periodo_type === 'anual') {
      return /^\d{4}$/.test(data.periodo_value);
    }
  }
  return true;
}, {
  message: 'El formato del período no es válido',
  path: ['periodo_value'],
});

/**
 * Schema para Agent Config Bulk Update
 */
export const agentConfigBulkUpdateSchema = z.object({
  configs: z.array(z.object({
    key: z.string().min(1, 'La clave es requerida'),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
    ]),
    description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional().transform((val) => val ? sanitizeString(val) : val),
  }).refine((data) => {
    // Validación específica por key (misma lógica que agentConfigUpdateSchema)
    if (data.key === 'temperature') {
      return typeof data.value === 'number' && data.value >= 0 && data.value <= 2;
    }
    if (data.key === 'top_k') {
      return typeof data.value === 'number' && data.value >= 1 && data.value <= 20;
    }
    if (data.key === 'chunk_size') {
      return typeof data.value === 'number' && data.value >= 100 && data.value <= 2000;
    }
    if (data.key === 'chunk_overlap') {
      return typeof data.value === 'number' && data.value >= 0 && data.value <= 500;
    }
    if (data.key === 'max_tokens') {
      return typeof data.value === 'number' && data.value >= 100 && data.value <= 8192;
    }
    if (data.key === 'system_prompt') {
      return typeof data.value === 'string' && data.value.length >= 50;
    }
    if (data.key === 'restrictions') {
      return Array.isArray(data.value) && data.value.every(item => typeof item === 'string');
    }
    return true;
  }, {
    message: 'El valor no es válido para esta clave',
    path: ['value'],
  })).min(1, 'Debe haber al menos una configuración').max(50, 'No se pueden actualizar más de 50 configuraciones a la vez'),
  updated_by: userIdSchema,
});

/**
 * Schema para Agent Config Update (con updated_by y description)
 */
export const agentConfigUpdateWithMetaSchema = z.object({
  key: z.string().min(1, 'La clave es requerida'),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]),
  updated_by: userIdSchema,
  description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional().transform((val) => val ? sanitizeString(val) : val),
}).refine((data) => {
  // Validación específica por key (misma lógica que agentConfigUpdateSchema)
  if (data.key === 'temperature') {
    return typeof data.value === 'number' && data.value >= 0 && data.value <= 2;
  }
  if (data.key === 'top_k') {
    return typeof data.value === 'number' && data.value >= 1 && data.value <= 20;
  }
  if (data.key === 'chunk_size') {
    return typeof data.value === 'number' && data.value >= 100 && data.value <= 2000;
  }
  if (data.key === 'chunk_overlap') {
    return typeof data.value === 'number' && data.value >= 0 && data.value <= 500;
  }
  if (data.key === 'max_tokens') {
    return typeof data.value === 'number' && data.value >= 100 && data.value <= 8192;
  }
  if (data.key === 'system_prompt') {
    return typeof data.value === 'string' && data.value.length >= 50;
  }
  if (data.key === 'restrictions') {
    return Array.isArray(data.value) && data.value.every(item => typeof item === 'string');
  }
  return true;
}, {
  message: 'El valor no es válido para esta clave',
  path: ['value'],
});

/**
 * Schema para Chat History Delete (query params)
 */
export const chatHistoryDeleteSchema = z.object({
  userId: z.string().min(1, 'El userId es requerido').transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) throw new Error('userId debe ser un número válido');
    return num;
  }),
  zone: zoneSchema.optional(),
  development: z.string().max(100).optional().transform((val) => val ? sanitizeString(val) : val),
});

// =====================================================
// EXPORTS
// =====================================================

export type RagQueryRequest = z.infer<typeof ragQueryRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type CreateUserWithRoleIdRequest = z.infer<typeof createUserWithRoleIdRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type AdminChangePasswordRequest = z.infer<typeof adminChangePasswordRequestSchema>;
export type RagFeedbackRequest = z.infer<typeof ragFeedbackRequestSchema>;
export type UserDevelopmentRequest = z.infer<typeof userDevelopmentRequestSchema>;
export type UpdateUserDevelopmentRequest = z.infer<typeof updateUserDevelopmentRequestSchema>;
export type DevelopmentRequest = z.infer<typeof developmentRequestSchema>;
export type CommissionRuleInput = z.infer<typeof commissionRuleInputSchema>;
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleSchema>;
export type CommissionSaleInput = z.infer<typeof commissionSaleInputSchema>;
export type CommissionAdjustmentInput = z.infer<typeof commissionAdjustmentInputSchema>;
export type CommissionConfigInput = z.infer<typeof commissionConfigInputSchema>;
export type UpdateCommissionDistributionInput = z.infer<typeof updateCommissionDistributionSchema>;
export type AgentConfigUpdate = z.infer<typeof agentConfigUpdateSchema>;
export type AgentConfigUpdateWithMeta = z.infer<typeof agentConfigUpdateWithMetaSchema>;
export type AgentConfigBulkUpdate = z.infer<typeof agentConfigBulkUpdateSchema>;
export type ChatHistoryDeleteRequest = z.infer<typeof chatHistoryDeleteSchema>;

