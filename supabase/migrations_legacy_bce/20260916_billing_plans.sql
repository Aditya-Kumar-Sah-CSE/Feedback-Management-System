-- ====================================================================
-- MIGRATION: 20260916_billing_plans.sql
-- PURPOSE: Database-driven Billing Plans
-- DESCRIPTION:
--   1. billing_plans — stores all plans (FREE, MONTHLY, YEARLY, custom)
--   2. Adds billing_plan_id + snapshot columns to payment_requests
--   3. RLS: Super Admin manages, authenticated admins can read active plans
--   4. Seed initial plans: FREE, MONTHLY (₹2,999), YEARLY (₹29,999)
-- SAFETY: Idempotent via IF NOT EXISTS / ON CONFLICT.
-- ====================================================================

-- ====================================================================
-- 1. BILLING PLANS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
        CHECK (billing_interval IN ('FREE', 'MONTHLY', 'YEARLY', 'ONETIME', 'CUSTOM', 'one_time', 'monthly', 'yearly')),
    duration_days INTEGER DEFAULT NULL,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_recommended BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_billing_plans_slug ON public.billing_plans(slug);
CREATE INDEX IF NOT EXISTS idx_billing_plans_display_order ON public.billing_plans(display_order);

-- ====================================================================
-- 2. ADD PLAN SNAPSHOT COLUMNS TO payment_requests
-- ====================================================================

-- billing_plan_id: FK to billing_plans for traceability
ALTER TABLE public.payment_requests
    ADD COLUMN IF NOT EXISTS billing_plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL;

-- Immutable snapshot columns: record the plan name, amount, and interval
-- at the time of request (so historical records are never affected by edits)
ALTER TABLE public.payment_requests
    ADD COLUMN IF NOT EXISTS snapshot_plan_name VARCHAR(100);

ALTER TABLE public.payment_requests
    ADD COLUMN IF NOT EXISTS snapshot_billing_interval VARCHAR(20);

-- ====================================================================
-- 3. ROW LEVEL SECURITY
-- ====================================================================

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

-- All authenticated admins can read active plans
DROP POLICY IF EXISTS "Admins can read active billing plans" ON public.billing_plans;
CREATE POLICY "Admins can read active billing plans" ON public.billing_plans
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

-- Super Admin can manage all plans (CRUD)
DROP POLICY IF EXISTS "Super Admin manages billing plans" ON public.billing_plans;
CREATE POLICY "Super Admin manages billing plans" ON public.billing_plans
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Service role full access (server actions)
GRANT ALL ON public.billing_plans TO service_role;
GRANT SELECT ON public.billing_plans TO authenticated;

-- Revoke anon/public access
REVOKE ALL ON public.billing_plans FROM anon, public;

-- ====================================================================
-- 4. SEED INITIAL PLANS
-- ====================================================================

INSERT INTO public.billing_plans (name, slug, description, price, currency, billing_interval, duration_days, features, is_active, is_recommended, display_order)
VALUES
    ('Free', 'FREE', 'Assigned by Super Admin only.', 0, 'INR', 'FREE', NULL,
     '["Google Form generation", "Google Sheet integration", "Basic analytics"]'::jsonb,
     true, false, 0),
    ('Monthly', 'MONTHLY', 'Pay monthly, cancel anytime.', 2999, 'INR', 'MONTHLY', 30,
     '["Google Form generation", "Google Sheet integration", "Full analytics access", "Priority support"]'::jsonb,
     true, false, 10),
    ('Yearly', 'YEARLY', 'Best value — save over ₹5,900/year.', 29999, 'INR', 'YEARLY', 365,
     '["Google Form generation", "Google Sheet integration", "Full analytics access", "Priority support", "2 months free"]'::jsonb,
     true, true, 20)
ON CONFLICT (slug) DO NOTHING;

-- ====================================================================
-- 5. BACKFILL EXISTING payment_requests WITH PLAN SNAPSHOT
-- ====================================================================

-- Set billing_plan_id for existing payment requests based on plan_type slug
UPDATE public.payment_requests pr
SET
    billing_plan_id = bp.id,
    snapshot_plan_name = bp.name,
    snapshot_billing_interval = bp.billing_interval
FROM public.billing_plans bp
WHERE pr.plan_type = bp.slug
  AND pr.billing_plan_id IS NULL;

-- ====================================================================
-- 6. RELOAD SCHEMA CACHE
-- ====================================================================
NOTIFY pgrst, 'reload schema';
