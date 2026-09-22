'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import {
  isValidUUID,
  createBillingPlanSchema,
  updateBillingPlanSchema,
} from '@/lib/validation';
import type { BillingPlan } from '@/types/database';

async function getAdminDb() {
  return createAdminClient() || await createClient();
}

async function logAudit(
  supabase: ReturnType<typeof createAdminClient>,
  actor: { adminId?: string | null; email?: string },
  action: string,
  entityType: string,
  entityId: string,
  details: string,
) {
  try {
    await supabase!.from('audit_logs').insert({
      actor_user_id: actor.adminId || null,
      actor_email: actor.email || '',
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
  } catch (err) {
    console.error('Plan audit log write error:', err);
  }
}

// ====================================================================
// FETCH ACTIVE PLANS (available to any authenticated admin)
// ====================================================================

export async function getActiveBillingPlansAction(): Promise<{
  success: boolean;
  plans: BillingPlan[];
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, plans: [], error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return { success: false, plans: [], error: 'Failed to load billing plans.' };
  }

  return { success: true, plans: (data || []) as BillingPlan[] };
}

// ====================================================================
// FETCH ALL PLANS (Super Admin only — includes disabled)
// ====================================================================

export async function getAllBillingPlansAction(): Promise<{
  success: boolean;
  plans: BillingPlan[];
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, plans: [], error: 'Only the Super Admin can view all plans.' };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    return { success: false, plans: [], error: 'Failed to load billing plans.' };
  }

  return { success: true, plans: (data || []) as BillingPlan[] };
}

// ====================================================================
// FETCH SINGLE PLAN BY ID
// ====================================================================

export async function getBillingPlanByIdAction(planId: string): Promise<{
  success: boolean;
  plan?: BillingPlan;
  error?: string;
}> {
  if (!isValidUUID(planId)) {
    return { success: false, error: 'Invalid plan ID.' };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error || !data) {
    return { success: false, error: 'Plan not found.' };
  }

  return { success: true, plan: data as BillingPlan };
}

// ====================================================================
// CREATE PLAN (Super Admin only)
// ====================================================================

export async function createBillingPlanAction(input: {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  currency?: string;
  billingInterval: string;
  durationDays?: number | null;
  features?: string[];
  isActive?: boolean;
  isRecommended?: boolean;
  displayOrder?: number;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can create billing plans.' };
  }

  const validation = createBillingPlanSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid input.' };
  }

  const v = validation.data;
  const slug = (v.slug || v.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')).trim();
  const supabase = await getAdminDb();

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('billing_plans')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return { success: false, error: `A plan with slug "${slug}" already exists.` };
  }

  const { data: newPlan, error } = await supabase
    .from('billing_plans')
    .insert({
      name: v.name,
      slug,
      description: v.description || '',
      price: v.price,
      currency: v.currency || 'INR',
      billing_interval: v.billingInterval,
      duration_days: v.durationDays || null,
      features: v.features || [],
      is_active: v.isActive ?? true,
      is_recommended: v.isRecommended ?? false,
      display_order: v.displayOrder ?? 0,
      created_by: session.admin?.id || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[CREATE_BILLING_PLAN]', error);
    return { success: false, error: error.message || 'Failed to create billing plan.' };
  }

  await logAudit(supabase, { adminId: session.admin?.id, email: session.user?.email },
    'PLAN_CREATED', 'billing_plans', newPlan.id,
    `Created billing plan: ${v.name} (${slug}), ₹${v.price}, interval: ${v.billingInterval}`);

  revalidatePath('/admin/dashboard');
  return { success: true, plan: newPlan as BillingPlan };
}

// ====================================================================
// UPDATE PLAN (Super Admin only)
// ====================================================================

