/**
 * =====================================================
 * MÓDULO: Calculadora de Comisiones
 * =====================================================
 * Lógica de negocio para calcular y distribuir comisiones
 * según las reglas configuradas por desarrollo
 */

import type {
  CommissionConfig,
  CommissionConfigInput,
  CommissionSale,
  CommissionDistribution,
  CommissionCalculationResult,
  CommissionRoleType,
  CommissionPhase,
} from '@/types/commissions';

// =====================================================
// TIPOS INTERNOS
// =====================================================

interface RoleDistribution {
  role_type: CommissionRoleType;
  person_name: string;
  person_id: string | null;
  percent: number;
  amount: number;
}

interface PhaseCalculation {
  phase: CommissionPhase;
  total_amount: number;
  distributions: RoleDistribution[];
}

// =====================================================
// FUNCIONES DE CÁLCULO
// =====================================================

/**
 * Calcula el precio por m² a partir del valor total y metros cuadrados
 */
export function calculatePricePerM2(
  valorTotal: number,
  metrosCuadrados: number
): number {
  if (metrosCuadrados <= 0) {
    throw new Error('Los metros cuadrados deben ser mayores a 0');
  }
  return Number((valorTotal / metrosCuadrados).toFixed(2));
}

/**
 * Redistribuye proporcionalmente el porcentaje del asesor externo
 * entre Gerente de Ventas y Propietario del Deal
 * cuando no existe asesor externo
 */
function redistributeExternalAdvisorPercent(
  saleManagerPercent: number,
  dealOwnerPercent: number,
  externalAdvisorPercent: number
): { saleManagerPercent: number; dealOwnerPercent: number } {
  if (externalAdvisorPercent === 0 || externalAdvisorPercent === null) {
    return { saleManagerPercent, dealOwnerPercent };
  }

  // Calcular el total actual (sin el asesor externo)
  const totalWithoutAdvisor = saleManagerPercent + dealOwnerPercent;
  
  if (totalWithoutAdvisor === 0) {
    // Si ambos son 0, dividir el porcentaje del asesor equitativamente
    return {
      saleManagerPercent: externalAdvisorPercent / 2,
      dealOwnerPercent: externalAdvisorPercent / 2,
    };
  }

  // Redistribuir proporcionalmente según los porcentajes actuales
  const saleManagerRatio = saleManagerPercent / totalWithoutAdvisor;
  const dealOwnerRatio = dealOwnerPercent / totalWithoutAdvisor;

  return {
    saleManagerPercent: Number((saleManagerPercent + externalAdvisorPercent * saleManagerRatio).toFixed(2)),
    dealOwnerPercent: Number((dealOwnerPercent + externalAdvisorPercent * dealOwnerRatio).toFixed(2)),
  };
}

/**
 * Calcula la distribución de la fase de venta
 */
