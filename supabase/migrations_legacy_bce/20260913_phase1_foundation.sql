-- ====================================================================
-- PROJECT: BCE FACULTY FEEDBACK PORTAL
-- PHASE 1 MIGRATION: FOUNDATION + ADMIN SYSTEM
-- MIGRATION NAME: 20260913_phase1_foundation.sql
-- DESCRIPTION: Idempotent migration to establish tables, columns, RLS,
--              triggers, and functions preserving all existing data.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 2. CORE ACADEMIC TABLES (IDEMPOTENT CREATION & ALTERATION)
-- ====================================================================

-- Academic Years
CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Semesters
CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 4),
    semester_number INTEGER NOT NULL CHECK (semester_number BETWEEN 1 AND 8),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS year_number INTEGER DEFAULT 1;
ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS semester_number INTEGER DEFAULT 1;
ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Faculties
CREATE TABLE IF NOT EXISTS public.faculties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(100),
    department VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL DEFAULT 'Assistant Professor',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.faculties ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
ALTER TABLE public.faculties ADD COLUMN IF NOT EXISTS department VARCHAR(255) DEFAULT 'General';
ALTER TABLE public.faculties ADD COLUMN IF NOT EXISTS designation VARCHAR(100) DEFAULT 'Assistant Professor';
ALTER TABLE public.faculties ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.faculties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Subjects
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Faculty Subject Assignments
CREATE TABLE IF NOT EXISTS public.faculty_subject_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id UUID NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.faculty_subject_assignments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.faculty_subject_assignments ADD COLUMN IF NOT EXISTS semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE;
ALTER TABLE public.faculty_subject_assignments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.faculty_subject_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- ====================================================================
-- 3. ADMIN TABLES
-- ====================================================================

-- Admins
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('SUPER_ADMIN', 'ADMIN')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'ADMIN';
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Admin Requests
CREATE TABLE IF NOT EXISTS public.admin_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.admins(id) ON DELETE SET NULL;
ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Feedback Forms (Phase 1 Foundation Only)
CREATE TABLE IF NOT EXISTS public.feedback_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    form_type VARCHAR(50) NOT NULL DEFAULT 'FACULTY_FEEDBACK',
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
    slug VARCHAR(255) UNIQUE,
    google_form_id TEXT,
    google_sheet_id TEXT,
    google_form_url TEXT,
    public_url TEXT,
    created_by UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS form_type VARCHAR(50) NOT NULL DEFAULT 'FACULTY_FEEDBACK';
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS google_form_id TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS google_sheet_id TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS google_form_url TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS public_url TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.admins(id) ON DELETE SET NULL;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id TEXT,
    details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ====================================================================
