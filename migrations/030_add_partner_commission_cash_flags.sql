-- Migration: Add separate cash payment flags for sale and post-sale phases in partner_commissions
-- Created at: 2026-01-27

ALTER TABLE partner_commissions 
ADD COLUMN IF NOT EXISTS sale_phase_is_cash_payment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS post_sale_phase_is_cash_payment BOOLEAN DEFAULT FALSE;
