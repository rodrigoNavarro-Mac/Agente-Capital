-- =====================================================
-- MIGRACIÓN: Configuración de Proveedor LLM
-- =====================================================
-- Agrega la configuración para cambiar entre proveedores LLM
-- (LM Studio, OpenAI, etc.)

-- Insertar configuración del proveedor LLM por defecto
INSERT INTO agent_config (key, value, description) VALUES
    ('llm_provider', 'lmstudio', 'Proveedor LLM a utilizar: lmstudio o openai')
ON CONFLICT (key) DO NOTHING;

-- Comentario en la tabla
COMMENT ON COLUMN agent_config.key IS 'Clave de configuración única (ej: llm_provider, temperature, etc.)';
COMMENT ON COLUMN agent_config.value IS 'Valor de la configuración (puede ser JSON para valores complejos)';

