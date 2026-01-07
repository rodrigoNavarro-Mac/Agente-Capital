/**
 * =====================================================
 * TIPOS: Módulo de Comisiones
 * =====================================================
 * Tipos TypeScript para el sistema de comisiones
 */

// =====================================================
// TIPOS BASE
// =====================================================

// =====================================================
// TIPOS BASE - FLUJOS FINANCIEROS SEPARADOS
// =====================================================

// Estados del flujo interno (egresos - pagos a equipo)
export type InternalSalePhaseStatus = 'visible' | 'pending' | 'paid';
export type InternalPostSalePhaseStatus = 'hidden' | 'upcoming' | 'payable' | 'paid';

// Estados del flujo de socios (ingresos - cobros a socios)
export type PartnerCommissionStatus = 'pending_invoice' | 'invoiced' | 'collected';

// Estados de facturas a socios
export type PartnerInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

// Estados de eventos de Zoho Projects
export type ZohoProjectsEventType = 'post_sale_trigger';
export type ZohoProjectsEventStatus = 'pending' | 'processed' | 'failed';

// Tipos legacy (mantener compatibilidad)
export type CommissionPhase = 'sale' | 'post_sale' | 'utility';

export type CommissionRoleType =
  | 'sale_manager'
  | 'deal_owner'
  | 'external_advisor'
  | 'operations_coordinator'
  | 'marketing'
  | 'legal_manager'
  | 'post_sale_coordinator'
  | 'customer_service'
  | 'deliveries'
  | 'bonds'
  | 'rule_bonus';

export type PaymentStatus = 'pending' | 'paid';

export type AdjustmentType = 'percent_change' | 'amount_change' | 'role_change';

// =====================================================
// CONFIGURACIÓN
// =====================================================

export interface CommissionConfig {
  id: number;
  desarrollo: string;
  
  // Porcentajes de fases (solo como guía, el cálculo es sobre monto total)
  phase_sale_percent: number;
  phase_post_sale_percent: number;
  
  // Fase Venta - Roles directos
  sale_manager_percent: number; // Gerente de ventas del desarrollo
  deal_owner_percent: number; // Asesor Interno (Propietario del Lead)
  external_advisor_percent: number | null; // Asesor Externo (Opcional)
  
  // Fase Venta - Pool (Opcional, solo si cumplen reglas)
  pool_enabled: boolean;
  sale_pool_total_percent: number;
  
  // Fase Postventa - Roles opcionales
  customer_service_enabled: boolean; // Atención a clientes (Opcional)
  customer_service_percent: number | null;
  deliveries_enabled: boolean;
  deliveries_percent: number | null;
  bonds_enabled: boolean;
  bonds_percent: number | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface CommissionGlobalConfig {
  id: number;
  config_key: 
    | 'operations_coordinator_percent' // Fase Venta
    | 'marketing_percent' // Fase Venta
    | 'legal_manager_percent' // Fase Postventa
    | 'post_sale_coordinator_percent'; // Fase Postventa
  config_value: number;
  description: string | null;
  updated_at: string;
  updated_by: number | null;
}

export interface CommissionBillingTarget {
  id: number;
  year: number;
  month: number;
  target_amount: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface CommissionBillingTargetInput {
  year: number;
  month: number;
  target_amount: number;
}

export interface CommissionSalesTarget {
  id: number;
  year: number;
  month: number;
  target_amount: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface CommissionSalesTargetInput {
  year: number;
  month: number;
  target_amount: number;
}

export interface CommissionConfigInput {
  desarrollo: string;
  phase_sale_percent: number;
  phase_post_sale_percent: number;
  sale_manager_percent: number;
  deal_owner_percent: number;
  external_advisor_percent?: number | null;
  pool_enabled?: boolean;
  sale_pool_total_percent?: number;
  // Fase Postventa - Roles opcionales
  customer_service_enabled?: boolean;
  customer_service_percent?: number | null;
  deliveries_enabled?: boolean;
  deliveries_percent?: number | null;
  bonds_enabled?: boolean;
  bonds_percent?: number | null;
}

// =====================================================
// VENTAS COMISIONABLES
// =====================================================

export interface CommissionSale {
  id: number;
  zoho_deal_id: string;
  deal_name: string | null;

  // Información de la venta
  cliente_nombre: string;
  desarrollo: string;
  propietario_deal: string;
  propietario_deal_id: string | null;
  plazo_deal: string | null;
  producto: string | null;
  metros_cuadrados: number;
  precio_por_m2: number;
  valor_total: number;
  fecha_firma: string; // ISO date string

  // Información adicional
  asesor_externo: string | null;
  asesor_externo_id: string | null;

  // Estado de la comisión (legacy - mantener compatibilidad)
  commission_calculated: boolean;
  commission_total: number;
  commission_sale_phase: number;
  commission_post_sale_phase: number;
  
  // Porcentajes de fase usados cuando se calculó (estáticos, no cambian aunque se actualice la configuración)
  calculated_phase_sale_percent: number | null;
  calculated_phase_post_sale_percent: number | null;

