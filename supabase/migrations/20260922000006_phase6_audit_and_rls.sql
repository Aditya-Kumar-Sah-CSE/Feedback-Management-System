-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000006_phase6_audit_and_rls.sql
-- PURPOSE: Platform and tenant audit logging, complete Row Level Security
--          (RLS) enforcement across all tables, and explicit grants.
-- ====================================================================

-- ====================================================================
-- 1. AUDIT LOGS TABLE (HYBRID: PLATFORM + TENANT EVENTS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID REFERENCES public.colleges(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_college_created 
    ON public.audit_logs(college_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor 
    ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
    ON public.audit_logs(action);

-- ====================================================================
-- 2. ENABLE ROW LEVEL SECURITY ACROSS ALL APPLICATION TABLES
-- ====================================================================

ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_subject_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_form_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_response_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_trial_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.college_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. RLS POLICIES
-- ====================================================================

-- --------------------------------------------------------------------
-- 3.1 COLLEGES POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active colleges" ON public.colleges;
CREATE POLICY "Public read active colleges" ON public.colleges
    FOR SELECT TO anon, authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Super Admin manages colleges" ON public.colleges;
CREATE POLICY "Super Admin manages colleges" ON public.colleges
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- --------------------------------------------------------------------
-- 3.2 PLATFORM ADMINS POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Super Admin manages platform admins" ON public.platform_admins;
CREATE POLICY "Super Admin manages platform admins" ON public.platform_admins
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- --------------------------------------------------------------------
-- 3.3 COLLEGE MEMBERSHIPS POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Super Admin manages all memberships" ON public.college_memberships;
CREATE POLICY "Super Admin manages all memberships" ON public.college_memberships
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view own college memberships" ON public.college_memberships;
CREATE POLICY "Admins view own college memberships" ON public.college_memberships
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.is_college_admin(auth.uid(), college_id)
    );

-- --------------------------------------------------------------------
-- 3.4 COLLEGE ADMIN REQUESTS POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Applicants insert admin request" ON public.college_admin_requests;
CREATE POLICY "Applicants insert admin request" ON public.college_admin_requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Applicants view own requests" ON public.college_admin_requests;
CREATE POLICY "Applicants view own requests" ON public.college_admin_requests
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "College Admins manage requests" ON public.college_admin_requests;
CREATE POLICY "College Admins manage requests" ON public.college_admin_requests
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- --------------------------------------------------------------------
-- 3.5 ACADEMIC ENTITIES POLICIES (YEARS, BRANCHES, SEMESTERS, FACULTIES, SUBJECTS, ASSIGNMENTS)
-- --------------------------------------------------------------------

-- Academic Years
DROP POLICY IF EXISTS "Public view active academic years" ON public.academic_years;
CREATE POLICY "Public view active academic years" ON public.academic_years
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = academic_years.college_id AND c.is_active = true));

DROP POLICY IF EXISTS "Admins manage academic years" ON public.academic_years;
CREATE POLICY "Admins manage academic years" ON public.academic_years
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- Branches
DROP POLICY IF EXISTS "Public view active branches" ON public.branches;
CREATE POLICY "Public view active branches" ON public.branches
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = branches.college_id AND c.is_active = true));

DROP POLICY IF EXISTS "Admins manage branches" ON public.branches;
CREATE POLICY "Admins manage branches" ON public.branches
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- Semesters
DROP POLICY IF EXISTS "Public view active semesters" ON public.semesters;
CREATE POLICY "Public view active semesters" ON public.semesters
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = semesters.college_id AND c.is_active = true));

DROP POLICY IF EXISTS "Admins manage semesters" ON public.semesters;
CREATE POLICY "Admins manage semesters" ON public.semesters
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- Faculties
DROP POLICY IF EXISTS "Public view active faculties" ON public.faculties;
CREATE POLICY "Public view active faculties" ON public.faculties
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = faculties.college_id AND c.is_active = true));

DROP POLICY IF EXISTS "Admins manage faculties" ON public.faculties;
CREATE POLICY "Admins manage faculties" ON public.faculties
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- Subjects
DROP POLICY IF EXISTS "Public view active subjects" ON public.subjects;
CREATE POLICY "Public view active subjects" ON public.subjects
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = subjects.college_id AND c.is_active = true));

DROP POLICY IF EXISTS "Admins manage subjects" ON public.subjects;
CREATE POLICY "Admins manage subjects" ON public.subjects
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- Faculty Subject Assignments
DROP POLICY IF EXISTS "Public view active assignments" ON public.faculty_subject_assignments;
CREATE POLICY "Public view active assignments" ON public.faculty_subject_assignments
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = faculty_subject_assignments.college_id AND c.is_active = true));

DROP POLICY IF EXISTS "Admins manage assignments" ON public.faculty_subject_assignments;
CREATE POLICY "Admins manage assignments" ON public.faculty_subject_assignments
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- --------------------------------------------------------------------
-- 3.6 FEEDBACK FORMS & ITEMS POLICIES
-- --------------------------------------------------------------------

