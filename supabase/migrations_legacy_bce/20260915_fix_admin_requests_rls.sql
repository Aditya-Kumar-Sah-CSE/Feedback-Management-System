-- ====================================================================
-- MIGRATION: 20260915_fix_admin_requests_rls.sql
-- PURPOSE: Fix RLS error 25006 "cannot execute UPDATE in a read-only transaction"
--          caused by is_admin() containing an UPDATE inside SELECT-path evaluation.
--          Also add INSERT policy and partial unique index for duplicate prevention.
-- SAFETY: Does NOT create new tables. Does NOT drop columns. Preserves existing architecture.
-- ====================================================================

-- 1. Redefine is_super_admin as a pure read-only STABLE function
CREATE OR REPLACE FUNCTION public.is_super_admin(auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check by email match in auth.users
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth_user_id 
      AND LOWER(email) = 'iambestadi@gmail.com'
  ) THEN
    RETURN true;
  END IF;

  -- Check by admins table record
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = auth_user_id
      AND role = 'SUPER_ADMIN'
      AND (status = 'ACTIVE' OR status IS NULL)
  );
END;
$$;

-- 2. Redefine is_admin as a pure read-only STABLE function
--    REMOVED the UPDATE statement that caused error 25006 in read-only transactions.
--    Super Admin auto-linking is handled by ensure_super_admin() at login time instead.
CREATE OR REPLACE FUNCTION public.is_admin(auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super admin email is always an admin
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth_user_id 
      AND LOWER(email) = 'iambestadi@gmail.com'
  ) THEN
    RETURN true;
  END IF;

  -- Check admins table for active status
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = auth_user_id
      AND (status = 'ACTIVE' OR status IS NULL)
  );
END;
$$;

-- 3. Fix RLS policies on admin_requests
-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Applicants can insert admin request" ON public.admin_requests;
DROP POLICY IF EXISTS "Applicants can view own request" ON public.admin_requests;
DROP POLICY IF EXISTS "Super Admin can manage admin requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Super Admins manage admin requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Users read own admin request" ON public.admin_requests;

-- Ensure RLS is enabled
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;

-- INSERT: Any authenticated user can submit an admin access request
CREATE POLICY "Applicants can insert admin request" ON public.admin_requests
    FOR INSERT WITH CHECK (true);

-- SELECT: Applicant can see own request, or any admin/super-admin can see all
CREATE POLICY "Admins and applicants can view admin requests" ON public.admin_requests
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_admin(auth.uid())
        OR public.is_super_admin(auth.uid())
    );

-- UPDATE/DELETE: Only Super Admin can manage (approve/reject/delete)
CREATE POLICY "Super Admin can manage admin requests" ON public.admin_requests
    FOR ALL USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. Partial unique index to prevent duplicate PENDING requests for same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_requests_pending_email
    ON public.admin_requests (LOWER(email))
    WHERE status = 'PENDING';

-- 5. Performance index on status + created_at for dashboard queries
CREATE INDEX IF NOT EXISTS idx_admin_requests_status_created
    ON public.admin_requests (status, created_at DESC);

-- 6. Ensure admins.email has a UNIQUE constraint (required for upsert onConflict: 'email')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admins_email_key'
  ) THEN
    ALTER TABLE public.admins ADD CONSTRAINT admins_email_key UNIQUE (email);
  END IF;
END $$;
