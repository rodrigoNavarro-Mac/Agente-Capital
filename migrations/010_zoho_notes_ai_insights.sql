-- =====================================================
-- MIGRACIÓN: Tabla de Insights IA para Notas de Zoho
-- =====================================================
-- Descripción: Almacena el último "insight" generado por IA
--              (incluye datos para gráficas: top palabras y tendencia temporal)
-- Fecha: 2025-12-16
-- =====================================================

-- =====================================================
-- TABLA: zoho_notes_ai_insights
-- Una fila por "contexto" (periodo + filtros) usando context_hash como PK
-- =====================================================
CREATE TABLE IF NOT EXISTS zoho_notes_ai_insights (
    context_hash VARCHAR(64) PRIMARY KEY, -- md5/sha256 hex (nosotros usamos md5)
    context JSONB NOT NULL,               -- periodo + filtros + fechas
    notes_count INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL,               -- JSON completo retornado por la IA (y datos de gráficas)
    generated_by_user_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE zoho_notes_ai_insights IS 'Últimos insights IA generados desde notas de Zoho (por contexto/filtros)';
COMMENT ON COLUMN zoho_notes_ai_insights.context_hash IS 'Hash estable del contexto para upsert y lectura rápida';
COMMENT ON COLUMN zoho_notes_ai_insights.payload IS 'Respuesta JSON completa (incluye campos para gráficas)';

-- Índices útiles para depuración/reportes (opcional)
CREATE INDEX IF NOT EXISTS idx_zoho_notes_ai_insights_updated_at ON zoho_notes_ai_insights(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_zoho_notes_ai_insights_context_gin ON zoho_notes_ai_insights USING GIN(context);

-- =====================================================
-- FUNCIÓN/TRIGGER: updated_at automático
-- =====================================================
CREATE OR REPLACE FUNCTION update_zoho_notes_ai_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_zoho_notes_ai_insights_updated_at ON zoho_notes_ai_insights;
CREATE TRIGGER trigger_update_zoho_notes_ai_insights_updated_at
    BEFORE UPDATE ON zoho_notes_ai_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_zoho_notes_ai_insights_updated_at();


