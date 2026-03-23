import { logger } from '@/lib/utils/logger';
import { getConfig, query } from '@/lib/db/postgres';
import type { CanvaAutofillPayload, SlideContent } from './types';

const SCOPE = 'reportes:canva';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

// Cache del access token en memoria (se invalida al reiniciar el proceso)
let cachedToken: { token: string; expiresAt: number } | null = null;

// =====================================================
// TOKEN MANAGEMENT (authorization_code + refresh_token)
// =====================================================

async function getRefreshToken(): Promise<string> {
  const token = await getConfig('canva_refresh_token');
  if (!token) {
    throw new Error(
      'Canva no está conectado. Ve a /dashboard/reportes y haz clic en "Conectar Canva".'
    );
  }
  return token;
}

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('CANVA_CLIENT_ID o CANVA_CLIENT_SECRET no configurados');
  }

  const refreshToken = await getRefreshToken();

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Si el refresh_token expiró, marcar como desconectado
    if (res.status === 400 || res.status === 401) {
      await query('DELETE FROM agent_config WHERE key = $1', ['canva_refresh_token']);
      cachedToken = null;
    }
    throw new Error(`Canva refresh_token falló (${res.status}): ${body}`);
  }

  const json = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Canva puede rotar el refresh_token; guardarlo si cambia
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    await query(
      `INSERT INTO agent_config (key, value, description, updated_by)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      ['canva_refresh_token', json.refresh_token, 'Canva OAuth refresh token']
    );
    logger.info('Canva refresh_token rotado y guardado', {}, SCOPE);
  }

  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };

  logger.info('Canva access_token renovado', { expiresIn: json.expires_in }, SCOPE);
  return cachedToken.token;
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  return refreshAccessToken();
}

// =====================================================
// AUTOFILL
// =====================================================

export async function autofillTemplate(
  templateId: string,
  slides: SlideContent,
  titulo?: string
): Promise<string> {
  const token = await getAccessToken();

  const campos: Record<string, { type: 'text'; text: string }> = {
    resumen_titulo:            { type: 'text', text: slides.slide_resumen.titulo },
    resumen_insight:           { type: 'text', text: slides.slide_resumen.insight_principal },
    resumen_variacion:         { type: 'text', text: slides.slide_resumen.variacion_leads_texto },
    embudo_conv_lead_visita:   { type: 'text', text: slides.slide_embudo.conv_lead_visita },
    embudo_conv_visita_cierre: { type: 'text', text: slides.slide_embudo.conv_visita_cierre },
    embudo_analisis:           { type: 'text', text: slides.slide_embudo.analisis_embudo },
    fuentes_principal:         { type: 'text', text: slides.slide_fuentes.fuente_principal },
    fuentes_porcentaje:        { type: 'text', text: slides.slide_fuentes.porcentaje_fuente_principal },
    fuentes_comentario:        { type: 'text', text: slides.slide_fuentes.comentario },
    historico_tendencia:       { type: 'text', text: slides.slide_historico.tendencia },
    historico_mejor_mes:       { type: 'text', text: slides.slide_historico.mejor_mes },
    historico_comentario:      { type: 'text', text: slides.slide_historico.comentario_6m },
    cierres_unidades:          { type: 'text', text: slides.slide_cierres.unidades },
    cierres_monto:             { type: 'text', text: slides.slide_cierres.monto_formateado },
    cierres_comentario:        { type: 'text', text: slides.slide_cierres.comentario_cierres },
  };

  const payload: CanvaAutofillPayload = {
    brand_template_id: templateId,
    title: titulo,
    data: campos,
  };

  const res = await fetch(`${CANVA_API_BASE}/autofills`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva autofill falló (${res.status}): ${body}`);
  }

  const json = await res.json() as { job?: { id?: string }; design?: { id?: string } };
  const designId = json.job?.id ?? json.design?.id;
  if (!designId) {
    throw new Error(`Canva autofill no devolvió design ID: ${JSON.stringify(json)}`);
  }

  logger.info('Canva autofill iniciado', { templateId, designId }, SCOPE);
  return designId;
}

// =====================================================
// EXPORT
// =====================================================

export async function exportDesign(designId: string): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${CANVA_API_BASE}/exports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ design_id: designId, format: 'pdf' }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva export falló (${res.status}): ${body}`);
  }

  const json = await res.json() as { job?: { id?: string } };
  const jobId = json.job?.id;
  if (!jobId) {
    throw new Error(`Canva export no devolvió job ID: ${JSON.stringify(json)}`);
  }

  logger.info('Canva export iniciado', { designId, jobId }, SCOPE);

  const TIMEOUT_MS = 60_000;
  const POLL_INTERVAL_MS = 3_000;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${CANVA_API_BASE}/exports/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pollRes.ok) {
      const body = await pollRes.text();
      throw new Error(`Canva export poll falló (${pollRes.status}): ${body}`);
    }

    const status = await pollRes.json() as {
      job?: { status?: string; urls?: string[]; error?: { message?: string } };
    };

    const jobStatus = status.job?.status;
    if (jobStatus === 'success') {
      const url = status.job?.urls?.[0];
      if (!url) throw new Error('Canva export success pero sin URL en respuesta');
      logger.info('Canva export completado', { designId, url }, SCOPE);
      return url;
    }

    if (jobStatus === 'failed' || jobStatus === 'error') {
      const errMsg = status.job?.error?.message ?? 'Error desconocido en export';
      throw new Error(`Canva export falló: ${errMsg}`);
    }

    logger.info('Canva export en progreso', { jobId, status: jobStatus }, SCOPE);
  }

  throw new Error(`Canva export timeout después de ${TIMEOUT_MS / 1000}s para design ${designId}`);
}
