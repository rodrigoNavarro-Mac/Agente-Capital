/**
 * =====================================================
 * MÃ“DULO: Base de Datos de Comisiones
 * =====================================================
 * Funciones para interactuar con las tablas de comisiones
 */

import { query, getClient } from './postgres';
import { logger } from '@/lib/utils/logger';
import { getProductPartnersFromDeal } from '@/lib/services/zoho-crm';
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
  CommissionSalesTarget,
  CommissionSalesTargetInput,
  ProductPartner,
  ProductPartnerInput,
} from '@/types/commissions';

// =====================================================
// FUNCIONES AUXILIARES DE NORMALIZACIÃ“N
// =====================================================

/**
 * Normaliza el nombre de un desarrollo para bÃºsquedas en la base de datos
 * Maneja casos especiales como "P. Quintana Roo" / "qroo" que deben ser tratados como el mismo desarrollo
 * Esta funciÃ³n normaliza a un formato consistente para comparaciones en BD
 */
function normalizeDevelopmentForDB(desarrollo: string): string {
  if (!desarrollo || typeof desarrollo !== 'string') return desarrollo;
  const trimmed = desarrollo.trim().toLowerCase();

  // Caso especial: "qroo" y "P. Quintana Roo" se normalizan a "p. quintana roo"
  if (trimmed === 'qroo' || trimmed === 'p. quintana roo' || trimmed === 'p quintana roo') {
    return 'p. quintana roo';
  }

  return trimmed;
}

// =====================================================
// CONFIGURACIÃ“N
// =====================================================

/**
 * Obtiene la configuraciÃ³n de comisiones para un desarrollo
 * Normaliza el nombre del desarrollo para hacer la bÃºsqueda case-insensitive
 * Maneja casos especiales como "P. Quintana Roo" / "qroo"
 */
