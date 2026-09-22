-- ====================================================================
-- MIGRATION: 20260917_payment_proofs_storage.sql
-- DESCRIPTION: Setup payment-proofs Supabase Storage bucket for billing upgrades
-- ====================================================================

-- 1. Insert payment-proofs bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- 2. Storage RLS policies
-- Service role has full access by default.
-- Authenticated admins can upload their own proofs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND policyname = 'Admins can upload payment proofs'
    ) THEN
        CREATE POLICY "Admins can upload payment proofs" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'payment-proofs');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND policyname = 'Admins can view payment proofs'
    ) THEN
        CREATE POLICY "Admins can view payment proofs" ON storage.objects
            FOR SELECT TO authenticated
            USING (bucket_id = 'payment-proofs');
    END IF;
END $$;
