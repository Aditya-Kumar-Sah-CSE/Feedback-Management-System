'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { getAdminSession, ACTIVE_TENANT_COOKIE } from './admin-auth';
import { ACADEMIC_CACHE_TAG } from '@/lib/supabase/academic-cache';

/**
 * Server Action to switch active college for Platform Super Admin or multi-college admins.
 * Validates authorization server-side before updating the secure cookie.
 */
export async function setActiveCollegeAction(collegeId: string): Promise<{
  success?: boolean;
  activeCollegeId?: string;
  error?: string;
}> {
  try {
    if (!collegeId || typeof collegeId !== 'string') {
      return { error: 'Invalid college ID.' };
    }

    const session = await getAdminSession();

    if (!session.isAuthenticated || !session.isActive) {
      return { error: 'Unauthorized: You must be logged in as an active administrator.' };
    }

    // College Admins are locked to their authorized institution — switching is forbidden
    if (!session.isPlatformSuperAdmin) {
      return { error: 'Access Denied: Institution switching is restricted to Platform Super Administrators.' };
    }

    // Verify user has access to the requested college
    const canAccess = session.colleges.some(
      (c) => c.collegeId === collegeId && c.status === 'ACTIVE'
    );

    if (!canAccess) {
      return { error: 'Access Denied: You do not have permissions for this institution.' };
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_TENANT_COOKIE, collegeId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    try {
      revalidateTag(ACADEMIC_CACHE_TAG);
      revalidateTag(`academic_masters_${collegeId}`);
    } catch {
      // Ignore cache tag error outside request
    }
    revalidatePath('/admin/dashboard');
    revalidatePath('/');

    return { success: true, activeCollegeId: collegeId };
  } catch (err: any) {
    return { error: err.message || 'Failed to set active college.' };
  }
}
