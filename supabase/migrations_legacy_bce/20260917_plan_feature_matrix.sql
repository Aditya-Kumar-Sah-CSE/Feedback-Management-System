-- ====================================================================
-- MIGRATION: 20260917_plan_feature_matrix.sql
-- PURPOSE: Ensure database-driven billing_plans contain authoritative feature sets
-- ====================================================================

-- 1. FREE BASE PLAN
UPDATE public.billing_plans
SET features = '["Basic analytics"]'::jsonb,
    is_active = true
WHERE slug = 'FREE';

-- 2. BASIC PLAN (Google Form generation, Google Sheet integration, Basic analytics)
INSERT INTO public.billing_plans (
    name,
    slug,
    description,
    price,
    currency,
    billing_interval,
    duration_days,
    features,
    is_active,
    is_recommended,
    display_order
)
VALUES (
    'Basic',
    'BASIC',
    'Essential tools for form generation and response sync. Full analytics & PDF exports locked.',
    999,
    'INR',
    'MONTHLY',
    30,
    '["Google Form generation", "Google Sheet integration", "Basic analytics"]'::jsonb,
    true,
    false,
    15
)
ON CONFLICT (slug) DO UPDATE
SET features = '["Google Form generation", "Google Sheet integration", "Basic analytics"]'::jsonb,
    name = 'Basic',
    is_active = true,
    price = EXCLUDED.price,
    duration_days = EXCLUDED.duration_days;

-- 3. FULL ACCESS PLAN (Forms, Sheets, Basic Analytics, Full Analytics, Analytics PDF)
INSERT INTO public.billing_plans (
    name,
    slug,
    description,
    price,
    currency,
    billing_interval,
    duration_days,
    features,
    is_active,
    is_recommended,
    display_order
)
VALUES (
    'Full Access',
    'FULL_ACCESS',
    'Complete access to form generation, response sync, full analytics dashboard, and PDF reports.',
    2999,
    'INR',
    'MONTHLY',
    30,
    '["Google Form generation", "Google Sheet integration", "Basic analytics", "Full analytics access", "Analytics PDF reports"]'::jsonb,
    true,
    true,
    25
)
ON CONFLICT (slug) DO UPDATE
SET features = '["Google Form generation", "Google Sheet integration", "Basic analytics", "Full analytics access", "Analytics PDF reports"]'::jsonb,
    name = 'Full Access',
    is_active = true,
    price = EXCLUDED.price,
    duration_days = EXCLUDED.duration_days;

-- 4. UPDATE MONTHLY, HALF_YEARLY, YEARLY PLANS WITH COMPLETE FEATURE SET
UPDATE public.billing_plans
SET features = '["Google Form generation", "Google Sheet integration", "Basic analytics", "Full analytics access", "Analytics PDF reports", "Priority support"]'::jsonb
WHERE slug IN ('MONTHLY', 'HALF_YEARLY', 'YEARLY');
