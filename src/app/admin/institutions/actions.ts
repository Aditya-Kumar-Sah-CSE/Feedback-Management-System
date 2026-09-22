'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import {
  createCollegeSchema,
  updateCollegeSchema,
  type CreateCollegeInput,
  type UpdateCollegeInput,
} from '@/lib/validation';
import type { College } from '@/types/tenant';

async function getAdminDb() {
  return createAdminClient() || await createClient();
}

async function logCollegeAudit(
  supabase: any,
  actor: { userId: string; email: string },
  collegeId: string,
  action: string,
  details: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from('audit_logs').insert({
      college_id: collegeId,
      actor_user_id: actor.userId,
      actor_email: actor.email,
      action,
      entity_type: 'college',
      entity_id: collegeId,
      details,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error('Failed to write college audit log:', err);
  }
}

// ====================================================================
// 1. GET ALL INSTITUTIONS (Super Admin Only)
// ====================================================================

export async function getInstitutionsAction(): Promise<{
  success: boolean;
  colleges?: College[];
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isPlatformSuperAdmin) {
    return { success: false, error: 'Forbidden: Super Admin access required.' };
  }

  const supabase = await getAdminDb();
  const { data, error } = await supabase
    .from('colleges')
    .select('*')
    .order('name', { ascending: true });

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to fetch colleges.' };
  }

  return { success: true, colleges: data as College[] };
}

// ====================================================================
// 2. CREATE INSTITUTION (Super Admin Only)
// ====================================================================