  // Estados independientes por flujo financiero
  internal_sale_phase_status: InternalSalePhaseStatus;
  internal_post_sale_phase_status: InternalPostSalePhaseStatus;
  partner_commission_status: PartnerCommissionStatus;

  // Control de postventa por Zoho Projects
  post_sale_triggered_at: string | null;
  post_sale_triggered_by: string | null;

  // Agregado: resumen de pagos (conteo de distribuciones pagadas vs totales)
  total_distributions?: number;
  paid_distributions?: number;

  // Metadata
  created_at: string;
  updated_at: string;
  synced_from_zoho_at: string;
}

export interface CommissionSaleInput {
  zoho_deal_id: string;
  deal_name?: string;
  cliente_nombre: string;
  desarrollo: string;
  propietario_deal: string;
  propietario_deal_id?: string;
  plazo_deal?: string;
  producto?: string;
  metros_cuadrados: number;
  precio_por_m2: number;
  valor_total: number;
  fecha_firma: string;
  asesor_externo?: string | null;
  asesor_externo_id?: string | null;

  // Nuevos campos opcionales para estados iniciales
  internal_sale_phase_status?: InternalSalePhaseStatus;
  internal_post_sale_phase_status?: InternalPostSalePhaseStatus;
  partner_commission_status?: PartnerCommissionStatus;
}

// =====================================================
// SOCIOS DEL PRODUCTO
// =====================================================

export interface ProductPartner {
  id: number;
  commission_sale_id: number;
  zoho_product_id: string | null;
  socio_name: string;
  participacion: number;
  synced_from_zoho_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProductPartnerInput {
  commission_sale_id: number;
  zoho_product_id?: string | null;
  socio_name: string;
  participacion: number;
}

// =====================================================
// DISTRIBUCIÓN DE COMISIONES
// =====================================================

export interface CommissionDistribution {
  id: number;
  sale_id: number;
  role_type: CommissionRoleType;
  person_name: string;
  person_id: string | null;
  phase: CommissionPhase;
  percent_assigned: number;
  amount_calculated: number;
  payment_status: PaymentStatus;
  invoice_pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionDistributionInput {
  sale_id: number;
  role_type: CommissionRoleType;
  person_name: string;
  person_id?: string | null;
  phase: CommissionPhase;
  percent_assigned: number;
  amount_calculated: number;
  payment_status?: PaymentStatus;
}

// =====================================================
// AJUSTES MANUALES
// =====================================================

export interface CommissionAdjustment {
  id: number;
  distribution_id: number;
  sale_id: number;
  adjustment_type: AdjustmentType;
  old_value: number | null;
  new_value: number;
  old_role_type: string | null;
  new_role_type: string | null;
  amount_impact: number;
  adjusted_by: number;
  adjusted_at: string;
  reason: string | null;
  notes: string | null;
}

export interface CommissionAdjustmentInput {
  distribution_id: number;
  sale_id: number;
  adjustment_type: AdjustmentType;
  old_value?: number | null;
  new_value: number;
  old_role_type?: string | null;
  new_role_type?: string | null;
  amount_impact: number;
  reason?: string | null;
  notes?: string | null;
}

// =====================================================
// VISTAS Y RESULTADOS
// =====================================================

export interface CommissionSaleWithDistributions extends CommissionSale {
  distributions: CommissionDistribution[];
  adjustments: CommissionAdjustment[];
  partner_commissions?: PartnerCommission[];
  partner_invoices?: PartnerInvoice[];
}

// Resultado de cálculo que incluye ambos flujos
export interface CommissionCalculationResult {
  sale_id: number;
  commission_total: number;
  commission_sale_phase: number; // Suma real de distribuciones de fase venta (pagado)
  commission_post_sale_phase: number; // Suma real de distribuciones de fase postventa (pagado)
  sale_phase_total: number; // Monto total asignado a fase venta (basado en porcentaje)
  post_sale_phase_total: number; // Monto total asignado a fase postventa (basado en porcentaje)
  distributions: CommissionDistribution[];
  partner_commissions?: PartnerCommission[]; // Comisiones calculadas para socios (flujo de ingresos)
}

export interface CommissionCalculationResult {
  sale_id: number;
  commission_total: number;
  commission_sale_phase: number; // Suma real de distribuciones de fase venta (pagado)
  commission_post_sale_phase: number; // Suma real de distribuciones de fase postventa (pagado)
  sale_phase_total: number; // Monto total asignado a fase venta (basado en porcentaje)
  post_sale_phase_total: number; // Monto total asignado a fase postventa (basado en porcentaje)
  distributions: CommissionDistribution[];
}

// =====================================================
// DASHBOARD
// =====================================================

export interface CommissionMonthlyStats {
  month: number; // 1-12
  month_name: string;
  commission_total: number;
  commission_paid: number;
  commission_pending: number;
  commission_by_owner: Record<string, number>; // owner_name -> amount
  total_by_advisor: Record<string, number>; // advisor_name -> total
}

export interface CommissionDevelopmentDashboard {
  desarrollo: string;
  year: number;
  monthly_stats: CommissionMonthlyStats[];
  total_annual: number;
  total_paid: number;
  total_pending: number;
  total_by_owner: Record<string, number>;
  total_by_advisor: Record<string, number>;
}

export interface CommissionGeneralDashboard {
  year: number;
  monthly_metrics: {
    month: number;
    month_name: string;
    ventas_totales: number;
    unidades_vendidas: number;
    facturacion_ventas: number;
    ticket_promedio_venta: number;
    monto_comision: number;
    meta_facturacion: number | null;
    porcentaje_cumplimiento: number | null;
    monto_ventas: number;
    meta_ventas: number | null;
    porcentaje_cumplimiento_ventas: number | null;
  }[];
  total_annual: {
    ventas_totales: number;
    unidades_vendidas: number;
    facturacion_ventas: number;
    ticket_promedio_venta: number;
  };
  commission_by_development: Record<string, Record<number, number>>; // desarrollo -> month -> amount
  commission_by_salesperson: Record<string, Record<number, number>>; // salesperson -> month -> amount
}

// =====================================================
// FILTROS Y QUERIES
// =====================================================

export interface CommissionSalesFilters {
  desarrollo?: string;
  propietario_deal?: string;
  fecha_firma_from?: string;
  fecha_firma_to?: string;
  commission_calculated?: boolean;
}

export interface CommissionDashboardFilters {
  desarrollo?: string;
  year: number;
}

// =====================================================
// REGLAS DE COMISIÓN
// =====================================================

export type CommissionRuleOperator = '=' | '>=' | '<=';

export type CommissionRulePeriodType = 'trimestre' | 'mensual' | 'anual';

export interface CommissionRule {
  id: number;
  desarrollo: string;
  rule_name: string;
  periodo_type: CommissionRulePeriodType;
  periodo_value: string; // Formato: "2025" (trimestre - año completo, se aplica a todos los trimestres), "2025-01" (mensual), "2025" (anual)
  operador: CommissionRuleOperator;
  unidades_vendidas: number;
  porcentaje_comision: number;
  porcentaje_iva: number;
  activo: boolean;
  prioridad: number;
  created_by: number;
  updated_by: number;
  created_at: string;
  updated_at: string;
}

export interface CommissionRuleInput {
  desarrollo: string;
  rule_name: string;
  periodo_type: CommissionRulePeriodType;
  periodo_value: string; // Formato: "2025" (trimestre - año completo, se aplica a todos los trimestres), "2025-01" (mensual), "2025" (anual)
  operador: CommissionRuleOperator;
  unidades_vendidas: number;
  porcentaje_comision: number;
  porcentaje_iva?: number;
  activo?: boolean;
  prioridad?: number;
}

// =====================================================
// FLUJO DE SOCIOS (INGRESOS) - NUEVAS TABLAS
// =====================================================

export interface PartnerCommission {
  id: number;
  commission_sale_id: number;
  socio_name: string;
  participacion: number; // porcentaje 0-100

