/**
 * =====================================================
 * FUNCIONES OPTIMIZADAS CON KEYSET PAGINATION
 * =====================================================
 * 
 * Estas funciones reemplazan OFFSET pagination por keyset pagination
 * para mejorar el rendimiento en serverless.
 * 
 * USO:
 * 
 * // Primera página
 * const result = await getZohoLeadsFromDBKeyset({ limit: 50 });
 * 
 * // Siguiente página
 * const nextResult = await getZohoLeadsFromDBKeyset({ 
 *   limit: 50, 
 *   cursor: result.nextCursor 
 * });
 */

import { queryWithKeyset, type KeysetPaginationResult } from './postgres-serverless';
import type { ZohoLead, ZohoDeal } from '@/lib/zoho-crm';

/**
 * Obtiene leads usando keyset pagination (cursor-based)
 * 
 * VENTAJAS:
 * - Latencia constante O(log n) en lugar de O(n)
 * - No escanea filas anteriores
 * - Funciona bien con datos que cambian
 * 
 * @param options Opciones de paginación y filtros
 * @returns Resultado con datos y cursor para siguiente página
 */
export async function getZohoLeadsFromDBKeyset(options: {
  cursor?: string; // ID del último lead de la página anterior
  limit?: number; // Número de leads a devolver (default: 50, max: 200)
  filters?: {
    desarrollo?: string;
    startDate?: Date;
    endDate?: Date;
  };
}): Promise<KeysetPaginationResult<ZohoLead> & { total?: number }> {
  const limit = Math.min(options.limit ?? 50, 200);
  const { filters } = options;

  // Construir WHERE clause
  const whereConditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.desarrollo) {
    whereConditions.push(`desarrollo = $${paramIndex}`);
    params.push(filters.desarrollo);
    paramIndex++;
  }

  if (filters?.startDate) {
    whereConditions.push(`created_time >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters?.endDate) {
    whereConditions.push(`created_time <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Query base
  const baseQuery = `SELECT id, data FROM zoho_leads ${whereClause}`;

  // Ejecutar con keyset pagination
  const result = await queryWithKeyset<{ id: string; data: string }>(
    baseQuery,
    params,
    {
      cursor: options.cursor,
      limit,
      orderBy: 'desc',
    },
    {
      cursorColumn: 'id',
      cursorType: 'id',
      timeout: 10000,
    }
  );

  // Obtener notas en batch (una sola query)
  const leadIds = result.data.map(row => row.id);
  const notesMap = new Map<string, any[]>();

  if (leadIds.length > 0) {
    try {
      const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
      const { queryServerless } = await import('./postgres-serverless');
      
      const notesResult = await queryServerless<{
        parent_id: string;
        data: string;
      }>(
        `SELECT parent_id, data FROM zoho_notes 
         WHERE parent_type = 'Leads' AND parent_id IN (${placeholders})
         ORDER BY created_time DESC`,
        leadIds
      );

      notesResult.rows.forEach(row => {
        if (!notesMap.has(row.parent_id)) {
          notesMap.set(row.parent_id, []);
        }
        const note = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        notesMap.get(row.parent_id)!.push(note);
      });
    } catch (error) {
      console.warn('⚠️ Error obteniendo notas de leads:', error);
    }
  }

  // Parsear leads y agregar notas
  const leads: ZohoLead[] = result.data.map((row) => {
    const lead = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    lead.Notes = notesMap.get(row.id) || [];
    return lead;
  });

  // Obtener total solo si es necesario (puede ser costoso)
  // En keyset pagination, normalmente no necesitas el total
  let total: number | undefined;
  if (options.filters) {
    try {
      const { queryServerless } = await import('./postgres-serverless');
      const countResult = await queryServerless<{ count: string }>(
        `SELECT COUNT(*) as count FROM zoho_leads ${whereClause}`,
        params
      );
      total = parseInt(countResult.rows[0].count);
    } catch (error) {
      console.warn('⚠️ Error obteniendo total de leads:', error);
    }
  }

  return {
    data: leads,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    total,
  };
}

/**
 * Obtiene deals usando keyset pagination (cursor-based)
 */
export async function getZohoDealsFromDBKeyset(options: {
  cursor?: string;
  limit?: number;
  filters?: {
    desarrollo?: string;
    startDate?: Date;
    endDate?: Date;
  };
}): Promise<KeysetPaginationResult<ZohoDeal> & { total?: number }> {
  const limit = Math.min(options.limit ?? 50, 200);
  const { filters } = options;

  // Construir WHERE clause
  const whereConditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.desarrollo) {
    // Buscar en la columna desarrollo O en el JSONB (tanto "Desarrollo" como "Desarollo")
    // Nota: Zoho tiene un error de tipeo y usa "Desarollo" en lugar de "Desarrollo"
    // Esto asegura que encontremos deals incluso si la columna está NULL o el campo tiene el nombre incorrecto
    whereConditions.push(`(
      COALESCE(
        desarrollo,
        data->>'Desarrollo',
        data->>'Desarollo'
      ) = $${paramIndex}
    )`);
    params.push(filters.desarrollo);
    paramIndex++;
  }

  if (filters?.startDate) {
    whereConditions.push(`created_time >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters?.endDate) {
    whereConditions.push(`created_time <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Query base
  const baseQuery = `SELECT id, data FROM zoho_deals ${whereClause}`;

  // Ejecutar con keyset pagination
  const result = await queryWithKeyset<{ id: string; data: string }>(
    baseQuery,
    params,
    {
      cursor: options.cursor,
      limit,
      orderBy: 'desc',
    },
    {
      cursorColumn: 'id',
      cursorType: 'id',
      timeout: 10000,
    }
  );

  // Obtener notas en batch
  const dealIds = result.data.map(row => row.id);
  const notesMap = new Map<string, any[]>();

  if (dealIds.length > 0) {
    try {
      const placeholders = dealIds.map((_, i) => `$${i + 1}`).join(',');
      const { queryServerless } = await import('./postgres-serverless');
      
      const notesResult = await queryServerless<{
        parent_id: string;
        data: string;
      }>(
        `SELECT parent_id, data FROM zoho_notes 
         WHERE parent_type = 'Deals' AND parent_id IN (${placeholders})
         ORDER BY created_time DESC`,
        dealIds
      );

      notesResult.rows.forEach(row => {
        if (!notesMap.has(row.parent_id)) {
          notesMap.set(row.parent_id, []);
        }
        const note = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        notesMap.get(row.parent_id)!.push(note);
      });
    } catch (error) {
      console.warn('⚠️ Error obteniendo notas de deals:', error);
    }
  }

  // Parsear deals y agregar notas
  const deals: ZohoDeal[] = result.data.map((row) => {
    const deal = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    deal.Notes = notesMap.get(row.id) || [];
    return deal;
  });

  // Obtener total solo si es necesario
  let total: number | undefined;
  if (options.filters) {
    try {
      const { queryServerless } = await import('./postgres-serverless');
      const countResult = await queryServerless<{ count: string }>(
        `SELECT COUNT(*) as count FROM zoho_deals ${whereClause}`,
        params
      );
      total = parseInt(countResult.rows[0].count);
    } catch (error) {
      console.warn('⚠️ Error obteniendo total de deals:', error);
    }
  }

  return {
    data: deals,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    total,
  };
}

