-- ====================================================================
-- MIGRATION: 20260914_response_records_and_ratings.sql
-- DESCRIPTION: Response Metadata Records & Sync Tracking Table
--              1. Creates feedback_response_records table
--              2. Adds performance indexes
--              3. Configures admin-only RLS and service role grants
--              4. Ensures 100% idempotent execution
-- ====================================================================

-- 1. CREATE FEEDBACK_RESPONSE_RECORDS TABLE
CREATE TABLE IF NOT EXISTS public.feedback_response_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id UUID NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
    google_response_id VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    student_name VARCHAR(255),
    registration_number VARCHAR(100),
    submitted_at TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    confirmation_email_sent_at TIMESTAMP WITH TIME ZONE,
    email_status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_feedback_response_records_form_google_id UNIQUE(form_id, google_response_id)
);

-- 2. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_feedback_responses_form ON public.feedback_response_records(form_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_google_id ON public.feedback_response_records(google_response_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_email ON public.feedback_response_records(student_email);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_reg_no ON public.feedback_response_records(registration_number);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_submitted ON public.feedback_response_records(submitted_at);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_synced ON public.feedback_response_records(synced_at);

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.feedback_response_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Only authorized admins can view response records
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'feedback_response_records' 
          AND policyname = 'Admins have full access to response records'
    ) THEN
        CREATE POLICY "Admins have full access to response records" ON public.feedback_response_records
            FOR ALL TO authenticated
            USING (public.is_admin(auth.uid()))
            WITH CHECK (public.is_admin(auth.uid()));
    END IF;
END $$;

-- 4. PERMISSIONS
-- Explicitly DO NOT grant SELECT to public / anon to protect student privacy
REVOKE ALL ON public.feedback_response_records FROM anon, public;
GRANT ALL ON public.feedback_response_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_response_records TO authenticated;
