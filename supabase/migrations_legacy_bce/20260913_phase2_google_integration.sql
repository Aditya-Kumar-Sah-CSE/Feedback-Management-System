-- ====================================================================
-- PROJECT: BCE FACULTY FEEDBACK PORTAL
-- PHASE 2 MIGRATION: GOOGLE FORMS + GOOGLE SHEETS INTEGRATION
-- MIGRATION NAME: 20260913_phase2_google_integration.sql
-- DESCRIPTION: Idempotently extend feedback_forms with Google metadata,
--              lifecycle timestamps, and sync properties.
-- ====================================================================

-- 1. EXTEND FEEDBACK_FORMS COLUMNS
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS google_form_edit_url TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS google_sheet_url TEXT;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS response_destination_type VARCHAR(50) DEFAULT 'APPLICATION_MANAGED' CHECK (response_destination_type IN ('NATIVE_SHEET', 'APPLICATION_MANAGED'));
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.feedback_forms ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- 2. CREATE INDEXES FOR FAST LOOKUP AND STATUS FILTERING
CREATE INDEX IF NOT EXISTS idx_feedback_forms_status ON public.feedback_forms(status);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_google_ids ON public.feedback_forms(google_form_id, google_sheet_id);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_sync ON public.feedback_forms(last_synced_at);

-- 3. AUDIT LOG ACTION VALIDATION (Ensure Phase 2 action types are indexed)
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- 4. PUBLIC VIEW OF PUBLISHED FORMS
-- Safe view for public student queries avoiding exposure of private Google Sheet IDs or edit links
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
    published_at
FROM public.feedback_forms
WHERE status = 'PUBLISHED';

GRANT SELECT ON public.public_feedback_forms TO anon, authenticated;
