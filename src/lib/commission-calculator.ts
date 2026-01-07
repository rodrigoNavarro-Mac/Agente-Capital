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
  CommissionRule,
  CommissionGlobalConfig,
  PartnerCommission,
} from '@/types/commissions';

// =====================================================
// MAPEO DE ROLES A NOMBRES Y PERSONAS
// =====================================================

/**
 * Mapeo de roles a nombres normalizados para mostrar en la UI
 */
const ROLE_DISPLAY_NAMES: Record<CommissionRoleType, string> = {
  sale_manager: 'Gerente de Ventas',
  deal_owner: 'Asesor Interno',
  external_advisor: 'Asesor Externo',
  operations_coordinator: 'Coordinador de Operaciones de Venta',
  marketing: 'Gerente de Marketing',
  legal_manager: 'Gerente Legal',
  post_sale_coordinator: 'Coordinador Postventas',
  customer_service: 'Atención a Clientes',
  deliveries: 'Entregas',
  bonds: 'Fianzas',
  rule_bonus: 'Utilidad por Regla',
};

/**
 * Mapeo de roles a nombres de personas específicas
 */
const ROLE_PERSON_NAMES: Record<CommissionRoleType, string | null> = {
  sale_manager: null, // Se obtiene del desarrollo
  deal_owner: null, // Se obtiene de la venta (propietario del deal)
  external_advisor: null, // Se obtiene de la venta
  operations_coordinator: 'Rodrigo Navarro Marquez de la Mora',
  marketing: 'Alejandro Carmona',
  legal_manager: 'Jose Luis Santos',
  post_sale_coordinator: 'Montserrat Lopez',
  customer_service: null, // Se configura por desarrollo
  deliveries: null, // Se configura por desarrollo
  bonds: null, // Se configura por desarrollo
  rule_bonus: null, // Se obtiene del nombre de la regla
};

/**
 * Obtiene el nombre del gerente de ventas para un desarrollo
 * Por ahora retorna un nombre genérico, pero se puede extender para obtener de una tabla de configuración
 */
function getSaleManagerName(_desarrollo: string): string {
  // TODO: Obtener de una tabla de configuración desarrollo -> gerente de ventas
  // Por ahora retornamos un nombre genérico
  return 'Gerente de Ventas del Desarrollo';
}

/**
 * Obtiene el nombre normalizado para mostrar de un rol
 */
export function getRoleDisplayName(roleType: CommissionRoleType): string {
  return ROLE_DISPLAY_NAMES[roleType] || roleType;
}

/**
 * Normaliza el nombre de una persona basándose en el role_type
 * Si el nombre guardado es genérico, lo reemplaza con el nombre específico
 */
export function normalizePersonName(roleType: CommissionRoleType, currentName: string, sale?: CommissionSale, desarrollo?: string): string {
  // Si hay un nombre específico en el mapeo, usarlo siempre
  if (ROLE_PERSON_NAMES[roleType]) {
    return ROLE_PERSON_NAMES[roleType]!;
  }
  
  // Casos especiales
  if (roleType === 'sale_manager' && desarrollo) {
    return getSaleManagerName(desarrollo);
  }
  
  if (roleType === 'deal_owner' && sale) {
    return sale.propietario_deal;
  }
  
  if (roleType === 'external_advisor' && sale?.asesor_externo) {
    return sale.asesor_externo;
  }
  
  // Si el nombre actual es genérico, reemplazarlo con el nombre específico
  const genericNames: Record<string, string[]> = {
    marketing: ['Gerente de Marketing', 'Departamento de Marketing', 'Marketing'],
    operations_coordinator: ['Coordinador de Operaciones de Venta', 'Coordinador de Operaciones de Ventas', 'Operaciones'],
    legal_manager: ['Gerente Legal', 'Legal'],
    post_sale_coordinator: ['Coordinador Postventas', 'Coordinador de Postventa', 'Postventa'],
  };
  
  const genericNamesForRole = genericNames[roleType];
  if (genericNamesForRole && genericNamesForRole.some(name => currentName.includes(name) || name.includes(currentName))) {
    // Si el nombre actual es genérico, usar el nombre específico del mapeo
    if (ROLE_PERSON_NAMES[roleType]) {
      return ROLE_PERSON_NAMES[roleType]!;
    }
  }
  
  // Si no hay nombre específico y el actual no es genérico, mantener el actual
  return currentName;
}

