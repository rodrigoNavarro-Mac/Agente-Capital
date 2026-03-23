// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require('pptxgenjs');
import type { SlideContent } from './types';

const COLORS = {
  navy: '1B2A3B',
  gold: 'C9A84C',
  white: 'FFFFFF',
  lightText: 'B0BEC5',
  lightBg: 'F5F7FA',
  darkText: '1B2A3B',
};

export async function generateReportPPT(
  slides: SlideContent,
  desarrollo: string,
  periodo: string
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pptx = new PptxGenJS() as any;
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
  pptx.title = `Reporte ${desarrollo} ${periodo}`;
  pptx.author = 'Capital Plus AI';

  // SLIDE 1: Resumen
  const s1 = pptx.addSlide();
  s1.background = { color: COLORS.navy };
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: 7.5, fill: { color: COLORS.gold } });
  s1.addText(`REPORTE DE VENTAS · ${desarrollo.toUpperCase()} · ${periodo}`, {
    x: 0.3, y: 0.3, w: 12.5, h: 0.4, fontSize: 11, color: COLORS.gold, bold: false,
  });
  s1.addText(slides.slide_resumen.titulo, {
    x: 0.3, y: 1.0, w: 12.5, h: 1.0, fontSize: 32, color: COLORS.white, bold: true,
  });
  s1.addShape(pptx.ShapeType.rect, { x: 0.3, y: 2.2, w: 5, h: 0.04, fill: { color: COLORS.gold } });
  s1.addText(slides.slide_resumen.insight_principal, {
    x: 0.3, y: 2.5, w: 8, h: 2.5, fontSize: 16, color: COLORS.lightText,
  });
  s1.addText(slides.slide_resumen.variacion_leads_texto, {
    x: 0.3, y: 5.5, w: 8, h: 1.0, fontSize: 18, color: COLORS.gold, bold: true,
  });

  // SLIDE 2: Embudo
  const s2 = pptx.addSlide();
  s2.background = { color: COLORS.lightBg };
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: COLORS.navy } });
  s2.addText('EMBUDO DE CONVERSIÓN', {
    x: 0.5, y: 0.2, w: 12, h: 0.6, fontSize: 18, color: COLORS.white, bold: true,
  });
  s2.addText('Lead → Visita', { x: 1.0, y: 1.8, w: 5.5, h: 0.4, fontSize: 13, color: COLORS.darkText });
  s2.addText(slides.slide_embudo.conv_lead_visita, {
    x: 0.5, y: 2.1, w: 5.5, h: 1.5, fontSize: 44, color: COLORS.gold, bold: true,
  });
  s2.addShape(pptx.ShapeType.rect, { x: 6.5, y: 1.8, w: 0.04, h: 3.0, fill: { color: COLORS.gold } });
  s2.addText('Visita → Cierre', { x: 7.5, y: 1.8, w: 5.5, h: 0.4, fontSize: 13, color: COLORS.darkText });
  s2.addText(slides.slide_embudo.conv_visita_cierre, {
    x: 7.0, y: 2.1, w: 5.5, h: 1.5, fontSize: 44, color: COLORS.darkText, bold: true,
  });
  s2.addText(slides.slide_embudo.analisis_embudo, {
    x: 1.0, y: 5.2, w: 11, h: 1.8, fontSize: 14, color: COLORS.darkText,
  });

  // SLIDE 3: Fuentes
  const s3 = pptx.addSlide();
  s3.background = { color: COLORS.navy };
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: COLORS.gold } });
  s3.addText('FUENTES DE LEADS', {
    x: 0.5, y: 0.2, w: 12, h: 0.6, fontSize: 18, color: COLORS.darkText, bold: true,
  });
  s3.addText('FUENTE PRINCIPAL', { x: 1.0, y: 1.8, w: 8, h: 0.4, fontSize: 11, color: COLORS.lightText });
  s3.addText(slides.slide_fuentes.fuente_principal, {
    x: 0.8, y: 2.2, w: 8, h: 1.2, fontSize: 36, color: COLORS.white, bold: true,
  });
  s3.addText(slides.slide_fuentes.porcentaje_fuente_principal, {
    x: 9.0, y: 1.8, w: 4, h: 2, fontSize: 52, color: COLORS.gold, bold: true, align: 'center',
  });
  s3.addText(slides.slide_fuentes.comentario, {
    x: 1.0, y: 5.2, w: 11, h: 1.8, fontSize: 14, color: COLORS.lightText,
  });

  // SLIDE 4: Histórico
  const s4 = pptx.addSlide();
  s4.background = { color: COLORS.lightBg };
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: COLORS.navy } });
  s4.addText('TENDENCIA 6 MESES', {
    x: 0.5, y: 0.2, w: 12, h: 0.6, fontSize: 18, color: COLORS.white, bold: true,
  });
  s4.addText('TENDENCIA', { x: 1.0, y: 1.5, w: 11, h: 0.4, fontSize: 11, color: COLORS.darkText });
  s4.addText(slides.slide_historico.tendencia, {
    x: 1.0, y: 1.9, w: 11, h: 1.0, fontSize: 22, color: COLORS.darkText, bold: true,
  });
  s4.addShape(pptx.ShapeType.rect, { x: 1.0, y: 3.1, w: 11, h: 0.04, fill: { color: COLORS.gold } });
  s4.addText('MEJOR MES', { x: 1.0, y: 3.3, w: 11, h: 0.4, fontSize: 11, color: COLORS.gold });
  s4.addText(slides.slide_historico.mejor_mes, {
    x: 1.0, y: 3.7, w: 11, h: 0.8, fontSize: 20, color: COLORS.darkText, bold: true,
  });
  s4.addText(slides.slide_historico.comentario_6m, {
    x: 1.0, y: 5.0, w: 11, h: 2.0, fontSize: 14, color: COLORS.darkText,
  });

  // SLIDE 5: Cierres
  const s5 = pptx.addSlide();
  s5.background = { color: COLORS.navy };
  s5.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: COLORS.gold } });
  s5.addText('CIERRES DEL PERÍODO', {
    x: 1.0, y: 0.3, w: 11, h: 0.6, fontSize: 18, color: COLORS.gold, bold: true,
  });
  s5.addText('UNIDADES VENDIDAS', { x: 1.0, y: 1.8, w: 6, h: 0.4, fontSize: 11, color: COLORS.lightText });
  s5.addText(slides.slide_cierres.unidades, {
    x: 0.5, y: 2.0, w: 6, h: 2.5, fontSize: 72, color: COLORS.white, bold: true, align: 'center',
  });
  s5.addShape(pptx.ShapeType.rect, { x: 6.8, y: 1.5, w: 0.04, h: 3.5, fill: { color: COLORS.gold } });
  s5.addText('MONTO TOTAL', { x: 7.5, y: 1.8, w: 5.5, h: 0.4, fontSize: 11, color: COLORS.lightText });
  s5.addText(slides.slide_cierres.monto_formateado, {
    x: 7.2, y: 2.3, w: 5.5, h: 1.5, fontSize: 28, color: COLORS.gold, bold: true,
  });
  s5.addText(slides.slide_cierres.comentario_cierres, {
    x: 1.0, y: 5.8, w: 11, h: 1.5, fontSize: 14, color: COLORS.lightText,
  });

  // Exportar como Buffer
  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
