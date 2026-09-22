'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import {
  isValidUUID,
  grantTrialSchema,
  extendTrialSchema,
  revokeTrialSchema,
  replaceTrialSchema,
  type GrantTrialInput,
  type ExtendTrialInput,
  type RevokeTrialInput,
  type ReplaceTrialInput,
} from '@/lib/validation';
import type { CollegeTrialEntitlement } from '@/types/database';

async function getAdminDb() {
  return createAdminClient() || await createClient();
}

async function logAudit(
  supabase: any,
  actor: { collegeId?: string | null; userId?: string | null; email?: string },
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  metadata?: any,
) {
  try {
    await supabase.from('audit_logs').insert({
      college_id: actor.collegeId || null,
      actor_user_id: actor.userId || null,
      actor_email: actor.email || '',
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error('Trial audit log write error:', err);
  }
}

// ====================================================================
// 1. GET TRIAL CONFIGURATION (Dynamic features & duration options)
// ====================================================================

export async function getTrialConfigAction() {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { data: plans, error } = await supabase
    .from('billing_plans')
    .select('duration_days, features')
    .eq('is_active', true);

  if (error || !plans) {
    return {
      success: true,
      durationOptions: [7, 14, 30, 60, 90],
      availableFeatures: [
        'Google Form generation',
        'Google Sheet integration',
        'Full analytics access',
        'Basic analytics',
      ],
    };
  }

  const featureSet = new Set<string>();
  featureSet.add('Google Form generation');
  featureSet.add('Google Sheet integration');
  featureSet.add('Full analytics access');

  for (const plan of plans) {
    if (Array.isArray(plan.features)) {
      for (const feat of plan.features) {
        if (feat && typeof feat === 'string') featureSet.add(feat.trim());
      }
    }
  }

  const durationSet = new Set<number>([7, 14, 30, 60, 90]);
  for (const plan of plans) {
    if (typeof plan.duration_days === 'number' && plan.duration_days > 0) {
      durationSet.add(plan.duration_days);
    }
  }

  const durationOptions = Array.from(durationSet).sort((a, b) => a - b);
  const availableFeatures = Array.from(featureSet);

  return {
    success: true,
    durationOptions,
    availableFeatures,
  };
}

// ====================================================================
// 2. GRANT FREE TRIAL (Super Admin only -> College Tenant)
// ====================================================================

export async function grantTrialAction(input: GrantTrialInput) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can grant Free Trials.' };
  }

  const validation = grantTrialSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid trial grant parameters.' };
  }

  const targetCollegeId = validation.data.collegeId || validation.data.adminId!;
  const { durationDays, startsAt, features, note } = validation.data;
  const supabase = await getAdminDb();

  // 1. Verify target college exists
  const { data: targetCollege, error: colErr } = await supabase
    .from('colleges')
    .select('id, name, code')
    .eq('id', targetCollegeId)
    .single();

  if (colErr || !targetCollege) {
    return { success: false, error: 'Target college organization not found.' };
  }

  // 2. Calculate dates
  const now = new Date();
  const effectiveStartsAt = startsAt ? new Date(startsAt) : now;
  const effectiveExpiresAt = new Date(effectiveStartsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // 3. Prevent duplicate active trials
  const { data: existingTrial } = await supabase
    .from('college_trial_entitlements')
    .select('id, expires_at, starts_at')
    .eq('college_id', targetCollegeId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (existingTrial) {
    const isCurrentlyActive = new Date(existingTrial.expires_at) > now;
    if (isCurrentlyActive) {
      return {
        success: false,
        error: `This college already has an active trial valid until ${new Date(existingTrial.expires_at).toLocaleDateString('en-IN')}. Please extend or replace it instead.`,
        alreadyActive: true,
        existingTrialId: existingTrial.id,
      };
    } else {
      // In-memory expired: update it to EXPIRED before creating new
      await supabase
        .from('college_trial_entitlements')
        .update({ status: 'EXPIRED', updated_at: now.toISOString() })
        .eq('id', existingTrial.id);
    }
  }

  // 4. Insert into college_trial_entitlements
  const { data: newTrial, error: insertErr } = await supabase
    .from('college_trial_entitlements')
    .insert({
      college_id: targetCollegeId,
      granted_by: session.userId,
      starts_at: effectiveStartsAt.toISOString(),
      expires_at: effectiveExpiresAt.toISOString(),
      status: 'ACTIVE',
      features,
      note: note || null,
    })
    .select('*')
    .single();

  if (insertErr) {
    console.error('[GRANT_TRIAL_INSERT_ERROR]', insertErr);
    return { success: false, error: insertErr.message || 'Failed to grant trial.' };
  }

  // 5. Audit Log
  await logAudit(
    supabase,
    { collegeId: targetCollegeId, userId: session.userId, email: session.email },
    'TRIAL_GRANTED',
    'college_trial_entitlements',
    newTrial.id,
    `Granted ${durationDays}-day trial to ${targetCollege.name} (${targetCollege.code}). Features: ${features.join(', ')}. Valid until: ${effectiveExpiresAt.toISOString()}`,
    { durationDays, features, startsAt: effectiveStartsAt.toISOString(), expiresAt: effectiveExpiresAt.toISOString() }
  );

  revalidatePath('/admin/dashboard');
  return {
    success: true,
    message: `Free Trial granted to ${targetCollege.name} (${durationDays} days).`,
    trial: newTrial,
  };
}

// ====================================================================
// 3. EXTEND FREE TRIAL (Super Admin only)
// ====================================================================

export async function extendTrialAction(input: ExtendTrialInput) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can extend trials.' };
  }

  const validation = extendTrialSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid trial extension parameters.' };
  }

  const { trialId, additionalDays, newExpiresAt: explicitExpiry, note } = validation.data;
  const supabase = await getAdminDb();

  const { data: trial, error: fetchErr } = await supabase
    .from('college_trial_entitlements')
    .select('*, college:colleges(id, name, code)')
    .eq('id', trialId)
    .single();

  if (fetchErr || !trial) {
    return { success: false, error: 'Trial entitlement record not found.' };
  }

  if (trial.status === 'REVOKED') {
    return { success: false, error: 'A revoked trial cannot be extended. Grant a new trial instead.' };
  }

  const currentExpiry = new Date(trial.expires_at);
  const now = new Date();
  const baseDate = currentExpiry > now ? currentExpiry : now;

  let finalExpiry: Date;
  if (explicitExpiry) {
    finalExpiry = new Date(explicitExpiry);
    if (finalExpiry <= baseDate) {
      return { success: false, error: 'New expiry date must be further in the future than the current expiry date.' };
    }
  } else if (additionalDays) {
    finalExpiry = new Date(baseDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
  } else {
    return { success: false, error: 'Either additional days or a new expiry date must be provided.' };
  }

  const updatedNote = note
    ? `${trial.note ? trial.note + ' | ' : ''}Extended on ${now.toLocaleDateString('en-IN')}: ${note}`
    : trial.note;

  const { error: updateErr } = await supabase
    .from('college_trial_entitlements')
    .update({
      expires_at: finalExpiry.toISOString(),
      status: 'ACTIVE',
      note: updatedNote,
      updated_at: now.toISOString(),
    })
    .eq('id', trialId);

  if (updateErr) {
    return { success: false, error: updateErr.message || 'Failed to extend trial.' };
  }

  const colName = (trial.college as any)?.name || trial.college_id;
  await logAudit(
    supabase,
    { collegeId: trial.college_id, userId: session.userId, email: session.email },
    'TRIAL_EXTENDED',
    'college_trial_entitlements',
    trialId,
    `Extended trial for ${colName} until ${finalExpiry.toISOString()}.${additionalDays ? ` Added ${additionalDays} days.` : ''}`,
    { previousExpiry: trial.expires_at, newExpiry: finalExpiry.toISOString(), additionalDays }
  );

  revalidatePath('/admin/dashboard');
  return {
    success: true,
    message: `Trial extended until ${finalExpiry.toLocaleDateString('en-IN')}.`,
  };
}