export async function getCommissionConfig(
  desarrollo: string
): Promise<CommissionConfig | null> {
  try {
    // Normalizar desarrollo para bÃºsqueda (incluye manejo de casos especiales)
    const normalizedDesarrollo = normalizeDevelopmentForDB(desarrollo);

    // Buscar con normalizaciÃ³n: primero intentar con el nombre normalizado exacto
    // Luego buscar variaciones de "P. Quintana Roo" / "qroo"
    let result = await query<CommissionConfig>(
      `SELECT * FROM commission_configs 
       WHERE LOWER(TRIM(desarrollo)) = $1 
          OR (LOWER(TRIM(desarrollo)) IN ('qroo', 'p. quintana roo', 'p quintana roo') 
              AND $1 IN ('qroo', 'p. quintana roo', 'p quintana roo'))`,
      [normalizedDesarrollo]
    );

    // Si no se encontrÃ³, intentar buscar cualquier variaciÃ³n de "P. Quintana Roo" / "qroo"
    if (result.rows.length === 0 && normalizedDesarrollo === 'p. quintana roo') {
      result = await query<CommissionConfig>(
        `SELECT * FROM commission_configs 
         WHERE LOWER(TRIM(desarrollo)) IN ('qroo', 'p. quintana roo', 'p quintana roo')`,
        []
      );
    }

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error obteniendo configuraciÃ³n de comisiones', error, {}, 'commission-db');
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
    logger.error('Error obteniendo configuraciones de comisiones', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Crea o actualiza la configuraciÃ³n de comisiones para un desarrollo
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
    logger.error('Error guardando configuraciÃ³n de comisiones', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene la configuraciÃ³n global de roles indirectos
 */
export async function getCommissionGlobalConfigs(): Promise<CommissionGlobalConfig[]> {
  try {
    const result = await query<CommissionGlobalConfig>(
      `SELECT * FROM commission_global_configs ORDER BY config_key`
    );
    return result.rows;
  } catch (error) {
    logger.error('Error obteniendo configuraciÃ³n global de comisiones', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza la configuraciÃ³n global de roles indirectos
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
      throw new Error(`ConfiguraciÃ³n global no encontrada: ${configKey}`);
    }
    return result.rows[0];
  } catch (error) {
    logger.error('Error actualizando configuraciÃ³n global de comisiones', error, {}, 'commission-db');
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
    logger.error('Error obteniendo venta comisionable', error, {}, 'commission-db');
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
    logger.error('Error obteniendo venta comisionable por Zoho Deal ID', error, {}, 'commission-db');
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
    logger.error('Error obteniendo deals cerrados-ganados', error, {}, 'commission-db');
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
        producto = parts.slice(1).join(' - ').trim(); // Por si hay mÃºltiples " - " en el producto
      } else if (parts.length === 1) {
        // Si no tiene el formato, usar todo como nombre del cliente
        clienteNombre = parts[0].trim();
      }
    }

    // Si no se pudo extraer del Deal_Name, usar Account_Name como fallback
    if (clienteNombre === 'Cliente sin nombre' && deal.Account_Name?.name) {
      clienteNombre = deal.Account_Name.name;
    }

    // Normalizar desarrollo: trim + lowercase para consistencia con la configuraciÃ³n
    const desarrollo = (deal.Desarrollo || deal.Desarollo || null)?.trim().toLowerCase() || null;
    const propietarioDeal = deal.Owner?.name || 'Sin propietario';
    const propietarioDealId = deal.Owner?.id || null;
    const valorTotal = deal.Amount || 0;
    const closingDate = deal.Closing_Date || null;

    // Extraer campos adicionales del JSONB data (buscar en mÃºltiples variantes de nombres)
    // Buscar plazo_deal en mÃºltiples variantes posibles de nombres de campos en Zoho
    // El campo correcto en Zoho es "Plazos" (API name: Plazos) - viene como nÃºmero
    let plazoDeal: string | null = null;

    // Buscar el campo "Plazos" primero (es el correcto en Zoho CRM)
    if (deal.Plazos !== null && deal.Plazos !== undefined) {
      // Convertir a string si viene como nÃºmero (el campo en Zoho es tipo "NÃºmero")
      plazoDeal = String(deal.Plazos);
    } else if ((deal as any)?.Plazos !== null && (deal as any)?.Plazos !== undefined) {
      plazoDeal = String((deal as any).Plazos);
    } else {
      // Fallback a otras variantes
      const plazoValue = deal.Plazo ||
        deal.Plazo_Deal ||
        deal.Plazo_de_Deal ||
        deal.Plazo_De_Deal ||
        deal.Plazo_Deal_Numero ||
        deal.Plazo_Numero ||
        deal.Plazo_Meses ||
        deal.Plazo_en_Meses ||
        deal.Payment_Terms ||
        deal.Terms ||
        deal.Plazo_Pago ||
        (deal as any)?.Plazo ||
        (deal as any)?.plazo ||
        null;

      if (plazoValue !== null && plazoValue !== undefined) {
        plazoDeal = String(plazoValue);
      }
    }

    // Log para debugging si no se encuentra plazo_deal
    if (!plazoDeal) {
      logger.warn('No se encontrÃ³ plazo_deal en el deal', {
        zohoDealId: deal.id,
        dealName: deal.Deal_Name,
        // Buscar especÃ­ficamente el campo "Plazos" que es el correcto en Zoho
        tienePlazos: !!(deal.Plazos || (deal as any)?.Plazos),
        valorPlazos: deal.Plazos || (deal as any)?.Plazos,
        availableFields: Object.keys(deal).filter(k =>
          k.toLowerCase().includes('plazo') ||
          k.toLowerCase().includes('term') ||
          k.toLowerCase().includes('meses') ||
          k === 'Plazos'  // Incluir el campo correcto
        ),
        allFields: Object.keys(deal).slice(0, 30) // Primeros 30 campos para no saturar el log
      }, 'commission-db');
    } else {
      // Log cuando SÃ se encuentra para verificar que estÃ¡ funcionando
      logger.info('Plazo_deal encontrado en el deal', {
        zohoDealId: deal.id,
        dealName: deal.Deal_Name,
        plazoDeal,
        campoEncontradoEn: deal.Plazos ? 'Plazos' :
          deal.Plazo ? 'Plazo' :
            deal.Plazo_Deal ? 'Plazo_Deal' : 'otro'
      }, 'commission-db');
    }

    // Si no se extrajo producto del Deal_Name, intentar desde otros campos
    if (!producto) {
      const lote = deal.Lote || deal.Lote_Numero || null;
      const calle = deal.Calle || deal.Calle_Nombre || null;
      producto = deal.Producto || (lote && calle ? `${lote} - ${calle}` : lote || calle || null);
    }

    // Metros cuadrados - buscar en mÃºltiples campos
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
      throw new Error(`Deal ${zohoDealId} no tiene valor total vÃ¡lido`);
    }

    // Calcular metros cuadrados si no estÃ¡ disponible (usar valor por defecto o calcular)
    let m2 = metrosCuadrados;
    if (!m2 || m2 <= 0) {
      // Si no hay m2, usar un valor por defecto o intentar calcular
      // Por ahora, usar 100 m2 como valor por defecto si no estÃ¡ disponible
      m2 = 100;
    }

    // Calcular precio por mÂ²
    const precioPorM2 = Number((valorTotal / m2).toFixed(2));

    // Crear o actualizar venta comisionable
    const saleInput: CommissionSaleInput = {
      zoho_deal_id: zohoDealId,
      deal_name: dealName,
      cliente_nombre: clienteNombre,
      desarrollo: desarrollo,
      propietario_deal: propietarioDeal,
      propietario_deal_id: propietarioDealId,
      plazo_deal: plazoDeal || undefined, // Convertir null a undefined para el tipo
      producto: producto,
      metros_cuadrados: m2,
      precio_por_m2: precioPorM2,
      valor_total: valorTotal,
      fecha_firma: closingDate,
      asesor_externo: asesorExterno,
      asesor_externo_id: asesorExternoId,
    };

    // Log informaciÃ³n sobre plazo_deal al sincronizar
    if (plazoDeal) {
      logger.info('Plazo_deal encontrado al sincronizar deal', {
        zohoDealId,
        dealName,
        plazoDeal,
        saleId: null // Se asignarÃ¡ despuÃ©s
      }, 'commission-db');
    } else {
      logger.warn('Plazo_deal NO encontrado al sincronizar deal - puede afectar cÃ¡lculo de comisiones de postventa', {
        zohoDealId,
        dealName,
        desarrollo,
        clienteNombre,
        valorTotal,
        fechaFirma: closingDate,
        // Buscar campos relacionados con plazo en el deal
        camposRelacionados: Object.keys(deal).filter(k => {
          const keyLower = k.toLowerCase();
          return keyLower.includes('plazo') ||
            keyLower.includes('term') ||
            keyLower.includes('meses') ||
            keyLower.includes('pago') ||
            keyLower.includes('payment');
        }),
        // Mostrar algunos campos del deal para debugging
        sampleFields: Object.keys(deal).slice(0, 30).reduce((acc, key) => {
          if (!['id', 'Deal_Name', 'Amount', 'Stage', 'Closing_Date', 'Owner', 'Account_Name'].includes(key)) {
            acc[key] = deal[key];
          }
          return acc;
        }, {} as Record<string, any>)
      }, 'commission-db');
    }

    const sale = await upsertCommissionSale(saleInput);

    // Sincronizar socios del producto (en segundo plano, no bloquear si falla)
    try {
      logger.info(`Intentando obtener socios del producto para deal ${zohoDealId}`, {
        saleId: sale.id,
        zohoDealId,
        dealHasProductName: !!(deal.Product_Name || deal.Product_ID || deal.Products),
        productName: deal.Product_Name || deal.Product_ID || deal.Products,
      }, 'commission-db');

      const partners = await getProductPartnersFromDeal(zohoDealId);

      logger.info(`Socios obtenidos desde Zoho para deal ${zohoDealId}`, {
        saleId: sale.id,
        zohoDealId,
        partnersCount: partners?.length || 0,
        partners: partners,
      }, 'commission-db');

      if (partners && partners.length > 0) {
        const partnerInputs: ProductPartnerInput[] = partners.map(p => ({
          commission_sale_id: sale.id,
          socio_name: p.socio,
          participacion: p.participacion,
        }));
        await upsertProductPartners(sale.id, partnerInputs);
        logger.info(`Socios del producto sincronizados para venta ${sale.id}`, {
          saleId: sale.id,
          zohoDealId,
          partnersCount: partners.length,
        }, 'commission-db');
      } else {
        logger.info(`No se encontraron socios para deal ${zohoDealId}`, {
          saleId: sale.id,
          zohoDealId,
        }, 'commission-db');
      }
    } catch (partnerError) {
      // No fallar la sincronizaciÃ³n si no se pueden obtener los socios
      logger.error('Error sincronizando socios del producto (no crÃ­tico)', partnerError, {
        saleId: sale.id,
        zohoDealId,
        errorMessage: partnerError instanceof Error ? partnerError.message : String(partnerError),
        errorStack: partnerError instanceof Error ? partnerError.stack : undefined,
      }, 'commission-db');
    }

    return sale;
  } catch (error) {
    logger.error('Error sincronizando deal a venta comisionable', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Procesa todos los deals cerrados-ganados desde la BD local (zoho_deals) a commission_sales
 * TambiÃ©n sincroniza los socios del producto desde Zoho para cada venta
 */
export async function processClosedWonDealsFromLocalDB(): Promise<{
  processed: number;
  errors: number;
  errorsList: string[];
  skipped: number; // Deals que ya estaban sincronizados
  partnersSynced: number; // NÃºmero de ventas con socios sincronizados
}> {
  try {
    const deals = await getClosedWonDealsFromDB(10000); // Obtener hasta 10000 deals desde BD local
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    let partnersSynced = 0;
    const errorsList: string[] = [];

    for (const deal of deals) {
      try {
        // Verificar si ya existe en commission_sales
        const existing = await getCommissionSaleByZohoDealId(deal.id);
        if (existing) {
          // Actualizar datos si el deal cambiÃ³ (incluye sincronizaciÃ³n de socios)
          const sale = await syncDealToCommissionSale(deal);
          skipped++; // Ya existÃ­a, pero se actualizÃ³

          // Verificar si se sincronizaron socios
          const partners = await getProductPartners(sale.id);
          if (partners.length > 0) {
            partnersSynced++;
          }
        } else {
          // Crear nuevo registro (incluye sincronizaciÃ³n de socios)
          const sale = await syncDealToCommissionSale(deal);
          processed++;

          // Verificar si se sincronizaron socios
          const partners = await getProductPartners(sale.id);
          if (partners.length > 0) {
            partnersSynced++;
          }
        }
      } catch (error) {
        errors++;
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        errorsList.push(`Deal ${deal.id}: ${errorMsg}`);
        logger.error(`Error procesando deal ${deal.id}`, error, {}, 'commission-db');
      }
    }

    logger.info(`SincronizaciÃ³n completada: ${processed} nuevas, ${skipped} actualizadas, ${partnersSynced} con socios`, {
      processed,
      skipped,
      errors,
      partnersSynced,
    }, 'commission-db');

    return { processed, errors, errorsList, skipped, partnersSynced };
  } catch (error) {
    logger.error('Error procesando deals cerrados-ganados desde BD local', error, {}, 'commission-db');
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
      whereConditions.push(`cs.desarrollo = $${paramIndex}`);
      params.push(filters.desarrollo);
      paramIndex++;
    }

    if (filters?.propietario_deal) {
      whereConditions.push(`cs.propietario_deal = $${paramIndex}`);
      params.push(filters.propietario_deal);
      paramIndex++;
    }

    if (filters?.fecha_firma_from) {
      whereConditions.push(`cs.fecha_firma >= $${paramIndex}::date`);
      params.push(filters.fecha_firma_from);
      paramIndex++;
    }

    if (filters?.fecha_firma_to) {
      whereConditions.push(`cs.fecha_firma <= $${paramIndex}::date`);
      params.push(filters.fecha_firma_to);
      paramIndex++;
    }

    if (filters?.commission_calculated !== undefined) {
      whereConditions.push(`cs.commission_calculated = $${paramIndex}`);
      params.push(filters.commission_calculated);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Obtener total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM commission_sales cs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Obtener ventas
    params.push(limit, offset);
    const salesResult = await query<CommissionSale>(
      `SELECT 
         cs.*,
         COALESCE(cd.total_distributions, 0) AS total_distributions,
         COALESCE(cd.paid_distributions, 0) AS paid_distributions
       FROM commission_sales cs
       LEFT JOIN (
         SELECT 
           sale_id,
           COUNT(*) AS total_distributions,
           COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_distributions
         FROM commission_distributions
         GROUP BY sale_id
       ) cd ON cs.id = cd.sale_id
       ${whereClause}
       ORDER BY cs.fecha_firma DESC, cs.id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return {
      sales: salesResult.rows,
      total,
    };
  } catch (error) {
    logger.error('Error obteniendo ventas comisionables', error, {}, 'commission-db');
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
        plazo_deal = COALESCE(NULLIF(EXCLUDED.plazo_deal, ''), commission_sales.plazo_deal), -- Solo actualizar si hay un valor no vacÃ­o, sino mantener el existente
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
        sale.plazo_deal !== undefined ? (sale.plazo_deal || null) : null, // Preservar null explÃ­cito, pero convertir undefined a null
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
    logger.error('Error guardando venta comisionable', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza el estado de cÃ¡lculo de comisiÃ³n de una venta
 */
export async function updateCommissionSaleCalculation(
  saleId: number,
  commissionTotal: number,
  commissionSalePhase: number,
  commissionPostSalePhase: number,
  phaseSalePercent?: number | null,
  phasePostSalePercent?: number | null
): Promise<void> {
  try {
    await query(
      `UPDATE commission_sales
       SET commission_calculated = true,
           commission_total = $1,
           commission_sale_phase = $2,
           commission_post_sale_phase = $3,
           calculated_phase_sale_percent = $5,
           calculated_phase_post_sale_percent = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [commissionTotal, commissionSalePhase, commissionPostSalePhase, saleId, phaseSalePercent ?? null, phasePostSalePercent ?? null]
    );
  } catch (error) {
    logger.error('Error actualizando cÃ¡lculo de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

// =====================================================
// DISTRIBUCIONES
// =====================================================

/**
 * Obtiene las distribuciones de comisiÃ³n para una venta
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
    logger.error('Error obteniendo distribuciones de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Crea una distribuciÃ³n de comisiÃ³n
 */
export async function createCommissionDistribution(
  distribution: CommissionDistributionInput
): Promise<CommissionDistribution> {
  try {
    // El trigger de BD automáticamente establece amount_calculated en 0 si payment_status es 'NO_APLICA'

    const result = await query<CommissionDistribution>(
      `INSERT INTO commission_distributions (
        sale_id, role_type, person_name, person_id,
        phase, percent_assigned, amount_calculated, payment_status, is_cash_payment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        distribution.sale_id,
        distribution.role_type,
        distribution.person_name,
        distribution.person_id || null,
        distribution.phase,
        distribution.percent_assigned,
        distribution.amount_calculated,
        distribution.payment_status || 'SOLICITADA',
        distribution.is_cash_payment || false,
      ]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error creando distribuciÃ³n de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Crea mÃºltiples distribuciones de comisiÃ³n
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
    logger.error('Error creando distribuciones de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene una distribuciÃ³n de comisiÃ³n por ID
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
    logger.error('Error obteniendo distribuciÃ³n de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza una distribuciÃ³n de comisiÃ³n
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
      throw new Error(`DistribuciÃ³n no encontrada: ${distributionId}`);
    }
    return result.rows[0];
  } catch (error) {
    logger.error('Error actualizando distribuciÃ³n de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza el estado de pago de una distribuciÃ³n de comisiÃ³n
 */
export async function updateCommissionDistributionPaymentStatus(
  distributionId: number,
  paymentStatus: 'pending' | 'paid' | 'SOLICITADA' | 'NO_APLICA'
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
      throw new Error(`DistribuciÃ³n no encontrada: ${distributionId}`);
    }
    return result.rows[0];
  } catch (error) {
    logger.error('Error actualizando estado de pago de distribuciÃ³n', error, {}, 'commission-db');
    throw error;
  }
}



/**
 * Obtiene todas las distribuciones con informaciÃ³n de la venta
 * Ãštil para mostrar listado de comisiones a pagar
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
  plazo_deal: string | null;
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

    // Excluir distribuciones con estado NO_APLICA (no se deben mostrar en cálculos de totales)
    // Nota: Este filtro se puede remover si se desea mostrar todas las comisiones independiente de su estado
    // whereConditions.push("cd.estado != 'NO_APLICA'");

    if (filters?.desarrollo) {
      whereConditions.push(`cs.desarrollo = $${paramIndex}`);
      params.push(filters.desarrollo);
      paramIndex++;
    }

    if (filters?.year) {
      // Filtrar por ano de pago estimado:
      // - Si es venta o utilidad/bono: usar fecha_firma
      // - Si es postventa y tiene plazo: usar fecha_firma + plazo
      // - Si es postventa y NO tiene plazo: usar fecha_firma
      whereConditions.push(`
        (
          EXTRACT(YEAR FROM 
            CASE 
              WHEN cd.phase = 'post_sale' AND cs.plazo_deal IS NOT NULL AND cs.plazo_deal ~ '[0-9]+' THEN 
                (cs.fecha_firma + (CAST(SUBSTRING(cs.plazo_deal FROM '([0-9]+)') AS INTEGER) || ' months')::INTERVAL)
              ELSE 
                cs.fecha_firma 
            END
          ) = $${paramIndex}
        )
      `);
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
      plazo_deal: string | null;
    }>(
      `SELECT 
        cd.*,
        cs.producto,
        cs.fecha_firma,
        cs.cliente_nombre,
        cs.desarrollo,
        cs.plazo_deal
       FROM commission_distributions cd
       INNER JOIN commission_sales cs ON cd.sale_id = cs.id
       ${whereClause}
       ORDER BY cs.fecha_firma DESC, cd.payment_status, cd.phase, cd.role_type`,
      params
    );

    return result.rows;
  } catch (error) {
    logger.error('Error obteniendo distribuciones con informaciÃ³n de venta', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Elimina todas las distribuciones de comisiÃ³n para una venta y resetea el estado de cÃ¡lculo
 */
export async function deleteCommissionDistributions(saleId: number): Promise<void> {
  try {
    // Eliminar distribuciones
    await query(
      `DELETE FROM commission_distributions WHERE sale_id = $1`,
      [saleId]
    );

    // Resetear estado de cÃ¡lculo de la venta
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
    logger.error('Error eliminando distribuciones de comisiÃ³n', error, {}, 'commission-db');
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
    logger.error('Error creando ajuste de comisiÃ³n', error, {}, 'commission-db');
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
    logger.error('Error obteniendo ajustes de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

// =====================================================
// REGLAS DE COMISIÃ“N
// =====================================================

/**
 * Obtiene todas las reglas de comisiÃ³n para un desarrollo
 * Maneja casos especiales como "P. Quintana Roo" / "qroo"
 */
export async function getCommissionRules(desarrollo?: string): Promise<CommissionRule[]> {
  try {
    let sqlQuery = 'SELECT * FROM commission_rules';
    const params: any[] = [];

    if (desarrollo) {
      const normalizedDesarrollo = normalizeDevelopmentForDB(desarrollo);
      // Buscar con normalizaciÃ³n, incluyendo variaciones de "P. Quintana Roo" / "qroo"
      sqlQuery += ` WHERE (LOWER(TRIM(desarrollo)) = $1 
                OR (LOWER(TRIM(desarrollo)) IN ('qroo', 'p. quintana roo', 'p quintana roo') 
                    AND $1 IN ('qroo', 'p. quintana roo', 'p quintana roo')))`;
      params.push(normalizedDesarrollo);

      // Si es "P. Quintana Roo", tambiÃ©n buscar variaciones
      if (normalizedDesarrollo === 'p. quintana roo') {
        sqlQuery = 'SELECT * FROM commission_rules WHERE LOWER(TRIM(desarrollo)) IN ($1, $2, $3)';
        params.length = 0;
        params.push('qroo', 'p. quintana roo', 'p quintana roo');
      }
    }

    sqlQuery += ' ORDER BY prioridad DESC, periodo_value DESC, created_at DESC';

    const result = await query<CommissionRule>(sqlQuery, params);
    return result.rows;
  } catch (error) {
    logger.error('Error obteniendo reglas de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene una regla de comisiÃ³n por ID
 */
export async function getCommissionRule(id: number): Promise<CommissionRule | null> {
  try {
    const result = await query<CommissionRule>(
      'SELECT * FROM commission_rules WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error obteniendo regla de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Crea una nueva regla de comisiÃ³n
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
    logger.error('Error creando regla de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza una regla de comisiÃ³n existente
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
      throw new Error('Regla de comisiÃ³n no encontrada');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error actualizando regla de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Elimina una regla de comisiÃ³n
 */
export async function deleteCommissionRule(id: number): Promise<boolean> {
  try {
    const result = await query<{ count: string }>(
      'DELETE FROM commission_rules WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Error eliminando regla de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

function _fechaEstaEnPeriodo(
  fecha: string | Date,
  periodoValue: string,
  periodoType: 'trimestre' | 'mensual' | 'anual'
): boolean {
  try {
    const fechaObj = typeof fecha === 'string' ? new Date(fecha) : fecha;
    const ano = fechaObj.getFullYear();
    const mes = fechaObj.getMonth() + 1; // 1-12

    if (periodoType === 'trimestre') {
      // Puede ser formato "2025-Q1" o solo "2025"
      const matchCompleto = periodoValue.match(/^(\d{4})-Q(\d)$/);
      if (matchCompleto) {
        // Formato completo: "2025-Q1" -> ano 2025, trimestre 1 (enero-marzo)
        const anoPeriodo = parseInt(matchCompleto[1], 10);
        const trimestrePeriodo = parseInt(matchCompleto[2], 10);
        const trimestreFecha = Math.ceil(mes / 3); // 1-4
        return ano === anoPeriodo && trimestreFecha === trimestrePeriodo;
      } else {
        // Formato solo ano: "2025" -> verificar que el ano coincida
        const anoPeriodo = parseInt(periodoValue, 10);
        if (!isNaN(anoPeriodo)) {
          return ano === anoPeriodo;
        }
      }
      return false;
    } else if (periodoType === 'mensual') {
      // Formato: "2025-01" -> ano 2025, mes 1
      const match = periodoValue.match(/^(\d{4})-(\d{2})$/);
      if (!match) return false;
      const anoPeriodo = parseInt(match[1], 10);
      const mesPeriodo = parseInt(match[2], 10);
      return ano === anoPeriodo && mes === mesPeriodo;
    } else if (periodoType === 'anual') {
      // Formato: "2025" -> ano 2025
      const anoPeriodo = parseInt(periodoValue, 10);
      if (isNaN(anoPeriodo)) return false;
      return ano === anoPeriodo;
    }
    return false;
  } catch (error) {
    logger.error('Error verificando si fecha estÃ¡ en perÃ­odo', error, {}, 'commission-db');
    return false;
  }
}

/**
 * Cuenta las unidades vendidas (ventas) para un desarrollo en un perÃ­odo especÃ­fico
 * Solo cuenta ventas cuya fecha de firma estÃ© dentro del perÃ­odo especificado
 * @param desarrollo - Nombre del desarrollo
 * @param periodoValue - Valor del perÃ­odo (ej: "2025-Q1", "2025-01", "2025")
 * @param periodoType - Tipo de perÃ­odo: 'trimestre', 'mensual', 'anual'
 * @returns NÃºmero de unidades vendidas en ese perÃ­odo
 */
export async function countUnidadesVendidasEnPeriodo(
  desarrollo: string,
  periodoValue: string,
  periodoType: 'trimestre' | 'mensual' | 'anual'
): Promise<number> {
  try {
    const normalizedDesarrollo = normalizeDevelopmentForDB(desarrollo);
    let dateCondition = '';
    const params: any[] = [];

    // Construir condiciÃ³n de fecha segÃºn el tipo de perÃ­odo
    if (periodoType === 'trimestre') {
      // Formato: "2025-Q1" -> ano 2025, trimestre 1 (enero-marzo)
      const match = periodoValue.match(/^(\d{4})-Q(\d)$/);
      if (!match) {
        logger.warn(`Formato de perÃ­odo trimestral invÃ¡lido: ${periodoValue}`, {}, 'commission-db');
        return 0;
      }
      const ano = parseInt(match[1], 10);
      const trimestre = parseInt(match[2], 10);
      // Calcular rango de meses: Q1 = 1-3, Q2 = 4-6, Q3 = 7-9, Q4 = 10-12
      const mesInicio = (trimestre - 1) * 3 + 1;
      const mesFin = trimestre * 3;
      params.push(ano, mesInicio, mesFin);
      // dateCondition se construirÃ¡ despuÃ©s con los Ã­ndices correctos
    } else if (periodoType === 'mensual') {
      // Formato: "2025-01" -> ano 2025, mes 1
      const match = periodoValue.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        logger.warn(`Formato de perÃ­odo mensual invÃ¡lido: ${periodoValue}`, {}, 'commission-db');
        return 0;
      }
      const ano = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10);
      params.push(ano, mes);
    } else if (periodoType === 'anual') {
      // Formato: "2025" -> ano 2025
      const ano = parseInt(periodoValue, 10);
      if (isNaN(ano)) {
        logger.warn(`Formato de perÃ­odo anual invÃ¡lido: ${periodoValue}`, {}, 'commission-db');
        return 0;
      }
      params.push(ano);
    } else {
      logger.warn(`Tipo de perÃ­odo desconocido: ${periodoType}`, {}, 'commission-db');
      return 0;
    }

    // Contar todas las ventas en el perÃ­odo cuya fecha de firma estÃ© dentro del perÃ­odo
    // IMPORTANTE: Solo cuenta ventas cuya fecha de firma estÃ© dentro del perÃ­odo especificado
    // y que no sea una fecha futura (no mayor a la fecha actual)
    const fechaActual = new Date();
    fechaActual.setHours(23, 59, 59, 999); // Incluir todo el dÃ­a actual

    // Manejar casos especiales como "P. Quintana Roo" / "qroo"
    let result;
    if (normalizedDesarrollo === 'p. quintana roo') {
      // Construir parÃ¡metros para la consulta con variaciones de "P. Quintana Roo"
      const desarrolloParams = ['qroo', 'p. quintana roo', 'p quintana roo'];
      const desarrolloPlaceholders = desarrolloParams.map((_, i) => `$${i + 1}`).join(', ');
      const desarrolloParamCount = desarrolloParams.length;

      // Construir dateCondition con los Ã­ndices correctos (despuÃ©s de los parÃ¡metros de desarrollo)
      if (periodoType === 'trimestre') {
        dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $${desarrolloParamCount + 1} 
                         AND EXTRACT(MONTH FROM fecha_firma) >= $${desarrolloParamCount + 2} 
                         AND EXTRACT(MONTH FROM fecha_firma) <= $${desarrolloParamCount + 3}`;
      } else if (periodoType === 'mensual') {
        dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $${desarrolloParamCount + 1} 
                         AND EXTRACT(MONTH FROM fecha_firma) = $${desarrolloParamCount + 2}`;
      } else if (periodoType === 'anual') {
        dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $${desarrolloParamCount + 1}`;
      }

      const allParams = [...desarrolloParams, ...params, fechaActual.toISOString().split('T')[0]];
      const fechaParamIndex = allParams.length;

      result = await query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM commission_sales
         WHERE LOWER(TRIM(desarrollo)) IN (${desarrolloPlaceholders})
           AND ${dateCondition}
           AND fecha_firma <= $${fechaParamIndex}::date`,
        allParams
      );
    } else {
      // Construir dateCondition con los Ã­ndices correctos (despuÃ©s del parÃ¡metro de desarrollo)
      if (periodoType === 'trimestre') {
        dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $2 
                         AND EXTRACT(MONTH FROM fecha_firma) >= $3 
                         AND EXTRACT(MONTH FROM fecha_firma) <= $4`;
      } else if (periodoType === 'mensual') {
        dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $2 
                         AND EXTRACT(MONTH FROM fecha_firma) = $3`;
      } else if (periodoType === 'anual') {
        dateCondition = `EXTRACT(YEAR FROM fecha_firma) = $2`;
      }

      const allParams = [normalizedDesarrollo, ...params, fechaActual.toISOString().split('T')[0]];
      const fechaParamIndex = allParams.length;

      result = await query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM commission_sales
         WHERE LOWER(TRIM(desarrollo)) = $1
           AND ${dateCondition}
           AND fecha_firma <= $${fechaParamIndex}::date`,
        allParams
      );
    }

    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    logger.error('Error contando unidades vendidas en perÃ­odo', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene TODAS las reglas de comisiÃ³n aplicables para una venta
 * Basada en: desarrollo, perÃ­odo vigente (calculado desde fecha actual), y unidades vendidas
 * IMPORTANTE: Se aplican TODAS las reglas que cumplan las condiciones, no solo una
 * 
 * IMPORTANTE: Las reglas de tipo "trimestre" se aplican a TODOS los trimestres del ano.
 * El periodo_value para trimestres solo contiene el ano (ej: "2025"), no el trimestre especÃ­fico.
 * La regla se evalÃºa para el trimestre vigente actual segÃºn la fecha de hoy.
 * 
 * El conteo de unidades vendidas se calcula dinÃ¡micamente para cada regla
 * basÃ¡ndose en el perÃ­odo vigente actual (trimestre, mes, ano segÃºn la fecha de hoy)
 */
export async function getApplicableCommissionRules(
  desarrollo: string,
  fechaFirma: string
): Promise<CommissionRule[]> {
  try {
    const normalizedDesarrollo = normalizeDevelopmentForDB(desarrollo);

    // Usar la fecha ACTUAL (hoy) para determinar el perÃ­odo vigente
    const fechaActual = new Date();
    const _anoActual = fechaActual.getFullYear();
    const mesActual = fechaActual.getMonth() + 1; // 1-12
    const _trimestreActual = Math.ceil(mesActual / 3); // 1-4

    // Determinar el trimestre/mes/ano de la fecha de firma del deal
    const fechaFirmaObj = new Date(fechaFirma);
    const anoFirma = fechaFirmaObj.getFullYear();
    const mesFirma = fechaFirmaObj.getMonth() + 1; // 1-12
    const trimestreFirma = Math.ceil(mesFirma / 3); // 1-4

    // Obtener todas las reglas activas del desarrollo
    // Las reglas de tipo "trimestre" tienen periodo_value = ano (ej: "2025")
    // Las reglas de tipo "mensual" tienen periodo_value = ano-mes (ej: "2025-01")
    // Las reglas de tipo "anual" tienen periodo_value = ano (ej: "2025")
    // Manejar casos especiales como "P. Quintana Roo" / "qroo"
    let rulesResult;
    if (normalizedDesarrollo === 'p. quintana roo') {
      // Buscar todas las variaciones de "P. Quintana Roo" / "qroo"
      rulesResult = await query<CommissionRule>(
        `SELECT * FROM commission_rules
         WHERE LOWER(TRIM(desarrollo)) IN ('qroo', 'p. quintana roo', 'p quintana roo')
           AND activo = TRUE
         ORDER BY unidades_vendidas DESC, created_at DESC`,
        []
      );
    } else {
      rulesResult = await query<CommissionRule>(
        `SELECT * FROM commission_rules
         WHERE LOWER(TRIM(desarrollo)) = $1
           AND activo = TRUE
         ORDER BY unidades_vendidas DESC, created_at DESC`,
        [normalizedDesarrollo]
      );
    }

    const allRules = rulesResult.rows;
    const applicableRules: CommissionRule[] = [];

    for (const rule of allRules) {
      let periodoValueParaConteo = '';
      let fechaEnPeriodo = false;

      if (rule.periodo_type === 'trimestre') {
        // Para reglas trimestrales, periodo_value es solo el ano (ej: "2025")
        // La regla se aplica a todos los trimestres de ese ano
        // Verificar que el ano de la fecha de firma coincida con el ano de la regla
        const anoRegla = parseInt(rule.periodo_value, 10);
        if (isNaN(anoRegla)) {
          // Si periodo_value tiene formato "2025-Q4", extraer solo el ano
          const match = rule.periodo_value.match(/^(\d{4})/);
          if (match) {
            const anoExtraido = parseInt(match[1], 10);
            if (!isNaN(anoExtraido) && anoFirma === anoExtraido) {
              // Construir periodo_value para el trimestre actual de la fecha de firma
              periodoValueParaConteo = `${anoFirma
                } -Q${trimestreFirma} `;
              fechaEnPeriodo = true;
            }
          }
        } else if (anoFirma === anoRegla) {
          // Construir periodo_value para el trimestre de la fecha de firma
          periodoValueParaConteo = `${anoFirma} -Q${trimestreFirma} `;
          fechaEnPeriodo = true;
        }
      } else if (rule.periodo_type === 'mensual') {
        // Para reglas mensuales, periodo_value es ano-mes (ej: "2025-01")
        // Verificar que la fecha de firma estÃ© en ese mes especÃ­fico
        const match = rule.periodo_value.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const anoRegla = parseInt(match[1], 10);
          const mesRegla = parseInt(match[2], 10);
          if (anoFirma === anoRegla && mesFirma === mesRegla) {
            periodoValueParaConteo = rule.periodo_value;
            fechaEnPeriodo = true;
          }
        }
      } else if (rule.periodo_type === 'anual') {
        // Para reglas anuales, periodo_value es solo el ano (ej: "2025")
        const anoRegla = parseInt(rule.periodo_value, 10);
        if (!isNaN(anoRegla) && anoFirma === anoRegla) {
          periodoValueParaConteo = rule.periodo_value;
          fechaEnPeriodo = true;
        }
      }

      // Si la fecha de firma no estÃ¡ en el perÃ­odo de la regla, saltar esta regla
      if (!fechaEnPeriodo || !periodoValueParaConteo) {
        continue;
      }

      // Calcular unidades vendidas en el perÃ­odo especÃ­fico de la fecha de firma
      // Para trimestres: cuenta ventas en ese trimestre especÃ­fico
      // Para mensual: cuenta ventas en ese mes especÃ­fico
      // Para anual: cuenta ventas en ese ano especÃ­fico
      const unidadesVendidasEnPeriodo = await countUnidadesVendidasEnPeriodo(
        desarrollo,
        periodoValueParaConteo,
        rule.periodo_type
      );

      // Verificar si la regla cumple la condiciÃ³n segÃºn el operador
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
    logger.error('Error obteniendo reglas aplicables de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene el conteo de unidades vendidas en el perÃ­odo para todas las reglas de un desarrollo
 * Esta funciÃ³n calcula el conteo real de unidades vendidas en el perÃ­odo correspondiente
 * para cada regla, basÃ¡ndose en la fecha de firma de la venta
 * @param desarrollo - Nombre del desarrollo
 * @param fechaFirma - Fecha de firma de la venta
 * @returns Mapa de rule_id -> unidades_vendidas_en_periodo
 */
export async function getRuleUnitsCountMap(
  desarrollo: string,
  fechaFirma: string
): Promise<Map<number, number>> {
  try {
    const normalizedDesarrollo = normalizeDevelopmentForDB(desarrollo);

    // Determinar el trimestre/mes/ano de la fecha de firma del deal
    const fechaFirmaObj = new Date(fechaFirma);
    const anoFirma = fechaFirmaObj.getFullYear();
    const mesFirma = fechaFirmaObj.getMonth() + 1; // 1-12
    const trimestreFirma = Math.ceil(mesFirma / 3); // 1-4

    // Obtener todas las reglas activas del desarrollo
    // Manejar casos especiales como "P. Quintana Roo" / "qroo"
    let rulesResult;
    if (normalizedDesarrollo === 'p. quintana roo') {
      rulesResult = await query<CommissionRule>(
        `SELECT * FROM commission_rules
         WHERE LOWER(TRIM(desarrollo)) IN('qroo', 'p. quintana roo', 'p quintana roo')
           AND activo = TRUE
         ORDER BY unidades_vendidas DESC, created_at DESC`,
        []
      );
    } else {
      rulesResult = await query<CommissionRule>(
        `SELECT * FROM commission_rules
         WHERE LOWER(TRIM(desarrollo)) = $1
           AND activo = TRUE
         ORDER BY unidades_vendidas DESC, created_at DESC`,
        [normalizedDesarrollo]
      );
    }

    const allRules = rulesResult.rows;
    const unitsCountMap = new Map<number, number>();

    for (const rule of allRules) {
      let periodoValueParaConteo = '';
      let fechaEnPeriodo = false;

      if (rule.periodo_type === 'trimestre') {
        // Para reglas trimestrales, periodo_value es solo el ano (ej: "2025")
        // La regla se aplica a todos los trimestres de ese ano
        const anoRegla = parseInt(rule.periodo_value, 10);
        if (isNaN(anoRegla)) {
          // Si periodo_value tiene formato "2025-Q4", extraer solo el ano
          const match = rule.periodo_value.match(/^(\d{4})/);
          if (match) {
            const anoExtraido = parseInt(match[1], 10);
            if (!isNaN(anoExtraido) && anoFirma === anoExtraido) {
              periodoValueParaConteo = `${anoFirma} -Q${trimestreFirma} `;
              fechaEnPeriodo = true;
            }
          }
        } else if (anoFirma === anoRegla) {
          periodoValueParaConteo = `${anoFirma} -Q${trimestreFirma} `;
          fechaEnPeriodo = true;
        }
      } else if (rule.periodo_type === 'mensual') {
        // Para reglas mensuales, periodo_value es ano-mes (ej: "2025-01")
        const match = rule.periodo_value.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const anoRegla = parseInt(match[1], 10);
          const mesRegla = parseInt(match[2], 10);
          if (anoFirma === anoRegla && mesFirma === mesRegla) {
            periodoValueParaConteo = rule.periodo_value;
            fechaEnPeriodo = true;
          }
        }
      } else if (rule.periodo_type === 'anual') {
        // Para reglas anuales, periodo_value es solo el ano (ej: "2025")
        const anoRegla = parseInt(rule.periodo_value, 10);
        if (!isNaN(anoRegla) && anoFirma === anoRegla) {
          periodoValueParaConteo = rule.periodo_value;
          fechaEnPeriodo = true;
        }
      }

      // Si la fecha de firma estÃ¡ en el perÃ­odo de la regla, calcular el conteo
      if (fechaEnPeriodo && periodoValueParaConteo) {
        const unidadesVendidasEnPeriodo = await countUnidadesVendidasEnPeriodo(
          desarrollo,
          periodoValueParaConteo,
          rule.periodo_type
        );
        unitsCountMap.set(rule.id, unidadesVendidasEnPeriodo);
      } else {
        // Si la fecha no estÃ¡ en el perÃ­odo, establecer conteo en 0
        unitsCountMap.set(rule.id, 0);
      }
    }

    return unitsCountMap;
  } catch (error) {
    logger.error('Error obteniendo conteo de unidades por regla', error, {}, 'commission-db');
    throw error;
  }
}

// =====================================================
// METAS DE COMISIÃ“N
// =====================================================

/**
 * Obtiene todas las metas de comisiÃ³n para un ano
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
    logger.error('Error obteniendo metas de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene la meta de comisiÃ³n para un mes y ano especÃ­ficos
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
    logger.error('Error obteniendo meta de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Crea o actualiza una meta de comisiÃ³n
 */
export async function upsertCommissionBillingTarget(
  target: CommissionBillingTargetInput,
  userId: number
): Promise<CommissionBillingTarget> {
  try {
    const result = await query<CommissionBillingTarget>(
      `INSERT INTO commission_billing_targets(
              year, month, target_amount, created_by, updated_by
            ) VALUES($1, $2, $3, $4, $4)
      ON CONFLICT(year, month) DO UPDATE SET
            target_amount = EXCLUDED.target_amount,
              updated_by = EXCLUDED.updated_by,
              updated_at = CURRENT_TIMESTAMP
            RETURNING * `,
      [target.year, target.month, target.target_amount, userId]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error guardando meta de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Elimina una meta de comisiÃ³n
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
    logger.error('Error eliminando meta de comisiÃ³n', error, {}, 'commission-db');
    throw error;
  }
}

// =====================================================
// METAS DE VENTAS
// =====================================================

/**
 * Obtiene todas las metas de ventas para un ano
 */
export async function getCommissionSalesTargets(
  year: number
): Promise<CommissionSalesTarget[]> {
  try {
    const result = await query<CommissionSalesTarget>(
      `SELECT * FROM commission_sales_targets 
       WHERE year = $1 
       ORDER BY month`,
      [year]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error obteniendo metas de ventas', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene la meta de ventas para un mes y ano especÃ­ficos
 */
export async function getCommissionSalesTarget(
  year: number,
  month: number
): Promise<CommissionSalesTarget | null> {
  try {
    const result = await query<CommissionSalesTarget>(
      `SELECT * FROM commission_sales_targets 
       WHERE year = $1 AND month = $2`,
      [year, month]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error obteniendo meta de ventas', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Crea o actualiza una meta de ventas
 */
export async function upsertCommissionSalesTarget(
  target: CommissionSalesTargetInput,
  userId: number
): Promise<CommissionSalesTarget> {
  try {
    const result = await query<CommissionSalesTarget>(
      `INSERT INTO commission_sales_targets(
              year, month, target_amount, created_by, updated_by
            ) VALUES($1, $2, $3, $4, $4)
      ON CONFLICT(year, month) DO UPDATE SET
            target_amount = EXCLUDED.target_amount,
              updated_by = EXCLUDED.updated_by,
              updated_at = CURRENT_TIMESTAMP
            RETURNING * `,
      [target.year, target.month, target.target_amount, userId]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error guardando meta de ventas', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Elimina una meta de ventas
 */
export async function deleteCommissionSalesTarget(
  year: number,
  month: number
): Promise<boolean> {
  try {
    const result = await query(
      `DELETE FROM commission_sales_targets 
       WHERE year = $1 AND month = $2`,
      [year, month]
    );
    return (result.rowCount || 0) > 0;
  } catch (error) {
    logger.error('Error eliminando meta de ventas', error, {}, 'commission-db');
    throw error;
  }
}

// =====================================================
// SOCIOS DEL PRODUCTO
// =====================================================

/**
 * Guarda o actualiza los socios del producto para una venta comisionable
 */
export async function upsertProductPartners(
  saleId: number,
  partners: ProductPartnerInput[]
): Promise<ProductPartner[]> {
  try {
    // Primero, eliminar los socios existentes para esta venta
    await query(
      `DELETE FROM commission_product_partners WHERE commission_sale_id = $1`,
      [saleId]
    );

    // Si no hay socios, retornar array vacÃ­o
    if (!partners || partners.length === 0) {
      return [];
    }

    // Insertar los nuevos socios
    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const partner of partners) {
      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
      params.push(
        saleId,
        partner.zoho_product_id || null,
        partner.socio_name,
        partner.participacion
      );
      paramIndex += 4;
    }

    const result = await query<ProductPartner>(
      `INSERT INTO commission_product_partners(
              commission_sale_id, zoho_product_id, socio_name, participacion
            ) VALUES ${values.join(', ')}
          RETURNING * `,
      params
    );

    return result.rows;
  } catch (error) {
    logger.error('Error guardando socios del producto', error, { saleId }, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene los socios del producto para una venta comisionable
 */
export async function getProductPartners(
  saleId: number
): Promise<ProductPartner[]> {
  try {
    const result = await query<ProductPartner>(
      `SELECT * FROM commission_product_partners
       WHERE commission_sale_id = $1
       ORDER BY participacion DESC, socio_name ASC`,
      [saleId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error obteniendo socios del producto', error, { saleId }, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene los socios del producto para mÃºltiples ventas
 */
export async function getProductPartnersForSales(
  saleIds: number[]
): Promise<Record<number, ProductPartner[]>> {
  try {
    if (saleIds.length === 0) {
      return {};
    }

    const result = await query<ProductPartner>(
      `SELECT * FROM commission_product_partners
       WHERE commission_sale_id = ANY($1:: int[])
       ORDER BY commission_sale_id, participacion DESC, socio_name ASC`,
      [saleIds]
    );

    // Agrupar por sale_id
    const partnersMap: Record<number, ProductPartner[]> = {};
    for (const partner of result.rows) {
      if (!partnersMap[partner.commission_sale_id]) {
        partnersMap[partner.commission_sale_id] = [];
      }
      partnersMap[partner.commission_sale_id].push(partner);
    }

    return partnersMap;
  } catch (error) {
    logger.error('Error obteniendo socios del producto para mÃºltiples ventas', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene las comisiones por socio (100% de venta + posventa)
 * Retorna un array con las comisiones que se deben cobrar a cada socio
 */
export async function getCommissionsByPartner(
  filters?: {
    desarrollo?: string;
    year?: number;
    month?: number;
  }
): Promise<Array<{
  socio_name: string;
  concepto: string;
  producto: string | null;
  cliente_nombre: string;
  desarrollo: string;
  total_comision: number;
  iva: number;
  total_con_iva: number;
  participacion: number;
  sale_id: number;
  month: number;
  fecha_firma: string;
}>> {
  try {
    // Construir query base para obtener ventas con comisiones calculadas
    // IMPORTANTE: Usar valor_total y porcentajes guardados para calcular lo que se cobra al socio
    // NO usar commission_sale_phase ni commission_post_sale_phase que son valores de egresos (lo que se paga al equipo)
    let queryText = `
          SELECT
          cs.id as sale_id,
            cs.cliente_nombre,
            cs.desarrollo,
            cs.producto,
            cs.valor_total,
            cs.calculated_phase_sale_percent,
            cs.calculated_phase_post_sale_percent,
            cs.commission_sale_phase,
            cs.commission_post_sale_phase,
            cs.fecha_firma,
            EXTRACT(MONTH FROM cs.fecha_firma):: INTEGER as month,
              cpp.socio_name,
              cpp.participacion
      FROM commission_sales cs
      INNER JOIN commission_product_partners cpp ON cs.id = cpp.commission_sale_id
      WHERE cs.commission_calculated = true
            `;

    const params: any[] = [];
    let paramIndex = 1;

    // Agregar filtros
    if (filters?.desarrollo) {
      queryText += ` AND cs.desarrollo = $${paramIndex} `;
      params.push(filters.desarrollo);
      paramIndex++;
    }

    if (filters?.year) {
      queryText += ` AND EXTRACT(YEAR FROM cs.fecha_firma) = $${paramIndex} `;
      params.push(filters.year);
      paramIndex++;
    }

    if (filters?.month) {
      queryText += ` AND EXTRACT(MONTH FROM cs.fecha_firma) = $${paramIndex} `;
      params.push(filters.month);
      paramIndex++;
    }

    queryText += ` ORDER BY month, cpp.socio_name, cs.fecha_firma`;

    const result = await query<{
      sale_id: number;
      cliente_nombre: string;
      desarrollo: string;
      producto: string | null;
      valor_total: number;
      calculated_phase_sale_percent: number | null;
      calculated_phase_post_sale_percent: number | null;
      commission_sale_phase: number;
      commission_post_sale_phase: number;
      socio_name: string;
      participacion: number;
      month: number;
      fecha_firma: string;
    }>(queryText, params);

    // Obtener porcentaje de IVA (por defecto 16% - IVA estÃ¡ndar en MÃ©xico)
    // Se puede configurar con la variable de entorno IVA_PERCENT, por defecto 16
    const ivaPercent = parseFloat(process.env.IVA_PERCENT || '16');

    // Calcular comisiones por socio
    const commissionsByPartner = result.rows.map(row => {
      // Calcular montos de fase usando valor_total y porcentajes guardados (lo que se cobra al socio)
      // Si no hay porcentajes guardados, usar los valores de egresos como fallback (comportamiento legacy)
      const valorTotal = Number(row.valor_total || 0);
      const phaseSalePercent = Number(row.calculated_phase_sale_percent || 0);
      const phasePostSalePercent = Number(row.calculated_phase_post_sale_percent || 0);

      let salePhaseAmount: number;
      let postSalePhaseAmount: number;

      if (phaseSalePercent > 0 && phasePostSalePercent > 0) {
        // Calcular desde la configuraciÃ³n: valor_total * porcentaje / 100
        salePhaseAmount = Number(((valorTotal * phaseSalePercent) / 100).toFixed(2));
        postSalePhaseAmount = Number(((valorTotal * phasePostSalePercent) / 100).toFixed(2));
      } else {
        // Fallback: usar los montos ya calculados en commission_sales (comportamiento legacy)
        salePhaseAmount = Number(row.commission_sale_phase || 0);
        postSalePhaseAmount = Number(row.commission_post_sale_phase || 0);
      }

      // Calcular el total de comisiÃ³n (venta + posventa)
      const totalCommission = salePhaseAmount + postSalePhaseAmount;

      // Calcular la comisiÃ³n que corresponde al socio segÃºn su participaciÃ³n
      const participacion = Number(row.participacion || 0);
      const comisionSocio = Number(((totalCommission * participacion) / 100).toFixed(2));

      // Calcular IVA sobre la comisiÃ³n del socio
      const iva = Number(((comisionSocio * ivaPercent) / 100).toFixed(2));

      // Calcular total con IVA
      const totalConIva = Number((comisionSocio + iva).toFixed(2));

      // Generar el concepto: "ComisiÃ³n por venta {Producto} de desarrollo {Desarrollo}"
      const producto = row.producto || 'N/A';
      const desarrollo = row.desarrollo || 'N/A';
      const concepto = `ComisiÃ³n por venta ${producto} de desarrollo ${desarrollo} `;

      return {
        socio_name: row.socio_name,
        concepto,
        producto: row.producto,
        cliente_nombre: row.cliente_nombre,
        desarrollo: row.desarrollo,
        total_comision: comisionSocio,
        iva: iva,
        total_con_iva: totalConIva,
        participacion,
        sale_id: row.sale_id,
        month: row.month,
        fecha_firma: row.fecha_firma,
      };
    });

    return commissionsByPartner;
  } catch (error) {
    logger.error('Error obteniendo comisiones por socio', error, filters, 'commission-db');
    throw error;
  }
}

// =====================================================
// FUNCIONES PARA FLUJOS SEPARADOS (NUEVO)
// =====================================================

/**
 * Procesa un evento de Zoho Projects
 */
export async function processZohoProjectsEvent(
  eventData: {
    event_type: 'post_sale_trigger';
    zoho_project_id?: string;
    zoho_task_id?: string;
    commission_sale_id?: number;
    event_data?: any;
  },
  _processedBy: number
): Promise<{
  event_id: number;
  processed: boolean;
  message: string;
}> {
  try {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Insertar el evento
      const eventResult = await client.query(`
        INSERT INTO zoho_projects_events(
              event_type, zoho_project_id, zoho_task_id,
              commission_sale_id, event_data, processing_status
            ) VALUES($1, $2, $3, $4, $5, 'pending')
        RETURNING id
            `, [
        eventData.event_type,
        eventData.zoho_project_id || null,
        eventData.zoho_task_id || null,
        eventData.commission_sale_id || null,
        eventData.event_data ? JSON.stringify(eventData.event_data) : null
      ]);

      const eventId = eventResult.rows[0].id;
      let processed = false;
      let message = 'Evento registrado pero no procesado';

      // Procesar segÃºn el tipo de evento
      if (eventData.event_type === 'post_sale_trigger' && eventData.commission_sale_id) {
        try {
          // Llamar a la funciÃ³n de PostgreSQL para procesar el trigger
          const triggerResult = await client.query(`
            SELECT process_post_sale_trigger($1, 'zoho_projects') as processed
          `, [eventData.commission_sale_id]);

          processed = triggerResult.rows[0].processed;

          if (processed) {
            message = 'Postventa activada correctamente por Zoho Projects';
          } else {
            message = 'La postventa ya estaba activada';
          }

          // Marcar evento como procesado
          await client.query(`
            UPDATE zoho_projects_events
            SET processing_status = 'processed', processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `, [eventId]);

        } catch (triggerError) {
          // Marcar evento como fallido
          await client.query(`
            UPDATE zoho_projects_events
            SET processing_status = 'failed',
            processing_error = $2,
            processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `, [eventId, triggerError instanceof Error ? triggerError.message : 'Error desconocido']);

          throw triggerError;
        }
      }

      await client.query('COMMIT');

      return {
        event_id: eventId,
        processed,
        message
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error procesando evento de Zoho Projects', error, eventData, 'commission-db');
    throw error;
  }
}

/**
 * Calcula comisiones para socios (flujo de ingresos)
 */
export async function calculatePartnerCommissions(
  saleId: number,
  calculatedBy?: number
): Promise<{
  partner_commissions: Array<{
    socio_name: string;
    participacion: number;
    total_commission_amount: number;
    sale_phase_amount: number;
    post_sale_phase_amount: number;
    collection_status: string;
  }>;
  total_partners: number;
}> {
  try {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Obtener informaciÃ³n de la venta para logging
      const saleInfoResult = await client.query(`
          SELECT
          valor_total,
            calculated_phase_sale_percent,
            calculated_phase_post_sale_percent,
            commission_sale_phase,
            commission_post_sale_phase
        FROM commission_sales
        WHERE id = $1
            `, [saleId]);

      if (saleInfoResult.rows.length > 0) {
        const saleInfo = saleInfoResult.rows[0];
        logger.info('Calculando comisiones por socio desde configuraciÃ³n', {
          saleId,
          valorTotal: saleInfo.valor_total,
          phaseSalePercent: saleInfo.calculated_phase_sale_percent,
          phasePostSalePercent: saleInfo.calculated_phase_post_sale_percent,
          salePhaseAmountFromDB: saleInfo.commission_sale_phase,
          postSalePhaseAmountFromDB: saleInfo.commission_post_sale_phase,
          calculatedBy
        }, 'commission-db');
      }

      // Llamar a la funciÃ³n de PostgreSQL
      const result = await client.query(`
        SELECT calculate_partner_commissions($1, $2) as partners_count
          `, [saleId, calculatedBy || null]);

      const partnersCount = result.rows[0].partners_count;

      // Obtener las comisiones calculadas
      const commissionsResult = await client.query(`
          SELECT
          socio_name,
            participacion,
            total_commission_amount,
            sale_phase_amount,
            post_sale_phase_amount,
            collection_status
        FROM partner_commissions
        WHERE commission_sale_id = $1
        ORDER BY socio_name
            `, [saleId]);

      logger.info('Comisiones por socio calculadas', {
        saleId,
        partnersCount,
        commissions: commissionsResult.rows.map(c => ({
          socio: c.socio_name,
          participacion: c.participacion,
          salePhaseAmount: c.sale_phase_amount,
          postSalePhaseAmount: c.post_sale_phase_amount,
          totalAmount: c.total_commission_amount
        }))
      }, 'commission-db');

      await client.query('COMMIT');

      return {
        partner_commissions: commissionsResult.rows.map(row => ({
          socio_name: row.socio_name,
          participacion: Number(row.participacion),
          total_commission_amount: Number(row.total_commission_amount),
          sale_phase_amount: Number(row.sale_phase_amount),
          post_sale_phase_amount: Number(row.post_sale_phase_amount),
          collection_status: row.collection_status
        })),
        total_partners: partnersCount
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error calculando comisiones para socios', error, { saleId, calculatedBy }, 'commission-db');
    throw error;
  }
}

/**
 * Obtiene comisiones de socios con informaciÃ³n completa
 */
export async function getPartnerCommissions(
  filters?: {
    commission_sale_id?: number;
    socio_name?: string;
    collection_status?: string;
    desarrollo?: string;
    fecha_firma_from?: string;
    fecha_firma_to?: string;
    phase?: 'sale-phase' | 'post-sale-phase';
    includeHidden?: boolean;
  }
): Promise<Array<{
  id: number;
  commission_sale_id: number;
  socio_name: string;
  participacion: number;
  total_commission_amount: number;
  sale_phase_amount: number;
  post_sale_phase_amount: number;
  collection_status: string;
  sale_phase_collection_status: string;
  post_sale_phase_collection_status: string;
  sale_phase_is_cash_payment: boolean;
  post_sale_phase_is_cash_payment: boolean;
  calculated_at: string;
  sale_info?: {
    cliente_nombre: string;
    desarrollo: string;
    fecha_firma: string;
    valor_total: number | null;
    calculated_phase_post_sale_percent: number | null;
    calculated_phase_sale_percent: number | null;
    producto: string | null;
    plazo_deal: string | null;
  };
}>> {
  try {
    const client = await getClient();

    let queryText = `
          SELECT
          pc.*,
            cs.cliente_nombre,
            cs.desarrollo,
            cs.fecha_firma,
            cs.valor_total,
            cs.calculated_phase_sale_percent,
            cs.calculated_phase_post_sale_percent,
            cs.producto,
            cs.plazo_deal
      FROM partner_commissions pc
      INNER JOIN commission_sales cs ON pc.commission_sale_id = cs.id
      WHERE 1 = 1
            `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.commission_sale_id) {
      queryText += ` AND pc.commission_sale_id = $${paramIndex} `;
      params.push(filters.commission_sale_id);
      paramIndex++;
    }

    if (filters?.socio_name) {
      queryText += ` AND pc.socio_name ILIKE $${paramIndex} `;
      params.push(`% ${filters.socio_name}% `);
      paramIndex++;
    }

    if (filters?.collection_status) {
      // Usar el estado especÃ­fico de la fase si estamos filtrando por fase
      // Si es fase venta, usar sale_phase_collection_status
      // Si es fase postventa, usar post_sale_phase_collection_status
      // Si no hay fase especÃ­fica, usar collection_status como fallback
      if (filters?.phase === 'sale-phase') {
        queryText += ` AND COALESCE(pc.sale_phase_collection_status, pc.collection_status) = $${paramIndex} `;
      } else if (filters?.phase === 'post-sale-phase') {
        queryText += ` AND COALESCE(pc.post_sale_phase_collection_status, pc.collection_status) = $${paramIndex} `;
      } else {
        queryText += ` AND pc.collection_status = $${paramIndex} `;
      }
      params.push(filters.collection_status);
      paramIndex++;
    }

    if (filters?.desarrollo) {
      queryText += ` AND cs.desarrollo = $${paramIndex} `;
      params.push(filters.desarrollo);
      paramIndex++;
    }

    // Filtrar socios ocultos si no se solicitan explÃ­citamente
    if (!filters?.includeHidden) {
      queryText += ` AND pc.socio_name NOT IN(SELECT socio_name FROM commission_hidden_partners)`;
    }

    // Para filtros de fecha, usar la fecha correspondiente segÃºn la fase
    // - Fase venta: usar fecha_firma
    // - Fase postventa: usar fecha_escrituracion (fecha_firma + plazo_deal en meses)
    if (filters?.fecha_firma_from || filters?.fecha_firma_to) {
      const fechaFrom = filters?.fecha_firma_from || '1900-01-01';
      const fechaTo = filters?.fecha_firma_to || '9999-12-31';

      logger.info('Aplicando filtro de fecha en getPartnerCommissions', {
        phase: filters?.phase,
        fechaFrom,
        fechaTo,
        hasPostSaleCollectedAt: 'post_sale_phase_collected_at' in (queryText.match(/post_sale_phase_collected_at/g) || []),
      }, 'commission-db');

      if (filters?.phase === 'post-sale-phase') {
        // Fase postventa: solo mostrar si tiene monto de postventa > 0
        // Filtrar estrictamente por fecha de escrituraciÃ³n (fecha_firma + plazo)
        // Esto alinea el filtro con la agrupaciÃ³n visual en el frontend
        queryText += ` AND pc.post_sale_phase_amount > 0 AND(
              --Si tiene plazo_deal, usar fecha de escrituraciÃ³n calculada
              (cs.fecha_firma IS NOT NULL
           AND cs.plazo_deal IS NOT NULL 
           AND cs.plazo_deal ~ '^[0-9]+'
           AND(
                cs.fecha_firma +
                (CAST(SUBSTRING(cs.plazo_deal FROM '^([0-9]+)') AS INTEGER) || ' months'):: INTERVAL
              ) >= $${paramIndex}
           AND(
                cs.fecha_firma +
                (CAST(SUBSTRING(cs.plazo_deal FROM '^([0-9]+)') AS INTEGER) || ' months'):: INTERVAL
              ) <= $${paramIndex + 1})
        OR
        --Si no tiene plazo_deal(es contado), usar fecha_firma
          (cs.fecha_firma IS NOT NULL
           AND(cs.plazo_deal IS NULL OR cs.plazo_deal = '' OR cs.plazo_deal!~ '^[0-9]+')
           AND cs.fecha_firma >= $${paramIndex}
           AND cs.fecha_firma <= $${paramIndex + 1})
        )`;
      } else {
        // Fase venta: filtrar estrictamente por fecha de firma
        // Esto alinea el filtro con la agrupaciÃ³n visual en el frontend
        queryText += ` AND(
            cs.fecha_firma >= $${paramIndex} 
           AND cs.fecha_firma <= $${paramIndex + 1}
        )`;
      }
      params.push(fechaFrom, fechaTo);
      paramIndex += 2;
    }

    queryText += ` ORDER BY pc.created_at DESC`;

    logger.info('Ejecutando consulta getPartnerCommissions', {
      query: queryText.substring(0, 1000) + (queryText.length > 1000 ? '...' : ''),
      params: params,
      filters: filters,
      phase: filters?.phase,
      fechaFrom: filters?.fecha_firma_from,
      fechaTo: filters?.fecha_firma_to,
    }, 'commission-db');

    const result = await client.query(queryText, params);

    // Consulta de diagnÃ³stico para verificar valores de plazo_deal en commission_sales
    if (result.rows.length > 0) {
      const diagnosticClient = await getClient();
      const saleIdsSet = new Set(result.rows.map(r => r.commission_sale_id));
      const saleIds = Array.from(saleIdsSet);
      if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1} `).join(',');
        const plazoDealCheck = await diagnosticClient.query(
          `SELECT id, zoho_deal_id, plazo_deal, plazo_deal IS NULL as is_null, plazo_deal = '' as is_empty 
           FROM commission_sales 
           WHERE id IN(${placeholders})`,
          saleIds
        );
        diagnosticClient.release();

        logger.info('VerificaciÃ³n de plazo_deal en commission_sales', {
          totalSales: saleIds.length,
          salesConPlazo: plazoDealCheck.rows.filter(r => r.plazo_deal !== null && r.plazo_deal !== '').length,
          salesSinPlazo: plazoDealCheck.rows.filter(r => r.plazo_deal === null || r.plazo_deal === '').length,
          detalles: plazoDealCheck.rows.map(r => ({
            id: r.id,
            zoho_deal_id: r.zoho_deal_id,
            plazo_deal: r.plazo_deal,
            is_null: r.is_null,
            is_empty: r.is_empty,
            tipo: typeof r.plazo_deal
          }))
        }, 'commission-db');
      }
    }

    // Consulta real para obtener datos
    logger.info('Ejecutando consulta final getPartnerCommissions', { query: queryText }, 'commission-db');
    const commissionsResult = await client.query(queryText, params);
    client.release();

    const commissions = commissionsResult.rows.map(row => {
      // Convertir valores numÃ©ricos, manejando null y undefined correctamente
      const valorTotal = row.valor_total != null ? Number(row.valor_total) : null;
      const postSalePercent = row.calculated_phase_post_sale_percent != null
        ? Number(row.calculated_phase_post_sale_percent)
        : null;
      const salePercent = row.calculated_phase_sale_percent != null
        ? Number(row.calculated_phase_sale_percent)
        : null;

      const saleInfo = {
        cliente_nombre: row.cliente_nombre,
        desarrollo: row.desarrollo,
        fecha_firma: row.fecha_firma,
        valor_total: valorTotal,
        calculated_phase_post_sale_percent: postSalePercent,
        calculated_phase_sale_percent: salePercent,
        producto: row.producto,
        plazo_deal: row.plazo_deal
      };

      return {
        id: row.id,
        commission_sale_id: row.commission_sale_id,
        socio_name: row.socio_name,
        participacion: Number(row.participacion),
        total_commission_amount: Number(row.total_commission_amount),
        sale_phase_amount: Number(row.sale_phase_amount),
        post_sale_phase_amount: Number(row.post_sale_phase_amount),
        collection_status: row.collection_status,
        sale_phase_collection_status: row.sale_phase_collection_status || row.collection_status,
        post_sale_phase_collection_status: row.post_sale_phase_collection_status || row.collection_status,

        // Banderas de pago en efectivo
        sale_phase_is_cash_payment: row.sale_phase_is_cash_payment || false,
        post_sale_phase_is_cash_payment: row.post_sale_phase_is_cash_payment || false,

        calculated_at: row.calculated_at,
        sale_info: saleInfo
      };
    });

    return commissions;

  } catch (error) {
    logger.error('Error obteniendo comisiones de socios', error, filters, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza el estado de cobro de una comisiÃ³n a socio por fase
 * Guarda la fecha de cobro cuando el estado cambia a 'collected'
 */
export async function updatePartnerCommissionStatus(
  partnerCommissionId: number,
  newStatus: 'pending_invoice' | 'invoiced' | 'collected',
  updatedBy: number,
  phase: 'sale_phase' | 'post_sale_phase' = 'sale_phase'
): Promise<void> {
  try {
    const client = await getClient();

    // Actualizar el estado segÃºn la fase especificada
    // Si el estado es 'collected', guardar la fecha de cobro
    if (phase === 'post_sale_phase') {
      if (newStatus === 'collected') {
        await client.query(`
          UPDATE partner_commissions
    SET
    post_sale_phase_collection_status = $1,
      post_sale_phase_collected_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
      `, [newStatus, partnerCommissionId]);
      } else {
        // Si cambia a otro estado, limpiar la fecha de cobro
        await client.query(`
          UPDATE partner_commissions
    SET
    post_sale_phase_collection_status = $1,
      post_sale_phase_collected_at = NULL,
      updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
      `, [newStatus, partnerCommissionId]);
      }
    } else {
      if (newStatus === 'collected') {
        await client.query(`
          UPDATE partner_commissions
    SET
    sale_phase_collection_status = $1,
      sale_phase_collected_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
      `, [newStatus, partnerCommissionId]);
      } else {
        // Si cambia a otro estado, limpiar la fecha de cobro
        await client.query(`
          UPDATE partner_commissions
    SET
    sale_phase_collection_status = $1,
      sale_phase_collected_at = NULL,
      updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
      `, [newStatus, partnerCommissionId]);
      }
    }

    client.release();

    logger.info('Estado de comisiÃ³n a socio actualizado', {
      partnerCommissionId,
      newStatus,
      phase,
      updatedBy
    }, 'commission-db');

  } catch (error) {
    logger.error('Error actualizando estado de comisiÃ³n a socio', error, {
      partnerCommissionId,
      newStatus,
      phase,
      updatedBy
    }, 'commission-db');
    throw error;
  }
}

/**
 * Actualiza el estado de "Pago en Efectivo" de una comisiÃ³n a socio por fase
 */
export async function updatePartnerCommissionCashStatus(
  partnerCommissionId: number,
  phase: 'sale_phase' | 'post_sale_phase',
  isCashPayment: boolean,
  updatedBy: number
): Promise<void> {
  try {
    const client = await getClient();

    // Actualizar el estado segÃºn la fase especificada
    if (phase === 'post_sale_phase') {
      await client.query(`
        UPDATE partner_commissions
    SET
    post_sale_phase_is_cash_payment = $1,
      updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [isCashPayment, partnerCommissionId]);
    } else {
      await client.query(`
        UPDATE partner_commissions
    SET
    sale_phase_is_cash_payment = $1,
      updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [isCashPayment, partnerCommissionId]);
    }

    client.release();

    logger.info('Estado de pago en efectivo actualizado', {
      partnerCommissionId,
      phase,
      isCashPayment,
      updatedBy
    }, 'commission-db');

  } catch (error) {
    logger.error('Error actualizando estado de pago en efectivo', error, {
      partnerCommissionId,
      phase,
      isCashPayment,
      updatedBy
    }, 'commission-db');
    throw error;
  }
}

/**
 * Crea una factura para una comisiÃ³n a socio
 */
export async function createPartnerInvoice(
  invoiceData: {
    partner_commission_id: number;
    invoice_number?: string;
    invoice_date: string;
    due_date?: string;
    invoice_amount: number;
    iva_amount?: number;
    invoice_pdf_path?: string;
  },
  createdBy: number
): Promise<{ invoice_id: number }> {
  try {
    const client = await getClient();

    const result = await client.query(`
      INSERT INTO partner_invoices(
        partner_commission_id, invoice_number, invoice_date, due_date,
        invoice_amount, iva_amount, total_amount,
        invoice_pdf_path, invoice_pdf_uploaded_at, created_by
      ) VALUES(
        $1, $2, $3, $4, $5, $6,
        $5 + COALESCE($6, 0),
        $7, CASE WHEN $7 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
        $8
      )
      RETURNING id
      `, [
      invoiceData.partner_commission_id,
      invoiceData.invoice_number || null,
      invoiceData.invoice_date,
      invoiceData.due_date || null,
      invoiceData.invoice_amount,
      invoiceData.iva_amount || 0,
      invoiceData.invoice_pdf_path || null,
      createdBy
    ]);

    // Actualizar estado de la comisiÃ³n a "invoiced"
    await client.query(`
      UPDATE partner_commissions
      SET collection_status = 'invoiced', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `, [invoiceData.partner_commission_id]);

    client.release();

    return { invoice_id: result.rows[0].id };

  } catch (error) {
    logger.error('Error creando factura para socio', error, invoiceData, 'commission-db');
    throw error;
  }
}



/**
 * Obtiene la lista de socios ocultos
 */
export async function getHiddenPartners(): Promise<Array<{ id: number; socio_name: string; description: string; created_at: string }>> {
  try {
    const client = await getClient();
    const result = await client.query(`
      SELECT id, socio_name, description, created_at 
      FROM commission_hidden_partners 
      ORDER BY created_at DESC
      `);
    client.release();
    return result.rows;
  } catch (error) {
    logger.error('Error obteniendo socios ocultos', error, {}, 'commission-db');
    throw error;
  }
}

/**
 * Agrega un socio a la lista de ocultos
 */
export async function addHiddenPartner(socioName: string, description: string, userId: number): Promise<void> {
  try {
    const client = await getClient();
    await client.query(`
      INSERT INTO commission_hidden_partners(socio_name, description, created_by)
    VALUES($1, $2, $3)
      ON CONFLICT(socio_name) DO NOTHING
      `, [socioName, description, userId]);
    client.release();

    logger.info('Socio ocultado', { socioName, userId }, 'commission-db');
  } catch (error) {
    logger.error('Error ocultando socio', error, { socioName, userId }, 'commission-db');
    throw error;
  }
}

/**
 * Elimina un socio de la lista de ocultos
 */
export async function removeHiddenPartner(socioName: string): Promise<void> {
  try {
    const client = await getClient();
    await client.query(`
      DELETE FROM commission_hidden_partners WHERE socio_name = $1
      `, [socioName]);
    client.release();

    logger.info('Socio restaurado (desocultado)', { socioName }, 'commission-db');
  } catch (error) {
    logger.error('Error restaurando socio', error, { socioName }, 'commission-db');
    throw error;
  }
}


