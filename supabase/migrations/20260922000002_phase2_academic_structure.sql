-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260922000002_phase2_academic_structure.sql
-- PURPOSE: Tenant-scoped academic curriculum structures:
--          academic years, branches, semesters, faculties, subjects,
--          and faculty-subject assignments.
-- ====================================================================

-- ====================================================================
-- 1. ACADEMIC YEARS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_academic_years_college_name UNIQUE (college_id, name)
);

CREATE INDEX IF NOT EXISTS idx_academic_years_college ON public.academic_years(college_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_active ON public.academic_years(college_id, is_active);

-- ====================================================================
-- 2. BRANCHES (DEPARTMENTS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_branches_college_code UNIQUE (college_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_college ON public.branches(college_id);
CREATE INDEX IF NOT EXISTS idx_branches_active ON public.branches(college_id, is_active);

-- ====================================================================
-- 3. SEMESTERS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 4),
    semester_number INTEGER NOT NULL CHECK (semester_number BETWEEN 1 AND 8),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_semesters_college_sem_no UNIQUE (college_id, semester_number)
);

CREATE INDEX IF NOT EXISTS idx_semesters_college ON public.semesters(college_id, semester_number);
CREATE INDEX IF NOT EXISTS idx_semesters_active ON public.semesters(college_id, is_active);

-- ====================================================================
-- 4. FACULTIES (TEACHING STAFF)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.faculties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(100),
    department VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL DEFAULT 'Assistant Professor',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Filtered unique index: employee_id is unique per college when provided
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculties_employee_unique 
    ON public.faculties(college_id, employee_id) 
    WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_faculties_college_dept ON public.faculties(college_id, department);
CREATE INDEX IF NOT EXISTS idx_faculties_college_name ON public.faculties(college_id, name);
CREATE INDEX IF NOT EXISTS idx_faculties_college_active ON public.faculties(college_id, is_active);

-- ====================================================================
-- 5. SUBJECTS (COURSES)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_subjects_college_code UNIQUE (college_id, code)
);

CREATE INDEX IF NOT EXISTS idx_subjects_college ON public.subjects(college_id);
CREATE INDEX IF NOT EXISTS idx_subjects_college_curriculum ON public.subjects(college_id, branch_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_subjects_active ON public.subjects(college_id, is_active);

-- ====================================================================
-- 6. FACULTY-SUBJECT ASSIGNMENTS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.faculty_subject_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_faculty_assignments_f_s_y UNIQUE (college_id, faculty_id, subject_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_lookup 
    ON public.faculty_subject_assignments(college_id, academic_year_id, branch_id, semester_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_faculty ON public.faculty_subject_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON public.faculty_subject_assignments(subject_id);
