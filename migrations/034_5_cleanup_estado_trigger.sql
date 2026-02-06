-- Migration: Clean up residual trigger from migration 032
-- Created at: 2026-02-06
-- Purpose: Remove trigger and function that references the obsolete 'estado' field

-- Drop the trigger
DROP TRIGGER IF EXISTS trigger_update_amount_on_estado_change ON commission_distributions;

-- Drop the function
DROP FUNCTION IF EXISTS update_commission_distribution_amount_on_estado_change();

-- Drop obsolete indexes if they exist
DROP INDEX IF EXISTS idx_commission_distributions_estado;
DROP INDEX IF EXISTS idx_commission_distributions_sale_estado;
