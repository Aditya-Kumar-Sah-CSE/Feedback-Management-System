import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  AdminSession,
  AdminCollegeMembership,
  CollegeRole,
  MembershipStatus,
} from '@/types/auth';

// Re-export client-safe helpers so existing server-side imports continue to work
export {
  SUPER_ADMIN_EMAIL,
  PRIMARY_SUPER_ADMIN_EMAIL,
  PRIMARY_SUPER_ADMIN_ID,
  isPrimarySuperAdmin,
} from './admin-auth-shared';

export const ACTIVE_TENANT_COOKIE = 'fms_active_tenant_id';

export type AdminAuthResult = AdminSession;

/**
 * Centralized helper: checks if a session, admin object, or role represents a Super Admin.
 */
export function isSuperAdmin(
  sessionOrRole?:
    | AdminSession
    | { role?: string; isSuperAdmin?: boolean; isPlatformSuperAdmin?: boolean }
    | string
    | null
): boolean {
  if (!sessionOrRole) return false;
  if (typeof sessionOrRole === 'string') {
    const norm = sessionOrRole.toUpperCase().trim();
    return norm === 'SUPER_ADMIN' || norm === 'PLATFORM_SUPER_ADMIN';
  }
  if (typeof sessionOrRole === 'object') {
    if ('isPlatformSuperAdmin' in sessionOrRole && sessionOrRole.isPlatformSuperAdmin) return true;
    if ('isSuperAdmin' in sessionOrRole && sessionOrRole.isSuperAdmin) return true;
    if ('role' in sessionOrRole && sessionOrRole.role) {
      const norm = String(sessionOrRole.role).toUpperCase().trim();
      return norm === 'SUPER_ADMIN' || norm === 'PLATFORM_SUPER_ADMIN';
    }
  }
  return false;
}

/**
 * Resolves the authenticated multi-tenant admin session.
 * Canonical identity is strictly auth.uid() / user.id.
 */
