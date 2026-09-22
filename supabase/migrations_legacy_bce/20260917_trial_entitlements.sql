-- ====================================================================
-- MIGRATION: 20260917_trial_entitlements.sql
-- PURPOSE: Production-Grade Database-Driven Free Trial Entitlement System
-- DESCRIPTION:
--   1. admin_trial_entitlements — dedicated table for temporary trials
--   2. Enforce exactly ONE active trial per admin via partial unique index
--   3. Date constraints (expires_at > starts_at)
--   4. RLS policies: Super Admin full control, admins can view own
--   5. Safely clean up / deactivate FREE_TRIAL from billing_plans
--   6. Ensure all active admins have UNLOCKED FREE base plan
-- SAFETY: Idempotent. Preserves all historical payment and billing records.
-- ====================================================================

-- ====================================================================
-- 1. ADMIN TRIAL ENTITLEMENTS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.admin_trial_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES public.admins(id) ON DELETE RESTRICT,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_trial_dates CHECK (expires_at > starts_at)
);

-- Indexes for lightning-fast lookups
CREATE INDEX IF NOT EXISTS idx_trial_admin_id ON public.admin_trial_entitlements(admin_id);
CREATE INDEX IF NOT EXISTS idx_trial_status ON public.admin_trial_entitlements(status);
CREATE INDEX IF NOT EXISTS idx_trial_expires_at ON public.admin_trial_entitlements(expires_at);
CREATE INDEX IF NOT EXISTS idx_trial_admin_status ON public.admin_trial_entitlements(admin_id, status);
CREATE INDEX IF NOT EXISTS idx_trial_created_at ON public.admin_trial_entitlements(created_at DESC);

-- Critical: PostgreSQL partial unique index ensuring at most ONE active trial per admin
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_active_trial_per_admin 
    ON public.admin_trial_entitlements(admin_id) 
    WHERE status = 'ACTIVE';

-- ====================================================================
-- 2. ROW LEVEL SECURITY
-- ====================================================================

ALTER TABLE public.admin_trial_entitlements ENABLE ROW LEVEL SECURITY;

-- Admins can view own trial entitlements (or Super Admin can view all)
DROP POLICY IF EXISTS "Admins can view own trial entitlements" ON public.admin_trial_entitlements;
CREATE POLICY "Admins can view own trial entitlements" ON public.admin_trial_entitlements
    FOR SELECT TO authenticated
    USING (
        admin_id IN (SELECT id FROM public.admins WHERE user_id = auth.uid())
        OR public.is_super_admin(auth.uid())
    );

-- Super Admin has full management privileges
DROP POLICY IF EXISTS "Super Admin manages trial entitlements" ON public.admin_trial_entitlements;
CREATE POLICY "Super Admin manages trial entitlements" ON public.admin_trial_entitlements
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Grants and Revokes
GRANT ALL ON public.admin_trial_entitlements TO service_role;
GRANT SELECT ON public.admin_trial_entitlements TO authenticated;
REVOKE ALL ON public.admin_trial_entitlements FROM anon, public;

-- ====================================================================
-- 3. CLEAN UP FREE_TRIAL FROM PURCHASABLE BILLING PLANS
-- ====================================================================

-- Deactivate FREE_TRIAL plan so it never appears in billing cards
UPDATE public.billing_plans
SET is_active = false,
    updated_at = timezone('utc'::text, now())
WHERE slug = 'FREE_TRIAL';

-- If not referenced by any historical payment request, safely delete it
DELETE FROM public.billing_plans
WHERE slug = 'FREE_TRIAL'
  AND NOT EXISTS (
      SELECT 1 FROM public.payment_requests
      WHERE billing_plan_id = billing_plans.id
         OR plan_type = 'FREE_TRIAL'
  );

-- Ensure FREE base plan contains ONLY Basic analytics
UPDATE public.billing_plans
SET features = '["Basic analytics"]'::jsonb,
    description = 'Permanent base plan with Basic Analytics.',
    updated_at = timezone('utc'::text, now())
WHERE slug = 'FREE';

-- ====================================================================
-- 4. ENSURE FREE BASE PLAN FOR ALL ACTIVE ADMINS
-- ====================================================================

-- Ensure grandfathered and all normal admins have UNLOCKED FREE base plan
INSERT INTO public.admin_billing_accounts (admin_user_id, plan_type, access_status, subscription_status, started_at)
SELECT
    a.id,
    'FREE',
    'UNLOCKED',
    'ACTIVE',
    timezone('utc'::text, now())
FROM public.admins a
WHERE a.status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1 FROM public.admin_billing_accounts b WHERE b.admin_user_id = a.id
  );

-- Ensure FREE base plan accounts are marked UNLOCKED
UPDATE public.admin_billing_accounts
SET access_status = 'UNLOCKED',
    subscription_status = 'ACTIVE'
WHERE plan_type = 'FREE'
  AND access_status = 'LOCKED'
  AND expires_at IS NULL;

-- ====================================================================
-- 5. RELOAD SCHEMA CACHE
-- ====================================================================
NOTIFY pgrst, 'reload schema';
