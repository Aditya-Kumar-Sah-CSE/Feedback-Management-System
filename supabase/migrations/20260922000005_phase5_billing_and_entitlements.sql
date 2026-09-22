-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000005_phase5_billing_and_entitlements.sql
-- PURPOSE: Tenant-scoped billing, subscription plans, trials,
--          payment proofs storage, and verification requests.
-- ====================================================================

-- ====================================================================
-- 1. BILLING PLANS TABLE (PLATFORM CATALOG)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' 
        CHECK (billing_interval IN ('FREE', 'MONTHLY', 'YEARLY', 'ONETIME', 'CUSTOM')),
    duration_days INTEGER DEFAULT NULL,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_recommended BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_billing_plans_slug ON public.billing_plans(slug);
CREATE INDEX IF NOT EXISTS idx_billing_plans_display ON public.billing_plans(display_order);

-- ====================================================================
-- 2. PAYMENT SETTINGS TABLE (PLATFORM SINGLETON)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.payment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upi_id VARCHAR(255) DEFAULT '',
    account_name VARCHAR(255) DEFAULT '',
    bank_name VARCHAR(255) DEFAULT '',
    account_number VARCHAR(50) DEFAULT '',
    ifsc_code VARCHAR(20) DEFAULT '',
    support_phone VARCHAR(20) DEFAULT '9470870830',
    payment_instructions TEXT DEFAULT 'Pay via UPI or Bank Transfer. After payment, enter the UTR/transaction reference number below.',
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ====================================================================
-- 3. COLLEGE BILLING ACCOUNTS (TENANT SUBSCRIPTION STATE)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.college_billing_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL UNIQUE REFERENCES public.colleges(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'FREE',
    current_plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL,
    access_status VARCHAR(20) NOT NULL DEFAULT 'LOCKED' 
        CHECK (access_status IN ('LOCKED', 'UNLOCKED')),
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (subscription_status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING')),
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_billing_accounts_college ON public.college_billing_accounts(college_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_status ON public.college_billing_accounts(access_status, subscription_status);

-- ====================================================================
-- 4. COLLEGE TRIAL ENTITLEMENTS (TEMPORARY FEATURE TRIALS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.college_trial_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_college_trial_dates CHECK (expires_at > starts_at)
);

-- Partial index: at most ONE active trial per college at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_active_trial_per_college 
    ON public.college_trial_entitlements(college_id) 
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_trial_college_lookup 
    ON public.college_trial_entitlements(college_id, status, expires_at);

-- ====================================================================
-- 5. COLLEGE PAYMENT REQUESTS (PAYMENT VERIFICATION WORKFLOW)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.college_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    billing_plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL,
    plan_type VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('UPI', 'BANK_TRANSFER')),
    payment_reference VARCHAR(255) NOT NULL,
    payment_proof_url TEXT,
    snapshot_plan_name VARCHAR(100),
    snapshot_billing_interval VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_college 
    ON public.college_payment_requests(college_id, status, created_at DESC);

-- ====================================================================
-- 6. STORAGE BUCKET CONFIGURATION FOR PAYMENT PROOFS
-- ====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Storage Policies for 'payment-proofs'
-- Path structure: <college_id>/<filename>
-- Safe validation: extracts first folder segment and safely checks UUID format before casting

DROP POLICY IF EXISTS "Admins can upload payment proofs" ON storage.objects;
CREATE POLICY "Admins can upload payment proofs" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'payment-proofs' AND (
            public.is_platform_super_admin(auth.uid()) OR
            CASE 
                WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
                ELSE false
            END
        )
    );

DROP POLICY IF EXISTS "Admins can view payment proofs" ON storage.objects;
CREATE POLICY "Admins can view payment proofs" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'payment-proofs' AND (
            public.is_platform_super_admin(auth.uid()) OR
            CASE 
                WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
                ELSE false
            END
        )
    );

DROP POLICY IF EXISTS "Admins can update payment proofs" ON storage.objects;
CREATE POLICY "Admins can update payment proofs" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'payment-proofs' AND (
            public.is_platform_super_admin(auth.uid()) OR
            CASE 
                WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
                ELSE false
            END
        )
    )
    WITH CHECK (
        bucket_id = 'payment-proofs' AND (
            public.is_platform_super_admin(auth.uid()) OR
            CASE 
                WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
                ELSE false
            END
        )
    );

DROP POLICY IF EXISTS "Admins can delete payment proofs" ON storage.objects;
CREATE POLICY "Admins can delete payment proofs" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'payment-proofs' AND (
            public.is_platform_super_admin(auth.uid()) OR
            CASE 
                WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
                ELSE false
            END
        )
    );

