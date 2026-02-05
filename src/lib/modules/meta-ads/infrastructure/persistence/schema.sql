-- Meta Ads Recommendation Engine Schema
-- Strictly Append-Only for Auditability

-- 1. Configuration Versions
CREATE TABLE IF NOT EXISTS meta_ads_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version TEXT NOT NULL, -- e.g. "v1.0.0"
  config_hash TEXT NOT NULL,    -- SHA256 of the payload
  payload JSONB NOT NULL,       -- The full config (rules, templates, profiles references)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_configs_version ON meta_ads_configs(config_version);

-- 2. Audit Logs (Execution Trace)
CREATE TABLE IF NOT EXISTS meta_ads_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ NOT NULL,
  
  -- Link to used config
  config_version TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  
  -- Link to context
  context_hash TEXT NOT NULL,
  context_snapshot JSONB NOT NULL, -- Full input snapshot frozen
  
  -- The Output
  recommendations JSONB NOT NULL, -- Array of recommendations
  
  -- Metadata
  execution_duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_audit_logs_generated_at ON meta_ads_audit_logs(generated_at);
CREATE INDEX IF NOT EXISTS idx_meta_ads_audit_logs_context_hash ON meta_ads_audit_logs(context_hash);


-- 3. System Settings (Key-Value Store)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);


-- 3. System Settings (Key-Value Store)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);