  // Montos calculados
  total_commission_amount: number;
  sale_phase_amount: number;
  post_sale_phase_amount: number;

  // Estados de cobro por fase (independientes)
  sale_phase_collection_status: PartnerCommissionStatus;
  post_sale_phase_collection_status: PartnerCommissionStatus;
  
  // Estado de cobro legacy (deprecated, mantener por compatibilidad)
  collection_status: PartnerCommissionStatus;

  // Metadata
  created_at: string;
  updated_at: string;
  calculated_at: string;
  calculated_by: number | null;
}

export interface PartnerCommissionInput {
  commission_sale_id: number;
  socio_name: string;
  participacion: number;
}

export interface PartnerInvoice {
  id: number;
  partner_commission_id: number;

  // Información de la factura
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  invoice_amount: number;
  iva_amount: number;
  total_amount: number;

  // Archivo PDF
  invoice_pdf_path: string | null;
  invoice_pdf_uploaded_at: string | null;

  // Estado
  invoice_status: PartnerInvoiceStatus;

  // Metadata
  created_at: string;
  updated_at: string;
  created_by: number;
  sent_at: string | null;
  paid_at: string | null;
}

export interface PartnerInvoiceInput {
  partner_commission_id: number;
  invoice_number?: string;
  invoice_date: string;
  due_date?: string;
  invoice_amount: number;
  iva_amount?: number;
  invoice_pdf_path?: string;
}

// =====================================================
// EVENTOS DE ZOHO PROJECTS
// =====================================================

export interface ZohoProjectsEvent {
  id: number;
  event_type: ZohoProjectsEventType;
  zoho_project_id: string | null;
  zoho_task_id: string | null;
  commission_sale_id: number | null;

  // Datos del evento
  event_data: any; // JSONB
  triggered_at: string;

  // Procesamiento
  processed_at: string | null;
  processing_status: ZohoProjectsEventStatus;
  processing_error: string | null;

  created_at: string;
}

export interface ZohoProjectsEventInput {
  event_type: ZohoProjectsEventType;
  zoho_project_id?: string;
  zoho_task_id?: string;
  commission_sale_id?: number;
  event_data?: any;
}

