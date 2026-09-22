'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import {
  ensureCollegeBillingAccount,
  getCollegeBillingStatus,
  assertAnalyticsAccess,
} from '@/lib/billing/access-control';
import {
  isValidUUID,
  submitPaymentRequestSchema,
  updatePaymentSettingsSchema,
} from '@/lib/validation';
import type {
  CollegeBillingAccount,
  CollegePaymentRequest,
  CollegeTrialEntitlement,
  PaymentSettings,
  BillingOverviewItem,
} from '@/types/database';

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
    console.error('Billing audit log write error:', err);
  }
}

// ====================================================================
// PAYMENT SETTINGS (Platform Singleton: Super Admin writes, Admin reads)
// ====================================================================

export async function getPaymentSettingsAction() {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    return { success: false, error: 'Failed to load payment settings.' };
  }

  return { success: true, settings: (data || null) as PaymentSettings | null };
}

export async function updatePaymentSettingsAction(input: {
  upiId?: string;
  accountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  supportPhone?: string;
  paymentInstructions?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can update payment settings.' };
  }

  const validation = updatePaymentSettingsSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid input.' };
  }

  const supabase = await getAdminDb();
  const { data: existing } = await supabase
    .from('payment_settings')
    .select('id')
    .limit(1)
    .maybeSingle();

  const payload = {
    upi_id: validation.data.upiId,
    account_name: validation.data.accountName,
    bank_name: validation.data.bankName,
    account_number: validation.data.accountNumber,
    ifsc_code: validation.data.ifscCode,
    support_phone: validation.data.supportPhone,
    payment_instructions: validation.data.paymentInstructions,
    updated_by: session.userId || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from('payment_settings')
      .update(payload)
      .eq('id', existing.id);
    if (error) return { success: false, error: 'Failed to update payment settings.' };
  } else {
    const { error } = await supabase
      .from('payment_settings')
      .insert(payload);
    if (error) return { success: false, error: 'Failed to create payment settings.' };
  }

  await logAudit(
    supabase,
    { collegeId: null, userId: session.userId, email: session.email },
    'PAYMENT_SETTINGS_UPDATED',
    'payment_settings',
    existing?.id || 'new',
    'Super Admin updated payment settings.'
  );

  revalidatePath('/admin/dashboard');
  return { success: true };
}

// ====================================================================
// SUBMIT PAYMENT REQUEST (Tenant College Admin)
// ====================================================================