-- 4. INDEXES
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_subjects_branch_sem ON public.subjects(branch_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_lookup ON public.faculty_subject_assignments(academic_year_id, branch_id, semester_id, faculty_id);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_discovery ON public.feedback_forms(academic_year_id, branch_id, semester_id, faculty_id, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON public.admins(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON public.admins(email);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON public.admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ====================================================================
-- 5. DATABASE FUNCTIONS & TRIGGERS
-- ====================================================================

-- Function: Check if user is Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin(auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth_user_id 
      AND LOWER(email) = 'iambestadi@gmail.com'
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = auth_user_id
      AND role = 'SUPER_ADMIN'
      AND status = 'ACTIVE'
  );
END;
$$;

-- Function: Check if user is an approved Active Admin
CREATE OR REPLACE FUNCTION public.is_admin(auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth_user_id 
      AND LOWER(email) = 'iambestadi@gmail.com'
  ) THEN
    UPDATE public.admins 
    SET user_id = auth_user_id, status = 'ACTIVE', role = 'SUPER_ADMIN' 
    WHERE LOWER(email) = 'iambestadi@gmail.com' AND (user_id IS NULL OR user_id != auth_user_id);
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = auth_user_id
      AND status = 'ACTIVE'
  );
END;
$$;

-- Function: Server-side promotion for iambestadi@gmail.com
CREATE OR REPLACE FUNCTION public.ensure_super_admin(p_user_id UUID, p_email TEXT, p_name TEXT DEFAULT 'Aditya (Super Admin)')
RETURNS public.admins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin public.admins;
    v_clean_email TEXT;
BEGIN
    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email = 'iambestadi@gmail.com' THEN
        INSERT INTO public.admins (user_id, email, name, role, status, updated_at)
        VALUES (
            p_user_id,
            v_clean_email,
            COALESCE(NULLIF(p_name, ''), 'Aditya (Super Admin)'),
            'SUPER_ADMIN',
            'ACTIVE',
            timezone('utc'::text, now())
        )
        ON CONFLICT (user_id) DO UPDATE
        SET role = 'SUPER_ADMIN',
            status = 'ACTIVE',
            email = v_clean_email,
            updated_at = timezone('utc'::text, now())
        RETURNING * INTO v_admin;

        -- Mark any pending request as APPROVED
        UPDATE public.admin_requests
        SET status = 'APPROVED',
            reviewed_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE LOWER(TRIM(email)) = 'iambestadi@gmail.com';

        RETURN v_admin;
    END IF;
    RETURN NULL;
END;
$$;

-- Function: Approve admin request
CREATE OR REPLACE FUNCTION public.approve_admin_request(p_request_id UUID, p_reviewer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_reviewer RECORD;
    v_new_admin_id UUID;
BEGIN
    -- Verify reviewer is active super admin
    SELECT * INTO v_reviewer FROM public.admins WHERE id = p_reviewer_id AND role = 'SUPER_ADMIN' AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only an active Super Admin can approve requests.';
    END IF;

    SELECT * INTO v_req FROM public.admin_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin request not found.';
    END IF;

    IF v_req.status = 'APPROVED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already approved');
    END IF;

    -- Upsert admin record
    INSERT INTO public.admins (user_id, email, name, role, status, updated_at)
    VALUES (v_req.user_id, LOWER(TRIM(v_req.email)), v_req.name, 'ADMIN', 'ACTIVE', timezone('utc'::text, now()))
    ON CONFLICT (email) DO UPDATE
    SET status = 'ACTIVE',
        role = 'ADMIN',
        user_id = COALESCE(v_req.user_id, admins.user_id),
        updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_new_admin_id;

    -- Update request
    UPDATE public.admin_requests
    SET status = 'APPROVED',
        reviewed_by = p_reviewer_id,
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    -- Audit Log
    INSERT INTO public.audit_logs (admin_id, actor_email, action, entity_type, entity_id, details)
    VALUES (p_reviewer_id, v_reviewer.email, 'APPROVE_ADMIN', 'admin_requests', p_request_id::text, 'Approved admin request for ' || v_req.email);

    RETURN jsonb_build_object('success', true, 'admin_id', v_new_admin_id);
END;
$$;

-- Function: Reject admin request
CREATE OR REPLACE FUNCTION public.reject_admin_request(p_request_id UUID, p_reviewer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_reviewer RECORD;
BEGIN
    SELECT * INTO v_reviewer FROM public.admins WHERE id = p_reviewer_id AND role = 'SUPER_ADMIN' AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only an active Super Admin can reject requests.';
    END IF;

    SELECT * INTO v_req FROM public.admin_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin request not found.';
    END IF;

    UPDATE public.admin_requests
    SET status = 'REJECTED',
        reviewed_by = p_reviewer_id,
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs (admin_id, actor_email, action, entity_type, entity_id, details)
    VALUES (p_reviewer_id, v_reviewer.email, 'REJECT_ADMIN', 'admin_requests', p_request_id::text, 'Rejected admin request for ' || v_req.email);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Function: Toggle admin active/inactive status
CREATE OR REPLACE FUNCTION public.toggle_admin_status(p_target_admin_id UUID, p_new_status TEXT, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor RECORD;
    v_target RECORD;
BEGIN
    SELECT * INTO v_actor FROM public.admins WHERE id = p_actor_id AND role = 'SUPER_ADMIN' AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only an active Super Admin can toggle admin status.';
    END IF;

    SELECT * INTO v_target FROM public.admins WHERE id = p_target_admin_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target admin not found.';
    END IF;

    -- Prevent deactivating the Super Admin
    IF v_target.email = 'iambestadi@gmail.com' AND p_new_status = 'INACTIVE' THEN
        RAISE EXCEPTION 'The initial Super Admin cannot be deactivated.';
    END IF;

    UPDATE public.admins
    SET status = p_new_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_target_admin_id;

    INSERT INTO public.audit_logs (admin_id, actor_email, action, entity_type, entity_id, details)
    VALUES (p_actor_id, v_actor.email, 'TOGGLE_ADMIN_STATUS', 'admins', p_target_admin_id::text, 'Changed status of ' || v_target.email || ' to ' || p_new_status);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ====================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_subject_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6.1 Public read access for academic discovery
DROP POLICY IF EXISTS "Public can view active academic years" ON public.academic_years;
CREATE POLICY "Public can view active academic years" ON public.academic_years
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active branches" ON public.branches;
CREATE POLICY "Public can view active branches" ON public.branches
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active semesters" ON public.semesters;
CREATE POLICY "Public can view active semesters" ON public.semesters
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active faculties" ON public.faculties;
CREATE POLICY "Public can view active faculties" ON public.faculties
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active subjects" ON public.subjects;
CREATE POLICY "Public can view active subjects" ON public.subjects
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active assignments" ON public.faculty_subject_assignments;
CREATE POLICY "Public can view active assignments" ON public.faculty_subject_assignments
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view published feedback forms" ON public.feedback_forms;
CREATE POLICY "Public can view published feedback forms" ON public.feedback_forms
    FOR SELECT USING (status = 'PUBLISHED');

-- 6.2 Admin full access on academic entities
DROP POLICY IF EXISTS "Admins have full access to academic years" ON public.academic_years;
CREATE POLICY "Admins have full access to academic years" ON public.academic_years
    FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to branches" ON public.branches;
CREATE POLICY "Admins have full access to branches" ON public.branches
    FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to semesters" ON public.semesters;
CREATE POLICY "Admins have full access to semesters" ON public.semesters
    FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to faculties" ON public.faculties;
CREATE POLICY "Admins have full access to faculties" ON public.faculties
    FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to subjects" ON public.subjects;
CREATE POLICY "Admins have full access to subjects" ON public.subjects
    FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to assignments" ON public.faculty_subject_assignments;
CREATE POLICY "Admins have full access to assignments" ON public.faculty_subject_assignments
    FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins have full access to feedback forms" ON public.feedback_forms;
CREATE POLICY "Admins have full access to feedback forms" ON public.feedback_forms
    FOR ALL USING (public.is_admin(auth.uid()));

-- 6.3 Admins table protection
DROP POLICY IF EXISTS "Admins can view approved admin directory" ON public.admins;
CREATE POLICY "Admins can view approved admin directory" ON public.admins
    FOR SELECT USING (public.is_admin(auth.uid()) OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Super Admin can manage admins" ON public.admins;
CREATE POLICY "Super Admin can manage admins" ON public.admins
    FOR ALL USING (public.is_super_admin(auth.uid()));

-- 6.4 Admin requests protection
DROP POLICY IF EXISTS "Applicants can insert admin request" ON public.admin_requests;
CREATE POLICY "Applicants can insert admin request" ON public.admin_requests
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Applicants can view own request" ON public.admin_requests;
CREATE POLICY "Applicants can view own request" ON public.admin_requests
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admin can manage admin requests" ON public.admin_requests;
CREATE POLICY "Super Admin can manage admin requests" ON public.admin_requests
    FOR ALL USING (public.is_super_admin(auth.uid()));

-- 6.5 Audit logs protection
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() IS NOT NULL);

-- ====================================================================
-- 7. INITIAL SUPER ADMIN SEED & SCHEMA RELOAD
-- ====================================================================

-- 7.1 Seed or link Super Admin from auth.users if already registered
INSERT INTO public.admins (user_id, email, name, role, status, updated_at)
SELECT 
    id, 
    LOWER(email), 
    COALESCE(raw_user_meta_data->>'name', 'Aditya (Super Admin)'), 
    'SUPER_ADMIN', 
    'ACTIVE', 
    timezone('utc'::text, now())
FROM auth.users
WHERE LOWER(email) = 'iambestadi@gmail.com'
ON CONFLICT (email) DO UPDATE 
SET user_id = EXCLUDED.user_id,
    role = 'SUPER_ADMIN',
    status = 'ACTIVE',
    updated_at = timezone('utc'::text, now());

-- 7.2 If user hasn't signed up in auth.users yet, create baseline row in admins
INSERT INTO public.admins (email, name, role, status, updated_at)
VALUES (
    'iambestadi@gmail.com',
    'Aditya (Super Admin)',
    'SUPER_ADMIN',
    'ACTIVE',
    timezone('utc'::text, now())
)
ON CONFLICT (email) DO UPDATE 
SET role = 'SUPER_ADMIN',
    status = 'ACTIVE',
    updated_at = timezone('utc'::text, now());

-- 7.3 Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

