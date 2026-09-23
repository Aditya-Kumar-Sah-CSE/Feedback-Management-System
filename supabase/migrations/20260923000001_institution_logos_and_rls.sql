-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260923000001_institution_logos_and_rls.sql
-- PURPOSE: Provision institution-logos public storage bucket with strict
--          scoped RLS, harden public.colleges RLS policies for College
--          Admins, and enforce database-level BEFORE UPDATE trigger
--          preventing non-Super Admins from mutating is_active, code, or slug.
-- ====================================================================

-- 1. PROVISION STORAGE BUCKET: 'institution-logos'
-- Public read for portal/report rendering, 5MB limit, strict image types.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'institution-logos',
    'institution-logos',
    true,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- 2. STORAGE POLICIES FOR 'institution-logos'
-- Public read: Anyone (anon or authenticated) can view institution logos
DROP POLICY IF EXISTS "Public read institution logos" ON storage.objects;
CREATE POLICY "Public read institution logos" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'institution-logos');

-- Super Admin can manage all objects in institution-logos
DROP POLICY IF EXISTS "Super Admin manages all institution logos" ON storage.objects;
CREATE POLICY "Super Admin manages all institution logos" ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'institution-logos' AND
        public.is_platform_super_admin(auth.uid())
    )
    WITH CHECK (
        bucket_id = 'institution-logos' AND
        public.is_platform_super_admin(auth.uid())
    );

-- College Admin can insert/update/delete objects strictly within their own folder: <college_id>/...
DROP POLICY IF EXISTS "College Admin inserts own institution logo" ON storage.objects;
CREATE POLICY "College Admin inserts own institution logo" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'institution-logos' AND
        CASE 
            WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
            ELSE false
        END
    );

DROP POLICY IF EXISTS "College Admin updates own institution logo" ON storage.objects;
CREATE POLICY "College Admin updates own institution logo" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'institution-logos' AND
        CASE 
            WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
            ELSE false
        END
    )
    WITH CHECK (
        bucket_id = 'institution-logos' AND
        CASE 
            WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
            ELSE false
        END
    );

DROP POLICY IF EXISTS "College Admin deletes own institution logo" ON storage.objects;
CREATE POLICY "College Admin deletes own institution logo" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'institution-logos' AND
        CASE 
            WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.is_college_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
            ELSE false
        END
    );

-- 3. HARDEN RLS POLICIES ON public.colleges
-- College Admins can SELECT their own college even if temporarily inactive (for context inspection)
DROP POLICY IF EXISTS "College Admin reads own college" ON public.colleges;
CREATE POLICY "College Admin reads own college" ON public.colleges
    FOR SELECT TO authenticated
    USING (public.is_college_admin(auth.uid(), id));

-- College Admins can UPDATE their own college ONLY IF the institution is active
DROP POLICY IF EXISTS "College Admin updates own active college" ON public.colleges;
CREATE POLICY "College Admin updates own active college" ON public.colleges
    FOR UPDATE TO authenticated
    USING (
        is_active = true AND
        public.is_college_admin(auth.uid(), id)
    )
    WITH CHECK (
        is_active = true AND
        public.is_college_admin(auth.uid(), id)
    );

-- 4. DATABASE-LEVEL BEFORE UPDATE TRIGGER
-- Prohibits non-Super Admins from mutating is_active, code, or slug
CREATE OR REPLACE FUNCTION public.enforce_college_mutation_permissions()
RETURNS TRIGGER AS $$
BEGIN
    -- If actor is not a platform super admin, strictly prevent mutating critical identity columns
    IF NOT public.is_platform_super_admin(auth.uid()) THEN
        -- Prevent changing is_active
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Forbidden: Only Platform Super Administrators can alter institution active status.';
        END IF;

        -- Prevent changing college code
        IF NEW.code IS DISTINCT FROM OLD.code THEN
            RAISE EXCEPTION 'Forbidden: Only Platform Super Administrators can alter institution code.';
        END IF;

        -- Prevent changing public portal slug
        IF NEW.slug IS DISTINCT FROM OLD.slug THEN
            RAISE EXCEPTION 'Forbidden: Only Platform Super Administrators can alter institution public slug.';
        END IF;
    END IF;

    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_college_mutation_permissions ON public.colleges;
CREATE TRIGGER trg_enforce_college_mutation_permissions
    BEFORE UPDATE ON public.colleges
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_college_mutation_permissions();