export async function submitPaymentRequestAction(input: {
  billingPlanId: string;
  paymentMethod: string;
  paymentReference: string;
  paymentProofUrl?: string | null;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  // HARDENING RULE 3: collegeId is never an authorization credential.
  // We establish authorized college strictly from authenticated session.
  const collegeId = session.activeCollegeId;
  if (!collegeId) {
    return { success: false, error: 'No active college organization found for your account.' };
  }

  const validation = submitPaymentRequestSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid payment request data.' };
  }

  const { billingPlanId, paymentMethod, paymentReference, paymentProofUrl } = validation.data;

  const supabase = await getAdminDb();

  // Fetch plan from DB — NEVER trust browser-sent amounts
  const { data: plan, error: planErr } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('id', billingPlanId)
    .eq('is_active', true)
    .single();

  if (planErr || !plan) {
    return { success: false, error: 'Selected plan not found or is no longer available.' };
  }

  if (plan.price <= 0) {
    return { success: false, error: 'Free plans cannot be purchased. Contact the Super Admin.' };
  }

  // Ensure college billing account exists
  await ensureCollegeBillingAccount(collegeId);

  // Prevent duplicate PENDING requests for this college
  const { data: existingPending } = await supabase
    .from('college_payment_requests')
    .select('id')
    .eq('college_id', collegeId)
    .eq('status', 'PENDING')
    .maybeSingle();

  if (existingPending) {
    return {
      success: false,
      error: 'Your college already has a pending payment request. Please wait for Super Admin verification.',
    };
  }

  const { data: newRequest, error } = await supabase
    .from('college_payment_requests')
    .insert({
      college_id: collegeId,
      billing_plan_id: plan.id,
      plan_type: plan.slug,
      amount: plan.price,
      payment_method: paymentMethod,
      payment_reference: paymentReference.trim(),
      payment_proof_url: paymentProofUrl || null,
      snapshot_plan_name: plan.name,
      snapshot_billing_interval: plan.billing_interval,
      status: 'PENDING',
      submitted_by: session.userId,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[COLLEGE_PAYMENT_REQUEST_CREATE]', error);
    return { success: false, error: 'Failed to submit payment request. Please try again.' };
  }

  await logAudit(
    supabase,
    { collegeId, userId: session.userId, email: session.email },
    'PAYMENT_REQUEST_CREATED',
    'college_payment_requests',
    newRequest.id,
    `Payment request submitted: ${plan.name} (${plan.slug}) plan, ₹${plan.price}, via ${paymentMethod}, UTR: ${paymentReference}`
  );

  revalidatePath('/admin/dashboard');
  return {
    success: true,
    message: 'Payment request submitted successfully. It will be verified by the Super Admin.',
  };
}

// ====================================================================
// UPLOAD PAYMENT PROOF (Tenant College Storage)
// ====================================================================

export async function uploadPaymentProofAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const collegeId = session.activeCollegeId;
  if (!collegeId) {
    return { success: false, error: 'No active college organization found.' };
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'No file provided.' };
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: 'File size must be less than 5MB.' };
  }

  // Only images
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'Only image files are allowed.' };
  }

  const supabase = await getAdminDb();
  const ext = file.name.split('.').pop() || 'png';
  // Enforce storage folder structure: <college_id>/<filename>
  const fileName = `${collegeId}/${Date.now()}.${ext}`;

  let { data, error } = await supabase.storage
    .from('payment-proofs')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error && (error.message?.includes('not found') || (error as any).statusCode === 404)) {
    try {
      await supabase.storage.createBucket('payment-proofs', {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
      });

      const retry = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });
      data = retry.data;
      error = retry.error;
    } catch (createErr) {
      console.error('[PAYMENT_PROOF_BUCKET_AUTO_CREATE]', createErr);
    }
  }

  if (error || !data) {
    console.error('[PAYMENT_PROOF_UPLOAD]', error);
    return { success: false, error: error?.message || 'Failed to upload payment proof.' };
  }

  return { success: true, url: data.path };
}

// ====================================================================
// GET PAYMENT PROOF SIGNED URL
// ====================================================================