function calculateSalePhaseDistribution(
  config: CommissionConfig,
  sale: CommissionSale,
  salePhaseAmount: number
): RoleDistribution[] {
  const distributions: RoleDistribution[] = [];

  // Obtener porcentajes redistribuidos si no hay asesor externo
  const hasExternalAdvisor = sale.asesor_externo && sale.asesor_externo.trim() !== '';
  let saleManagerPercent = config.sale_manager_percent;
  let dealOwnerPercent = config.deal_owner_percent;
  let externalAdvisorPercent = config.external_advisor_percent || 0;

  if (!hasExternalAdvisor && externalAdvisorPercent > 0) {
    // Redistribuir el porcentaje del asesor externo
    const redistributed = redistributeExternalAdvisorPercent(
      saleManagerPercent,
      dealOwnerPercent,
      externalAdvisorPercent
    );
    saleManagerPercent = redistributed.saleManagerPercent;
    dealOwnerPercent = redistributed.dealOwnerPercent;
    externalAdvisorPercent = 0;
  }

  // Calcular montos basados en el pool total de ventas
  const poolPercent = config.sale_pool_total_percent;
  const poolAmount = (salePhaseAmount * poolPercent) / 100;

  // Gerente de Ventas (obligatorio)
  if (saleManagerPercent > 0) {
    const amount = (poolAmount * saleManagerPercent) / 100;
    distributions.push({
      role_type: 'sale_manager',
      person_name: 'Gerente de Ventas', // Se debe obtener del sistema
      person_id: null,
      percent: saleManagerPercent,
      amount: Number(amount.toFixed(2)),
    });
  }

  // Propietario del Deal (obligatorio)
  if (dealOwnerPercent > 0) {
    const amount = (poolAmount * dealOwnerPercent) / 100;
    distributions.push({
      role_type: 'deal_owner',
      person_name: sale.propietario_deal,
      person_id: sale.propietario_deal_id || null,
      percent: dealOwnerPercent,
      amount: Number(amount.toFixed(2)),
    });
  }

  // Asesor Externo (opcional)
  if (hasExternalAdvisor && externalAdvisorPercent > 0) {
    const amount = (poolAmount * externalAdvisorPercent) / 100;
    distributions.push({
      role_type: 'external_advisor',
      person_name: sale.asesor_externo!,
      person_id: sale.asesor_externo_id || null,
      percent: externalAdvisorPercent,
      amount: Number(amount.toFixed(2)),
    });
  }

  // Roles indirectos (globales) - se aplican sobre el total de la fase venta
  if (config.operations_coordinator_percent > 0) {
    const amount = (salePhaseAmount * config.operations_coordinator_percent) / 100;
    distributions.push({
      role_type: 'operations_coordinator',
      person_name: 'Coordinador de Operaciones de Ventas',
      person_id: null,
      percent: config.operations_coordinator_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  if (config.marketing_percent > 0) {
    const amount = (salePhaseAmount * config.marketing_percent) / 100;
    distributions.push({
      role_type: 'marketing',
      person_name: 'Departamento de Marketing',
      person_id: null,
      percent: config.marketing_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  return distributions;
}

/**
 * Calcula la distribución de la fase de postventa
 */
function calculatePostSalePhaseDistribution(
  config: CommissionConfig,
  postSalePhaseAmount: number
): RoleDistribution[] {
  const distributions: RoleDistribution[] = [];

  // Roles base (siempre activos)
  if (config.legal_manager_percent > 0) {
    const amount = (postSalePhaseAmount * config.legal_manager_percent) / 100;
    distributions.push({
      role_type: 'legal_manager',
      person_name: 'Gerente Legal',
      person_id: null,
      percent: config.legal_manager_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  if (config.post_sale_coordinator_percent > 0) {
    const amount = (postSalePhaseAmount * config.post_sale_coordinator_percent) / 100;
    distributions.push({
      role_type: 'post_sale_coordinator',
      person_name: 'Coordinador de Postventa',
      person_id: null,
      percent: config.post_sale_coordinator_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  // Roles opcionales (dependen del desarrollo)
  if (config.customer_service_enabled && config.customer_service_percent && config.customer_service_percent > 0) {
    const amount = (postSalePhaseAmount * config.customer_service_percent) / 100;
    distributions.push({
      role_type: 'customer_service',
      person_name: 'Atención a Clientes',
      person_id: null,
      percent: config.customer_service_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  if (config.deliveries_enabled && config.deliveries_percent && config.deliveries_percent > 0) {
    const amount = (postSalePhaseAmount * config.deliveries_percent) / 100;
    distributions.push({
      role_type: 'deliveries',
      person_name: 'Entregas',
      person_id: null,
      percent: config.deliveries_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  if (config.bonds_enabled && config.bonds_percent && config.bonds_percent > 0) {
    const amount = (postSalePhaseAmount * config.bonds_percent) / 100;
    distributions.push({
      role_type: 'bonds',
      person_name: 'Fianzas',
      person_id: null,
      percent: config.bonds_percent,
      amount: Number(amount.toFixed(2)),
    });
  }

  return distributions;
}

/**
 * Calcula la comisión total y distribuciones para una venta
 * Esta es la función principal que orquesta todo el cálculo
 */
export function calculateCommission(
  config: CommissionConfig,
  sale: CommissionSale,
  commissionPercent: number = 100 // Porcentaje de comisión sobre el valor total (por defecto 100%)
): CommissionCalculationResult {
  // Calcular comisión total (porcentaje sobre el valor total de la venta)
  const commissionTotal = Number(((sale.valor_total * commissionPercent) / 100).toFixed(2));

  // Calcular montos por fase
  const salePhaseAmount = Number(((commissionTotal * config.phase_sale_percent) / 100).toFixed(2));
  const postSalePhaseAmount = Number(((commissionTotal * config.phase_post_sale_percent) / 100).toFixed(2));

  // Calcular distribuciones por fase
  const saleDistributions = calculateSalePhaseDistribution(config, sale, salePhaseAmount);
  const postSaleDistributions = calculatePostSalePhaseDistribution(config, postSalePhaseAmount);

  // Convertir a formato CommissionDistribution
  const distributions: CommissionDistribution[] = [
    ...saleDistributions.map((dist) => ({
      id: 0, // Se asignará al guardar en BD
      sale_id: sale.id,
      role_type: dist.role_type,
      person_name: dist.person_name,
      person_id: dist.person_id,
      phase: 'sale' as CommissionPhase,
      percent_assigned: dist.percent,
      amount_calculated: dist.amount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    ...postSaleDistributions.map((dist) => ({
      id: 0, // Se asignará al guardar en BD
      sale_id: sale.id,
      role_type: dist.role_type,
      person_name: dist.person_name,
      person_id: dist.person_id,
      phase: 'post_sale' as CommissionPhase,
      percent_assigned: dist.percent,
      amount_calculated: dist.amount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  ];

  return {
    sale_id: sale.id,
    commission_total: commissionTotal,
    commission_sale_phase: salePhaseAmount,
    commission_post_sale_phase: postSalePhaseAmount,
    distributions,
  };
}

/**
 * Valida la configuración de comisiones
 */
export function validateCommissionConfig(config: CommissionConfigInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validar porcentajes de fase venta
  if (config.phase_sale_percent < 0 || config.phase_sale_percent > 100) {
    errors.push('El porcentaje de fase venta debe estar entre 0 y 100');
  }

  if (config.phase_post_sale_percent < 0 || config.phase_post_sale_percent > 100) {
    errors.push('El porcentaje de fase postventa debe estar entre 0 y 100');
  }

  // Validar pool de ventas
  if (config.sale_pool_total_percent < 0 || config.sale_pool_total_percent > 100) {
    errors.push('El porcentaje total del pool de ventas debe estar entre 0 y 100');
  }

  // Validar que Gerente de Ventas y Propietario del Deal tengan porcentajes
  if (config.sale_manager_percent <= 0) {
    errors.push('El porcentaje de Gerente de Ventas debe ser mayor a 0 (obligatorio)');
  }

  if (config.deal_owner_percent <= 0) {
    errors.push('El porcentaje de Propietario del Deal debe ser mayor a 0 (obligatorio)');
  }

  // Validar porcentajes de postventa base
  if (config.legal_manager_percent < 0 || config.legal_manager_percent > 100) {
    errors.push('El porcentaje de Gerente Legal debe estar entre 0 y 100');
  }

  if (config.post_sale_coordinator_percent < 0 || config.post_sale_coordinator_percent > 100) {
    errors.push('El porcentaje de Coordinador de Postventa debe estar entre 0 y 100');
  }

  // Validar roles opcionales si están habilitados
  if (config.customer_service_enabled) {
    if (!config.customer_service_percent || config.customer_service_percent <= 0) {
      errors.push('Si Atención a Clientes está habilitado, debe tener un porcentaje mayor a 0');
    }
  }

  if (config.deliveries_enabled) {
    if (!config.deliveries_percent || config.deliveries_percent <= 0) {
      errors.push('Si Entregas está habilitado, debe tener un porcentaje mayor a 0');
    }
  }

  if (config.bonds_enabled) {
    if (!config.bonds_percent || config.bonds_percent <= 0) {
      errors.push('Si Fianzas está habilitado, debe tener un porcentaje mayor a 0');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

