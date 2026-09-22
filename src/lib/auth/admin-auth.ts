import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  AdminSession,
  AdminCollegeMembership,
  CollegeRole,
  MembershipStatus,
} from '@/types/auth';

export const ACTIVE_TENANT_COOKIE = 'fms_active_tenant_id';

export type AdminAuthResult = AdminSession;

/**
 * Super Admin email configuration used only for bootstrapping/recovery,
 * NEVER as the canonical authorization identity.
 */
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'iambestadi@gmail.com')
  .toLowerCase()
  .trim();

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
    // College Admin may ONLY select an authorized college with status = ACTIVE
    if (requestedCollegeId) {
      activeCollege = authorizedColleges.find((c) => c.collegeId === requestedCollegeId) || null;
    }
    // If cookie is missing or points to unauthorized college, default to first authorized membership
    if (!activeCollege && authorizedColleges.length > 0) {
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