// ====================================================================
// 4. REVOKE FREE TRIAL (Super Admin only)
// ====================================================================

export async function revokeTrialAction(input: RevokeTrialInput) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can revoke trials.' };
  }

  const validation = revokeTrialSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid revoke parameters.' };
  }

  const { trialId, reason } = validation.data;
  const supabase = await getAdminDb();

  const { data: trial, error: fetchErr } = await supabase
    .from('college_trial_entitlements')
    .select('*, college:colleges(id, name, code)')
    .eq('id', trialId)
    .single();

  if (fetchErr || !trial) {
    return { success: false, error: 'Trial entitlement record not found.' };
  }

  if (trial.status === 'REVOKED') {
    return { success: false, error: 'This trial has already been revoked.' };
  }

  const now = new Date();
  const updatedNote = reason
    ? `${trial.note ? trial.note + ' | ' : ''}Revoked on ${now.toLocaleDateString('en-IN')}: ${reason}`
    : trial.note;

  const { error: updateErr } = await supabase
    .from('college_trial_entitlements')
    .update({
      status: 'REVOKED',
      revoked_at: now.toISOString(),
      revoked_by: session.userId,
      note: updatedNote,
      updated_at: now.toISOString(),
    })
    .eq('id', trialId);

  if (updateErr) {
    return { success: false, error: updateErr.message || 'Failed to revoke trial.' };
  }

  const colName = (trial.college as any)?.name || trial.college_id;
  await logAudit(
    supabase,
    { collegeId: trial.college_id, userId: session.userId, email: session.email },
    'TRIAL_REVOKED',
    'college_trial_entitlements',
    trialId,
    `Revoked trial for ${colName}.${reason ? ` Reason: ${reason}` : ''}`,
    { reason }
  );

  revalidatePath('/admin/dashboard');
  return {
    success: true,
    message: `Trial for ${colName} has been revoked. Access falls back to base plan.`,
  };
}

