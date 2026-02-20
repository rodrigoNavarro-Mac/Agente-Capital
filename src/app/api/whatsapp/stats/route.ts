import { NextRequest, NextResponse } from 'next/server';
// import { sql } from '@vercel/postgres';

/**
 * GET /api/whatsapp/stats
 * Retorna estadísticas de leads por calidad
 */
export async function GET(_request: NextRequest) {
  // MOCK DATA (Temporal fix for missing @vercel/postgres)
  const result = {
    byQuality: [],
    stats: {
      total_conversations: 0,
      alto: 0,
      medio: 0,
      bajo: 0,
      sin_clasificar: 0,
      qualified: 0,
      synced_to_zoho: 0
    },
    byState: [],
    byDevelopment: [],
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(result, { status: 200 });
}
