-- ====================================================================
-- GOOGLE OAUTH TOKENS PERSISTENT STORAGE
-- Secure server-side singleton table for Google OAuth refresh token
-- Accessible only by service_role (server-side operations)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
    id TEXT PRIMARY KEY DEFAULT 'default',
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Deny all access to anon and authenticated roles
-- ONLY service_role can read and write
REVOKE ALL ON TABLE public.google_oauth_tokens FROM anon, authenticated;
GRANT ALL ON TABLE public.google_oauth_tokens TO service_role;