export async function createInstitutionAction(input: CreateCollegeInput): Promise<{
  success: boolean;
  college?: College;
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isPlatformSuperAdmin) {
    return { success: false, error: 'Forbidden: Super Admin access required.' };
  }

  const validation = createCollegeSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid college parameters.',
    };
  }

  const data = validation.data;
  const slug = data.slug.trim().toLowerCase();
  const code = data.code.trim().toUpperCase();
  const supabase = await getAdminDb();

  // 1. Check slug uniqueness
  const { data: existingSlug } = await supabase
    .from('colleges')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingSlug) {
    return { success: false, error: `A college with slug "${slug}" already exists. Slugs must be unique.` };
  }

  // 2. Check code uniqueness
  const { data: existingCode } = await supabase
    .from('colleges')
    .select('id')
    .ilike('code', code)
    .maybeSingle();

  if (existingCode) {
    return { success: false, error: `A college with code "${code}" already exists. Codes must be unique.` };
  }

  // 3. Insert into public.colleges
  const { data: newCollege, error: insertErr } = await supabase
    .from('colleges')
    .insert({
      name: data.name.trim(),
      code,
      slug,
      logo_url: data.logoUrl?.trim() || null,
      address: data.address?.trim() || null,
      contact_email: data.contactEmail?.trim() || null,
      contact_phone: data.contactPhone?.trim() || null,
      website_url: data.websiteUrl?.trim() || null,
      tagline: data.tagline?.trim() || null,
      affiliated_university: data.affiliatedUniversity?.trim() || null,
      established_year: data.establishedYear || null,
      is_active: data.isActive,
    })
    .select('*')
    .single();

  if (insertErr || !newCollege) {
    return { success: false, error: insertErr?.message || 'Failed to create college record.' };
  }

  // 4. Initialize required default college-level billing account
  try {
    await supabase.from('college_billing_accounts').insert({
      college_id: newCollege.id,
      plan_type: 'FREE',
      access_status: 'UNLOCKED',
      subscription_status: 'ACTIVE',
      started_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to initialize college billing account:', err);
  }

  // 5. Audit log
  await logCollegeAudit(
    supabase,
    { userId: session.userId, email: session.email },
    newCollege.id,
    'COLLEGE_CREATED',
    `Created college "${newCollege.name}" (${newCollege.code}) with slug /${newCollege.slug}`,
    { code: newCollege.code, slug: newCollege.slug }
  );

  // 6. Invalidate caches
  try {
    revalidatePath('/');
    revalidatePath('/admin/institutions');
    revalidatePath('/admin/dashboard');
    revalidatePath(`/${newCollege.slug}`);
    revalidateTag('colleges');
    revalidateTag('all_active_colleges_cache');
    revalidateTag(`tenant_${newCollege.slug}`);
  } catch (err) {
    console.warn('Revalidation warning:', err);
  }

  return { success: true, college: newCollege as College };
}

// ====================================================================
// 3. UPDATE INSTITUTION (Super Admin Only)
// ====================================================================

export async function updateInstitutionAction(input: UpdateCollegeInput): Promise<{
  success: boolean;
  college?: College;
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isPlatformSuperAdmin) {
    return { success: false, error: 'Forbidden: Super Admin access required.' };
  }

  const validation = updateCollegeSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid update parameters.',
    };
  }

  const data = validation.data;
  const collegeId = data.id;
  const slug = data.slug.trim().toLowerCase();
  const code = data.code.trim().toUpperCase();
  const supabase = await getAdminDb();

  // 1. Fetch existing college record
  const { data: existing, error: fetchErr } = await supabase
    .from('colleges')
    .select('*')
    .eq('id', collegeId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'College not found.' };
  }

  // 2. Check slug uniqueness if changed
  if (slug !== existing.slug) {
    const { data: conflictSlug } = await supabase
      .from('colleges')
      .select('id')
      .neq('id', collegeId)
      .eq('slug', slug)
      .maybeSingle();

    if (conflictSlug) {
      return { success: false, error: `A college with slug "${slug}" already exists. Slugs must be unique.` };
    }
  }

  // 3. Check code uniqueness if changed
  if (code !== existing.code) {
    const { data: conflictCode } = await supabase
      .from('colleges')
      .select('id')
      .neq('id', collegeId)
      .ilike('code', code)
      .maybeSingle();

    if (conflictCode) {
      return { success: false, error: `A college with code "${code}" already exists. Codes must be unique.` };
    }
  }

  // 4. Update in public.colleges
  const { data: updated, error: updateErr } = await supabase
    .from('colleges')
    .update({
      name: data.name.trim(),
      code,
      slug,
      logo_url: data.logoUrl?.trim() || null,
      address: data.address?.trim() || null,
      contact_email: data.contactEmail?.trim() || null,
      contact_phone: data.contactPhone?.trim() || null,
      website_url: data.websiteUrl?.trim() || null,
      tagline: data.tagline?.trim() || null,
      affiliated_university: data.affiliatedUniversity?.trim() || null,
      established_year: data.establishedYear || null,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', collegeId)
    .select('*')
    .single();

  if (updateErr || !updated) {
    return { success: false, error: updateErr?.message || 'Failed to update college.' };
  }

  // 5. Audit log
  await logCollegeAudit(
    supabase,
    { userId: session.userId, email: session.email },
    collegeId,
    'COLLEGE_UPDATED',
    `Updated college "${updated.name}" (${updated.code})`,
    { oldSlug: existing.slug, newSlug: updated.slug, oldCode: existing.code, newCode: updated.code }
  );

  // 6. Invalidate caches
  try {
    revalidatePath('/');
    revalidatePath('/admin/institutions');
    revalidatePath('/admin/dashboard');
    revalidatePath(`/${existing.slug}`);
    revalidatePath(`/${updated.slug}`);
    revalidateTag('colleges');
    revalidateTag('all_active_colleges_cache');
    revalidateTag(`tenant_${existing.slug}`);
    revalidateTag(`tenant_${updated.slug}`);
  } catch (err) {
    console.warn('Revalidation warning:', err);
  }

  return { success: true, college: updated as College };
}

// ====================================================================
// 4. TOGGLE INSTITUTION STATUS (Super Admin Only)
// ====================================================================

export async function toggleInstitutionStatusAction(
  collegeId: string,
  isActive: boolean
): Promise<{ success: boolean; isActive?: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isPlatformSuperAdmin) {
    return { success: false, error: 'Forbidden: Super Admin access required.' };
  }

  if (!collegeId) {
    return { success: false, error: 'College ID is required.' };
  }

  const supabase = await getAdminDb();

  // 1. Fetch current record
  const { data: existing, error: fetchErr } = await supabase
    .from('colleges')
    .select('id, name, code, slug, is_active')
    .eq('id', collegeId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'College not found.' };
  }

  // 2. Update status
  const { error: updateErr } = await supabase
    .from('colleges')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', collegeId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // 3. Audit log
  await logCollegeAudit(
    supabase,
    { userId: session.userId, email: session.email },
    collegeId,
    isActive ? 'COLLEGE_ACTIVATED' : 'COLLEGE_DEACTIVATED',
    `${isActive ? 'Activated' : 'Deactivated'} college "${existing.name}" (${existing.code})`,
    { slug: existing.slug, previousStatus: existing.is_active, newStatus: isActive }
  );

  // 4. Invalidate caches
  try {
    revalidatePath('/');
    revalidatePath('/admin/institutions');
    revalidatePath('/admin/dashboard');
    revalidatePath(`/${existing.slug}`);
    revalidateTag('colleges');
    revalidateTag('all_active_colleges_cache');
    revalidateTag(`tenant_${existing.slug}`);
  } catch (err) {
    console.warn('Revalidation warning:', err);
  }

  return { success: true, isActive };
}