export async function getPaymentProofUrlAction(proofPath: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  // Authorization check: Super Admin OR caller is an active member of target college folder
  const folderCollegeId = proofPath.split('/')[0];
  const isAuthorized =
    session.isSuperAdmin ||
    session.colleges.some((c) => c.collegeId === folderCollegeId && c.status === 'ACTIVE');

  if (!isAuthorized) {
    return { success: false, error: 'Access denied.' };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(proofPath, 300); // 5 min expiry

  if (error || !data?.signedUrl) {
    return { success: false, error: 'Failed to generate access URL.' };
  }

  return { success: true, url: data.signedUrl };
}

// ====================================================================
// SUPER ADMIN: APPROVE PAYMENT
// ====================================================================

export async function approvePaymentAction(requestId: string) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isSuperAdmin) {
      return { success: false, error: 'Only the Super Admin can approve payments.' };
    }

    if (!isValidUUID(requestId)) {
      return { success: false, error: 'Invalid payment request ID.' };
    }

    const supabase = await getAdminDb();

    // Fetch payment request from college_payment_requests
    const { data: payReq, error: fetchErr } = await supabase
      .from('college_payment_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !payReq) {
      return { success: false, error: fetchErr?.message || 'Payment request not found.' };
    }

    if (payReq.status !== 'PENDING') {
      return { success: false, error: `This payment request has already been ${payReq.status.toLowerCase()}.` };
    }

    // Validate amount against billing_plans catalog
    let expectedAmount = payReq.amount;
    let durationDays = 30; // default

    if (payReq.billing_plan_id) {
      const { data: plan } = await supabase
        .from('billing_plans')
        .select('price, duration_days')
        .eq('id', payReq.billing_plan_id)
        .maybeSingle();
      if (plan) {
        expectedAmount = plan.price;
        if (plan.duration_days) durationDays = plan.duration_days;
      }
    } else {
      const { data: plan } = await supabase
        .from('billing_plans')
        .select('price, duration_days')
        .eq('slug', payReq.plan_type)
        .maybeSingle();
      if (plan) {
        expectedAmount = plan.price;
        if (plan.duration_days) durationDays = plan.duration_days;
      }
    }

    if (expectedAmount !== payReq.amount) {
      return {
        success: false,
        error: `Amount mismatch. Expected ₹${expectedAmount} for ${payReq.plan_type} plan but request has ₹${payReq.amount}.`,
      };
    }

    // Verify college exists
    const { data: targetCollege, error: colErr } = await supabase
      .from('colleges')
      .select('id, name, code, slug')
      .eq('id', payReq.college_id)
      .single();

    if (colErr || !targetCollege) {
      return { success: false, error: 'Target college not found.' };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Update payment request
    const { error: updateReqErr } = await supabase
      .from('college_payment_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: session.userId || null,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'PENDING');

    if (updateReqErr) {
      console.error('[APPROVE_PAYMENT_UPDATE_ERR]', updateReqErr);
      return { success: false, error: updateReqErr.message || 'Failed to update payment request.' };
    }

    // Upsert / update college billing account
    await ensureCollegeBillingAccount(payReq.college_id);

    const { error: billingErr } = await supabase
      .from('college_billing_accounts')
      .update({
        plan_type: payReq.plan_type,
        current_plan_id: payReq.billing_plan_id || null,
        access_status: 'UNLOCKED',
        subscription_status: 'ACTIVE',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('college_id', payReq.college_id);

    if (billingErr) {
      console.error('[APPROVE_PAYMENT_BILLING_ERR]', billingErr);
      return { success: false, error: billingErr.message || 'Payment approved but failed to update college billing account.' };
    }

    await logAudit(
      supabase,
      { collegeId: payReq.college_id, userId: session.userId, email: session.email },
      'PAYMENT_APPROVED',
      'college_payment_requests',
      requestId,
      `Approved ${payReq.plan_type} payment for ${targetCollege.name} (${targetCollege.code}). Amount: ₹${payReq.amount}. Valid until: ${expiresAt.toISOString()}`
    );

    revalidatePath('/admin/dashboard');
    return {
      success: true,
      message: `Payment approved. ${targetCollege.name} is now UNLOCKED with ${payReq.plan_type} plan.`,
    };
  } catch (err: any) {
    console.error('[APPROVE_PAYMENT_EXCEPTION]', err);
    return { success: false, error: err?.message || 'An unexpected error occurred while approving payment.' };
  }
}

// ====================================================================
// SUPER ADMIN: REJECT PAYMENT
// ====================================================================

export async function rejectPaymentAction(requestId: string, rejectionReason?: string) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isSuperAdmin) {
      return { success: false, error: 'Only the Super Admin can reject payments.' };
    }

    if (!isValidUUID(requestId)) {
      return { success: false, error: 'Invalid payment request ID.' };
    }

    const supabase = await getAdminDb();

    const { data: payReq, error: fetchErr } = await supabase
      .from('college_payment_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !payReq) {
      return { success: false, error: fetchErr?.message || 'Payment request not found.' };
    }

    if (payReq.status !== 'PENDING') {
      return { success: false, error: `This payment request has already been ${payReq.status.toLowerCase()}.` };
    }

    const { error } = await supabase
      .from('college_payment_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: session.userId || null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'PENDING');

    if (error) {
      console.error('[REJECT_PAYMENT_UPDATE_ERR]', error);
      return { success: false, error: error.message || 'Failed to reject payment request.' };
    }

    await logAudit(
      supabase,
      { collegeId: payReq.college_id, userId: session.userId, email: session.email },
      'PAYMENT_REJECTED',
      'college_payment_requests',
      requestId,
      `Rejected ${payReq.plan_type} payment for college ${payReq.college_id}. Reason: ${rejectionReason || 'Not specified'}`
    );

    revalidatePath('/admin/dashboard');
    return { success: true, message: 'Payment request rejected.' };
  } catch (err: any) {
    console.error('[REJECT_PAYMENT_EXCEPTION]', err);
    return { success: false, error: err?.message || 'An unexpected error occurred while rejecting payment.' };
  }
}

