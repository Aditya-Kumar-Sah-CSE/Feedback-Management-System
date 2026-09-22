-- ====================================================================
-- PROJECT: BCE FACULTY FEEDBACK PORTAL
-- PHASE 3 MIGRATION: STUDENT PUBLIC FEEDBACK PORTAL
-- MIGRATION NAME: 20260913_phase3_student_portal.sql
-- DESCRIPTION: Enhance public RLS policy on feedback_forms to allow
--              students to view both PUBLISHED and CLOSED forms (so closed
--              forms display friendly closure messages instead of errors),
--              and update public_feedback_forms view safely.
-- ====================================================================

-- 1. UPDATE PUBLIC RLS POLICY ON FEEDBACK_FORMS
-- Allows anonymous students to view PUBLISHED and CLOSED forms.
-- DRAFT and ARCHIVED forms remain strictly hidden from public.
DROP POLICY IF EXISTS "Public can view published feedback forms" ON public.feedback_forms;
DROP POLICY IF EXISTS "Public can view published and closed feedback forms" ON public.feedback_forms;

CREATE POLICY "Public can view published and closed feedback forms" ON public.feedback_forms
    FOR SELECT USING (status IN ('PUBLISHED', 'CLOSED'));

-- 2. UPDATE PUBLIC SAFE VIEW
-- View strictly excludes google_sheet_id, google_sheet_url, google_form_edit_url, and tokens.
CREATE OR REPLACE VIEW public.public_feedback_forms AS
SELECT 
    id,
    title,
    description,
    academic_year_id,
    branch_id,
    semester_id,
    faculty_id,
    subject_id,
    form_type,
    status,
    slug,
    google_form_url,
    published_at,
    closed_at
FROM public.feedback_forms
WHERE status IN ('PUBLISHED', 'CLOSED');

GRANT SELECT ON public.public_feedback_forms TO anon, authenticated;

-- 3. INDEX FOR STUDENT CASCADING LOOKUP
CREATE INDEX IF NOT EXISTS idx_feedback_forms_student_lookup 
ON public.feedback_forms(academic_year_id, branch_id, semester_id, faculty_id, subject_id, status);
