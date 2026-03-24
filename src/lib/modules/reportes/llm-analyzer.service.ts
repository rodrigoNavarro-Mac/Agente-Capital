import { runLLM } from '@/lib/services/llm';
import { logger } from '@/lib/utils/logger';
import type { LMStudioMessage } from '@/types/documents';
import type { ReporteData, SlideContent } from './types';

const SCOPE = 'reportes:llm-analyzer';

export async function analizarReporte(
  data: ReporteData,
  desarrollo: string,
  periodo: string
): Promise<SlideContent> {
  const variacionTexto = data.variacionLeadsPct >= 0
    ? `+${data.variacionLeadsPct}%`
    : `${data.variacionLeadsPct}%`;

  const top3Motivos = data.descartesPorMotivo.slice(0, 3)
    .map(m => `${m.motivo} (${m.cantidad})`)
    .join(', ') || 'Sin datos';

  const mensajeUsuario = `Analiza los siguientes datos de ventas del desarrollo inmobiliario "${desarrollo}" para el período ${periodo}:

MÉTRICAS DEL PERÍODO:
- Total leads: ${data.totalLeads} (vs ${data.totalLeadsMesAnterior} mes anterior, variación: ${variacionTexto})
- Total visitas: ${data.totalVisitas}
- Cierres/unidades vendidas: ${data.totalCierres}
- Monto total de ventas: $${data.montoTotalVentas.toLocaleString('es-MX')} MXN
- Tasa conversión lead→visita: ${data.tasaConversionLeadVisita}%
- Tasa conversión visita→cierre: ${data.tasaConversionVisitaCierre}%
- Total descartes: ${data.totalDescartes}
- Top motivos de descarte: ${top3Motivos}

FUENTES DE LEADS:
${data.leadsPorFuente.map(f => `- ${f.fuente}: ${f.cantidad} leads (${f.porcentaje}%)`).join('\n')}

HISTÓRICO 6 MESES:
${data.historico6Meses.map(m => `- ${m.mes}: ${m.leads} leads, ${m.visitas} visitas, ${m.cierres} cierres`).join('\n')}

Devuelve SOLO un JSON con esta estructura exacta (sin markdown, sin texto adicional):
{
  "slide_resumen": {
    "titulo": "string corto descriptivo del período",
    "insight_principal": "insight más importante en 1-2 oraciones",
    "variacion_leads_texto": "texto descriptivo de la variación de leads vs mes anterior"
  },
  "slide_embudo": {
    "conv_lead_visita": "porcentaje con texto descriptivo",
    "conv_visita_cierre": "porcentaje con texto descriptivo",
    "analisis_embudo": "análisis del embudo de conversión en 1-2 oraciones"
  },
  "slide_fuentes": {
    "fuente_principal": "nombre de la fuente principal de leads",
    "porcentaje_fuente_principal": "porcentaje como texto",
    "comentario": "comentario sobre las fuentes de leads"
  },
  "slide_historico": {
    "tendencia": "descripción de la tendencia de los últimos 6 meses",
    "mejor_mes": "mes con mejor desempeño y por qué",
    "comentario_6m": "análisis del comportamiento en 6 meses"
  },
  "slide_descartes": {
    "total_descartes": "número de descartes como texto",
    "top_motivos": ["motivo 1", "motivo 2", "motivo 3"],
    "insight": "análisis de los descartes y qué acciones tomar en 1-2 oraciones"
  },
  "slide_cierres": {
    "unidades": "número de cierres como texto",
    "monto_formateado": "monto total formateado en pesos mexicanos",
    "comentario_cierres": "comentario sobre los cierres del período"
  }
}`;

  const messages: LMStudioMessage[] = [
    {
      role: 'system',
      content: 'Eres un analista de ventas inmobiliarias experto. Analizas métricas de CRM y generas insights concisos para presentaciones ejecutivas. SIEMPRE responde con JSON válido y sin ningún texto adicional.',
    },
    { role: 'user', content: mensajeUsuario },
  ];

  logger.info('Generando análisis LLM del reporte', { desarrollo, periodo }, SCOPE);

  const raw = await runLLM(messages, { temperature: 0.3, max_tokens: 1200 });

  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed: SlideContent;
  try {
    parsed = JSON.parse(cleaned) as SlideContent;
  } catch (err) {
    logger.error('JSON inválido en respuesta LLM', err, { raw }, SCOPE);
    throw new Error(
      `LLM devolvió JSON inválido para reporte ${desarrollo}/${periodo}. Respuesta: ${cleaned.substring(0, 200)}`
    );
  }

  const requiredSlides: (keyof SlideContent)[] = [
    'slide_resumen', 'slide_embudo', 'slide_fuentes',
    'slide_historico', 'slide_descartes', 'slide_cierres',
  ];
  for (const slide of requiredSlides) {
    if (!parsed[slide]) {
      throw new Error(`LLM no devolvió el campo requerido: ${slide}`);
    }
  }

  logger.info('Análisis LLM generado exitosamente', { desarrollo, periodo }, SCOPE);
  return parsed;
}