// ====================================================================
// SUPER ADMIN: ASSIGN FREE PLAN TO COLLEGE
// ====================================================================

export async function assignFreePlanAction(targetCollegeId: string) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isSuperAdmin) {
      return { success: false, error: 'Only the Super Admin can assign the Free plan.' };
    }

    if (!isValidUUID(targetCollegeId)) {
      return { success: false, error: 'Invalid college ID.' };
    }

    const supabase = await getAdminDb();

    const { data: college } = await supabase
      .from('colleges')
      .select('id, name, code')
      .eq('id', targetCollegeId)
      .single();

    if (!college) {
      return { success: false, error: 'College not found.' };
    }

    await ensureCollegeBillingAccount(targetCollegeId);

    const { error } = await supabase
      .from('college_billing_accounts')
      .update({
        plan_type: 'FREE',
        current_plan_id: null,
        access_status: 'UNLOCKED',
        subscription_status: 'ACTIVE',
        started_at: new Date().toISOString(),
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('college_id', targetCollegeId);

    if (error) {
      return { success: false, error: error.message || 'Failed to assign Free plan.' };
    }

    await logAudit(
      supabase,
      { collegeId: targetCollegeId, userId: session.userId, email: session.email },
      'FREE_PLAN_ASSIGNED',
      'college_billing_accounts',
      targetCollegeId,
      `Free plan assigned to ${college.name} (${college.code}) by Super Admin.`
    );

    revalidatePath('/admin/dashboard');
    return { success: true, message: `Free plan assigned to ${college.name}. Access is UNLOCKED.` };
  } catch (err: any) {
    console.error('[ASSIGN_FREE_PLAN_EXCEPTION]', err);
    return { success: false, error: err?.message || 'An unexpected error occurred while assigning Free plan.' };
  }
}

// ====================================================================
// SUPER ADMIN: LOCK COLLEGE ACCESS
// ====================================================================

export async function lockAdminAccessAction(targetCollegeId: string) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isSuperAdmin) {
      return { success: false, error: 'Only the Super Admin can lock access.' };
    }

    if (!isValidUUID(targetCollegeId)) {
      return { success: false, error: 'Invalid college ID.' };
    }

    const supabase = await getAdminDb();

    const { data: college } = await supabase
      .from('colleges')
      .select('id, name, code')
      .eq('id', targetCollegeId)
      .single();

    if (!college) {
      return { success: false, error: 'College not found.' };
    }

    await ensureCollegeBillingAccount(targetCollegeId);

    const { error } = await supabase
      .from('college_billing_accounts')
      .update({
        access_status: 'LOCKED',
        updated_at: new Date().toISOString(),
      })
      .eq('college_id', targetCollegeId);

    if (error) {
      return { success: false, error: error.message || 'Failed to lock college access.' };
    }

    await logAudit(
      supabase,
      { collegeId: targetCollegeId, userId: session.userId, email: session.email },
      'COLLEGE_ACCESS_LOCKED',
      'college_billing_accounts',
      targetCollegeId,
      `Access locked for college ${college.name} (${college.code}) by Super Admin.`
    );

    revalidatePath('/admin/dashboard');
    return { success: true, message: `Access locked for ${college.name}.` };
  } catch (err: any) {
    console.error('[LOCK_COLLEGE_ACCESS_EXCEPTION]', err);
    return { success: false, error: err?.message || 'An unexpected error occurred while locking access.' };
  }
}

// ====================================================================
// SUPER ADMIN: UNLOCK COLLEGE ACCESS
// ====================================================================

