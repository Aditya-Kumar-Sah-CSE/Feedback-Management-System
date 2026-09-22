-- ====================================================================
-- PROJECT: BCE FACULTY FEEDBACK PORTAL
-- PERFORMANCE OPTIMIZATION: INDEXES FOR FAST ADMIN CRUD & FORMS
-- MIGRATION NAME: 20260914_performance_indexes.sql
-- DESCRIPTION: Idempotent creation of specialized indexes for
--              high-frequency search, filtering, pagination, and sorting.
-- ====================================================================

-- 1. FACULTIES INDEXES
-- Optimizes name search, department filtering, and active status checks
CREATE INDEX IF NOT EXISTS idx_faculties_name ON public.faculties(name);
CREATE INDEX IF NOT EXISTS idx_faculties_dept_active ON public.faculties(department, is_active);
CREATE INDEX IF NOT EXISTS idx_faculties_is_active ON public.faculties(is_active);
CREATE INDEX IF NOT EXISTS idx_faculties_created_at ON public.faculties(created_at DESC);

-- 2. SUBJECTS INDEXES
-- Optimizes code search, name search, and branch/semester curriculum catalog filtering
CREATE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(code);
CREATE INDEX IF NOT EXISTS idx_subjects_name ON public.subjects(name);
CREATE INDEX IF NOT EXISTS idx_subjects_active ON public.subjects(is_active);
CREATE INDEX IF NOT EXISTS idx_subjects_created_at ON public.subjects(created_at DESC);

-- 3. FACULTY-SUBJECT ASSIGNMENTS INDEXES
-- Optimizes session lookup, faculty+subject idempotency checks, and created_at ordering
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_f_s_y ON public.faculty_subject_assignments(faculty_id, subject_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_subject ON public.faculty_subject_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_created ON public.faculty_subject_assignments(created_at DESC);

-- 4. FEEDBACK FORMS INDEXES
-- Optimizes admin catalog listing, created_at descending sort, and cascading filter lookups
CREATE INDEX IF NOT EXISTS idx_feedback_forms_created_at ON public.feedback_forms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_year_branch_sem ON public.feedback_forms(academic_year_id, branch_id, semester_id);

-- 5. SEMESTERS & BRANCHES INDEXES
-- Optimizes sequence sorting and name lookups
CREATE INDEX IF NOT EXISTS idx_semesters_number ON public.semesters(semester_number);
CREATE INDEX IF NOT EXISTS idx_branches_name ON public.branches(name);

-- 6. AUDIT LOGS INDEXES
-- Optimizes form-specific audit history lookup
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs(entity_id);
