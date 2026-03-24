// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require('pptxgenjs');
import type { SlideContent, ReporteData } from './types';

// LAYOUT_WIDE = 13.33" × 7.5" — widescreen 16:9 estándar de PowerPoint.
// Las coordenadas del spec original van hasta y:6.2, lo que requiere 7.5" de alto.
const LAYOUT = 'LAYOUT_WIDE';

const C = {
  primary: '607443', // verde Capital
  text:    '2F2F2F', // texto oscuro
  bg:      'FFFFFF', // fondo blanco
  gray:    '757575', // labels secundarios
  lightBg: 'EEF2EA', // verde muy claro para filas alternas / cabecera
};

function formatMes(mes: string): string {
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const m = parseInt(mes.split('-')[1], 10);
  return meses[m - 1] ?? mes;
}

function formatMonto(n: number): string {
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
}

export async function generateReportPPT(
  slides: SlideContent,
  data: ReporteData,
  desarrollo: string,
  periodo: string
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pptx = new PptxGenJS() as any;
  pptx.layout = LAYOUT;
  pptx.title = `Reporte ${desarrollo} ${periodo}`;
  pptx.author = 'Capital Plus AI';

  const [year] = periodo.split('-');
  const mesNombre = formatMes(periodo);

  // ══════════════════════════════════════════════════════════
  // SLIDE 1 — RESUMEN
  // ══════════════════════════════════════════════════════════
  const s1 = pptx.addSlide();
  s1.background = { color: C.bg };

  // Título
  s1.addText(`${desarrollo.toUpperCase()} · ${mesNombre} ${year}`, {
    x: 1, y: 0.5, w: 6, h: 0.5,
    fontSize: 20, bold: true, color: C.text,
  });
  s1.addText(slides.slide_resumen.titulo, {
    x: 1, y: 1.0, w: 10, h: 0.5,
    fontSize: 14, color: C.gray,
  });

  // KPIs — fila horizontal
  // LEADS
  s1.addText(String(data.totalLeads), {
    x: 1.2, y: 1.8, w: 2, h: 0.9,
    fontSize: 42, bold: true, color: C.primary,
  });
  s1.addText('LEADS', {
    x: 1.2, y: 2.8, w: 2, h: 0.4,
    fontSize: 14, color: C.gray,
  });

  // VISITAS
  s1.addText(String(data.totalVisitas), {
    x: 3.8, y: 1.8, w: 2, h: 0.9,
    fontSize: 42, bold: true, color: C.primary,
  });
  s1.addText('VISITAS', {
    x: 3.8, y: 2.8, w: 2, h: 0.4,
    fontSize: 14, color: C.gray,
  });

  // CIERRES
  s1.addText(String(data.totalCierres), {
    x: 6.4, y: 1.8, w: 2, h: 0.9,
    fontSize: 42, bold: true, color: C.primary,
  });
  s1.addText('CIERRES', {
    x: 6.4, y: 2.8, w: 2, h: 0.4,
    fontSize: 14, color: C.gray,
  });

  // MONTO
  s1.addText(formatMonto(data.montoTotalVentas), {
    x: 8.8, y: 1.8, w: 4, h: 0.9,
    fontSize: 28, bold: true, color: C.primary,
  });
  s1.addText('MONTO', {
    x: 8.8, y: 2.8, w: 2, h: 0.4,
    fontSize: 14, color: C.gray,
  });

  // Separador horizontal
  s1.addShape(pptx.ShapeType.rect, {
    x: 1, y: 3.4, w: 8.5, h: 0.03,
    fill: { color: C.primary },
    line: { type: 'none' },
  });

  // Insight LLM
  s1.addText(slides.slide_resumen.insight_principal, {
    x: 1, y: 3.6, w: 8.5, h: 1.8,
    fontSize: 14, color: C.text,
  });
  s1.addText(slides.slide_resumen.variacion_leads_texto, {
    x: 1, y: 5.5, w: 8.5, h: 0.5,
    fontSize: 12, color: C.gray,
  });

  // ══════════════════════════════════════════════════════════
  // SLIDE 2 — EMBUDO
  // ══════════════════════════════════════════════════════════
  const s2 = pptx.addSlide();
  s2.background = { color: C.bg };

  s2.addText('EMBUDO DE CONVERSIÓN', {
    x: 1, y: 0.5, w: 8, h: 0.5,
    fontSize: 20, bold: true, color: C.text,
  });

  // Headers tabla embudo
  s2.addText('Leads',   { x: 2.5, y: 1.5, w: 2, h: 0.4, fontSize: 14, color: C.gray });
  s2.addText('Visitas', { x: 5.0, y: 1.5, w: 2, h: 0.4, fontSize: 14, color: C.gray });
  s2.addText('Cierres', { x: 7.5, y: 1.5, w: 2, h: 0.4, fontSize: 14, color: C.gray });

  // Valores tabla embudo
  s2.addText(String(data.totalLeads),    { x: 2.5, y: 2.2, w: 2, h: 0.8, fontSize: 26, bold: true, color: C.primary });
  s2.addText(String(data.totalVisitas),  { x: 5.0, y: 2.2, w: 2, h: 0.8, fontSize: 26, bold: true, color: C.primary });
  s2.addText(String(data.totalCierres),  { x: 7.5, y: 2.2, w: 2, h: 0.8, fontSize: 26, bold: true, color: C.primary });

  // Conversiones
  s2.addText(`Lead → Visita: ${data.tasaConversionLeadVisita}%`,   { x: 2.5, y: 3.2, w: 3, h: 0.5, fontSize: 13, color: C.text });
  s2.addText(`Visita → Cierre: ${data.tasaConversionVisitaCierre}%`, { x: 5.0, y: 3.2, w: 3, h: 0.5, fontSize: 13, color: C.text });

  // Gráfica embudo
  s2.addChart(pptx.ChartType.bar, [
    { name: 'Volumen', labels: ['Leads', 'Visitas', 'Cierres'], values: [data.totalLeads, data.totalVisitas, data.totalCierres] },
  ], {
    x: 1, y: 4, w: 8, h: 2,
    chartColors: [C.primary],
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 10,
    catAxisLabelFontSize: 10,
    valAxisHidden: true,
    barGrouping: 'clustered',
  });

  // ══════════════════════════════════════════════════════════
  // SLIDE 3 — HISTÓRICO 6 MESES
  // ══════════════════════════════════════════════════════════
  const s3 = pptx.addSlide();
  s3.background = { color: C.bg };

  s3.addText('HISTÓRICO 6 MESES', {
    x: 1, y: 0.5, w: 8, h: 0.5,
    fontSize: 20, bold: true, color: C.text,
  });

  const mesLabels = data.historico6Meses.map(m => formatMes(m.mes));

  // Gráfica principal centrada
  s3.addChart(pptx.ChartType.bar, [
    { name: 'Leads',   labels: mesLabels, values: data.historico6Meses.map(m => m.leads)   },
    { name: 'Visitas', labels: mesLabels, values: data.historico6Meses.map(m => m.visitas) },
    { name: 'Cierres', labels: mesLabels, values: data.historico6Meses.map(m => m.cierres) },
  ], {
    x: 1, y: 1.5, w: 8.5, h: 4.5,
    chartColors: [C.primary, '2F2F2F', 'AAAAAA'],
    showLegend: true,
    legendPos: 'b',
    legendFontSize: 10,
    showValue: false,
    catAxisLabelFontSize: 11,
    barGrouping: 'clustered',
  });

  // Tabla compacta debajo
  s3.addTable(
    [
      [
        { text: 'Mes',     options: { bold: true, fontSize: 9, color: C.bg, fill: { color: C.primary } } },
        ...data.historico6Meses.map(m => ({ text: formatMes(m.mes), options: { bold: true, fontSize: 9, color: C.bg, fill: { color: C.primary } } })),
      ],
      [
        { text: 'Leads',   options: { fontSize: 9, color: C.text } },
        ...data.historico6Meses.map(m => ({ text: String(m.leads),   options: { fontSize: 9, color: C.text } })),
      ],
      [
        { text: 'Visitas', options: { fontSize: 9, color: C.text } },
        ...data.historico6Meses.map(m => ({ text: String(m.visitas), options: { fontSize: 9, color: C.text } })),
      ],
      [
        { text: 'Cierres', options: { fontSize: 9, color: C.text } },
        ...data.historico6Meses.map(m => ({ text: String(m.cierres), options: { fontSize: 9, color: C.text } })),
      ],
    ],
    {
      x: 1, y: 6, w: 8.5,
      colW: [1.1, 1.23, 1.23, 1.23, 1.23, 1.23, 1.24],
      border: { type: 'solid', color: 'DDDDDD', pt: 0.5 },
    }
  );

  // ══════════════════════════════════════════════════════════
  // SLIDE 4 — DESCARTES
  // ══════════════════════════════════════════════════════════
  const s4 = pptx.addSlide();
  s4.background = { color: C.bg };

  s4.addText('DESCARTES DEL PERÍODO', {
    x: 1, y: 0.5, w: 8, h: 0.5,
    fontSize: 20, bold: true, color: C.text,
  });

  // KPI total descartes
  s4.addText(String(data.totalDescartes), {
    x: 1.2, y: 1.5, w: 3, h: 0.8,
    fontSize: 36, bold: true, color: C.primary,
  });
  s4.addText('descartes en el período', {
    x: 1.2, y: 2.2, w: 4, h: 0.35,
    fontSize: 12, color: C.gray,
  });

  // Gráfica semanal (barras por semana)
  s4.addChart(pptx.ChartType.bar, [
    {
      name: 'Descartes',
      labels: data.descartesSemanal.map(d => d.semana),
      values: data.descartesSemanal.map(d => d.cantidad),
    },
  ], {
    x: 1, y: 2.5, w: 6, h: 3.5,
    chartColors: [C.primary],
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 11,
    catAxisLabelFontSize: 12,
    valAxisHidden: false,
    barGrouping: 'clustered',
  });

  // Top motivos — columna derecha
  s4.addText('MOTIVOS PRINCIPALES', {
    x: 7.2, y: 2.5, w: 2.5, h: 0.4,
    fontSize: 11, bold: true, color: C.text,
  });

  const top3 = data.descartesPorMotivo.slice(0, 3);
  // Si no hay motivos desde datos, usar los del LLM
  const motivosDisplay = top3.length > 0
    ? top3.map(m => `${m.motivo} (${m.cantidad})`)
    : (slides.slide_descartes.top_motivos ?? []);

  motivosDisplay.forEach((motivo, i) => {
    s4.addText(`${i + 1}. ${motivo}`, {
      x: 7.2, y: 3.1 + i * 0.75, w: 2.5, h: 0.6,
      fontSize: 11, color: C.text,
    });
  });

  // Insight LLM
  s4.addText(slides.slide_descartes.insight, {
    x: 1, y: 6.2, w: 8.5, h: 0.6,
    fontSize: 12, color: C.gray,
  });

  // ══════════════════════════════════════════════════════════
  // SLIDE 5 — CIERRES
  // ══════════════════════════════════════════════════════════
  const s5 = pptx.addSlide();
  s5.background = { color: C.bg };

  s5.addText('CIERRES DEL PERÍODO', {
    x: 1, y: 0.5, w: 8, h: 0.5,
    fontSize: 20, bold: true, color: C.text,
  });

  // Unidades
  s5.addText(String(data.totalCierres), {
    x: 1.2, y: 1.8, w: 2.5, h: 0.9,
    fontSize: 36, bold: true, color: C.primary,
  });
  s5.addText('unidades', {
    x: 1.2, y: 2.7, w: 2.5, h: 0.4,
    fontSize: 12, color: C.gray,
  });

  // Monto
  s5.addText(formatMonto(data.montoTotalVentas), {
    x: 4.5, y: 1.8, w: 5, h: 0.9,
    fontSize: 36, bold: true, color: C.primary,
  });
  s5.addText('monto total', {
    x: 4.5, y: 2.7, w: 4, h: 0.4,
    fontSize: 12, color: C.gray,
  });

  // Tabla detalle (de commission_sales)
  if (data.cierresDetalle.length > 0) {
    const headerRow = [
      { text: 'Unidad / Deal', options: { bold: true, fontSize: 10, color: C.bg, fill: { color: C.primary } } },
      { text: 'Asesor',        options: { bold: true, fontSize: 10, color: C.bg, fill: { color: C.primary } } },
      { text: 'Monto',         options: { bold: true, fontSize: 10, color: C.bg, fill: { color: C.primary } } },
      { text: 'Fecha',         options: { bold: true, fontSize: 10, color: C.bg, fill: { color: C.primary } } },
    ];
    const dataRows = data.cierresDetalle.map(c => [
      { text: c.deal_name,                      options: { fontSize: 10, color: C.text } },
      { text: c.asesor,                          options: { fontSize: 10, color: C.text } },
      { text: formatMonto(c.monto),              options: { fontSize: 10, color: C.text } },
      { text: c.fecha_firma,                     options: { fontSize: 10, color: C.text } },
    ]);
    s5.addTable([headerRow, ...dataRows], {
      x: 1, y: 3, w: 8.5,
      colW: [3.5, 2.5, 1.5, 1.0],
      border: { type: 'solid', color: 'DDDDDD', pt: 0.5 },
      autoPage: false,
    });
  } else {
    s5.addText(slides.slide_cierres.comentario_cierres, {
      x: 1, y: 3, w: 8.5, h: 2,
      fontSize: 14, color: C.gray,
    });
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
