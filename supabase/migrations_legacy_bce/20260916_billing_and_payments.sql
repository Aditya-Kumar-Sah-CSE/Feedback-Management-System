-- ====================================================================
-- MIGRATION: 20260916_billing_and_payments.sql
-- PURPOSE: Manual Payment + Google Form Generation Access Control
-- DESCRIPTION:
--   1. admin_billing_accounts — per-admin plan/access/subscription state
--   2. payment_requests — admin payment submissions for Super Admin review
--   3. payment_settings — Super Admin-controlled UPI/bank details (singleton)
--   4. RLS policies, indexes, constraints
--   5. Grandfather existing admins as UNLOCKED + FREE
-- SAFETY: Idempotent. Does NOT modify existing tables/columns.
-- ====================================================================

-- ====================================================================
-- 1. ADMIN BILLING ACCOUNTS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.admin_billing_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'FREE',
    access_status VARCHAR(20) NOT NULL DEFAULT 'LOCKED' CHECK (access_status IN ('LOCKED', 'UNLOCKED')),
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (subscription_status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING')),
    started_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_billing_admin UNIQUE (admin_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_admin_user ON public.admin_billing_accounts(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_billing_access_status ON public.admin_billing_accounts(access_status);
CREATE INDEX IF NOT EXISTS idx_billing_plan_type ON public.admin_billing_accounts(plan_type);
CREATE INDEX IF NOT EXISTS idx_billing_expires ON public.admin_billing_accounts(expires_at);

-- ====================================================================
-- 2. PAYMENT REQUESTS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.payment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('UPI', 'BANK_TRANSFER')),
    payment_reference VARCHAR(255) NOT NULL,
    payment_proof_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_requests_admin ON public.payment_requests(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON public.payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created ON public.payment_requests(created_at DESC);

-- ====================================================================
-- 3. PAYMENT SETTINGS (Singleton — Super Admin managed)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.payment_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upi_id VARCHAR(255) DEFAULT '',
    account_name VARCHAR(255) DEFAULT '',
    bank_name VARCHAR(255) DEFAULT '',
    account_number VARCHAR(50) DEFAULT '',
    ifsc_code VARCHAR(20) DEFAULT '',
    support_phone VARCHAR(20) DEFAULT '9470870830',
    payment_instructions TEXT DEFAULT 'Pay via UPI or Bank Transfer. After payment, enter the UTR/transaction reference number below.',
    updated_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed singleton settings row if not exists
INSERT INTO public.payment_settings (upi_id, support_phone, payment_instructions)
SELECT '', '9470870830', 'Pay via UPI or Bank Transfer. After payment, enter the UTR/transaction reference number below.'
WHERE NOT EXISTS (SELECT 1 FROM public.payment_settings LIMIT 1);

-- ====================================================================
-- 4. ROW LEVEL SECURITY
-- ====================================================================

ALTER TABLE public.admin_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- 4.1 admin_billing_accounts
DROP POLICY IF EXISTS "Admin can view own billing" ON public.admin_billing_accounts;
CREATE POLICY "Admin can view own billing" ON public.admin_billing_accounts
    FOR SELECT TO authenticated
    USING (
        admin_user_id IN (SELECT id FROM public.admins WHERE user_id = auth.uid())
        OR public.is_super_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Super Admin manages all billing" ON public.admin_billing_accounts;
CREATE POLICY "Super Admin manages all billing" ON public.admin_billing_accounts
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Service role full access for server actions
GRANT ALL ON public.admin_billing_accounts TO service_role;
GRANT SELECT ON public.admin_billing_accounts TO authenticated;

-- 4.2 payment_requests
DROP POLICY IF EXISTS "Admin can view own payment requests" ON public.payment_requests;
CREATE POLICY "Admin can view own payment requests" ON public.payment_requests
    FOR SELECT TO authenticated
    USING (
        admin_user_id IN (SELECT id FROM public.admins WHERE user_id = auth.uid())
        OR public.is_super_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Admin can create own payment request" ON public.payment_requests;
CREATE POLICY "Admin can create own payment request" ON public.payment_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        admin_user_id IN (SELECT id FROM public.admins WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Super Admin manages all payment requests" ON public.payment_requests;
CREATE POLICY "Super Admin manages all payment requests" ON public.payment_requests
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

GRANT ALL ON public.payment_requests TO service_role;
GRANT SELECT, INSERT ON public.payment_requests TO authenticated;

-- 4.3 payment_settings
DROP POLICY IF EXISTS "Authenticated admins can read payment settings" ON public.payment_settings;
CREATE POLICY "Authenticated admins can read payment settings" ON public.payment_settings
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admin can manage payment settings" ON public.payment_settings;
CREATE POLICY "Super Admin can manage payment settings" ON public.payment_settings
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

GRANT ALL ON public.payment_settings TO service_role;
GRANT SELECT ON public.payment_settings TO authenticated;

-- Explicitly revoke public/anon access on all billing tables
REVOKE ALL ON public.admin_billing_accounts FROM anon, public;
REVOKE ALL ON public.payment_requests FROM anon, public;
REVOKE ALL ON public.payment_settings FROM anon, public;

-- ====================================================================
-- 5. GRANDFATHER EXISTING ADMINS AS UNLOCKED + FREE
-- ====================================================================

-- For every existing active admin, create a billing record with UNLOCKED + FREE
-- so migration does not revoke current access.
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

-- ====================================================================
-- 6. RELOAD SCHEMA CACHE
-- ====================================================================
NOTIFY pgrst, 'reload schema';