/**
 * Obtiene el nombre de la persona para un rol
 */
function getRolePersonName(roleType: CommissionRoleType, sale?: CommissionSale, desarrollo?: string): string {
  // Si hay un nombre específico en el mapeo, usarlo
  if (ROLE_PERSON_NAMES[roleType]) {
    return ROLE_PERSON_NAMES[roleType]!;
  }
  
  // Casos especiales
  if (roleType === 'sale_manager' && desarrollo) {
    return getSaleManagerName(desarrollo);
  }
  
  if (roleType === 'deal_owner' && sale) {
    return sale.propietario_deal;
  }
  
  if (roleType === 'external_advisor' && sale?.asesor_externo) {
    return sale.asesor_externo;
  }
  
  // Por defecto, usar el nombre del rol
  return ROLE_DISPLAY_NAMES[roleType] || roleType;
}

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

// PhaseCalculation interface removed - not used

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
  // Asegurar que todos los valores sean números
  const saleManager = Number(saleManagerPercent) || 0;
  const dealOwner = Number(dealOwnerPercent) || 0;
  const externalAdvisor = Number(externalAdvisorPercent) || 0;
  
  if (externalAdvisor === 0 || externalAdvisor === null) {
    return { saleManagerPercent: saleManager, dealOwnerPercent: dealOwner };
  }

  // Calcular el total actual (sin el asesor externo)
  const totalWithoutAdvisor = saleManager + dealOwner;
  
  if (totalWithoutAdvisor === 0) {
    // Si ambos son 0, dividir el porcentaje del asesor equitativamente
    return {
      saleManagerPercent: Number((externalAdvisor / 2).toFixed(3)),
      dealOwnerPercent: Number((externalAdvisor / 2).toFixed(3)),
    };
  }

  // Redistribuir proporcionalmente según los porcentajes actuales
  const saleManagerRatio = saleManager / totalWithoutAdvisor;
  const dealOwnerRatio = dealOwner / totalWithoutAdvisor;

  return {
    saleManagerPercent: Number((saleManager + externalAdvisor * saleManagerRatio).toFixed(3)),
    dealOwnerPercent: Number((dealOwner + externalAdvisor * dealOwnerRatio).toFixed(3)),
  };
}

/**
 * Calcula la distribución de la fase de venta
 */
