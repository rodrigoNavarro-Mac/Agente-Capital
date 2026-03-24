export interface MesHistorico {
  mes: string; // YYYY-MM
  leads: number;
  visitas: number;
  cierres: number;
}

export interface FuenteLeads {
  fuente: string;
  cantidad: number;
  porcentaje: number;
}

export interface MotivoDescarte {
  motivo: string;
  cantidad: number;
}

export interface DescartesSemanal {
  semana: string; // 'S1' .. 'S4'
  cantidad: number;
}

export interface CierreDetalle {
  deal_name: string;
  monto: number;
  fecha_firma: string;
  asesor: string;
}

export interface ReporteData {
  desarrollo: string;
  periodo: string;
  // Leads
  totalLeads: number;
  totalLeadsMesAnterior: number;
  variacionLeadsPct: number;
  leadsPorFuente: FuenteLeads[];
  // Visitas
  totalVisitas: number;
  // Cierres / ventas
  totalCierres: number;
  montoTotalVentas: number;
  cierresDetalle: CierreDetalle[];
  // Conversiones
  tasaConversionLeadVisita: number; // 0-100
  tasaConversionVisitaCierre: number; // 0-100
  // Histórico 6 meses
  historico6Meses: MesHistorico[];
  // Descartes
  totalDescartes: number;
  descartesPorMotivo: MotivoDescarte[];
  descartesSemanal: DescartesSemanal[];
}

export interface SlideResumen {
  titulo: string;
  insight_principal: string;
  variacion_leads_texto: string;
}

export interface SlideEmbudo {
  conv_lead_visita: string;
  conv_visita_cierre: string;
  analisis_embudo: string;
}

export interface SlideFuentes {
  fuente_principal: string;
  porcentaje_fuente_principal: string;
  comentario: string;
}

export interface SlideHistorico {
  tendencia: string;
  mejor_mes: string;
  comentario_6m: string;
}

export interface SlideDescartes {
  total_descartes: string;
  top_motivos: string[]; // top 3
  insight: string;
}

export interface SlideCierres {
  unidades: string;
  monto_formateado: string;
  comentario_cierres: string;
}

export interface SlideContent {
  slide_resumen: SlideResumen;
  slide_embudo: SlideEmbudo;
  slide_fuentes: SlideFuentes;
  slide_historico: SlideHistorico;
  slide_descartes: SlideDescartes;
  slide_cierres: SlideCierres;
}

export interface CanvaAutofillPayload {
  brand_template_id: string;
  title?: string;
  data: Record<string, { type: 'text'; text: string }>;
}

export interface ReporteRow {
  id: number;
  desarrollo: string;
  periodo: string;
  canva_design_id: string | null;
  canva_export_url: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  metadata: Record<string, unknown>;
  generated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
