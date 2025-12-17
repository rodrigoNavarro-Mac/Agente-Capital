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
        sale_pool_total_percent, sale_manager_percent, deal_owner_percent,
        external_advisor_percent, operations_coordinator_percent, marketing_percent,
        legal_manager_percent, post_sale_coordinator_percent,
        customer_service_enabled, customer_service_percent,
        deliveries_enabled, deliveries_percent,
        bonds_enabled, bonds_percent,
        created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      ON CONFLICT (desarrollo) DO UPDATE SET
        phase_sale_percent = EXCLUDED.phase_sale_percent,
        phase_post_sale_percent = EXCLUDED.phase_post_sale_percent,
        sale_pool_total_percent = EXCLUDED.sale_pool_total_percent,
        sale_manager_percent = EXCLUDED.sale_manager_percent,
        deal_owner_percent = EXCLUDED.deal_owner_percent,
        external_advisor_percent = EXCLUDED.external_advisor_percent,
        operations_coordinator_percent = EXCLUDED.operations_coordinator_percent,
        marketing_percent = EXCLUDED.marketing_percent,
        legal_manager_percent = EXCLUDED.legal_manager_percent,
        post_sale_coordinator_percent = EXCLUDED.post_sale_coordinator_percent,
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
        config.sale_pool_total_percent,
        config.sale_manager_percent,
        config.deal_owner_percent,
        config.external_advisor_percent || null,
        config.operations_coordinator_percent || 0,
        config.marketing_percent || 0,
        config.legal_manager_percent,
        config.post_sale_coordinator_percent,
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
  configKey: 'operations_coordinator_percent' | 'marketing_percent',
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
        phase, percent_assigned, amount_calculated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        distribution.sale_id,
        distribution.role_type,
        distribution.person_name,
        distribution.person_id || null,
        distribution.phase,
        distribution.percent_assigned,
        distribution.amount_calculated,
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

