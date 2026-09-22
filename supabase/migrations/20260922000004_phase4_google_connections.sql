-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000004_phase4_google_connections.sql
-- PURPOSE: Tenant-scoped Google Workspace OAuth connections.
--          Replaces the legacy global singleton OAuth token model.
--          Protects refresh tokens from client-side exposure.
-- ====================================================================

-- ====================================================================
-- 1. COLLEGE GOOGLE CONNECTIONS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.college_google_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL UNIQUE REFERENCES public.colleges(id) ON DELETE CASCADE,
    account_email VARCHAR(255) NOT NULL,
    account_name VARCHAR(255),
    refresh_token TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
    is_valid BOOLEAN NOT NULL DEFAULT true,
    last_error TEXT,
    last_verified_at TIMESTAMPTZ,
    connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_google_connections_college 
    ON public.college_google_connections(college_id);

-- ====================================================================
-- 2. ACCESS RESTRICTIONS & PERMISSIONS
-- ====================================================================
-- Crucial Security Rule:
-- Google OAuth refresh tokens must NEVER be accessible to client browsers
-- or exposed via the Supabase Data API (anon or authenticated).
-- All token exchanges and API actions run server-side via service_role.

ALTER TABLE public.college_google_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.college_google_connections FROM anon, authenticated, public;
GRANT ALL ON public.college_google_connections TO service_role;

-- ====================================================================
-- 3. SAFE STATUS VIEW FOR DASHBOARD (EXCLUDES REFRESH TOKENS)
-- ====================================================================

CREATE OR REPLACE VIEW public.college_google_status AS
SELECT 
    id,
    college_id,
    account_email,
    account_name,
    scopes,
    is_valid,
    last_error,
    last_verified_at,
    connected_at,
    updated_at
FROM public.college_google_connections
WHERE (
    public.is_platform_super_admin(auth.uid()) OR
    public.is_college_admin(auth.uid(), college_id)
);

-- Allow authenticated admins to read only non-sensitive metadata for their college
GRANT SELECT ON public.college_google_status TO authenticated;