export async function unlockAdminAccessAction(targetCollegeId: string) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isSuperAdmin) {
      return { success: false, error: 'Only the Super Admin can unlock access.' };
    }

    if (!isValidUUID(targetCollegeId)) {
      return { success: false, error: 'Invalid college ID.' };
    }

    const supabase = await getAdminDb();

    const { data: college } = await supabase
      .from('colleges')
      .select('id, name, code')
      .eq('id', targetCollegeId)
      .single();

    if (!college) {
      return { success: false, error: 'College not found.' };
    }

    await ensureCollegeBillingAccount(targetCollegeId);

    const { error } = await supabase
      .from('college_billing_accounts')
      .update({
        access_status: 'UNLOCKED',
        subscription_status: 'ACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('college_id', targetCollegeId);

    if (error) {
      return { success: false, error: error.message || 'Failed to unlock college access.' };
    }

    await logAudit(
      supabase,
      { collegeId: targetCollegeId, userId: session.userId, email: session.email },
      'COLLEGE_ACCESS_UNLOCKED',
      'college_billing_accounts',
      targetCollegeId,
      `Access unlocked for college ${college.name} (${college.code}) by Super Admin.`
    );

    revalidatePath('/admin/dashboard');
    return { success: true, message: `Access unlocked for ${college.name}.` };
  } catch (err: any) {
    console.error('[UNLOCK_COLLEGE_ACCESS_EXCEPTION]', err);
    return { success: false, error: err?.message || 'An unexpected error occurred while unlocking access.' };
  }
}

// ====================================================================
// SUPER ADMIN: REVOKE COLLEGE FORM ACCESS
// ====================================================================

export async function revokeFormAccessAction(targetCollegeId: string) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isSuperAdmin) {
      return { success: false, error: 'Only the Super Admin can revoke access.' };
    }

    if (!isValidUUID(targetCollegeId)) {
      return { success: false, error: 'Invalid college ID.' };
    }

    const supabase = await getAdminDb();

    const { data: college } = await supabase
      .from('colleges')
      .select('id, name, code')
      .eq('id', targetCollegeId)
      .single();

    if (!college) {
      return { success: false, error: 'College not found.' };
    }

    await ensureCollegeBillingAccount(targetCollegeId);

    const { error } = await supabase
      .from('college_billing_accounts')
      .update({
        access_status: 'LOCKED',
        subscription_status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('college_id', targetCollegeId);

    if (error) {
      return { success: false, error: error.message || 'Failed to revoke access.' };
    }

    await logAudit(
      supabase,
      { collegeId: targetCollegeId, userId: session.userId, email: session.email },
      'COLLEGE_ACCESS_REVOKED',
      'college_billing_accounts',
      targetCollegeId,
      `Access revoked for college ${college.name} (${college.code}) by Super Admin.`
    );

    revalidatePath('/admin/dashboard');
    return { success: true, message: `Access revoked for ${college.name}.` };
  } catch (err: any) {
    console.error('[REVOKE_COLLEGE_ACCESS_EXCEPTION]', err);
    return { success: false, error: err?.message || 'An unexpected error occurred while revoking access.' };
  }
}

// ====================================================================
// SUPER ADMIN: COLLEGE-LEVEL BILLING OVERVIEW
// ====================================================================

/**
 * HARDENING RULE 2: Billing Overview is COLLEGE-level, not admin-user-level.
 * Super Admin sees colleges and their billing state.
 */
