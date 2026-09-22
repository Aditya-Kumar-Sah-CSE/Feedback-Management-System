-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000007_phase7_seed_initial_platform.sql
-- PURPOSE: Minimal safe platform bootstrap:
--          1. Seed master billing plans catalog
--          2. Seed payment settings singleton
--          3. Seed initial tenant: BCE-BGP (deterministic UUID)
--          4. Seed BCE-BGP billing account
--          5. Automated Super Admin linkage for SUPER_ADMIN_EMAIL
--          6. Reload PostgREST schema cache
-- SAFETY: Zero production tokens, forms, sheets, or mock records copied.
-- ====================================================================

-- ====================================================================
-- 1. SEED AUTHORITATIVE BILLING PLANS
-- ====================================================================

INSERT INTO public.billing_plans (name, slug, description, price, currency, billing_interval, duration_days, features, is_active, is_recommended, display_order)
VALUES
    ('Free', 'FREE', 'Permanent base plan with Basic Analytics.', 0, 'INR', 'FREE', NULL,
     '["Basic analytics"]'::jsonb, true, false, 0),
    ('Basic', 'BASIC', 'Essential tools for Google Form generation and Sheet response sync.', 999, 'INR', 'MONTHLY', 30,
     '["Google Form generation", "Google Sheet integration", "Basic analytics"]'::jsonb, true, false, 10),
    ('Full Access', 'FULL_ACCESS', 'Complete access to form generation, response sync, full analytics, and PDF reports.', 2999, 'INR', 'MONTHLY', 30,
     '["Google Form generation", "Google Sheet integration", "Basic analytics", "Full analytics access", "Analytics PDF reports"]'::jsonb, true, true, 20),
    ('Yearly', 'YEARLY', 'Best value annual plan — save over ₹5,900/year with priority support.', 29999, 'INR', 'YEARLY', 365,
     '["Google Form generation", "Google Sheet integration", "Basic analytics", "Full analytics access", "Analytics PDF reports", "Priority support"]'::jsonb, true, false, 30)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    features = EXCLUDED.features,
    is_active = true,
    updated_at = timezone('utc'::text, now());

-- ====================================================================
-- 2. SEED PAYMENT SETTINGS SINGLETON
-- ====================================================================

INSERT INTO public.payment_settings (upi_id, account_name, bank_name, support_phone, payment_instructions)
SELECT 
    '', 
    'FMS Platform', 
    '', 
    '9470870830', 
    'Pay via UPI or Bank Transfer. After payment, enter the UTR/transaction reference number below.'
WHERE NOT EXISTS (SELECT 1 FROM public.payment_settings LIMIT 1);

-- ====================================================================
-- 3. SEED INITIAL TENANT: BCE-BGP (BHAGALPUR COLLEGE OF ENGINEERING)
-- ====================================================================

INSERT INTO public.colleges (
    id,
    name,
    code,
    slug,
    tagline,
    established_year,
    aicte_approved,
    affiliated_university,
    primary_color,
    secondary_color,
    accent_color,
    is_active
)
VALUES (
    'bce00000-0000-0000-0000-000000000001',
    'Bhagalpur College of Engineering',
    'BCE-BGP',
    'bce-bgp',
    'Govt. of Bihar | Dept. of Science, Technology & Technical Education',
    1960,
    true,
    'Bihar Engineering University, Patna',
    '#0B192C',
    '#1E3E62',
    '#F6995C',
    true
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    tagline = EXCLUDED.tagline,
    is_active = true,
    updated_at = timezone('utc'::text, now());

-- ====================================================================
-- 4. SEED INITIAL BILLING ACCOUNT FOR BCE-BGP
-- ====================================================================

INSERT INTO public.college_billing_accounts (
    college_id,
    plan_type,
    access_status,
    subscription_status
)
VALUES (
    'bce00000-0000-0000-0000-000000000001',
    'FREE',
    'UNLOCKED',
    'ACTIVE'
)
ON CONFLICT (college_id) DO NOTHING;

-- ====================================================================
-- 5. AUTOMATED SUPER ADMIN ENROLLMENT & LINKAGE FUNCTION
-- ====================================================================

CREATE OR REPLACE FUNCTION public.sync_platform_super_admin(p_user_id UUID, p_email TEXT, p_name TEXT DEFAULT 'Aditya (Platform Super Admin)')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_email TEXT;
BEGIN
    v_clean_email := LOWER(TRIM(p_email));
    
    -- 1. Ensure Platform Super Admin record
    INSERT INTO public.platform_admins (user_id, email, name, role, is_active, updated_at)
    VALUES (
        p_user_id,
        v_clean_email,
        COALESCE(NULLIF(p_name, ''), 'Aditya (Platform Super Admin)'),
        'PLATFORM_SUPER_ADMIN',
        true,
        timezone('utc'::text, now())
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        role = 'PLATFORM_SUPER_ADMIN',
        is_active = true,
        updated_at = timezone('utc'::text, now());

    -- 2. Ensure initial College Admin membership for master tenant BCE-BGP
    INSERT INTO public.college_memberships (college_id, user_id, role, status, updated_at)
    VALUES (
        'bce00000-0000-0000-0000-000000000001',
        p_user_id,
        'COLLEGE_ADMIN',
        'ACTIVE',
        timezone('utc'::text, now())
    )
    ON CONFLICT (college_id, user_id) DO UPDATE SET
        role = 'COLLEGE_ADMIN',
        status = 'ACTIVE',
        updated_at = timezone('utc'::text, now());
END;
$$;

-- 5.1 Immediate check: if auth.users already contains iambestadi@gmail.com, link now
DO $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, email, raw_user_meta_data 
    INTO v_user 
    FROM auth.users 
    WHERE LOWER(email) = 'iambestadi@gmail.com' 
    LIMIT 1;

    IF FOUND THEN
        PERFORM public.sync_platform_super_admin(
            v_user.id, 
            v_user.email, 
            COALESCE(v_user.raw_user_meta_data->>'name', 'Aditya (Platform Super Admin)')
        );
    END IF;
END $$;

-- 5.2 Trigger on auth.users for future registration of iambestadi@gmail.com
CREATE OR REPLACE FUNCTION public.handle_super_admin_auth_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF LOWER(NEW.email) = 'iambestadi@gmail.com' THEN
        PERFORM public.sync_platform_super_admin(
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'name', 'Aditya (Platform Super Admin)')
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_super_admin_on_registration ON auth.users;
CREATE TRIGGER trg_sync_super_admin_on_registration
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_super_admin_auth_registration();

-- ====================================================================
-- 6. RELOAD SCHEMA CACHE
-- ====================================================================
NOTIFY pgrst, 'reload schema';