-- Feedback Forms
DROP POLICY IF EXISTS "Public view published feedback forms" ON public.feedback_forms;
CREATE POLICY "Public view published feedback forms" ON public.feedback_forms
    FOR SELECT TO anon, authenticated
    USING (
        status IN ('PUBLISHED', 'CLOSED') 
        AND EXISTS (SELECT 1 FROM public.colleges c WHERE c.id = feedback_forms.college_id AND c.is_active = true)
    );

DROP POLICY IF EXISTS "Admins manage feedback forms" ON public.feedback_forms;
CREATE POLICY "Admins manage feedback forms" ON public.feedback_forms
    FOR ALL TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id))
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

-- Feedback Form Items (Derived ownership via parent form)
DROP POLICY IF EXISTS "Public view published feedback form items" ON public.feedback_form_items;
CREATE POLICY "Public view published feedback form items" ON public.feedback_form_items
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.feedback_forms f
            JOIN public.colleges c ON c.id = f.college_id
            WHERE f.id = feedback_form_items.form_id
              AND f.status IN ('PUBLISHED', 'CLOSED')
              AND c.is_active = true
        )
    );

DROP POLICY IF EXISTS "Admins manage feedback form items" ON public.feedback_form_items;
CREATE POLICY "Admins manage feedback form items" ON public.feedback_form_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.feedback_forms f
            WHERE f.id = feedback_form_items.form_id
              AND public.is_college_admin(auth.uid(), f.college_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.feedback_forms f
            WHERE f.id = feedback_form_items.form_id
              AND public.is_college_admin(auth.uid(), f.college_id)
        )
    );

-- --------------------------------------------------------------------
-- 3.7 FEEDBACK RESPONSE RECORDS POLICIES (STUDENT PRIVACY PROTECTED)
-- --------------------------------------------------------------------
REVOKE ALL ON public.feedback_response_records FROM anon, public;
GRANT SELECT ON public.feedback_response_records TO authenticated;
GRANT ALL ON public.feedback_response_records TO service_role;

DROP POLICY IF EXISTS "Admins view college response records" ON public.feedback_response_records;
CREATE POLICY "Admins view college response records" ON public.feedback_response_records
    FOR SELECT TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id));

-- --------------------------------------------------------------------
-- 3.8 BILLING & PAYMENTS POLICIES
-- --------------------------------------------------------------------

-- Billing Plans
DROP POLICY IF EXISTS "Public view active billing plans" ON public.billing_plans;
CREATE POLICY "Public view active billing plans" ON public.billing_plans
    FOR SELECT TO anon, authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Super Admin manages billing plans" ON public.billing_plans;
CREATE POLICY "Super Admin manages billing plans" ON public.billing_plans
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- Payment Settings
DROP POLICY IF EXISTS "Admins view payment settings" ON public.payment_settings;
CREATE POLICY "Admins view payment settings" ON public.payment_settings
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Super Admin manages payment settings" ON public.payment_settings;
CREATE POLICY "Super Admin manages payment settings" ON public.payment_settings
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- College Billing Accounts
DROP POLICY IF EXISTS "Admins view college billing" ON public.college_billing_accounts;
CREATE POLICY "Admins view college billing" ON public.college_billing_accounts
    FOR SELECT TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id));

DROP POLICY IF EXISTS "Super Admin manages all college billing" ON public.college_billing_accounts;
CREATE POLICY "Super Admin manages all college billing" ON public.college_billing_accounts
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- College Trial Entitlements
DROP POLICY IF EXISTS "Admins view college trials" ON public.college_trial_entitlements;
CREATE POLICY "Admins view college trials" ON public.college_trial_entitlements
    FOR SELECT TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id));

DROP POLICY IF EXISTS "Super Admin manages college trials" ON public.college_trial_entitlements;
CREATE POLICY "Super Admin manages college trials" ON public.college_trial_entitlements
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- College Payment Requests
DROP POLICY IF EXISTS "Admins view and submit payment requests" ON public.college_payment_requests;
CREATE POLICY "Admins view and submit payment requests" ON public.college_payment_requests
    FOR SELECT TO authenticated
    USING (public.is_college_admin(auth.uid(), college_id));

CREATE POLICY "Admins insert payment requests" ON public.college_payment_requests
    FOR INSERT TO authenticated
    WITH CHECK (public.is_college_admin(auth.uid(), college_id));

DROP POLICY IF EXISTS "Super Admin manages payment requests" ON public.college_payment_requests;
CREATE POLICY "Super Admin manages payment requests" ON public.college_payment_requests
    FOR ALL TO authenticated
    USING (public.is_platform_super_admin(auth.uid()))
    WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- --------------------------------------------------------------------
-- 3.9 AUDIT LOGS POLICIES
-- --------------------------------------------------------------------
REVOKE ALL ON public.audit_logs FROM anon, public;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "Admins view college audit logs" ON public.audit_logs;
CREATE POLICY "Admins view college audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        public.is_platform_super_admin(auth.uid()) OR
        (college_id IS NOT NULL AND public.is_college_admin(auth.uid(), college_id))
    );

DROP POLICY IF EXISTS "Authenticated users insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users insert audit logs" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL AND (
            (college_id IS NULL AND public.is_platform_super_admin(auth.uid())) OR
            (college_id IS NOT NULL AND public.is_college_admin(auth.uid(), college_id))
        )
    );

-- ====================================================================
-- 4. SERVICE ROLE FULL ACCESS GRANTS
-- ====================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