export async function getAdminSession(
  client?: any,
  options?: { cookieTenantId?: string }
): Promise<AdminSession> {
  const supabase = client || (await createClient());

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      userId: '',
      email: '',
      name: '',
      isPlatformSuperAdmin: false,
      colleges: [],
      activeCollegeId: null,
      activeCollege: null,
      isAuthenticated: false,
      isActive: false,
      isPending: false,
      isRejected: false,
      isSuperAdmin: false,
      isApproved: false,
      admin: null,
      user: null,
    };
  }

  const userId = user.id;
  const userEmail = (user.email || '').toLowerCase().trim();
  const userName = user.user_metadata?.name || userEmail.split('@')[0] || 'Administrator';

  // 1. Query platform_admins by canonical user.id
  // Uses authenticated client respecting RLS (public.is_platform_super_admin)
  const { data: platformAdmin } = await supabase
    .from('platform_admins')
    .select('id, user_id, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const isPlatformSuperAdmin = Boolean(platformAdmin);

  // 2. Query user's college memberships joined to colleges
  const { data: rawMemberships } = await supabase
    .from('college_memberships')
    .select(`
      college_id,
      role,
      status,
      colleges (
        id,
        name,
        slug,
        code,
        logo_url,
        is_active
      )
    `)
    .eq('user_id', userId);

  let authorizedColleges: AdminCollegeMembership[] = [];

  if (rawMemberships && Array.isArray(rawMemberships)) {
    for (const m of rawMemberships) {
      const col = (m as any).colleges;
      if (col && col.is_active && m.status === 'ACTIVE') {
        authorizedColleges.push({
          collegeId: m.college_id,
          slug: col.slug,
          name: col.name,
          code: col.code,
          logoUrl: col.logo_url || null,
          role: m.role as CollegeRole,
          status: m.status as MembershipStatus,
        });
      }
    }
  }

  // If Platform Super Admin, fetch all active colleges to enable platform-wide switching
  if (isPlatformSuperAdmin) {
    const { data: allActiveColleges } = await supabase
      .from('colleges')
      .select('id, name, slug, code, logo_url, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (allActiveColleges) {
      const superAdminColleges: AdminCollegeMembership[] = allActiveColleges.map((c: any) => {
        const existing = authorizedColleges.find((ac) => ac.collegeId === c.id);
        return {
          collegeId: c.id,
          slug: c.slug,
          name: c.name,
          code: c.code,
          logoUrl: c.logo_url || null,
          role: existing?.role || 'COLLEGE_ADMIN',
          status: 'ACTIVE',
        };
      });
      authorizedColleges = superAdminColleges;
    }
  }

  // 3. Resolve active college from request cookie
  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Outside request context
  }

  const requestedCollegeId = options?.cookieTenantId || cookieStore?.get(ACTIVE_TENANT_COOKIE)?.value || null;
  let activeCollege: AdminCollegeMembership | null = null;

  if (isPlatformSuperAdmin) {
    // Platform Super Admin may select any active college
    if (requestedCollegeId) {
      activeCollege = authorizedColleges.find((c) => c.collegeId === requestedCollegeId) || null;
    }
    // If no valid cookie, choose the first deterministic active college (never hardcoded BCE)
    if (!activeCollege && authorizedColleges.length > 0) {
      activeCollege = authorizedColleges[0];
    }
  } else {
    // College Admin: LOCKED to their authorized membership. Cookie is IGNORED.
    // This prevents forged/stale cookies from pointing a College Admin at another institution.
    if (authorizedColleges.length > 0) {
      activeCollege = authorizedColleges[0];
    }
  }

  const activeCollegeId = activeCollege?.collegeId || null;
  const hasActiveAccess = isPlatformSuperAdmin || authorizedColleges.length > 0;

  // 4. If no active membership or platform role, check college_admin_requests
  let isPending = false;
  let isRejected = false;

  if (!hasActiveAccess) {
    const { data: req } = await supabase
      .from('college_admin_requests')
      .select('status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (req) {
      isPending = req.status === 'PENDING';
      isRejected = req.status === 'REJECTED';
    } else {
      // Check by email as secondary check for requests submitted prior to user confirmation
      const { data: emailReq } = await supabase
        .from('college_admin_requests')
        .select('status')
        .eq('email', userEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (emailReq) {
        isPending = emailReq.status === 'PENDING';
        isRejected = emailReq.status === 'REJECTED';
      }
    }
  }

  return {
    userId,
    email: userEmail,
    name: userName,
    isPlatformSuperAdmin,
    colleges: authorizedColleges,
    activeCollegeId,
    activeCollege,
    isAuthenticated: true,
    isActive: hasActiveAccess,
    isPending,
    isRejected,
    isSuperAdmin: isPlatformSuperAdmin,
    isApproved: hasActiveAccess,
    admin: hasActiveAccess
      ? {
          id: userId,
          user_id: userId,
          email: userEmail,
          name: userName,
          role: isPlatformSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
          status: 'ACTIVE',
        }
      : null,
    user: {
      id: userId,
      email: userEmail,
      user_metadata: user.user_metadata,
    },
  };
}

/**
 * Server-side protection helper for Server Components, Server Actions, and Route Handlers.
 * Throws or redirects if unauthenticated, pending, or unauthorized for the requested college.
 */
export async function requireAdminSession(options?: {
  requireCollegeId?: string;
  redirectTo?: string;
  client?: any;
  cookieTenantId?: string;
  requireSuperAdmin?: boolean;
}): Promise<AdminSession> {
  const session = await getAdminSession(options?.client, {
    cookieTenantId: options?.cookieTenantId,
  });

  if (!session.isAuthenticated) {
    redirect(options?.redirectTo || '/admin/login');
  }

  if (session.isPending) {
    redirect('/admin/pending');
  }

  if (!session.isActive) {
    throw new Error('Unauthorized: Administrator account is inactive or has no institutional memberships.');
  }

  if (options?.requireSuperAdmin && !session.isPlatformSuperAdmin) {
    throw new Error('Forbidden: Platform Super Administrator privilege is required.');
  }

  if (options?.requireCollegeId) {
    const targetId = options.requireCollegeId;

    if (session.isPlatformSuperAdmin) {
      // Verify requested college exists and is active
      const collegeExists = session.colleges.some((c) => c.collegeId === targetId);
      if (!collegeExists) {
        throw new Error(`Unauthorized: Target college [${targetId}] does not exist or is inactive.`);
      }
    } else {
      // College Admin must have an ACTIVE membership for that exact college
      const isMember = session.colleges.some(
        (c) => c.collegeId === targetId && c.status === 'ACTIVE'
      );
      if (!isMember) {
        throw new Error(`Forbidden: You do not possess administrative permissions for college [${targetId}].`);
      }
    }
  }

  return session;
}

