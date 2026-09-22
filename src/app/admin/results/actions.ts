'use server';

import {
  getFormAnalyticsData,
  getOverallAnalyticsData,
  type ScopeFilters,
} from '@/lib/analytics/service';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { createClient } from '@/lib/supabase/server';
import { syncFormResponsesToSheet } from '@/lib/google/sync';
import { isGoogleConfigured } from '@/lib/google/auth';
import { isValidUUID } from '@/lib/validation';
import { assertAnalyticsAccess } from '@/lib/billing/access-control';
import type { FormAnalyticsReport, AggregatedAnalyticsReport } from '@/lib/analytics/types';

export type { ScopeFilters };

/**
 * Server action to fetch real-time analytics for a specific feedback form.
 * Directly delegates to authoritative shared analytics service after verifying Full Analytics Access.
 */
export async function getFormAnalyticsAction(
  formId: string,
  options?: { client?: any }
): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  report?: FormAnalyticsReport;
}> {
  // 1. Mandatory Admin Authentication & Active Check
  const session = await getAdminSession(options?.client);
  if (!session.isAuthenticated) {
    return { success: false, error: 'Unauthorized. Admin session required.', code: 'UNAUTHORIZED' };
  }
  if (!session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin credentials required.', code: 'ACCOUNT_INACTIVE' };
  }

  // 2. Validate Form ID format
  if (!formId || !isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  // 3. Tenant authorization check
  const supabase = options?.client || (await createClient());
  const { data: formRecord, error: formError } = await supabase
    .from('feedback_forms')
    .select('id, college_id')
    .eq('id', formId)
    .single();

  if (formError || !formRecord) {
    return { success: false, error: 'Form not found.', code: 'NOT_FOUND' };
  }

  if (!session.isPlatformSuperAdmin) {
    const hasMembership = session.colleges.some(
      (c) => c.collegeId === formRecord.college_id && c.status === 'ACTIVE'
    );
    if (!hasMembership) {
      return {
        success: false,
        error: 'Access denied. You do not have permission to view analytics for this form.',
        code: 'FORBIDDEN',
      };
    }
  }

  // 4. Centralized Billing & Plan Analytics Permission Check
  const access = await assertAnalyticsAccess(session);

  if (!access.allowed) {
    return {
      success: false,
      code: 'ANALYTICS_UPGRADE_REQUIRED',
      error: access.reason || 'Full analytics access required. Please upgrade your plan.',
    };
  }

  return getFormAnalyticsData(formId, options);
}

/**
 * Server action to fetch institutional scope analytics aggregated across matching feedback forms.
 * Requires Full Analytics Access.
 */
export async function getOverallAnalyticsAction(
  filters?: ScopeFilters,
  options?: { client?: any }
): Promise<{
  success: boolean;
  error?: string;
  code?: string;
  report?: AggregatedAnalyticsReport;
}> {
  // 1. Mandatory Admin Authentication & Active Check
  const session = await getAdminSession(options?.client);
  if (!session.isAuthenticated) {
    return { success: false, error: 'Unauthorized. Admin session required.', code: 'UNAUTHORIZED' };
  }
  if (!session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin credentials required.', code: 'ACCOUNT_INACTIVE' };
  }

  // 2. Centralized Billing & Plan Analytics Permission Check
  const access = await assertAnalyticsAccess(session);

  if (!access.allowed) {
    return {
      success: false,
      code: 'ANALYTICS_UPGRADE_REQUIRED',
      error: access.reason || 'Full analytics access required. Please upgrade your plan.',
    };
  }

  // 3. Enforce active college scope
  const targetCollegeId = session.activeCollegeId;
  const scopedFilters: ScopeFilters = {
    ...filters,
    collegeId: targetCollegeId || undefined,
  };

  return getOverallAnalyticsData(scopedFilters, options);
}

/**
 * Triggers on-demand response synchronization from Google Forms into Google Sheet,
 * then returns the updated sync status and count.
 */
export async function syncSingleFormResponsesAction(formId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin credentials required.' };
  }

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  const supabase = await createClient();
  const { data: form, error } = await supabase
    .from('feedback_forms')
    .select('*')
    .eq('id', formId)
    .single();

  if (error || !form) {
    return { success: false, error: 'Form not found.' };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin) {
    const hasMembership = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!hasMembership) {
      return { success: false, error: 'Access denied. You do not have permission to sync responses for this form.' };
    }
  }

  const resolvedFormId =
    form.google_form_id ||
    form.google_form_edit_url?.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
    form.google_form_url?.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)?.[1];

  const resolvedSheetId =
    form.google_sheet_id ||
    form.google_sheet_url?.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];

  if (!resolvedFormId || !resolvedSheetId) {
    return { success: false, error: 'Google Form ID or Sheet ID not associated with this record.' };
  }

  if (!isGoogleConfigured()) {
    return {
      success: false,
      error: 'Google OAuth application client is not configured on this server.',
    };
  }

  const syncRes = await syncFormResponsesToSheet({
    googleFormId: resolvedFormId,
    googleSheetId: resolvedSheetId,
    formId,
  });

  if (!syncRes.success) {
    return { success: false, error: syncRes.message };
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from('feedback_forms')
    .update({
      response_count: syncRes.totalResponses,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', formId);

  return {
    success: true,
    message: syncRes.message,
    syncedCount: syncRes.syncedCount,
    totalResponses: syncRes.totalResponses,
  };
}