export async function updateBillingPlanAction(input: {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  price?: number;
  currency?: string;
  billingInterval?: string;
  durationDays?: number | null;
  features?: string[];
  isActive?: boolean;
  isRecommended?: boolean;
  displayOrder?: number;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can update billing plans.' };
  }

  const validation = updateBillingPlanSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid input.' };
  }

  const v = validation.data;
  const supabase = await getAdminDb();

  // Fetch existing plan
  const { data: existingPlan } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('id', v.id)
    .single();

  if (!existingPlan) {
    return { success: false, error: 'Plan not found.' };
  }

  // If slug is changing, check uniqueness
  if (v.slug && v.slug !== existingPlan.slug) {
    const { data: slugConflict } = await supabase
      .from('billing_plans')
      .select('id')
      .eq('slug', v.slug)
      .neq('id', v.id)
      .maybeSingle();

    if (slugConflict) {
      return { success: false, error: `A plan with slug "${v.slug}" already exists.` };
    }
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.name !== undefined) updatePayload.name = v.name;
  if (v.slug !== undefined) updatePayload.slug = v.slug;
  if (v.description !== undefined) updatePayload.description = v.description;
  if (v.price !== undefined) updatePayload.price = v.price;
  if (v.currency !== undefined) updatePayload.currency = v.currency;
  if (v.billingInterval !== undefined) updatePayload.billing_interval = v.billingInterval;
  if (v.durationDays !== undefined) updatePayload.duration_days = v.durationDays;
  if (v.features !== undefined) updatePayload.features = v.features;
  if (v.isActive !== undefined) updatePayload.is_active = v.isActive;
  if (v.isRecommended !== undefined) updatePayload.is_recommended = v.isRecommended;
  if (v.displayOrder !== undefined) updatePayload.display_order = v.displayOrder;

  const { error } = await supabase
    .from('billing_plans')
    .update(updatePayload)
    .eq('id', v.id);

  if (error) {
    console.error('[UPDATE_BILLING_PLAN]', error);
    return { success: false, error: error.message || 'Failed to update billing plan.' };
  }

  const changes = Object.entries(updatePayload)
    .filter(([k]) => k !== 'updated_at')
    .map(([k, val]) => `${k}: ${JSON.stringify(val)}`)
    .join(', ');

  await logAudit(supabase, { adminId: session.admin?.id, email: session.user?.email },
    'PLAN_UPDATED', 'billing_plans', v.id,
    `Updated plan "${existingPlan.name}": ${changes}`);

  revalidatePath('/admin/dashboard');
  return { success: true };
}

// ====================================================================
// TOGGLE PLAN ACTIVE/DISABLED (Super Admin only)
// ====================================================================

export async function toggleBillingPlanAction(planId: string, isActive: boolean) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can enable/disable plans.' };
  }

  if (!isValidUUID(planId)) {
    return { success: false, error: 'Invalid plan ID.' };
  }

  const supabase = await getAdminDb();

  const { data: plan } = await supabase
    .from('billing_plans')
    .select('name, slug')
    .eq('id', planId)
    .single();

  if (!plan) {
    return { success: false, error: 'Plan not found.' };
  }

  const { error } = await supabase
    .from('billing_plans')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', planId);

  if (error) {
    return { success: false, error: error.message || `Failed to ${isActive ? 'enable' : 'disable'} plan.` };
  }

  await logAudit(supabase, { adminId: session.admin?.id, email: session.user?.email },
    isActive ? 'PLAN_ENABLED' : 'PLAN_DISABLED',
    'billing_plans', planId,
    `${isActive ? 'Enabled' : 'Disabled'} billing plan: ${plan.name} (${plan.slug})`);

  revalidatePath('/admin/dashboard');
  return { success: true, message: `Plan "${plan.name}" ${isActive ? 'enabled' : 'disabled'}.` };
}

// ====================================================================
// DELETE PLAN (Super Admin only — only if unused)
// ====================================================================

export async function deleteBillingPlanAction(planId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only the Super Admin can delete billing plans.' };
  }

  if (!isValidUUID(planId)) {
    return { success: false, error: 'Invalid plan ID.' };
  }

  const supabase = await getAdminDb();

  const { data: plan } = await supabase
    .from('billing_plans')
    .select('name, slug')
    .eq('id', planId)
    .single();

  if (!plan) {
    return { success: false, error: 'Plan not found.' };
  }

  // Check if plan is referenced by any payment request
  const { data: usedByPayment } = await supabase
    .from('college_payment_requests')
    .select('id')
    .eq('billing_plan_id', planId)
    .limit(1)
    .maybeSingle();

  if (usedByPayment) {
    return {
      success: false,
      error: 'This plan is already in use by payment records. Disable it instead of deleting.',
    };
  }

  // Also check by slug in plan_type
  const { data: usedByLegacy } = await supabase
    .from('college_payment_requests')
    .select('id')
    .eq('plan_type', plan.slug)
    .limit(1)
    .maybeSingle();

  if (usedByLegacy) {
    return {
      success: false,
      error: 'This plan is already in use by payment history. Disable it instead of deleting.',
    };
  }

  // Also check college_billing_accounts using this plan
  const { data: usedByBilling } = await supabase
    .from('college_billing_accounts')
    .select('id')
    .or(`current_plan_id.eq.${planId},plan_type.eq.${plan.slug}`)
    .limit(1)
    .maybeSingle();

  if (usedByBilling) {
    return {
      success: false,
      error: 'This plan is assigned to college billing accounts. Disable it instead of deleting.',
    };
  }

  const { error } = await supabase
    .from('billing_plans')
    .delete()
    .eq('id', planId);

  if (error) {
    console.error('[DELETE_BILLING_PLAN]', error);
    return { success: false, error: error.message || 'Failed to delete billing plan.' };
  }

  await logAudit(supabase, { adminId: session.admin?.id, email: session.user?.email },
    'PLAN_DELETED', 'billing_plans', planId,
    `Deleted billing plan: ${plan.name} (${plan.slug})`);

  revalidatePath('/admin/dashboard');
  return { success: true, message: `Plan "${plan.name}" deleted.` };
}
