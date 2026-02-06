-- Migration: Add is_cash_payment flag to commission_distributions
-- Created at: 2026-02-06
-- Purpose: Synchronize cash payment status from partner_commissions to commission_distributions
--          When a sale is marked as cash payment in partner commissions, the distributions should not have IVA

-- Add the column
ALTER TABLE commission_distributions
ADD COLUMN IF NOT EXISTS is_cash_payment BOOLEAN DEFAULT FALSE;

-- Update existing distributions based on partner_commissions
-- For sale phase: use sale_phase_is_cash_payment
-- For post_sale phase: use post_sale_phase_is_cash_payment
-- For utility phase: keep as FALSE
UPDATE commission_distributions cd
SET is_cash_payment = CASE 
  WHEN cd.phase = 'sale' THEN COALESCE(pc.sale_phase_is_cash_payment, FALSE)
  WHEN cd.phase = 'post_sale' THEN COALESCE(pc.post_sale_phase_is_cash_payment, FALSE)
  ELSE FALSE
END
FROM commission_sales cs
LEFT JOIN partner_commissions pc ON pc.commission_sale_id = cs.id
WHERE cd.sale_id = cs.id;

-- Add comment to the column
COMMENT ON COLUMN commission_distributions.is_cash_payment IS 
'Flag indicating if this distribution is a cash payment (no IVA). Inherited from partner_commissions based on phase.';
