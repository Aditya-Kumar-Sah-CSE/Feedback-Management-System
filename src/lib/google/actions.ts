'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession, getAdminSession } from '@/lib/auth/admin-auth';
import {
  getCollegeGoogleConnectionMetadata,
  disconnectCollegeGoogleConnection,
} from '@/lib/google/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Retrieves the Google connection status and safe metadata for the active college.
 * Never exposes refresh tokens or secrets to client callers.
 */
export async function getActiveCollegeGoogleStatusAction() {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.activeCollegeId) {
    return {
      connected: false,
      collegeId: null,
      collegeName: null,
      meta: null,
    };
  }

  const meta = await getCollegeGoogleConnectionMetadata(session.activeCollegeId);
  return {
    connected: Boolean(meta && meta.isValid),
    collegeId: session.activeCollegeId,
    collegeName: session.activeCollege?.name || 'Your Institution',
    meta,
  };
}

/**
 * Disconnects the Google Workspace connection for the specified college.
 * Strictly verifies caller is a PLATFORM_SUPER_ADMIN before disconnecting.
 */
export async function disconnectCollegeGoogleAction(collegeId: string) {
  if (!collegeId) {
    return { success: false, error: 'collegeId is required.' };
  }

  // Security Invariant: Only Platform Super Admins can disconnect Google connections during Testing mode
  const session = await requireAdminSession({ requireSuperAdmin: true });
  if (!session.isSuperAdmin) {
    return { success: false, error: 'Access denied: Only Platform Super Admins can disconnect Google Workspace connections.' };
  }

  const supabase = createAdminClient();
  const prevMeta = await getCollegeGoogleConnectionMetadata(collegeId);

  try {
    await disconnectCollegeGoogleConnection(collegeId);

    // Record audit event without credentials
    if (supabase) {
      await supabase.from('audit_logs').insert({
        admin_id: session.userId,
        actor_email: session.email,
        action: 'GOOGLE_ACCOUNT_DISCONNECTED',
        entity_type: 'college_google_connections',
        entity_id: collegeId,
        details: `Google connection disconnected for college ${collegeId} by ${session.email}`,
        metadata: {
          college_id: collegeId,
          account_email: prevMeta?.accountEmail || null,
        },
      });
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/settings');
    return { success: true };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errMsg };
  }
}
