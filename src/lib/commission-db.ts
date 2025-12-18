/**
 * =====================================================
 * MÓDULO: Base de Datos de Comisiones
 * =====================================================
 * Funciones para interactuar con las tablas de comisiones
 */

import { query } from './postgres';
import type {
  CommissionConfig,
  CommissionConfigInput,
  CommissionGlobalConfig,
  CommissionSale,
  CommissionSaleInput,
  CommissionDistribution,
  CommissionDistributionInput,
  CommissionAdjustment,
  CommissionAdjustmentInput,
  CommissionSalesFilters,
  CommissionRule,
  CommissionRuleInput,
  CommissionBillingTarget,
  CommissionBillingTargetInput,
} from '@/types/commissions';

// =====================================================
// CONFIGURACIÓN
// =====================================================

/**
 * Obtiene la configuración de comisiones para un desarrollo
 * Normaliza el nombre del desarrollo para hacer la búsqueda case-insensitive
 */
export async function getCommissionConfig(
  desarrollo: string
): Promise<CommissionConfig | null> {
  try {
    // Normalizar desarrollo: trim y lowercase para comparación
    const normalizedDesarrollo = desarrollo.trim().toLowerCase();
    
    const result = await query<CommissionConfig>(
      `SELECT * FROM commission_configs WHERE LOWER(TRIM(desarrollo)) = $1`,
      [normalizedDesarrollo]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo configuración de comisiones:', error);
    throw error;
  }
}

/**
 * Obtiene todas las configuraciones de comisiones
 */
export async function getAllCommissionConfigs(): Promise<CommissionConfig[]> {
  try {
    const result = await query<CommissionConfig>(
      `SELECT * FROM commission_configs ORDER BY desarrollo`
    );
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo configuraciones de comisiones:', error);
    throw error;
  }
}

/**
 * Crea o actualiza la configuración de comisiones para un desarrollo
 */
export async function upsertCommissionConfig(
  config: CommissionConfigInput,
  userId: number
): Promise<CommissionConfig> {
  try {
    // Normalizar el nombre del desarrollo (trim + lowercase para consistencia)
    const normalizedDesarrollo = config.desarrollo.trim().toLowerCase();
    
    const result = await query<CommissionConfig>(
      `INSERT INTO commission_configs (
        desarrollo, phase_sale_percent, phase_post_sale_percent,
        sale_manager_percent, deal_owner_percent, external_advisor_percent,
        pool_enabled, sale_pool_total_percent,
        customer_service_enabled, customer_service_percent,
        deliveries_enabled, deliveries_percent,
        bonds_enabled, bonds_percent,
        created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (desarrollo) DO UPDATE SET
        phase_sale_percent = EXCLUDED.phase_sale_percent,
        phase_post_sale_percent = EXCLUDED.phase_post_sale_percent,
        sale_manager_percent = EXCLUDED.sale_manager_percent,
        deal_owner_percent = EXCLUDED.deal_owner_percent,
        external_advisor_percent = EXCLUDED.external_advisor_percent,
        pool_enabled = EXCLUDED.pool_enabled,
        sale_pool_total_percent = EXCLUDED.sale_pool_total_percent,
        customer_service_enabled = EXCLUDED.customer_service_enabled,
        customer_service_percent = EXCLUDED.customer_service_percent,
        deliveries_enabled = EXCLUDED.deliveries_enabled,
        deliveries_percent = EXCLUDED.deliveries_percent,
        bonds_enabled = EXCLUDED.bonds_enabled,
        bonds_percent = EXCLUDED.bonds_percent,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        normalizedDesarrollo,
        config.phase_sale_percent,
        config.phase_post_sale_percent,
        config.sale_manager_percent,
        config.deal_owner_percent,
        config.external_advisor_percent || null,
        config.pool_enabled || false,
        config.sale_pool_total_percent || 0,
        config.customer_service_enabled || false,
        config.customer_service_percent || null,
        config.deliveries_enabled || false,
        config.deliveries_percent || null,
        config.bonds_enabled || false,
        config.bonds_percent || null,
        userId,
        userId,
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error guardando configuración de comisiones:', error);
    throw error;
  }
}

/**
 * Obtiene la configuración global de roles indirectos
 */
export async function getCommissionGlobalConfigs(): Promise<CommissionGlobalConfig[]> {
  try {
    const result = await query<CommissionGlobalConfig>(
      `SELECT * FROM commission_global_configs ORDER BY config_key`
    );
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo configuración global de comisiones:', error);
    throw error;
  }
}

/**
 * Actualiza la configuración global de roles indirectos
 */
export async function updateCommissionGlobalConfig(
  configKey: 'operations_coordinator_percent' | 'marketing_percent' | 'legal_manager_percent' | 'post_sale_coordinator_percent',
  configValue: number,
  userId: number
): Promise<CommissionGlobalConfig> {
  try {
    const result = await query<CommissionGlobalConfig>(
      `UPDATE commission_global_configs
       SET config_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE config_key = $3
       RETURNING *`,
      [configValue, userId, configKey]
    );
    if (result.rows.length === 0) {
      throw new Error(`Configuración global no encontrada: ${configKey}`);
    }
    return result.rows[0];
  } catch (error) {
    console.error('Error actualizando configuración global de comisiones:', error);
    throw error;
  }
}

// =====================================================
// VENTAS COMISIONABLES
// =====================================================

/**
 * Obtiene una venta comisionable por ID
 */
export async function getCommissionSale(id: number): Promise<CommissionSale | null> {
  try {
    const result = await query<CommissionSale>(
      `SELECT * FROM commission_sales WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo venta comisionable:', error);
    throw error;
  }
}

/**
 * Obtiene una venta comisionable por Zoho Deal ID
 */
export async function getCommissionSaleByZohoDealId(
  zohoDealId: string
): Promise<CommissionSale | null> {
  try {
    const result = await query<CommissionSale>(
      `SELECT * FROM commission_sales WHERE zoho_deal_id = $1`,
      [zohoDealId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo venta comisionable por Zoho Deal ID:', error);
    throw error;
  }
}

/**
 * Obtiene deals cerrados-ganados desde zoho_deals
 */
export async function getClosedWonDealsFromDB(
  limit: number = 1000
): Promise<any[]> {
  try {
    const result = await query<{
      id: string;
      zoho_id: string;
      data: string | any;
      deal_name: string | null;
      amount: number | null;
      stage: string | null;
      closing_date: string | null;
      desarrollo: string | null;
      owner_name: string | null;
      owner_id: string | null;
      account_name: string | null;
    }>(
      `SELECT 
        id, zoho_id, data, deal_name, amount, stage, closing_date,
        desarrollo, owner_name, owner_id, account_name
       FROM zoho_deals
       WHERE (
         LOWER(COALESCE(stage, data->>'Stage', '')) LIKE '%ganado%'
         OR LOWER(COALESCE(stage, data->>'Stage', '')) LIKE '%won%'
       )
       AND closing_date IS NOT NULL
       ORDER BY closing_date DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => {
      const dealData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return {
        id: row.zoho_id,
        Deal_Name: row.deal_name || dealData?.Deal_Name,
        Amount: row.amount || dealData?.Amount,
        Stage: row.stage || dealData?.Stage,
        Closing_Date: row.closing_date || dealData?.Closing_Date,
        Desarrollo: row.desarrollo || dealData?.Desarrollo || dealData?.Desarollo,
        Owner: row.owner_name ? {
          id: row.owner_id || '',
          name: row.owner_name,
        } : dealData?.Owner,
        Account_Name: row.account_name ? {
          id: '',
          name: row.account_name,
        } : dealData?.Account_Name,
        ...dealData,
      };
    });
  } catch (error) {
    console.error('Error obteniendo deals cerrados-ganados:', error);
    throw error;
  }
}

/**
 * Sincroniza un deal cerrado-ganado a commission_sales
 */
export async function syncDealToCommissionSale(deal: any): Promise<CommissionSale> {
  try {
    // Extraer campos del deal
    const zohoDealId = deal.id;
    const dealName = deal.Deal_Name || null;
    
    // El Deal_Name tiene estructura: {Nombre del cliente} - {Producto/lote}
    // Extraer nombre del cliente y producto del Deal_Name
    let clienteNombre = deal.Account_Name?.name || 'Cliente sin nombre';
    let producto = null;
    
    if (dealName) {
      // Intentar parsear el Deal_Name: "Cliente - Producto/Lote"
      const parts = dealName.split(' - ');
      if (parts.length >= 2) {
        // Si tiene el formato esperado, extraer cliente y producto
        clienteNombre = parts[0].trim();
        producto = parts.slice(1).join(' - ').trim(); // Por si hay múltiples " - " en el producto
      } else if (parts.length === 1) {
        // Si no tiene el formato, usar todo como nombre del cliente
        clienteNombre = parts[0].trim();
      }
    }
    
    // Si no se pudo extraer del Deal_Name, usar Account_Name como fallback
    if (clienteNombre === 'Cliente sin nombre' && deal.Account_Name?.name) {
      clienteNombre = deal.Account_Name.name;
    }
    
    // Normalizar desarrollo: trim + lowercase para consistencia con la configuración
    const desarrollo = (deal.Desarrollo || deal.Desarollo || null)?.trim().toLowerCase() || null;
    const propietarioDeal = deal.Owner?.name || 'Sin propietario';
    const propietarioDealId = deal.Owner?.id || null;
    const valorTotal = deal.Amount || 0;
    const closingDate = deal.Closing_Date || null;
    
    // Extraer campos adicionales del JSONB data (buscar en múltiples variantes de nombres)
    const plazoDeal = deal.Plazo || deal.Plazo_Deal || null;
    
    // Si no se extrajo producto del Deal_Name, intentar desde otros campos
    if (!producto) {
      const lote = deal.Lote || deal.Lote_Numero || null;
      const calle = deal.Calle || deal.Calle_Nombre || null;
      producto = deal.Producto || (lote && calle ? `${lote} - ${calle}` : lote || calle || null);
    }
    
    // Metros cuadrados - buscar en múltiples campos
    const metrosCuadrados = deal.Metros_Cuadrados || deal.Metros2 || deal.M2 || deal.m2 || 
                            deal.Metros || deal.Superficie || deal.Area || null;
    
    // Asesor externo
    const asesorExterno = deal.Asesor_Externo || deal.Asesor_Externo_Nombre || 
                          deal.External_Advisor || deal.Advisor_Name || null;
    const asesorExternoId = deal.Asesor_Externo_Id || deal.External_Advisor_Id || 
                            deal.Advisor_Id || null;

    // Validar campos requeridos
    if (!desarrollo) {
      throw new Error(`Deal ${zohoDealId} no tiene desarrollo asignado`);
    }

    if (!closingDate) {
      throw new Error(`Deal ${zohoDealId} no tiene fecha de cierre`);
    }

    if (valorTotal <= 0) {
      throw new Error(`Deal ${zohoDealId} no tiene valor total válido`);
    }

    // Calcular metros cuadrados si no está disponible (usar valor por defecto o calcular)
    let m2 = metrosCuadrados;
    if (!m2 || m2 <= 0) {
      // Si no hay m2, usar un valor por defecto o intentar calcular
      // Por ahora, usar 100 m2 como valor por defecto si no está disponible
      m2 = 100;
    }

    // Calcular precio por m²
    const precioPorM2 = Number((valorTotal / m2).toFixed(2));

    // Crear o actualizar venta comisionable
    const saleInput: CommissionSaleInput = {
      zoho_deal_id: zohoDealId,
      deal_name: dealName,
      cliente_nombre: clienteNombre,
      desarrollo: desarrollo,
      propietario_deal: propietarioDeal,
      propietario_deal_id: propietarioDealId,
      plazo_deal: plazoDeal,
      producto: producto,
      metros_cuadrados: m2,
      precio_por_m2: precioPorM2,
      valor_total: valorTotal,
      fecha_firma: closingDate,
      asesor_externo: asesorExterno,
      asesor_externo_id: asesorExternoId,
    };

    return await upsertCommissionSale(saleInput);
  } catch (error) {
    console.error('Error sincronizando deal a venta comisionable:', error);
    throw error;
  }
}

/**
 * Procesa todos los deals cerrados-ganados desde la BD local (zoho_deals) a commission_sales
 * NO llama a la API de Zoho, solo lee de la base de datos local
 */
export async function processClosedWonDealsFromLocalDB(): Promise<{
  processed: number;
  errors: number;
  errorsList: string[];
  skipped: number; // Deals que ya estaban sincronizados
}> {
  try {
    const deals = await getClosedWonDealsFromDB(10000); // Obtener hasta 10000 deals desde BD local
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    const errorsList: string[] = [];

    for (const deal of deals) {
      try {
        // Verificar si ya existe en commission_sales
        const existing = await getCommissionSaleByZohoDealId(deal.id);
        if (existing) {
          // Actualizar datos si el deal cambió
          await syncDealToCommissionSale(deal);
          skipped++; // Ya existía, pero se actualizó
        } else {
          // Crear nuevo registro
          await syncDealToCommissionSale(deal);
          processed++;
        }
      } catch (error) {
        errors++;
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        errorsList.push(`Deal ${deal.id}: ${errorMsg}`);
        console.error(`Error procesando deal ${deal.id}:`, error);
      }
    }

    return { processed, errors, errorsList, skipped };
  } catch (error) {
    console.error('Error procesando deals cerrados-ganados desde BD local:', error);
    throw error;
  }
}

/**
 * Obtiene ventas comisionables con filtros
 */
export async function getCommissionSales(
  filters?: CommissionSalesFilters,
  limit: number = 100,
  offset: number = 0
): Promise<{ sales: CommissionSale[]; total: number }> {
  try {
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.desarrollo) {
      whereConditions.push(`desarrollo = $${paramIndex}`);
      params.push(filters.desarrollo);
      paramIndex++;
    }

    if (filters?.propietario_deal) {
      whereConditions.push(`propietario_deal = $${paramIndex}`);
      params.push(filters.propietario_deal);
      paramIndex++;
    }

    if (filters?.fecha_firma_from) {
      whereConditions.push(`fecha_firma >= $${paramIndex}::date`);
      params.push(filters.fecha_firma_from);
      paramIndex++;
    }

    if (filters?.fecha_firma_to) {
      whereConditions.push(`fecha_firma <= $${paramIndex}::date`);
      params.push(filters.fecha_firma_to);
      paramIndex++;
    }

    if (filters?.commission_calculated !== undefined) {
      whereConditions.push(`commission_calculated = $${paramIndex}`);
      params.push(filters.commission_calculated);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Obtener total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM commission_sales ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Obtener ventas
    params.push(limit, offset);
    const salesResult = await query<CommissionSale>(
      `SELECT * FROM commission_sales ${whereClause}
       ORDER BY fecha_firma DESC, id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return {
      sales: salesResult.rows,
      total,
    };
  } catch (error) {
    console.error('Error obteniendo ventas comisionables:', error);
    throw error;
  }
}

/**
 * Crea o actualiza una venta comisionable
 */
export async function upsertCommissionSale(
  sale: CommissionSaleInput
): Promise<CommissionSale> {
  try {
    const result = await query<CommissionSale>(
      `INSERT INTO commission_sales (
        zoho_deal_id, deal_name, cliente_nombre, desarrollo,
        propietario_deal, propietario_deal_id, plazo_deal, producto,
        metros_cuadrados, precio_por_m2, valor_total, fecha_firma,
        asesor_externo, asesor_externo_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT (zoho_deal_id) DO UPDATE SET
        deal_name = EXCLUDED.deal_name,
        cliente_nombre = EXCLUDED.cliente_nombre,
        desarrollo = EXCLUDED.desarrollo,
        propietario_deal = EXCLUDED.propietario_deal,
        propietario_deal_id = EXCLUDED.propietario_deal_id,
        plazo_deal = EXCLUDED.plazo_deal,
        producto = EXCLUDED.producto,
        metros_cuadrados = EXCLUDED.metros_cuadrados,
        precio_por_m2 = EXCLUDED.precio_por_m2,
        valor_total = EXCLUDED.valor_total,
        fecha_firma = EXCLUDED.fecha_firma,
        asesor_externo = EXCLUDED.asesor_externo,
        asesor_externo_id = EXCLUDED.asesor_externo_id,
        synced_from_zoho_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        sale.zoho_deal_id,
        sale.deal_name || null,
        sale.cliente_nombre,
        sale.desarrollo,
        sale.propietario_deal,
        sale.propietario_deal_id || null,
        sale.plazo_deal || null,
        sale.producto || null,
        sale.metros_cuadrados,
        sale.precio_por_m2,
        sale.valor_total,
        sale.fecha_firma,
        sale.asesor_externo || null,
        sale.asesor_externo_id || null,
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error guardando venta comisionable:', error);
    throw error;
  }
}

/**
 * Actualiza el estado de cálculo de comisión de una venta
 */
export async function updateCommissionSaleCalculation(
  saleId: number,
  commissionTotal: number,
  commissionSalePhase: number,
  commissionPostSalePhase: number
): Promise<void> {
  try {
    await query(
      `UPDATE commission_sales
       SET commission_calculated = true,
           commission_total = $1,
           commission_sale_phase = $2,
           commission_post_sale_phase = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [commissionTotal, commissionSalePhase, commissionPostSalePhase, saleId]
    );
  } catch (error) {
    console.error('Error actualizando cálculo de comisión:', error);
    throw error;
  }
}

// =====================================================
// DISTRIBUCIONES
// =====================================================

/**
 * Obtiene las distribuciones de comisión para una venta
 */
export async function getCommissionDistributions(
  saleId: number
): Promise<CommissionDistribution[]> {
  try {
    const result = await query<CommissionDistribution>(
      `SELECT * FROM commission_distributions
       WHERE sale_id = $1
       ORDER BY phase, role_type`,
      [saleId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo distribuciones de comisión:', error);
    throw error;
  }
}

/**
 * Crea una distribución de comisión
 */
export async function createCommissionDistribution(
  distribution: CommissionDistributionInput
): Promise<CommissionDistribution> {
  try {
    const result = await query<CommissionDistribution>(
      `INSERT INTO commission_distributions (
        sale_id, role_type, person_name, person_id,
        phase, percent_assigned, amount_calculated, payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        distribution.sale_id,
        distribution.role_type,
        distribution.person_name,
        distribution.person_id || null,
        distribution.phase,
        distribution.percent_assigned,
        distribution.amount_calculated,
        distribution.payment_status || 'pending',
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creando distribución de comisión:', error);
    throw error;
  }
}

/**
 * Crea múltiples distribuciones de comisión
 */
export async function createCommissionDistributions(
  distributions: CommissionDistributionInput[]
): Promise<CommissionDistribution[]> {
  try {
    // Eliminar distribuciones existentes para esta venta
    if (distributions.length > 0) {
      await query(
        `DELETE FROM commission_distributions WHERE sale_id = $1`,
        [distributions[0].sale_id]
      );
    }

    // Insertar nuevas distribuciones
    const created: CommissionDistribution[] = [];
    for (const dist of distributions) {
      const createdDist = await createCommissionDistribution(dist);
      created.push(createdDist);
    }

    return created;
  } catch (error) {
    console.error('Error creando distribuciones de comisión:', error);
    throw error;
  }
}

/**
 * Obtiene una distribución de comisión por ID
 */
export async function getCommissionDistribution(
  distributionId: number
): Promise<CommissionDistribution | null> {
  try {
    const result = await query<CommissionDistribution>(
      `SELECT * FROM commission_distributions WHERE id = $1`,
      [distributionId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo distribución de comisión:', error);
    throw error;
  }
}

/**
 * Actualiza una distribución de comisión
 */
export async function updateCommissionDistribution(
  distributionId: number,
  percentAssigned: number,
  amountCalculated: number
): Promise<CommissionDistribution> {
  try {
    const result = await query<CommissionDistribution>(
      `UPDATE commission_distributions
       SET percent_assigned = $1,
           amount_calculated = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [percentAssigned, amountCalculated, distributionId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Distribución no encontrada: ${distributionId}`);
    }
    return result.rows[0];
  } catch (error) {
    console.error('Error actualizando distribución de comisión:', error);
    throw error;
  }
}

/**
 * Actualiza el estado de pago de una distribución de comisión
 */
export async function updateCommissionDistributionPaymentStatus(
  distributionId: number,
  paymentStatus: 'pending' | 'paid'
): Promise<CommissionDistribution> {
  try {
    const result = await query<CommissionDistribution>(
      `UPDATE commission_distributions
       SET payment_status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [paymentStatus, distributionId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Distribución no encontrada: ${distributionId}`);
    }
    return result.rows[0];
  } catch (error) {
    console.error('Error actualizando estado de pago de distribución:', error);
    throw error;
  }
}

/**
 * Obtiene todas las distribuciones con información de la venta
 * Útil para mostrar listado de comisiones a pagar
 */
export async function getCommissionDistributionsWithSaleInfo(
  filters?: {
    desarrollo?: string;
    year?: number;
    payment_status?: 'pending' | 'paid';
  }
): Promise<Array<CommissionDistribution & {
  producto: string | null;
  fecha_firma: string;
  cliente_nombre: string;
  desarrollo: string;
}>> {
  try {
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Solo obtener distribuciones de ventas con comisiones calculadas
    whereConditions.push('cs.commission_calculated = true');
    
    // Excluir reglas y utilidades (solo mostrar comisiones reales a pagar)
    whereConditions.push("cd.role_type != 'rule_bonus'");
    whereConditions.push("cd.phase != 'utility'");

    if (filters?.desarrollo) {
      whereConditions.push(`cs.desarrollo = $${paramIndex}`);
      params.push(filters.desarrollo);
      paramIndex++;
    }

    if (filters?.year) {
      whereConditions.push(`EXTRACT(YEAR FROM cs.fecha_firma) = $${paramIndex}`);
      params.push(filters.year);
      paramIndex++;
    }

    if (filters?.payment_status) {
      whereConditions.push(`cd.payment_status = $${paramIndex}`);
      params.push(filters.payment_status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query<CommissionDistribution & {
      producto: string | null;
      fecha_firma: string;
      cliente_nombre: string;
      desarrollo: string;
    }>(
      `SELECT 
        cd.*,
        cs.producto,
        cs.fecha_firma,
        cs.cliente_nombre,
        cs.desarrollo
       FROM commission_distributions cd
       INNER JOIN commission_sales cs ON cd.sale_id = cs.id
       ${whereClause}
       ORDER BY cs.fecha_firma DESC, cd.payment_status, cd.phase, cd.role_type`,
      params
    );

    return result.rows;
  } catch (error) {
    console.error('Error obteniendo distribuciones con información de venta:', error);
    throw error;
  }
}

/**
 * Elimina todas las distribuciones de comisión para una venta y resetea el estado de cálculo
 */
export async function deleteCommissionDistributions(saleId: number): Promise<void> {
  try {
    // Eliminar distribuciones
    await query(
      `DELETE FROM commission_distributions WHERE sale_id = $1`,
      [saleId]
    );
    
    // Resetear estado de cálculo de la venta
    await query(
      `UPDATE commission_sales
       SET commission_calculated = false,
           commission_total = 0,
           commission_sale_phase = 0,
           commission_post_sale_phase = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [saleId]
    );
  } catch (error) {
    console.error('Error eliminando distribuciones de comisión:', error);
    throw error;
  }
}

// =====================================================
// AJUSTES
// =====================================================

/**
 * Crea un registro de ajuste manual
 */
export async function createCommissionAdjustment(
  adjustment: CommissionAdjustmentInput,
  userId: number
): Promise<CommissionAdjustment> {
  try {
    const result = await query<CommissionAdjustment>(
      `INSERT INTO commission_adjustments (
        distribution_id, sale_id, adjustment_type,
        old_value, new_value, old_role_type, new_role_type,
        amount_impact, adjusted_by, reason, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        adjustment.distribution_id,
        adjustment.sale_id,
        adjustment.adjustment_type,
        adjustment.old_value || null,
        adjustment.new_value,
        adjustment.old_role_type || null,
        adjustment.new_role_type || null,
        adjustment.amount_impact,
        userId,
        adjustment.reason || null,
        adjustment.notes || null,
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creando ajuste de comisión:', error);
    throw error;
  }
}

/**
 * Obtiene el historial de ajustes para una venta
 */
export async function getCommissionAdjustments(
  saleId: number
): Promise<CommissionAdjustment[]> {
  try {
    const result = await query<CommissionAdjustment>(
      `SELECT ca.*, u.name as adjusted_by_name, u.email as adjusted_by_email
       FROM commission_adjustments ca
       LEFT JOIN users u ON ca.adjusted_by = u.id
       WHERE ca.sale_id = $1
       ORDER BY ca.adjusted_at DESC`,
      [saleId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo ajustes de comisión:', error);
    throw error;
  }
}

// =====================================================
// REGLAS DE COMISIÓN
// =====================================================

/**
 * Obtiene todas las reglas de comisión para un desarrollo
 */
export async function getCommissionRules(desarrollo?: string): Promise<CommissionRule[]> {
  try {
    let sqlQuery = 'SELECT * FROM commission_rules';
    const params: any[] = [];
    
    if (desarrollo) {
      sqlQuery += ' WHERE LOWER(TRIM(desarrollo)) = LOWER(TRIM($1))';
      params.push(desarrollo);
    }
    
    sqlQuery += ' ORDER BY prioridad DESC, periodo_value DESC, created_at DESC';
    
    const result = await query<CommissionRule>(sqlQuery, params);
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo reglas de comisión:', error);
    throw error;
  }
}

/**
 * Obtiene una regla de comisión por ID
 */
export async function getCommissionRule(id: number): Promise<CommissionRule | null> {
  try {
    const result = await query<CommissionRule>(
      'SELECT * FROM commission_rules WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo regla de comisión:', error);
    throw error;
  }
}

/**
 * Crea una nueva regla de comisión
 */
export async function createCommissionRule(
  rule: CommissionRuleInput,
  userId: number
): Promise<CommissionRule> {
  try {
    const normalizedDesarrollo = rule.desarrollo.trim().toLowerCase();
    
    const result = await query<CommissionRule>(
      `INSERT INTO commission_rules (
        desarrollo, rule_name, periodo_type, periodo_value,
        operador, unidades_vendidas, porcentaje_comision, porcentaje_iva,
        activo, prioridad, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *`,
      [
        normalizedDesarrollo,
        rule.rule_name,
        rule.periodo_type,
        rule.periodo_value,
        rule.operador,
        rule.unidades_vendidas,
        rule.porcentaje_comision,
        rule.porcentaje_iva || 0,
        rule.activo !== undefined ? rule.activo : true,
        rule.prioridad || 0,
        userId,
        userId,
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creando regla de comisión:', error);
    throw error;
  }
}

/**
 * Actualiza una regla de comisión existente
 */
export async function updateCommissionRule(
  id: number,
  rule: Partial<CommissionRuleInput>,
  userId: number
): Promise<CommissionRule> {
  try {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (rule.desarrollo !== undefined) {
      updates.push(`desarrollo = LOWER(TRIM($${paramIndex}))`);
      params.push(rule.desarrollo);
      paramIndex++;
    }
    if (rule.rule_name !== undefined) {
      updates.push(`rule_name = $${paramIndex}`);
      params.push(rule.rule_name);
      paramIndex++;
    }
    if (rule.periodo_type !== undefined) {
      updates.push(`periodo_type = $${paramIndex}`);
      params.push(rule.periodo_type);
      paramIndex++;
    }
    if (rule.periodo_value !== undefined) {
      updates.push(`periodo_value = $${paramIndex}`);
      params.push(rule.periodo_value);
      paramIndex++;
    }
    if (rule.operador !== undefined) {
      updates.push(`operador = $${paramIndex}`);
      params.push(rule.operador);
      paramIndex++;
    }
    if (rule.unidades_vendidas !== undefined) {
      updates.push(`unidades_vendidas = $${paramIndex}`);
      params.push(rule.unidades_vendidas);
      paramIndex++;
    }
    if (rule.porcentaje_comision !== undefined) {
      updates.push(`porcentaje_comision = $${paramIndex}`);
      params.push(rule.porcentaje_comision);
      paramIndex++;
    }
    if (rule.porcentaje_iva !== undefined) {
      updates.push(`porcentaje_iva = $${paramIndex}`);
      params.push(rule.porcentaje_iva);
      paramIndex++;
    }
    if (rule.activo !== undefined) {
      updates.push(`activo = $${paramIndex}`);
      params.push(rule.activo);
      paramIndex++;
    }
    if (rule.prioridad !== undefined) {
      updates.push(`prioridad = $${paramIndex}`);
      params.push(rule.prioridad);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    updates.push(`updated_by = $${paramIndex}`);
    params.push(userId);
    paramIndex++;

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(id);

    const result = await query<CommissionRule>(
      `UPDATE commission_rules 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Regla de comisión no encontrada');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error actualizando regla de comisión:', error);
    throw error;
  }
}

/**
 * Elimina una regla de comisión
 */
export async function deleteCommissionRule(id: number): Promise<boolean> {
  try {
    const result = await query<{ count: string }>(
      'DELETE FROM commission_rules WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error eliminando regla de comisión:', error);
    throw error;
  }
}

/**
 * Verifica si una fecha está dentro de un período específico
 * @param fecha - Fecha a verificar (string ISO o Date)
 * @param periodoValue - Valor del período (ej: "2025-Q1", "2025-01", "2025")
 * @param periodoType - Tipo de período: 'trimestre', 'mensual', 'anual'
 * @returns true si la fecha está dentro del período, false en caso contrario
 * 
 * NOTA: Para reglas trimestrales, periodoValue puede ser solo el año (ej: "2025")
 * o el formato completo (ej: "2025-Q1"). Si es solo el año, se considera que
 * la fecha está en el período si el año coincide.
 */
function _fechaEstaEnPeriodo(
  fecha: string | Date,
  periodoValue: string,
  periodoType: 'trimestre' | 'mensual' | 'anual'
): boolean {
  try {
    const fechaObj = typeof fecha === 'string' ? new Date(fecha) : fecha;
    const año = fechaObj.getFullYear();
    const mes = fechaObj.getMonth() + 1; // 1-12
    
    if (periodoType === 'trimestre') {
      // Puede ser formato "2025-Q1" o solo "2025"
      const matchCompleto = periodoValue.match(/^(\d{4})-Q(\d)$/);
      if (matchCompleto) {
        // Formato completo: "2025-Q1" -> año 2025, trimestre 1 (enero-marzo)
        const añoPeriodo = parseInt(matchCompleto[1], 10);
        const trimestrePeriodo = parseInt(matchCompleto[2], 10);
        const trimestreFecha = Math.ceil(mes / 3); // 1-4
        return año === añoPeriodo && trimestreFecha === trimestrePeriodo;
      } else {
        // Formato solo año: "2025" -> verificar que el año coincida
        const añoPeriodo = parseInt(periodoValue, 10);
        if (!isNaN(añoPeriodo)) {
          return año === añoPeriodo;
        }
      }
      return false;
    } else if (periodoType === 'mensual') {
      // Formato: "2025-01" -> año 2025, mes 1
      const match = periodoValue.match(/^(\d{4})-(\d{2})$/);
      if (!match) return false;
      const añoPeriodo = parseInt(match[1], 10);
      const mesPeriodo = parseInt(match[2], 10);
      return año === añoPeriodo && mes === mesPeriodo;
    } else if (periodoType === 'anual') {
      // Formato: "2025" -> año 2025
      const añoPeriodo = parseInt(periodoValue, 10);
      if (isNaN(añoPeriodo)) return false;
      return año === añoPeriodo;
    }
    return false;
  } catch (error) {
    console.error('Error verificando si fecha está en período:', error);
    return false;
  }
}

/**
 * Cuenta las unidades vendidas (ventas) para un desarrollo en un período específico
 * Solo cuenta ventas cuya fecha de firma esté dentro del período especificado
 * @param desarrollo - Nombre del desarrollo
 * @param periodoValue - Valor del período (ej: "2025-Q1", "2025-01", "2025")
 * @param periodoType - Tipo de período: 'trimestre', 'mensual', 'anual'
 * @returns Número de unidades vendidas en ese período
 */
export async function countUnidadesVendidasEnPeriodo(
  desarrollo: string,
  periodoValue: string,
  periodoType: 'trimestre' | 'mensual' | 'anual'
): Promise<number> {
  try {
    const normalizedDesarrollo = desarrollo.trim().toLowerCase();
    let dateCondition = '';
    const params: any[] = [normalizedDesarrollo];
    
    // Construir condición de fecha según el tipo de período
    if (periodoType === 'trimestre') {
      // Formato: "2025-Q1" -> año 2025, trimestre 1 (enero-marzo)
      const match = periodoValue.match(/^(\d{4})-Q(\d)$/);
      if (!match) {
        console.warn(`Formato de período trimestral inválido: ${periodoValue}`);
        return 0;
      }
      const año = parseInt(match[1], 10);
      const trimestre = parseInt(match[2], 10);
      // Calcular rango de meses: Q1 = 1-3, Q2 = 4-6, Q3 = 7-9, Q4 = 10-12
      const mesInicio = (trimestre - 1) * 3 + 1;
      const mesFin = trimestre * 3;
      dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $2 
                       AND EXTRACT(MONTH FROM fecha_firma) >= $3 
                       AND EXTRACT(MONTH FROM fecha_firma) <= $4`;
      params.push(año, mesInicio, mesFin);
    } else if (periodoType === 'mensual') {
      // Formato: "2025-01" -> año 2025, mes 1
      const match = periodoValue.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        console.warn(`Formato de período mensual inválido: ${periodoValue}`);
        return 0;
      }
      const año = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10);
      dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $2 
                       AND EXTRACT(MONTH FROM fecha_firma) = $3`;
      params.push(año, mes);
    } else if (periodoType === 'anual') {
      // Formato: "2025" -> año 2025
      const año = parseInt(periodoValue, 10);
      if (isNaN(año)) {
        console.warn(`Formato de período anual inválido: ${periodoValue}`);
        return 0;
      }
      dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $2`;
      params.push(año);
    } else {
      console.warn(`Tipo de período desconocido: ${periodoType}`);
      return 0;
    }
    
    // Contar todas las ventas en el período cuya fecha de firma esté dentro del período
    // IMPORTANTE: Solo cuenta ventas cuya fecha de firma esté dentro del período especificado
    // y que no sea una fecha futura (no mayor a la fecha actual)
    const fechaActual = new Date();
    fechaActual.setHours(23, 59, 59, 999); // Incluir todo el día actual
    
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM commission_sales
       WHERE LOWER(TRIM(desarrollo)) = $1
         AND ${dateCondition}
         AND fecha_firma <= $${params.length + 1}::date`,
      [...params, fechaActual.toISOString().split('T')[0]]
    );
    
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error contando unidades vendidas en período:', error);
    throw error;
  }
}

/**
 * Obtiene TODAS las reglas de comisión aplicables para una venta
 * Basada en: desarrollo, período vigente (calculado desde fecha actual), y unidades vendidas
 * IMPORTANTE: Se aplican TODAS las reglas que cumplan las condiciones, no solo una
 * 
 * IMPORTANTE: Las reglas de tipo "trimestre" se aplican a TODOS los trimestres del año.
 * El periodo_value para trimestres solo contiene el año (ej: "2025"), no el trimestre específico.
 * La regla se evalúa para el trimestre vigente actual según la fecha de hoy.
 * 
 * El conteo de unidades vendidas se calcula dinámicamente para cada regla
 * basándose en el período vigente actual (trimestre, mes, año según la fecha de hoy)
 */
export async function getApplicableCommissionRules(
  desarrollo: string,
  fechaFirma: string
): Promise<CommissionRule[]> {
  try {
    const normalizedDesarrollo = desarrollo.trim().toLowerCase();
    
    // Usar la fecha ACTUAL (hoy) para determinar el período vigente
    const fechaActual = new Date();
    const _añoActual = fechaActual.getFullYear();
    const mesActual = fechaActual.getMonth() + 1; // 1-12
    const _trimestreActual = Math.ceil(mesActual / 3); // 1-4
    
    // Determinar el trimestre/mes/año de la fecha de firma del deal
    const fechaFirmaObj = new Date(fechaFirma);
    const añoFirma = fechaFirmaObj.getFullYear();
    const mesFirma = fechaFirmaObj.getMonth() + 1; // 1-12
    const trimestreFirma = Math.ceil(mesFirma / 3); // 1-4
    
    // Obtener todas las reglas activas del desarrollo
    // Las reglas de tipo "trimestre" tienen periodo_value = año (ej: "2025")
    // Las reglas de tipo "mensual" tienen periodo_value = año-mes (ej: "2025-01")
    // Las reglas de tipo "anual" tienen periodo_value = año (ej: "2025")
    const rulesResult = await query<CommissionRule>(
      `SELECT * FROM commission_rules
       WHERE LOWER(TRIM(desarrollo)) = $1
         AND activo = TRUE
       ORDER BY unidades_vendidas DESC, created_at DESC`,
      [normalizedDesarrollo]
    );
    
    const allRules = rulesResult.rows;
    const applicableRules: CommissionRule[] = [];
    
    for (const rule of allRules) {
      let periodoValueParaConteo = '';
      let fechaEnPeriodo = false;
      
      if (rule.periodo_type === 'trimestre') {
        // Para reglas trimestrales, periodo_value es solo el año (ej: "2025")
        // La regla se aplica a todos los trimestres de ese año
        // Verificar que el año de la fecha de firma coincida con el año de la regla
        const añoRegla = parseInt(rule.periodo_value, 10);
        if (isNaN(añoRegla)) {
          // Si periodo_value tiene formato "2025-Q4", extraer solo el año
          const match = rule.periodo_value.match(/^(\d{4})/);
          if (match) {
            const añoExtraido = parseInt(match[1], 10);
            if (!isNaN(añoExtraido) && añoFirma === añoExtraido) {
              // Construir periodo_value para el trimestre actual de la fecha de firma
              periodoValueParaConteo = `${añoFirma}-Q${trimestreFirma}`;
              fechaEnPeriodo = true;
            }
          }
        } else if (añoFirma === añoRegla) {
          // Construir periodo_value para el trimestre de la fecha de firma
          periodoValueParaConteo = `${añoFirma}-Q${trimestreFirma}`;
          fechaEnPeriodo = true;
        }
      } else if (rule.periodo_type === 'mensual') {
        // Para reglas mensuales, periodo_value es año-mes (ej: "2025-01")
        // Verificar que la fecha de firma esté en ese mes específico
        const match = rule.periodo_value.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const añoRegla = parseInt(match[1], 10);
          const mesRegla = parseInt(match[2], 10);
          if (añoFirma === añoRegla && mesFirma === mesRegla) {
            periodoValueParaConteo = rule.periodo_value;
            fechaEnPeriodo = true;
          }
        }
      } else if (rule.periodo_type === 'anual') {
        // Para reglas anuales, periodo_value es solo el año (ej: "2025")
        const añoRegla = parseInt(rule.periodo_value, 10);
        if (!isNaN(añoRegla) && añoFirma === añoRegla) {
          periodoValueParaConteo = rule.periodo_value;
          fechaEnPeriodo = true;
        }
      }
      
      // Si la fecha de firma no está en el período de la regla, saltar esta regla
      if (!fechaEnPeriodo || !periodoValueParaConteo) {
        continue;
      }
      
      // Calcular unidades vendidas en el período específico de la fecha de firma
      // Para trimestres: cuenta ventas en ese trimestre específico
      // Para mensual: cuenta ventas en ese mes específico
      // Para anual: cuenta ventas en ese año específico
      const unidadesVendidasEnPeriodo = await countUnidadesVendidasEnPeriodo(
        desarrollo,
        periodoValueParaConteo,
        rule.periodo_type
      );
      
      // Verificar si la regla cumple la condición según el operador
      let cumpleCondicion = false;
      if (rule.operador === '=') {
        cumpleCondicion = unidadesVendidasEnPeriodo === rule.unidades_vendidas;
      } else if (rule.operador === '>=') {
        cumpleCondicion = unidadesVendidasEnPeriodo >= rule.unidades_vendidas;
      } else if (rule.operador === '<=') {
        cumpleCondicion = unidadesVendidasEnPeriodo <= rule.unidades_vendidas;
      }
      
      if (cumpleCondicion) {
        applicableRules.push(rule);
      }
    }
    
    return applicableRules;
  } catch (error) {
    console.error('Error obteniendo reglas aplicables de comisión:', error);
    throw error;
  }
}

/**
 * Obtiene el conteo de unidades vendidas en el período para todas las reglas de un desarrollo
 * Esta función calcula el conteo real de unidades vendidas en el período correspondiente
 * para cada regla, basándose en la fecha de firma de la venta
 * @param desarrollo - Nombre del desarrollo
 * @param fechaFirma - Fecha de firma de la venta
 * @returns Mapa de rule_id -> unidades_vendidas_en_periodo
 */
export async function getRuleUnitsCountMap(
  desarrollo: string,
  fechaFirma: string
): Promise<Map<number, number>> {
  try {
    const normalizedDesarrollo = desarrollo.trim().toLowerCase();
    
    // Determinar el trimestre/mes/año de la fecha de firma del deal
    const fechaFirmaObj = new Date(fechaFirma);
    const añoFirma = fechaFirmaObj.getFullYear();
    const mesFirma = fechaFirmaObj.getMonth() + 1; // 1-12
    const trimestreFirma = Math.ceil(mesFirma / 3); // 1-4
    
    // Obtener todas las reglas activas del desarrollo
    const rulesResult = await query<CommissionRule>(
      `SELECT * FROM commission_rules
       WHERE LOWER(TRIM(desarrollo)) = $1
         AND activo = TRUE
       ORDER BY unidades_vendidas DESC, created_at DESC`,
      [normalizedDesarrollo]
    );
    
    const allRules = rulesResult.rows;
    const unitsCountMap = new Map<number, number>();
    
    for (const rule of allRules) {
      let periodoValueParaConteo = '';
      let fechaEnPeriodo = false;
      
      if (rule.periodo_type === 'trimestre') {
        // Para reglas trimestrales, periodo_value es solo el año (ej: "2025")
        // La regla se aplica a todos los trimestres de ese año
        const añoRegla = parseInt(rule.periodo_value, 10);
        if (isNaN(añoRegla)) {
          // Si periodo_value tiene formato "2025-Q4", extraer solo el año
          const match = rule.periodo_value.match(/^(\d{4})/);
          if (match) {
            const añoExtraido = parseInt(match[1], 10);
            if (!isNaN(añoExtraido) && añoFirma === añoExtraido) {
              periodoValueParaConteo = `${añoFirma}-Q${trimestreFirma}`;
              fechaEnPeriodo = true;
            }
          }
        } else if (añoFirma === añoRegla) {
          periodoValueParaConteo = `${añoFirma}-Q${trimestreFirma}`;
          fechaEnPeriodo = true;
        }
      } else if (rule.periodo_type === 'mensual') {
        // Para reglas mensuales, periodo_value es año-mes (ej: "2025-01")
        const match = rule.periodo_value.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const añoRegla = parseInt(match[1], 10);
          const mesRegla = parseInt(match[2], 10);
          if (añoFirma === añoRegla && mesFirma === mesRegla) {
            periodoValueParaConteo = rule.periodo_value;
            fechaEnPeriodo = true;
          }
        }
      } else if (rule.periodo_type === 'anual') {
        // Para reglas anuales, periodo_value es solo el año (ej: "2025")
        const añoRegla = parseInt(rule.periodo_value, 10);
        if (!isNaN(añoRegla) && añoFirma === añoRegla) {
          periodoValueParaConteo = rule.periodo_value;
          fechaEnPeriodo = true;
        }
      }
      
      // Si la fecha de firma está en el período de la regla, calcular el conteo
      if (fechaEnPeriodo && periodoValueParaConteo) {
        const unidadesVendidasEnPeriodo = await countUnidadesVendidasEnPeriodo(
          desarrollo,
          periodoValueParaConteo,
          rule.periodo_type
        );
        unitsCountMap.set(rule.id, unidadesVendidasEnPeriodo);
      } else {
        // Si la fecha no está en el período, establecer conteo en 0
        unitsCountMap.set(rule.id, 0);
      }
    }
    
    return unitsCountMap;
  } catch (error) {
    console.error('Error obteniendo conteo de unidades por regla:', error);
    throw error;
  }
}

// =====================================================
// METAS DE FACTURACIÓN
// =====================================================

/**
 * Obtiene todas las metas de facturación para un año
 */
export async function getCommissionBillingTargets(
  year: number
): Promise<CommissionBillingTarget[]> {
  try {
    const result = await query<CommissionBillingTarget>(
      `SELECT * FROM commission_billing_targets 
       WHERE year = $1 
       ORDER BY month`,
      [year]
    );
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo metas de facturación:', error);
    throw error;
  }
}

/**
 * Obtiene la meta de facturación para un mes y año específicos
 */
export async function getCommissionBillingTarget(
  year: number,
  month: number
): Promise<CommissionBillingTarget | null> {
  try {
    const result = await query<CommissionBillingTarget>(
      `SELECT * FROM commission_billing_targets 
       WHERE year = $1 AND month = $2`,
      [year, month]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo meta de facturación:', error);
    throw error;
  }
}

/**
 * Crea o actualiza una meta de facturación
 */
export async function upsertCommissionBillingTarget(
  target: CommissionBillingTargetInput,
  userId: number
): Promise<CommissionBillingTarget> {
  try {
    const result = await query<CommissionBillingTarget>(
      `INSERT INTO commission_billing_targets (
        year, month, target_amount, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (year, month) DO UPDATE SET
        target_amount = EXCLUDED.target_amount,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [target.year, target.month, target.target_amount, userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error guardando meta de facturación:', error);
    throw error;
  }
}

/**
 * Elimina una meta de facturación
 */
export async function deleteCommissionBillingTarget(
  year: number,
  month: number
): Promise<boolean> {
  try {
    const result = await query(
      `DELETE FROM commission_billing_targets 
       WHERE year = $1 AND month = $2`,
      [year, month]
    );
    return (result.rowCount || 0) > 0;
  } catch (error) {
    console.error('Error eliminando meta de facturación:', error);
    throw error;
  }
}

