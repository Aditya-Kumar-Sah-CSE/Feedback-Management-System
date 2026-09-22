-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000001_phase1_platform_and_tenants.sql
-- PURPOSE: Platform foundation, multi-tenant colleges, memberships,
--          and STABLE security-definer authorization functions.
-- SAFETY: Idempotent. Zero single-tenant BCE assumptions.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 2. PLATFORM ENTITIES: COLLEGES (ROOT TENANTS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.colleges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    tagline VARCHAR(255),
    established_year INTEGER,
    aicte_approved BOOLEAN NOT NULL DEFAULT true,
    affiliated_university VARCHAR(255),
    logo_url TEXT,
    primary_color VARCHAR(20) NOT NULL DEFAULT '#0B192C',
    secondary_color VARCHAR(20) NOT NULL DEFAULT '#1E3E62',
    accent_color VARCHAR(20) NOT NULL DEFAULT '#F6995C',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address TEXT,
    website_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for lightning-fast slug and code resolution
CREATE INDEX IF NOT EXISTS idx_colleges_slug ON public.colleges(slug);
CREATE INDEX IF NOT EXISTS idx_colleges_code ON public.colleges(code);
CREATE INDEX IF NOT EXISTS idx_colleges_active ON public.colleges(is_active);

-- ====================================================================
-- 3. PLATFORM ADMINISTRATORS (CROSS-TENANT PRIVILEGES)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'PLATFORM_SUPER_ADMIN',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user ON public.platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins(LOWER(email));

-- ====================================================================
-- 4. COLLEGE MEMBERSHIPS (TENANT-ADMIN ASSOCIATIONS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.college_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'COLLEGE_ADMIN' CHECK (role IN ('COLLEGE_ADMIN')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_college_memberships_college_user UNIQUE (college_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_college ON public.college_memberships(user_id, college_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_college ON public.college_memberships(college_id);

-- ====================================================================
-- 5. COLLEGE ADMIN ACCESS REQUESTS (TENANT-SCOPED ONBOARDING)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.college_admin_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial index preventing duplicate pending requests for the same college + email
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_requests_pending_unique 
    ON public.college_admin_requests (college_id, LOWER(email)) 
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_admin_requests_college_status 
    ON public.college_admin_requests(college_id, status, created_at DESC);

-- ====================================================================
-- 6. SECURITY-DEFINER READ-ONLY STABLE AUTHORIZATION FUNCTIONS
-- ====================================================================

-- Function 6.1: Check if user is an active Platform Super Admin
CREATE OR REPLACE FUNCTION public.is_platform_super_admin(auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_user_id IS NULL THEN 
    RETURN false; 
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth_user_id 
      AND is_active = true
  );
END;
$$;

-- Function 6.2: Check if user is an active College Admin for a given college
CREATE OR REPLACE FUNCTION public.is_college_admin(auth_user_id UUID, target_college_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_user_id IS NULL OR target_college_id IS NULL THEN 
    RETURN false; 
  END IF;

  -- Platform Super Admins possess administrative privileges across all colleges
  IF public.is_platform_super_admin(auth_user_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.college_memberships
    WHERE user_id = auth_user_id
      AND college_id = target_college_id
      AND role = 'COLLEGE_ADMIN'
      AND status = 'ACTIVE'
  );
END;
$$;

-- Function 6.3: Get all college IDs where the user has active admin privileges
CREATE OR REPLACE FUNCTION public.get_user_college_ids(auth_user_id UUID)
RETURNS TABLE (college_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_user_id IS NULL THEN
    RETURN;
  END IF;

  IF public.is_platform_super_admin(auth_user_id) THEN
    RETURN QUERY SELECT id FROM public.colleges WHERE is_active = true;
  ELSE
    RETURN QUERY 
      SELECT cm.college_id 
      FROM public.college_memberships cm
      JOIN public.colleges c ON c.id = cm.college_id
      WHERE cm.user_id = auth_user_id 
        AND cm.status = 'ACTIVE'
        AND c.is_active = true;
  END IF;
END;
$$;