export async function getAdminBillingOverviewAction(): Promise<{
  success: boolean;
  error?: string;
  data: BillingOverviewItem[];
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can view billing overview.', data: [] };
  }

  const supabase = await getAdminDb();

  // 1. Fetch all colleges
  const { data: colleges, error: collegesErr } = await supabase
    .from('colleges')
    .select('id, name, code, slug, is_active, created_at')
    .order('created_at', { ascending: false });

  if (collegesErr || !colleges) {
    return { success: false, error: 'Failed to load colleges.', data: [] };
  }

  // 2. Concurrently fetch all college billing accounts, payment requests, trials, and memberships
  const [billingRes, requestsRes, trialsRes, membersRes] = await Promise.all([
    supabase.from('college_billing_accounts').select('*'),
    supabase.from('college_payment_requests').select('*').order('created_at', { ascending: false }),
    supabase.from('college_trial_entitlements').select('*').order('created_at', { ascending: false }),
    supabase.from('college_memberships').select('college_id, user_id, role, status').eq('status', 'ACTIVE'),
  ]);

  const billingRecords = billingRes.data || [];
  const paymentRequests = requestsRes.data || [];
  const trialRecords = trialsRes.data || [];
  const memberships = membersRes.data || [];

  const billingMap = new Map((billingRecords || []).map((b: any) => [b.college_id, b]));
  const requestsMap = new Map<string, CollegePaymentRequest[]>();
  const trialsMap = new Map<string, CollegeTrialEntitlement[]>();
  const membersCountMap = new Map<string, number>();

  for (const req of (paymentRequests || []) as CollegePaymentRequest[]) {
    if (!requestsMap.has(req.college_id)) {
      requestsMap.set(req.college_id, []);
    }
    requestsMap.get(req.college_id)!.push(req);
  }

  for (const trial of (trialRecords || []) as CollegeTrialEntitlement[]) {
    if (!trialsMap.has(trial.college_id)) {
      trialsMap.set(trial.college_id, []);
    }
    trialsMap.get(trial.college_id)!.push(trial);
  }

  for (const m of memberships as any[]) {
    membersCountMap.set(m.college_id, (membersCountMap.get(m.college_id) || 0) + 1);
  }

  const now = new Date();

  const overview: BillingOverviewItem[] = colleges.map((col: any) => {
    const billing = billingMap.get(col.id) as CollegeBillingAccount | undefined;
    const requests = requestsMap.get(col.id) || [];
    const latestRequest = requests[0] || null;
    const collegeTrials = trialsMap.get(col.id) || [];

    // Active trial check: status = ACTIVE, starts_at <= now, now < expires_at
    const activeTrial = collegeTrials.find(
      (t) => t.status === 'ACTIVE' && new Date(t.starts_at) <= now && new Date(t.expires_at) > now
    ) || null;

    const membersCount = membersCountMap.get(col.id) || 0;

    return {
      college: {
        id: col.id,
        name: col.name,
        code: col.code,
        slug: col.slug,
        is_active: col.is_active,
        created_at: col.created_at,
      },
      // UI compatibility admin bridge
      admin: {
        id: col.id,
        user_id: col.id,
        name: col.name,
        email: `${col.code.toLowerCase()}@platform.local`,
        role: 'ADMIN',
        status: col.is_active ? 'ACTIVE' : 'INACTIVE',
        created_at: col.created_at,
      },
      billing: billing || null,
      latestPaymentRequest: latestRequest,
      paymentRequests: requests,
      activeTrial,
      trialHistory: collegeTrials,
      membersCount,
    };
  });

  return { success: true, data: overview };
}

// Alias
export const getCollegeBillingOverviewAction = getAdminBillingOverviewAction;

// ====================================================================
// GET CURRENT TENANT BILLING STATUS (Tenant UI)
// ====================================================================

export async function getMyBillingStatusAction() {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const collegeId = session.activeCollegeId;
  if (!collegeId) {
    return { success: false, error: 'No active college selected.' };
  }

  const billingStatus = await getCollegeBillingStatus(collegeId);

  // Fetch latest payment request from college_payment_requests
  const supabase = await getAdminDb();
  const { data: latestRequest } = await supabase
    .from('college_payment_requests')
    .select('*')
    .eq('college_id', collegeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasFullAnalytics = session.isSuperAdmin || (billingStatus.isUnlocked && !!billingStatus.hasFullAnalytics);

  return {
    success: true,
    billing: {
      ...billingStatus,
      hasFullAnalytics,
    },
    hasFullAnalytics,
    latestPaymentRequest: latestRequest as CollegePaymentRequest | null,
    isSuperAdmin: session.isSuperAdmin,
  };
}

export async function checkAnalyticsAccessAction() {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { allowed: false, isSuperAdmin: false, reason: 'Unauthorized.' };
  }

  const result = await assertAnalyticsAccess(session);

  return {
    allowed: result.allowed,
    isSuperAdmin: session.isSuperAdmin,
    reason: result.reason,
    code: result.code,
    billingStatus: result.billingStatus,
  };
}
