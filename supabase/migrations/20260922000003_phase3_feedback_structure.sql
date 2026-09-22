-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000003_phase3_feedback_structure.sql
-- PURPOSE: Tenant-scoped feedback forms, multi-teacher form items,
--          response metadata sync tracking, and safe public views.
-- ====================================================================

-- ====================================================================
-- 1. FEEDBACK FORMS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.feedback_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
    faculty_id UUID REFERENCES public.faculties(id) ON DELETE RESTRICT,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE RESTRICT,
    form_type VARCHAR(50) NOT NULL DEFAULT 'FACULTY_FEEDBACK' 
        CHECK (form_type IN ('FACULTY_FEEDBACK', 'SEMESTER_FEEDBACK')),
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
    slug VARCHAR(255) NOT NULL,
    google_form_id TEXT,
    google_sheet_id TEXT,
    google_form_url TEXT,
    google_form_edit_url TEXT,
    google_sheet_url TEXT,
    response_destination_type VARCHAR(50) DEFAULT 'APPLICATION_MANAGED' 
        CHECK (response_destination_type IN ('NATIVE_SHEET', 'APPLICATION_MANAGED')),
    response_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_feedback_forms_college_slug UNIQUE (college_id, slug),
    CONSTRAINT chk_feedback_forms_scope CHECK (
        (form_type = 'SEMESTER_FEEDBACK') OR 
        (faculty_id IS NOT NULL AND subject_id IS NOT NULL)
    )
);

-- Performance and Discovery Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_forms_college ON public.feedback_forms(college_id);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_discovery 
    ON public.feedback_forms(college_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_cascading 
    ON public.feedback_forms(college_id, academic_year_id, branch_id, semester_id, status);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_google_ids 
    ON public.feedback_forms(college_id, google_form_id, google_sheet_id);

-- ====================================================================
-- 2. FEEDBACK FORM ITEMS (MULTI-FACULTY SEMESTER FORMS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.feedback_form_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculties(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    assignment_id UUID REFERENCES public.faculty_subject_assignments(id) ON DELETE SET NULL,
    grid_title VARCHAR(255) NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_feedback_form_items_form_f_s UNIQUE (form_id, faculty_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_form_items_form_order 
    ON public.feedback_form_items(form_id, order_index);
CREATE INDEX IF NOT EXISTS idx_feedback_form_items_faculty 
    ON public.feedback_form_items(faculty_id);
CREATE INDEX IF NOT EXISTS idx_feedback_form_items_subject 
    ON public.feedback_form_items(subject_id);

-- ====================================================================
-- 3. FEEDBACK RESPONSE RECORDS (METADATA & RECEIPT TRACKING)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.feedback_response_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
    google_response_id VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    student_name VARCHAR(255),
    registration_number VARCHAR(100),
    submitted_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    confirmation_email_sent_at TIMESTAMPTZ,
    email_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' 
        CHECK (email_status IN ('PENDING', 'SENT', 'FAILED', 'EMAIL_NOT_CONFIGURED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_feedback_response_records_c_f_g UNIQUE (college_id, form_id, google_response_id)
);

CREATE INDEX IF NOT EXISTS idx_response_records_college_form 
    ON public.feedback_response_records(college_id, form_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_records_email 
    ON public.feedback_response_records(college_id, student_email);
CREATE INDEX IF NOT EXISTS idx_response_records_reg_no 
    ON public.feedback_response_records(college_id, registration_number);

-- ====================================================================
-- 4. PUBLIC VIEW (SAFE PROJECTION FOR STUDENTS & PUBLIC ACCESS)
-- ====================================================================
-- Strictly omits google_sheet_id, google_sheet_url, google_form_edit_url.
CREATE OR REPLACE VIEW public.public_feedback_forms AS
SELECT 
    f.id,
    f.college_id,
    c.slug AS college_slug,
    c.name AS college_name,
    f.title,
    f.description,
    f.academic_year_id,
    f.branch_id,
    f.semester_id,
    f.faculty_id,
    f.subject_id,
    f.form_type,
    f.status,
    f.slug,
    f.google_form_url,
    f.published_at,
    f.closed_at
FROM public.feedback_forms f
JOIN public.colleges c ON c.id = f.college_id
WHERE f.status IN ('PUBLISHED', 'CLOSED') 
  AND c.is_active = true;

GRANT SELECT ON public.public_feedback_forms TO anon, authenticated;
