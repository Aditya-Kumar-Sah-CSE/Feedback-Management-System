/**
 * Client-safe admin auth helpers.
 * These functions are pure and can be imported from both client and server components.
 * They do NOT use next/headers or any server-only APIs.
 */

import type { AdminSession } from '@/types/auth';

export const PRIMARY_SUPER_ADMIN_EMAIL = 'iambestadi@gmail.com';
export const PRIMARY_SUPER_ADMIN_ID = 'e606b509-7864-4150-8666-a6e47a63abc4';
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'iambestadi@gmail.com')
  .toLowerCase()
  .trim();

/**
 * Checks whether an admin record or session represents the immutable Primary Super Admin.
 * Safe for use in client components.
 */
export function isPrimarySuperAdmin(
  adminOrSession?:
    | { email?: string; user_id?: string | null; id?: string; userId?: string }
    | AdminSession
    | null
): boolean {
  if (!adminOrSession) return false;
  const email = (adminOrSession.email || '').toLowerCase().trim();
  if (email === PRIMARY_SUPER_ADMIN_EMAIL || email === SUPER_ADMIN_EMAIL) {
    return true;
  }
  const uid =
    ('userId' in adminOrSession ? adminOrSession.userId : null) ||
    ('user_id' in adminOrSession ? adminOrSession.user_id : null) ||
    ('id' in adminOrSession ? adminOrSession.id : null);
  if (uid && uid === PRIMARY_SUPER_ADMIN_ID) {
    return true;
  }
  return false;
}
