/**
 * =====================================================
 * WHATSAPP LOGS API ENDPOINT
 * =====================================================
 * Endpoint para consultar logs de WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppLogs, countWhatsAppLogs } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/whatsapp/logs
 * 
 * Query params:
 * - development (opcional): Filtrar por desarrollo
 * - limit (default: 50): Cantidad de logs
 * - offset (default: 0): Para paginación
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const development = searchParams.get('development') || undefined;
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        // Validar parámetros
        if (limit < 1 || limit > 100) {
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            );
        }

        if (offset < 0) {
            return NextResponse.json(
                { error: 'Offset must be non-negative' },
                { status: 400 }
            );
        }

        logger.debug('Fetching WhatsApp logs', { development, limit, offset }, 'whatsapp-api');

        // Obtener logs y total
        const [logs, total] = await Promise.all([
            getWhatsAppLogs({ development, limit, offset }),
            countWhatsAppLogs({ development }),
        ]);

        return NextResponse.json({
            logs,
            total,
            limit,
            offset,
        });
    } catch (error) {
        logger.error('Error fetching WhatsApp logs', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
