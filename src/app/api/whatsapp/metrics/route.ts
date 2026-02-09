/**
 * =====================================================
 * WHATSAPP METRICS API ENDPOINT
 * =====================================================
 * Endpoint para consultar métricas de WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppMetrics } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/whatsapp/metrics
 * 
 * Retorna métricas agregadas de WhatsApp
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
    try {
        logger.debug('Fetching WhatsApp metrics', {}, 'whatsapp-api');

        const metrics = await getWhatsAppMetrics();

        return NextResponse.json(metrics);
    } catch (error) {
        logger.error('Error fetching WhatsApp metrics', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