/**
 * Server-side protection helper strictly requiring an active Platform Super Admin session.
 * Throws or redirects if caller lacks Super Admin privileges.
 */
export async function requireSuperAdmin(options?: {
  redirectTo?: string;
  client?: any;
}): Promise<AdminSession> {
  return requireAdminSession({
    requireSuperAdmin: true,
    redirectTo: options?.redirectTo,
    client: options?.client,
  });
}

/**
 * Server-side protection helper requiring either an active College Admin or Super Admin session.
 */
export async function requireAdminOrSuperAdmin(options?: {
  requireCollegeId?: string;
  redirectTo?: string;
  client?: any;
  cookieTenantId?: string;
}): Promise<AdminSession> {
  return requireAdminSession(options);
}

/**
 * Resolves and strictly validates the authorized college ID for an admin mutation.
 *
 * Rules:
 * 1. Admin must be authenticated and active.
 * 2. If caller is PLATFORM_SUPER_ADMIN:
 *    - May specify a requested targetCollegeId (e.g. from UI selector or input).
 *    - If requested targetCollegeId is provided, validates that it exists and is an active college in the platform.
 *    - If no targetCollegeId is provided, falls back to session.activeCollegeId.
 *    - If still no college ID, throws an authorization error.
 * 3. If caller is COLLEGE_ADMIN:
 *    - MUST use the authenticated user's authorized active college (session.activeCollegeId).
 *    - If the client passed an input collegeId, verifies it strictly matches the user's active/authorized college.
 *      Any mismatch throws a Forbidden error (anti-tamper / prevents forged collegeId).
 *    - User must have an active membership for this college.
 * 4. Returns authorizedCollegeId string. Throws clean error if missing or unauthorized.
 */
export async function resolveAuthorizedCollegeId(
  session: AdminSession,
  requestedCollegeId?: string | null
): Promise<string> {
  if (!session.isAuthenticated || !session.isActive) {
    throw new Error('Unauthorized: Administrator session is not authenticated or active.');
  }

  let authorizedCollegeId: string | null = null;

  if (session.isPlatformSuperAdmin) {
    // 1. Super Admin: Allow managing the selected institution
    if (requestedCollegeId && requestedCollegeId.trim()) {
      const candidateId = requestedCollegeId.trim();
      const collegeExists = session.colleges.some((c) => c.collegeId === candidateId);
      if (!collegeExists) {
        throw new Error(`Unauthorized: Target institution [${candidateId}] does not exist or is inactive.`);
      }
      authorizedCollegeId = candidateId;
    } else if (session.activeCollegeId) {
      authorizedCollegeId = session.activeCollegeId;
    } else if (session.colleges.length > 0) {
      authorizedCollegeId = session.colleges[0].collegeId;
    }
  } else {
    // 2. College Admin: Derive collegeId strictly from the authenticated user's authorized active college/membership
    const activeId = session.activeCollegeId;
    if (!activeId) {
      throw new Error('Unauthorized: No active institutional membership established for this account.');
    }

    // Verify active membership exists and is ACTIVE
    const membership = session.colleges.find(
      (c) => c.collegeId === activeId && c.status === 'ACTIVE'
    );
    if (!membership) {
      throw new Error(`Forbidden: You do not possess active administrative permissions for institution [${activeId}].`);
    }

    // Anti-tamper check: If client supplied a collegeId, it MUST match the user's active college
    if (requestedCollegeId && requestedCollegeId.trim() && requestedCollegeId.trim() !== activeId) {
      throw new Error(`Forbidden: Cross-tenant operation blocked. You cannot manage data for institution [${requestedCollegeId}].`);
    }

    authorizedCollegeId = activeId;
  }

  if (!authorizedCollegeId) {
    throw new Error('Unable to determine the active institution. Please select an institution and try again.');
  }

  return authorizedCollegeId;
}