function calculateSalePhaseDistribution(
  config: CommissionConfig,
  sale: CommissionSale,
  salePhaseAmount: number,
  globalConfigs: CommissionGlobalConfig[]
): RoleDistribution[] {
  const distributions: RoleDistribution[] = [];

  // Verificar si el propietario del deal es "Asesor Externo" literal
  const isDealOwnerExternalAdvisor = sale.propietario_deal && 
    sale.propietario_deal.trim().toLowerCase() === 'asesor externo';

  // Obtener porcentajes redistribuidos si no hay asesor externo
  // Asegurar que todos los valores sean números (pueden venir como strings desde la BD)
  const hasExternalAdvisor = sale.asesor_externo && sale.asesor_externo.trim() !== '';
  let saleManagerPercent = Number(config.sale_manager_percent) || 0;
  let dealOwnerPercent = Number(config.deal_owner_percent) || 0;
  let externalAdvisorPercent = Number(config.external_advisor_percent) || 0;

  // Si el propietario del deal es "Asesor Externo" literal, usar el porcentaje de asesor externo
  if (isDealOwnerExternalAdvisor && externalAdvisorPercent > 0) {
    // El propietario del deal es asesor externo, usar su porcentaje configurado
    dealOwnerPercent = 0; // No usar el porcentaje de deal_owner
    // externalAdvisorPercent ya está configurado, se usará más abajo
  } else if (!hasExternalAdvisor && externalAdvisorPercent > 0) {
    // Redistribuir el porcentaje del asesor externo solo si no hay asesor externo
    // y el propietario del deal NO es "Asesor Externo"
    const redistributed = redistributeExternalAdvisorPercent(
      saleManagerPercent,
      dealOwnerPercent,
      externalAdvisorPercent
    );
    saleManagerPercent = redistributed.saleManagerPercent;
    dealOwnerPercent = redistributed.dealOwnerPercent;
    externalAdvisorPercent = 0;
  }

  // Calcular montos basados en el pool total de ventas (solo si pool está habilitado)
  // El pool se calcula sobre el valor total, no sobre el valor de la fase
  // Asegurar que valor_total sea un número
  const valorTotal = Number(sale.valor_total) || 0;
  const poolPercent = config.pool_enabled && config.sale_pool_total_percent ? Number(config.sale_pool_total_percent) || 0 : 0;
  const poolAmount = poolPercent > 0 ? Number(((valorTotal * poolPercent) / 100).toFixed(3)) : valorTotal;

  // Gerente de Ventas (obligatorio)
  // El porcentaje se calcula sobre el monto total, no sobre el valor de la fase
  if (saleManagerPercent > 0) {
    const amount = (poolAmount * saleManagerPercent) / 100;
    distributions.push({
      role_type: 'sale_manager',
      person_name: getRolePersonName('sale_manager', sale, sale.desarrollo),
      person_id: null,
      percent: saleManagerPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  // Propietario del Deal / Asesor Interno (obligatorio)
  // Si el propietario es "Asesor Externo" literal, NO crear distribución aquí
  // El porcentaje se calcula sobre el monto total, no sobre el valor de la fase
  if (!isDealOwnerExternalAdvisor && dealOwnerPercent > 0) {
    const amount = (poolAmount * dealOwnerPercent) / 100;
    distributions.push({
      role_type: 'deal_owner',
      person_name: getRolePersonName('deal_owner', sale),
      person_id: sale.propietario_deal_id || null,
      percent: dealOwnerPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  // Asesor Externo (opcional)
  // Si el propietario del deal es "Asesor Externo" literal, usar el porcentaje configurado
  // El porcentaje se calcula sobre el monto total, no sobre el valor de la fase
  if ((hasExternalAdvisor || isDealOwnerExternalAdvisor) && externalAdvisorPercent > 0) {
    const amount = (poolAmount * externalAdvisorPercent) / 100;
    distributions.push({
      role_type: 'external_advisor',
      person_name: isDealOwnerExternalAdvisor 
        ? getRolePersonName('deal_owner', sale) 
        : getRolePersonName('external_advisor', sale),
      person_id: isDealOwnerExternalAdvisor 
        ? (sale.propietario_deal_id || null)
        : (sale.asesor_externo_id || null),
      percent: externalAdvisorPercent,
      amount: Number(amount.toFixed(3)),
    });
  }


  // Roles indirectos (globales) - se aplican sobre el monto total, no sobre el valor de la fase
  const operationsPercent = Number(globalConfigs.find(c => c.config_key === 'operations_coordinator_percent')?.config_value || 0);
  if (operationsPercent > 0) {
    const amount = (valorTotal * operationsPercent) / 100;
    distributions.push({
      role_type: 'operations_coordinator',
      person_name: getRolePersonName('operations_coordinator'),
      person_id: null,
      percent: operationsPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  const marketingPercent = Number(globalConfigs.find(c => c.config_key === 'marketing_percent')?.config_value || 0);
  if (marketingPercent > 0) {
    const amount = (valorTotal * marketingPercent) / 100;
    distributions.push({
      role_type: 'marketing',
      person_name: getRolePersonName('marketing'),
      person_id: null,
      percent: marketingPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  return distributions;
}

/**
 * Calcula la distribución de la fase de postventa
 */
function calculatePostSalePhaseDistribution(
  config: CommissionConfig,
  valorTotal: number,
  globalConfigs: CommissionGlobalConfig[]
): RoleDistribution[] {
  const distributions: RoleDistribution[] = [];
  
  // Asegurar que valorTotal sea un número
  const valorTotalNum = Number(valorTotal) || 0;

  // Roles base (globales) - se aplican sobre el monto total, no sobre el valor de la fase
  const legalPercent = Number(globalConfigs.find(c => c.config_key === 'legal_manager_percent')?.config_value || 0);
  if (legalPercent > 0) {
    const amount = (valorTotalNum * legalPercent) / 100;
    distributions.push({
      role_type: 'legal_manager',
      person_name: getRolePersonName('legal_manager'),
      person_id: null,
      percent: legalPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  const postSaleCoordinatorPercent = Number(globalConfigs.find(c => c.config_key === 'post_sale_coordinator_percent')?.config_value || 0);
  if (postSaleCoordinatorPercent > 0) {
    const amount = (valorTotalNum * postSaleCoordinatorPercent) / 100;
    distributions.push({
      role_type: 'post_sale_coordinator',
      person_name: getRolePersonName('post_sale_coordinator'),
      person_id: null,
      percent: postSaleCoordinatorPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  // Roles opcionales (dependen del desarrollo) - Fase Postventa
  // El porcentaje se calcula sobre el monto total, no sobre el valor de la fase
  const customerServicePercent = Number(config.customer_service_percent) || 0;
  if (config.customer_service_enabled && customerServicePercent > 0) {
    const amount = (valorTotalNum * customerServicePercent) / 100;
    distributions.push({
      role_type: 'customer_service',
      person_name: getRolePersonName('customer_service'),
      person_id: null,
      percent: customerServicePercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  const deliveriesPercent = Number(config.deliveries_percent) || 0;
  if (config.deliveries_enabled && deliveriesPercent > 0) {
    const amount = (valorTotalNum * deliveriesPercent) / 100;
    distributions.push({
      role_type: 'deliveries',
      person_name: getRolePersonName('deliveries'),
      person_id: null,
      percent: deliveriesPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  const bondsPercent = Number(config.bonds_percent) || 0;
  if (config.bonds_enabled && bondsPercent > 0) {
    const amount = (valorTotalNum * bondsPercent) / 100;
    distributions.push({
      role_type: 'bonds',
      person_name: getRolePersonName('bonds'),
      person_id: null,
      percent: bondsPercent,
      amount: Number(amount.toFixed(3)),
    });
  }

  return distributions;
}

/**
 * Calcula la comisión total y distribuciones para una venta
 * Esta es la función principal que orquesta todo el cálculo
 * El cálculo se realiza sobre el monto total (valor_total)
 * NOTA: Las reglas agregan utilidad que NO se distribuye en fases
 * @param ruleUnitsCountMap - Mapa opcional de rule_id -> unidades_vendidas_en_periodo
 *                            Si no se proporciona, se usa 1 por defecto (comportamiento legacy)
 */
export function calculateCommission(
  config: CommissionConfig,
  sale: CommissionSale,
  globalConfigs: CommissionGlobalConfig[],
  applicableRules: CommissionRule[] = [],
  allRules: CommissionRule[] = [], // Todas las reglas del desarrollo para mostrar cuáles no se cumplieron
  commissionPercent: number = 100, // Porcentaje de comisión sobre el valor total (por defecto 100%)
  ruleUnitsCountMap?: Map<number, number> // Mapa de rule_id -> unidades_vendidas_en_periodo
): CommissionCalculationResult {
  // Asegurar que todos los valores numéricos sean números (pueden venir como strings desde la BD)
  const valorTotal = Number(sale.valor_total) || 0;
  const commissionPercentNum = Number(commissionPercent) || 100;
  
  // Calcular comisión base sobre el monto total (SIN incluir reglas)
  const commissionBase = Number(((valorTotal * commissionPercentNum) / 100).toFixed(3));

  // Calcular utilidad por reglas aplicables (NO se distribuye en fases, solo se referencia)
  let ruleUtilityAmount = 0;
  const ruleDetails: { 
    rule_name: string; 
    percent: number; 
    amount: number; 
    fulfilled: boolean;
    unidades_requeridas: number;
    unidades_vendidas: number;
    operador: string;
  }[] = [];
  
  // Función helper para obtener el conteo de unidades vendidas en el período
  // Si hay un mapa proporcionado, usar el conteo real; si no, usar 1 (comportamiento legacy)
  const getUnidadesVendidas = (ruleId: number): number => {
    if (ruleUnitsCountMap && ruleUnitsCountMap.has(ruleId)) {
      return ruleUnitsCountMap.get(ruleId) || 0;
    }
    return 1; // Comportamiento legacy: 1 unidad por venta
  };
  
  // Agregar reglas cumplidas
  if (applicableRules.length > 0) {
    applicableRules.forEach((rule) => {
      const porcentajeComision = Number(rule.porcentaje_comision) || 0;
      const ruleAmount = Number(((valorTotal * porcentajeComision) / 100).toFixed(3));
      ruleUtilityAmount = Number((ruleUtilityAmount + ruleAmount).toFixed(3));
      const unidadesVendidasEnPeriodo = getUnidadesVendidas(rule.id);
      ruleDetails.push({
        rule_name: rule.rule_name,
        percent: porcentajeComision,
        amount: ruleAmount,
        fulfilled: true,
        unidades_requeridas: Number(rule.unidades_vendidas) || 0,
        unidades_vendidas: unidadesVendidasEnPeriodo,
        operador: rule.operador,
      });
    });
  }
  
  // Agregar reglas no cumplidas (solo para referencia visual)
  if (allRules.length > 0) {
    const applicableRuleIds = new Set(applicableRules.map(r => r.id));
    allRules.forEach((rule) => {
      if (!applicableRuleIds.has(rule.id) && rule.activo) {
        const unidadesVendidasEnPeriodo = getUnidadesVendidas(rule.id);
        ruleDetails.push({
          rule_name: rule.rule_name,
          percent: Number(rule.porcentaje_comision) || 0,
          amount: 0,
          fulfilled: false,
          unidades_requeridas: Number(rule.unidades_vendidas) || 0,
          unidades_vendidas: unidadesVendidasEnPeriodo,
          operador: rule.operador,
        });
      }
    });
  }

  // Calcular montos por fase (solo sobre la comisión base, NO incluye utilidad de reglas)
  // Los porcentajes de fase solo sirven como guía
  const phaseSalePercent = Number(config.phase_sale_percent) || 0;
  const phasePostSalePercent = Number(config.phase_post_sale_percent) || 0;
  const salePhaseAmount = Number(((commissionBase * phaseSalePercent) / 100).toFixed(3));
  const postSalePhaseAmount = Number(((commissionBase * phasePostSalePercent) / 100).toFixed(3));

  // Calcular distribuciones por fase
  // Los porcentajes se calculan sobre el monto total (valor_total), no sobre el valor de la fase
  const saleDistributions = calculateSalePhaseDistribution(config, sale, salePhaseAmount, globalConfigs);
  const postSaleDistributions = calculatePostSalePhaseDistribution(config, valorTotal, globalConfigs);

  // Calcular suma real de distribuciones por fase
  const salePhaseDistributed = saleDistributions.reduce((sum, dist) => sum + dist.amount, 0);
  const postSalePhaseDistributed = postSaleDistributions.reduce((sum, dist) => sum + dist.amount, 0);
  
  // La comisión total es la suma de las fases distribuidas (NO incluye utilidad)
  const commissionTotal = Number((salePhaseDistributed + postSalePhaseDistributed).toFixed(3));
  
  // Calcular totales de fase (montos asignados según porcentajes de configuración)
  const totalCommissionsByPhase = salePhaseAmount + postSalePhaseAmount;
  
  // Calcular utilidad restante (Monto total comisiones por fase - Total de comisiones pagadas)
  const remainingUtility = Number((totalCommissionsByPhase - commissionTotal).toFixed(3));
  
  // Agregar utilidad de reglas como distribución separada (referencia)
  const utilityDistributions: RoleDistribution[] = [];
  // Crear una distribución por cada regla (cumplida o no cumplida)
  ruleDetails.forEach((ruleDetail) => {
    // Codificar información de unidades en person_name: "Nombre|unidades_vendidas|unidades_requeridas|operador|fulfilled"
    const personNameWithInfo = `${ruleDetail.rule_name}|${ruleDetail.unidades_vendidas}|${ruleDetail.unidades_requeridas}|${ruleDetail.operador}|${ruleDetail.fulfilled ? '1' : '0'}`;
    
    if (ruleDetail.fulfilled) {
      // Regla cumplida: mostrar utilidad
      utilityDistributions.push({
        role_type: 'rule_bonus',
        person_name: personNameWithInfo,
        person_id: null,
        percent: ruleDetail.percent,
        amount: ruleDetail.amount,
      });
    } else {
      // Regla no cumplida: solo referencia
      utilityDistributions.push({
        role_type: 'rule_bonus',
        person_name: personNameWithInfo,
        person_id: null,
        percent: 0,
        amount: 0,
      });
    }
  });
  
  // Si hay utilidad restante (diferencia entre total de fases y lo distribuido), agregarla
  if (remainingUtility > 0.01) { // Tolerancia de 0.01 para errores de redondeo
    // Asegurar que valorTotal no sea 0 para evitar división por cero
    const percentValue = valorTotal > 0 
      ? Number(((remainingUtility / valorTotal) * 100).toFixed(3))
      : 0;
    utilityDistributions.push({
      role_type: 'rule_bonus',
      person_name: 'Utilidad Restante',
      person_id: null,
      percent: percentValue,
      amount: remainingUtility,
    });
  }

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
      payment_status: 'pending' as const,
      invoice_pdf_path: null,
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
      payment_status: 'pending' as const,
      invoice_pdf_path: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    // Agregar utilidad de reglas como referencia (no se distribuye en fases)
    ...utilityDistributions.map((dist) => ({
      id: 0, // Se asignará al guardar en BD
      sale_id: sale.id,
      role_type: dist.role_type,
      person_name: dist.person_name,
      person_id: dist.person_id,
      phase: 'utility' as CommissionPhase,
      percent_assigned: dist.percent,
      amount_calculated: dist.amount,
      payment_status: 'pending' as const,
      invoice_pdf_path: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  ];

  // Calcular comisiones para socios (flujo de ingresos independiente)
  const partnerData = getPartnerDataForSale(sale.id);
  const partner_commissions = partnerData.length > 0
    ? calculatePartnerCommissionsForSale(sale, partnerData, {
        phase_sale_percent: config.phase_sale_percent,
        phase_post_sale_percent: config.phase_post_sale_percent,
      })
    : undefined;

  return {
    sale_id: sale.id,
    commission_total: commissionTotal, // Solo suma de fases distribuidas (NO incluye utilidad)
    commission_sale_phase: salePhaseDistributed, // Suma real de distribuciones de fase venta (pagado)
    commission_post_sale_phase: postSalePhaseDistributed, // Suma real de distribuciones de fase postventa (pagado)
    sale_phase_total: salePhaseAmount, // Monto total asignado a fase venta (basado en porcentaje)
    post_sale_phase_total: postSalePhaseAmount, // Monto total asignado a fase postventa (basado en porcentaje)
    distributions,
    partner_commissions, // Comisiones calculadas para socios (flujo de ingresos)
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

  // Validar pool de ventas (si está habilitado)
  if (config.pool_enabled && config.sale_pool_total_percent !== undefined) {
    if (config.sale_pool_total_percent < 0 || config.sale_pool_total_percent > 100) {
      errors.push('El porcentaje total del pool de ventas debe estar entre 0 y 100');
    }
  }

  // Los porcentajes de postventa base (legal_manager_percent, post_sale_coordinator_percent)
  // ahora se configuran globalmente, no se validan aquí

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

// =====================================================
// FUNCIONES PARA FLUJO DE SOCIOS (INGRESOS)
// =====================================================

/**
 * Calcula las comisiones para socios basado en la participación
 * Esta función es llamada desde calculateCommission para integrar ambos flujos
 */
export function calculatePartnerCommissionsForSale(
  sale: CommissionSale,
  partnerData: Array<{
    socio_name: string;
    participacion: number;
  }>,
  config?: {
    phase_sale_percent: number;
    phase_post_sale_percent: number;
  }
): PartnerCommission[] {
  // Si no hay configuración, usar el método legacy (montos ya calculados)
  if (!config) {
    const salePhaseAmount = Number(sale.commission_sale_phase || 0);
    const postSalePhaseAmount = Number(sale.commission_post_sale_phase || 0);
    const totalCommissionForPartners = salePhaseAmount + postSalePhaseAmount;

    // Si no hay comisión calculada, retornar array vacío
    if (totalCommissionForPartners <= 0) {
      return [];
    }

    return partnerData.map((partner, index) => {
      const participacion = Number(partner.participacion || 0);

      if (participacion <= 0) {
        return {
          id: -(index + 1),
          commission_sale_id: sale.id,
          socio_name: partner.socio_name || 'Socio sin nombre',
          participacion: 0,
          total_commission_amount: 0,
          sale_phase_amount: salePhaseAmount,
          post_sale_phase_amount: postSalePhaseAmount,
          collection_status: 'pending_invoice' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          calculated_at: new Date().toISOString(),
          calculated_by: null
        };
      }

      const partnerAmount = totalCommissionForPartners * (participacion / 100);

      return {
        id: -(index + 1),
        commission_sale_id: sale.id,
        socio_name: partner.socio_name || 'Socio sin nombre',
        participacion: participacion,
        total_commission_amount: Number(partnerAmount.toFixed(2)),
        sale_phase_amount: salePhaseAmount,
        post_sale_phase_amount: postSalePhaseAmount,
        collection_status: 'pending_invoice' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        calculated_at: new Date().toISOString(),
        calculated_by: null
      };
    });
  }

  // Calcular usando configuración por fases
  const valorTotal = Number(sale.valor_total) || 0;
  const phaseSalePercent = Number(config.phase_sale_percent) || 0;
  const phasePostSalePercent = Number(config.phase_post_sale_percent) || 0;

  // Calcular montos por fase basados en configuración
  const salePhaseAmount = Number(((valorTotal * phaseSalePercent) / 100).toFixed(2));
  const postSalePhaseAmount = Number(((valorTotal * phasePostSalePercent) / 100).toFixed(2));
  const totalCommissionForPartners = salePhaseAmount + postSalePhaseAmount;

  // Si no hay comisión calculada, retornar array vacío
  if (totalCommissionForPartners <= 0) {
    return [];
  }

  return partnerData.map((partner, index) => {
    // Asegurar que la participación sea un número válido
    const participacion = Number(partner.participacion || 0);

    // Si la participación es 0 o inválida, retornar 0
    if (participacion <= 0) {
      return {
        id: -(index + 1),
        commission_sale_id: sale.id,
        socio_name: partner.socio_name || 'Socio sin nombre',
        participacion: 0,
        total_commission_amount: 0,
        sale_phase_amount: 0,
        post_sale_phase_amount: 0,
        collection_status: 'pending_invoice' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        calculated_at: new Date().toISOString(),
        calculated_by: null
      };
    }

    // Calcular la participación del socio sobre el valor total de la venta
    const partnerTotalValue = valorTotal * (participacion / 100);

    // Distribuir según porcentajes de fase de la configuración
    const partnerSalePhaseAmount = Number(((partnerTotalValue * phaseSalePercent) / 100).toFixed(2));
    const partnerPostSalePhaseAmount = Number(((partnerTotalValue * phasePostSalePercent) / 100).toFixed(2));
    const partnerTotalAmount = partnerSalePhaseAmount + partnerPostSalePhaseAmount;

    return {
      id: -(index + 1), // IDs negativos para indicar que son cálculos temporales
      commission_sale_id: sale.id,
      socio_name: partner.socio_name || 'Socio sin nombre',
      participacion: participacion,
      total_commission_amount: partnerTotalAmount,
      sale_phase_amount: partnerSalePhaseAmount,
      post_sale_phase_amount: partnerPostSalePhaseAmount,
      collection_status: 'pending_invoice' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      calculated_at: new Date().toISOString(),
      calculated_by: null
    };
  });
}

/**
 * Función helper para obtener datos de socios de una venta
 * En una implementación real, esto vendría de la base de datos
 */
export function getPartnerDataForSale(_saleId: number): Array<{
  socio_name: string;
  participacion: number;
}> {
  // TODO: Implementar consulta real a commission_product_partners
  // Por ahora retorna array vacío - se implementará cuando se integre con la BD
  return [];
}