// ====================================================================
// 5. REPLACE FREE TRIAL (Revoke current active + grant new)
// ====================================================================

export async function replaceTrialAction(input: ReplaceTrialInput) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can replace trials.' };
  }

  const validation = replaceTrialSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid trial replacement parameters.' };
  }

  const targetCollegeId = validation.data.collegeId || validation.data.adminId!;
  const supabase = await getAdminDb();
  const now = new Date();

  // Revoke any existing active trials for this college
  await supabase
    .from('college_trial_entitlements')
    .update({
      status: 'REVOKED',
      revoked_at: now.toISOString(),
      revoked_by: session.userId,
      note: 'Replaced with a new trial by Super Admin.',
      updated_at: now.toISOString(),
    })
    .eq('college_id', targetCollegeId)
    .eq('status', 'ACTIVE');

  // Grant the new trial
  return grantTrialAction(input);
}

// ====================================================================
// 6. GET COLLEGE TRIAL HISTORY
// ====================================================================

export async function getCollegeTrialHistoryAction(collegeId: string): Promise<{
  success: boolean;
  error?: string;
  trials: CollegeTrialEntitlement[];
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', trials: [] };
  }

  if (!isValidUUID(collegeId)) {
    return { success: false, error: 'Invalid college ID.', trials: [] };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase
    .from('college_trial_entitlements')
    .select('*')
    .eq('college_id', collegeId)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to load trial history.', trials: [] };
  }

  return { success: true, trials: (data || []) as CollegeTrialEntitlement[] };
}

// Backward-compatible alias
export const getAdminTrialHistoryAction = getCollegeTrialHistoryAction;
