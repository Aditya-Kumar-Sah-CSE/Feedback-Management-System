-- ====================================================================
-- MIGRATION: 20260914_multi_faculty_semester_forms.sql
-- DESCRIPTION: Enable Multi-Faculty Semester Feedback Forms (SEMESTER_FEEDBACK)
--              1. Make faculty_id and subject_id nullable on feedback_forms
--              2. Create feedback_form_items table with indexes and RLS
--              3. Grant proper permissions
-- ====================================================================

-- 1. MAKE FACULTY_ID AND SUBJECT_ID NULLABLE FOR SEMESTER_FEEDBACK FORMS
ALTER TABLE public.feedback_forms ALTER COLUMN faculty_id DROP NOT NULL;
ALTER TABLE public.feedback_forms ALTER COLUMN subject_id DROP NOT NULL;

-- Ensure check constraint for data integrity:
-- Single-faculty forms must have both faculty_id and subject_id.
ALTER TABLE public.feedback_forms DROP CONSTRAINT IF EXISTS chk_feedback_forms_scope;
ALTER TABLE public.feedback_forms ADD CONSTRAINT chk_feedback_forms_scope CHECK (
    (form_type = 'SEMESTER_FEEDBACK') OR
    (faculty_id IS NOT NULL AND subject_id IS NOT NULL)
);

-- 2. CREATE FEEDBACK_FORM_ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.feedback_form_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id UUID NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES public.faculty_subject_assignments(id) ON DELETE SET NULL,
    grid_title VARCHAR(255) NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(form_id, faculty_id, subject_id)
);

-- 3. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_feedback_form_items_form ON public.feedback_form_items(form_id);
CREATE INDEX IF NOT EXISTS idx_feedback_form_items_faculty ON public.feedback_form_items(faculty_id);
CREATE INDEX IF NOT EXISTS idx_feedback_form_items_subject ON public.feedback_form_items(subject_id);
CREATE INDEX IF NOT EXISTS idx_feedback_form_items_order ON public.feedback_form_items(form_id, order_index);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_type_status ON public.feedback_forms(academic_year_id, branch_id, semester_id, form_type, status);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.feedback_form_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Public view policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'feedback_form_items' 
          AND policyname = 'Public can view published feedback form items'
    ) THEN
        CREATE POLICY "Public can view published feedback form items" ON public.feedback_form_items
            FOR SELECT TO anon, authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.feedback_forms f
                    WHERE f.id = feedback_form_items.form_id
                      AND f.status IN ('PUBLISHED', 'CLOSED')
                )
            );
    END IF;

    -- Admins full access policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'feedback_form_items' 
          AND policyname = 'Admins have full access to feedback form items'
    ) THEN
        CREATE POLICY "Admins have full access to feedback form items" ON public.feedback_form_items
            FOR ALL TO authenticated
            USING (public.is_admin(auth.uid()))
            WITH CHECK (public.is_admin(auth.uid()));
    END IF;
END $$;

-- 5. PERMISSIONS
GRANT SELECT ON public.feedback_form_items TO anon, authenticated;
GRANT ALL ON public.feedback_form_items TO service_role;
