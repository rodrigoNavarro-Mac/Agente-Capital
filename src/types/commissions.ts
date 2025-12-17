/**
 * =====================================================
 * TIPOS: Módulo de Comisiones
 * =====================================================
 * Tipos TypeScript para el sistema de comisiones
 */

// =====================================================
// TIPOS BASE
// =====================================================

export type CommissionPhase = 'sale' | 'post_sale';

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
  | 'bonds';

export type AdjustmentType = 'percent_change' | 'amount_change' | 'role_change';

// =====================================================
// CONFIGURACIÓN
// =====================================================

export interface CommissionConfig {
  id: number;
  desarrollo: string;
  
  // Porcentajes de fases
  phase_sale_percent: number;
  phase_post_sale_percent: number;
  
  // Fase Venta - Pool de ventas
  sale_pool_total_percent: number;
  sale_manager_percent: number;
  deal_owner_percent: number;
  external_advisor_percent: number | null;
  
  // Fase Venta - Roles indirectos (globales)
  operations_coordinator_percent: number;
  marketing_percent: number;
  
  // Fase Postventa - Roles base
  legal_manager_percent: number;
  post_sale_coordinator_percent: number;
  
  // Fase Postventa - Roles opcionales
  customer_service_enabled: boolean;
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
  config_key: 'operations_coordinator_percent' | 'marketing_percent';
  config_value: number;
  description: string | null;
  updated_at: string;
  updated_by: number | null;
}

export interface CommissionConfigInput {
  desarrollo: string;
  phase_sale_percent: number;
  phase_post_sale_percent: number;
  sale_pool_total_percent: number;
  sale_manager_percent: number;
  deal_owner_percent: number;
  external_advisor_percent?: number | null;
  legal_manager_percent: number;
  post_sale_coordinator_percent: number;
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
  
  // Estado de la comisión
  commission_calculated: boolean;
  commission_total: number;
  commission_sale_phase: number;
  commission_post_sale_phase: number;
  
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
}

export interface CommissionCalculationResult {
  sale_id: number;
  commission_total: number;
  commission_sale_phase: number;
  commission_post_sale_phase: number;
  distributions: CommissionDistribution[];
}

// =====================================================
// DASHBOARD
// =====================================================

export interface CommissionMonthlyStats {
  month: number; // 1-12
  month_name: string;
  commission_total: number;
  commission_by_owner: Record<string, number>; // owner_name -> amount
  total_by_advisor: Record<string, number>; // advisor_name -> total
}

export interface CommissionDevelopmentDashboard {
  desarrollo: string;
  year: number;
  monthly_stats: CommissionMonthlyStats[];
  total_annual: number;
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
    mediana_ticket_venta: number;
    meta_facturacion: number | null;
    porcentaje_cumplimiento: number | null;
  }[];
  total_annual: {
    ventas_totales: number;
    unidades_vendidas: number;
    facturacion_ventas: number;
    mediana_ticket_venta: number;
  };
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

