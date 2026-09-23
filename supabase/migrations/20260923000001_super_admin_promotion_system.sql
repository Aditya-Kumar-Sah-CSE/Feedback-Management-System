-- ====================================================================
-- FMS MULTI-TENANT PLATFORM
-- MIGRATION: 20260923000001_super_admin_promotion_system.sql
-- PURPOSE: Super Admin promotion/demotion system, backward compatibility
--          helpers, security-definer procedures, and safety invariants.
-- ====================================================================

-- 1. INDEX OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_platform_admins_active_user 
    ON public.platform_admins(user_id, is_active);

-- ====================================================================
-- 2. CENTRALIZED DATABASE AUTHORIZATION FUNCTIONS
-- ====================================================================

-- Function 2.1: public.is_super_admin
-- Checks if target_user_id is an active Platform Super Admin.
-- Defaults to auth.uid() when called within authenticated context.
CREATE OR REPLACE FUNCTION public.is_super_admin(target_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF target_user_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.is_platform_super_admin(target_user_id);
END;
$$;

-- Function 2.2: public.is_admin
-- Returns true if user is an active Platform Super Admin OR has an active
-- institutional membership in any college.
CREATE OR REPLACE FUNCTION public.is_admin(target_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Platform Super Admins possess all administrative privileges
    IF public.is_platform_super_admin(target_user_id) THEN
        RETURN true;
    END IF;

    -- Active college admin in any college
    RETURN EXISTS (
        SELECT 1 FROM public.college_memberships
        WHERE user_id = target_user_id
          AND status = 'ACTIVE'
    );
END;
$$;

-- ====================================================================
-- 3. PROMOTION & DEMOTION PROCEDURES (SECURITY DEFINER)
-- ====================================================================

-- Function 3.1: public.promote_admin_to_super_admin
CREATE OR REPLACE FUNCTION public.promote_admin_to_super_admin(
    p_target_user_id UUID,
    p_actor_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_user RECORD;
    v_actor_email TEXT;
    v_result JSONB;
BEGIN
    -- 1. Validate that the actor is an authorized active Super Admin
    IF p_actor_user_id IS NULL OR NOT public.is_platform_super_admin(p_actor_user_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Super Admin can promote administrators to Super Admin.';
    END IF;

    -- 2. Verify target user exists in auth.users
    SELECT id, email, raw_user_meta_data
    INTO v_target_user
    FROM auth.users
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target administrator account not found in authentication system.';
    END IF;

    -- Resolve actor email for audit
    SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_user_id;

    -- 3. Upsert into public.platform_admins
    INSERT INTO public.platform_admins (
        user_id,
        email,
        name,
        role,
        is_active,
        updated_at
    )
    VALUES (
        v_target_user.id,
        LOWER(TRIM(v_target_user.email)),
        COALESCE(v_target_user.raw_user_meta_data->>'name', split_part(v_target_user.email, '@', 1)),
        'PLATFORM_SUPER_ADMIN',
        true,
        timezone('utc'::text, now())
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.platform_admins.name),
        role = 'PLATFORM_SUPER_ADMIN',
        is_active = true,
        updated_at = timezone('utc'::text, now());

    -- 4. Record audit log entry
    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        details,
        metadata
    )
    VALUES (
        p_actor_user_id,
        v_actor_email,
        'ADMIN_PROMOTED_TO_SUPER_ADMIN',
        'platform_admins',
        p_target_user_id::text,
        format('Administrator %s (ID: %s) promoted to Super Admin by %s', v_target_user.email, p_target_user_id, v_actor_email),
        jsonb_build_object(
            'target_user_id', p_target_user_id,
            'target_email', v_target_user.email,
            'promoted_by', p_actor_user_id
        )
    );

    v_result := jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'email', v_target_user.email,
        'role', 'SUPER_ADMIN'
    );

    RETURN v_result;
END;
$$;

-- Function 3.2: public.demote_super_admin_to_admin
CREATE OR REPLACE FUNCTION public.demote_super_admin_to_admin(
    p_target_user_id UUID,
    p_actor_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_user RECORD;
    v_actor_email TEXT;
    v_active_super_admins_count INTEGER;
    v_result JSONB;
BEGIN
    -- 1. Validate that the actor is an authorized active Super Admin
    IF p_actor_user_id IS NULL OR NOT public.is_platform_super_admin(p_actor_user_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Super Admin can demote administrators.';
    END IF;

    -- 2. Prevent accidental self-demotion
    IF p_target_user_id = p_actor_user_id THEN
        RAISE EXCEPTION 'Forbidden: You cannot demote your own Super Admin account. Another Super Admin must perform this action.';
    END IF;

    -- 3. Verify target user exists in auth.users
    SELECT id, email INTO v_target_user FROM auth.users WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target administrator account not found in authentication system.';
    END IF;

    -- 4. Protect Primary Super Admin
    IF LOWER(TRIM(v_target_user.email)) = 'iambestadi@gmail.com' 
       OR p_target_user_id = 'e606b509-7864-4150-8666-a6e47a63abc4'::UUID THEN
        RAISE EXCEPTION 'Forbidden: The Primary Super Admin cannot be demoted under any circumstance.';
    END IF;

    -- 5. Prevent demoting the last active Super Admin
    SELECT COUNT(*) INTO v_active_super_admins_count
    FROM public.platform_admins
    WHERE is_active = true;

    IF v_active_super_admins_count <= 1 THEN
        RAISE EXCEPTION 'Forbidden: Cannot demote the last remaining active Super Admin on the platform.';
    END IF;

    -- Resolve actor email for audit
    SELECT email INTO v_actor_email FROM auth.users WHERE id = p_actor_user_id;

    -- 6. Deactivate Platform Super Admin record
    UPDATE public.platform_admins
    SET is_active = false,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = p_target_user_id;

    -- 7. Record audit log entry
    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        details,
        metadata
    )
    VALUES (
        p_actor_user_id,
        v_actor_email,
        'SUPER_ADMIN_DEMOTED_TO_ADMIN',
        'platform_admins',
        p_target_user_id::text,
        format('Super Admin %s (ID: %s) demoted to Admin by %s', v_target_user.email, p_target_user_id, v_actor_email),
        jsonb_build_object(
            'target_user_id', p_target_user_id,
            'target_email', v_target_user.email,
            'demoted_by', p_actor_user_id
        )
    );

    v_result := jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'email', v_target_user.email,
        'role', 'ADMIN'
    );

    RETURN v_result;
END;
$$;

-- ====================================================================
-- 4. COMPATIBILITY VIEW: public.admins
-- Provides a unified backward-compatible representation of all administrators
-- ====================================================================

CREATE OR REPLACE VIEW public.admins AS
SELECT 
    pa.id,
    pa.user_id,
    NULL::UUID AS college_id,
    pa.email,
    pa.name,
    'SUPER_ADMIN'::VARCHAR(50) AS role,
    CASE WHEN pa.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END::VARCHAR(50) AS status,
    pa.created_at,
    pa.updated_at
FROM public.platform_admins pa
UNION ALL
SELECT 
    cm.id,
    cm.user_id,
    cm.college_id,
    COALESCE(u.email, 'admin@college.local') AS email,
    COALESCE(u.raw_user_meta_data->>'name', split_part(COALESCE(u.email, 'admin'), '@', 1)) AS name,
    'ADMIN'::VARCHAR(50) AS role,
    cm.status::VARCHAR(50) AS status,
    cm.created_at,
    cm.updated_at
FROM public.college_memberships cm
LEFT JOIN auth.users u ON u.id = cm.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa2 
    WHERE pa2.user_id = cm.user_id AND pa2.is_active = true
);

-- Ensure authenticated and service roles can query functions and view
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.promote_admin_to_super_admin(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demote_super_admin_to_admin(UUID, UUID) TO authenticated, service_role;
GRANT SELECT ON public.admins TO authenticated, service_role;
