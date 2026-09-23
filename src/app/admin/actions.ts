'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession, resolveAuthorizedCollegeId } from '@/lib/auth/admin-auth';
import { ACADEMIC_CACHE_TAG } from '@/lib/supabase/academic-cache';
import { branchSchema, isValidUUID } from '@/lib/validation';
import { deleteFeedbackFormAction as deleteFormInternal } from './forms/actions';

async function getAdminDb() {
  return createAdminClient() || await createClient();
}

// Helper: record audit log
async function logAuditAction(
  supabase: any,
  actor: { adminId?: string | null; email?: string },
  action: string,
  entityType: string,
  entityId: string,
  details: string
) {
  try {
    await supabase.from('audit_logs').insert({
      admin_id: actor.adminId || null,
      actor_email: actor.email,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

// -------------------------------------------------------------
// 1. ADMIN MANAGEMENT (SUPER ADMIN ONLY)
// -------------------------------------------------------------

export async function approveAdminRequestAction(requestId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    return { success: false, error: 'Authentication required.' };
  }

  const supabase = await getAdminDb();

  // First check if this is a multi-tenant college_admin_requests record
  const { data: collegeReq } = await supabase
    .from('college_admin_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (collegeReq) {
    // Platform Super Admin OR active College Admin of this college
    const canManageCollege =
      session.isPlatformSuperAdmin ||
      session.colleges.some(
        (c) => c.collegeId === collegeReq.college_id && c.status === 'ACTIVE'
      );

    if (!canManageCollege) {
      return { success: false, error: 'Only an authorized administrator for this institution can approve requests.' };
    }

    if (collegeReq.status === 'APPROVED') {
      return { success: false, error: 'This administrator request has already been approved.' };
    }

    let targetUserId = collegeReq.user_id;
    if (!targetUserId) {
      try {
        const { data: userListData } = await supabase.auth.admin.listUsers();
        const matchedUser = userListData?.users?.find(
          (u: any) => u.email?.toLowerCase() === collegeReq.email.toLowerCase().trim()
        );
        if (matchedUser) {
          targetUserId = matchedUser.id;
        }
      } catch (authResolveErr) {
        console.warn('[APPROVE_USER_ID_RESOLVE_WARNING]', authResolveErr);
      }
    }

    if (!targetUserId) {
      return { success: false, error: 'Cannot approve request: user account not found in Auth system.' };
    }

    // Auto-confirm user's email so they can login immediately
    try {
      await supabase.auth.admin.updateUserById(targetUserId, {
        email_confirm: true,
      });
    } catch (confirmErr) {
      console.warn('[APPROVE_EMAIL_CONFIRM_WARNING]', confirmErr);
      // Non-fatal: proceed with approval even if email confirm fails
    }

    // Upsert into college_memberships
    const { error: memberErr } = await supabase
      .from('college_memberships')
      .upsert(
        {
          college_id: collegeReq.college_id,
          user_id: targetUserId,
          role: 'COLLEGE_ADMIN',
          status: 'ACTIVE',
        },
        { onConflict: 'college_id,user_id' }
      );

    if (memberErr) {
      console.error('[APPROVE_MEMBERSHIP_ERROR]', memberErr);
      return { success: false, error: memberErr.message };
    }

    // Update college_admin_requests
    await supabase
      .from('college_admin_requests')
      .update({
        status: 'APPROVED',
        user_id: targetUserId,
        reviewed_by: session.userId || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // Audit log
    await logAuditAction(
      supabase,
      { adminId: session.userId, email: session.email },
      'APPROVE_COLLEGE_ADMIN_REQUEST',
      'college_admin_requests',
      requestId,
      `Approved college admin request for ${collegeReq.email} at college ${collegeReq.college_id}`
    );

    revalidatePath('/admin/dashboard');
    return { success: true };
  }

  return { success: false, error: 'Administrator request not found.' };
}

export async function rejectAdminRequestAction(requestId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    return { success: false, error: 'Authentication required.' };
  }

  const supabase = await getAdminDb();

  // First check college_admin_requests
  const { data: collegeReq } = await supabase
    .from('college_admin_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (collegeReq) {
    // Platform Super Admin OR active College Admin of this college
    const canManageCollege =
      session.isPlatformSuperAdmin ||
      session.colleges.some(
        (c) => c.collegeId === collegeReq.college_id && c.status === 'ACTIVE'
      );

    if (!canManageCollege) {
      return { success: false, error: 'Only an authorized administrator for this institution can reject requests.' };
    }

    if (collegeReq.status === 'REJECTED') {
      return { success: false, error: 'This administrator request has already been rejected.' };
    }

    await supabase
      .from('college_admin_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: session.userId || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // Suspend college membership if present
    if (collegeReq.user_id && collegeReq.college_id) {
      await supabase
        .from('college_memberships')
        .update({ status: 'SUSPENDED' })
        .eq('college_id', collegeReq.college_id)
        .eq('user_id', collegeReq.user_id);
    }

    await logAuditAction(
      supabase,
      { adminId: session.userId, email: session.email },
      'REJECT_COLLEGE_ADMIN_REQUEST',
      'college_admin_requests',
      requestId,
      `Rejected college admin request for ${collegeReq.email} at college ${collegeReq.college_id}`
    );

    revalidatePath('/admin/dashboard');
    return { success: true };
  }

  return { success: false, error: 'Administrator request not found.' };
}

export async function revokeAdminAccessAction(targetAdminId: string, reason?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin || !session.isActive) {
    return { success: false, error: 'Unauthorized: Only an active Super Admin can revoke administrator access.' };
  }

  const supabase = await getAdminDb();

  const { data: member } = await supabase
    .from('college_memberships')
    .select('id, user_id, role, status, college_id')
    .or(`id.eq.${targetAdminId},user_id.eq.${targetAdminId}`)
    .maybeSingle();

  if (!member) {
    return { success: false, error: 'Target administrator membership record not found.' };
  }

  // Prevent self-revocation
  if (member.user_id === session.userId) {
    return { success: false, error: 'Administrators cannot revoke their own account.' };
  }

  if (member.status === 'INACTIVE') {
    return { success: false, error: 'This administrator account is already revoked / inactive.' };
  }

  const { error: updateErr } = await supabase
    .from('college_memberships')
    .update({
      status: 'INACTIVE',
      updated_at: new Date().toISOString(),
    })
    .eq('id', member.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  await logAuditAction(
    supabase,
    { adminId: session.userId, email: session.email },
    'ADMIN_ACCESS_REVOKED',
    'college_memberships',
    member.id,
    `Revoked college membership for user ${member.user_id} at college ${member.college_id}.${reason ? ` Reason: ${reason}` : ''}`
  );

  revalidatePath('/admin/dashboard');
  return { success: true };
}

export async function reactivateAdminAccessAction(targetAdminId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isSuperAdmin || !session.isActive) {
    return { success: false, error: 'Unauthorized: Only an active Super Admin can reactivate administrator access.' };
  }

  const supabase = await getAdminDb();

  const { data: member } = await supabase
    .from('college_memberships')
    .select('id, user_id, role, status, college_id')
    .or(`id.eq.${targetAdminId},user_id.eq.${targetAdminId}`)
    .maybeSingle();

  if (!member) {
    return { success: false, error: 'Target administrator membership record not found.' };
  }

  if (member.status === 'ACTIVE') {
    return { success: false, error: 'This administrator account is already active.' };
  }

  const { error: updateErr } = await supabase
    .from('college_memberships')
    .update({
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    })
    .eq('id', member.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  await logAuditAction(
    supabase,
    { adminId: session.userId, email: session.email },
    'ADMIN_ACCESS_REACTIVATED',
    'college_memberships',
    member.id,
    `Reactivated college membership for user ${member.user_id} at college ${member.college_id}.`
  );

  revalidatePath('/admin/dashboard');
  return { success: true };
}


export async function toggleAdminStatusAction(targetAdminId: string, newStatus: 'ACTIVE' | 'INACTIVE') {
  if (newStatus === 'INACTIVE') {
    return revokeAdminAccessAction(targetAdminId);
  } else {
    return reactivateAdminAccessAction(targetAdminId);
  }
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// 2. ACADEMIC YEARS CRUD
// -------------------------------------------------------------

export async function createAcademicYearAction(data: { name: string; is_active: boolean; collegeId?: string }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();
  const trimmedName = data.name.trim();

  // Check unique constraint per college (uq_academic_years_college_name)
  const { data: existingYear } = await supabase
    .from('academic_years')
    .select('id, name')
    .eq('college_id', authorizedCollegeId)
    .ilike('name', trimmedName)
    .maybeSingle();

  if (existingYear) {
    return { success: false, error: `Academic session "${trimmedName}" already exists for this institution.` };
  }

  const { data: newYear, error } = await supabase
    .from('academic_years')
    .insert({
      college_id: authorizedCollegeId,
      name: trimmedName,
      is_active: data.is_active,
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_ACADEMIC_YEAR',
    'academic_years',
    newYear.id,
    `Created academic year ${newYear.name} in institution ${authorizedCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${authorizedCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, year: newYear };
}

export async function updateAcademicYearAction(id: string, data: { name: string; is_active: boolean; collegeId?: string }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid academic year ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  // Verify target year exists
  const { data: targetYear, error: fetchErr } = await supabase
    .from('academic_years')
    .select('id, college_id, name')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetYear) {
    return { success: false, error: 'Academic session not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetYear.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot modify an academic session belonging to another institution.' };
  }

  const effectiveCollegeId = session.isPlatformSuperAdmin ? targetYear.college_id : authorizedCollegeId;
  const trimmedName = data.name.trim();

  // Prevent duplicate year name within this college on other records
  const { data: existingYear } = await supabase
    .from('academic_years')
    .select('id, name')
    .eq('college_id', effectiveCollegeId)
    .ilike('name', trimmedName)
    .neq('id', id)
    .maybeSingle();

  if (existingYear) {
    return { success: false, error: `Academic session "${trimmedName}" already exists for this institution.` };
  }

  const { error } = await supabase
    .from('academic_years')
    .update({
      name: trimmedName,
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_ACADEMIC_YEAR',
    'academic_years',
    id,
    `Updated academic year ${trimmedName} in institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

// -------------------------------------------------------------
// 3. BRANCHES CRUD
// -------------------------------------------------------------

export async function createBranchAction(data: { name: string; code: string; is_active: boolean; collegeId?: string }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const validation = branchSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid branch details.' };
  }

  const { name, code, is_active } = validation.data;
  const supabase = await getAdminDb();

  // Prevent duplicate branch code within this college (uq_branches_college_code)
  const { data: existingCode } = await supabase
    .from('branches')
    .select('id, code')
    .eq('college_id', authorizedCollegeId)
    .ilike('code', code)
    .maybeSingle();

  if (existingCode) {
    return { success: false, error: `Branch code "${code}" is already in use in this institution.` };
  }

  const { data: newBranch, error } = await supabase
    .from('branches')
    .insert({
      college_id: authorizedCollegeId,
      name,
      code,
      is_active,
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_BRANCH',
    'branches',
    newBranch.id,
    `Created branch ${newBranch.name} (${newBranch.code}) in institution ${authorizedCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${authorizedCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, branch: newBranch };
}

export async function updateBranchAction(
  id: string,
  data: { name: string; code: string; is_active: boolean; collegeId?: string }
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid branch ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const validation = branchSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid branch details.' };
  }

  const { name, code, is_active } = validation.data;
  const supabase = await getAdminDb();

  // Verify the target branch exists and belongs to the authorized college
  const { data: targetBranch, error: fetchErr } = await supabase
    .from('branches')
    .select('id, college_id, code')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetBranch) {
    return { success: false, error: 'Branch not found.' };
  }

  // Cross-tenant boundary check: Non-super-admins cannot update branches of another institution
  if (!session.isPlatformSuperAdmin && targetBranch.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot modify a branch belonging to another institution.' };
  }

  const effectiveCollegeId = session.isPlatformSuperAdmin ? targetBranch.college_id : authorizedCollegeId;

  // Prevent duplicate branch code within this college on other branches
  const { data: existingCode } = await supabase
    .from('branches')
    .select('id, code')
    .eq('college_id', effectiveCollegeId)
    .ilike('code', code)
    .neq('id', id)
    .maybeSingle();

  if (existingCode) {
    return { success: false, error: `Branch code "${code}" is already assigned to another branch in this institution.` };
  }

  const { error } = await supabase
    .from('branches')
    .update({
      name,
      code,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_BRANCH',
    'branches',
    id,
    `Updated branch ${name} (${code}) in institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

export async function deleteBranchAction(id: string, targetCollegeId?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid branch ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, targetCollegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  // Fetch branch details
  const { data: branch, error: branchErr } = await supabase
    .from('branches')
    .select('id, college_id, name, code')
    .eq('id', id)
    .maybeSingle();

  if (branchErr || !branch) {
    return { success: false, error: 'Branch not found.' };
  }

  // Cross-tenant boundary check: Non-super-admins cannot delete branches of another institution
  if (!session.isPlatformSuperAdmin && branch.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot delete a branch belonging to another institution.' };
  }

  const effectiveCollegeId = branch.college_id;

  // 1. Dependency check: feedback_forms
  const { count: formsCount } = await supabase
    .from('feedback_forms')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', id)
    .eq('college_id', effectiveCollegeId);

  if (formsCount && formsCount > 0) {
    return {
      success: false,
      error: `Cannot delete branch "${branch.name}": ${formsCount} feedback form(s) are linked to it. Deactivate the branch instead to preserve historical records.`,
    };
  }

  // 2. Dependency check: faculty_subject_assignments
  const { count: assignCount } = await supabase
    .from('faculty_subject_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', id)
    .eq('college_id', effectiveCollegeId);

  if (assignCount && assignCount > 0) {
    return {
      success: false,
      error: `Cannot delete branch "${branch.name}": ${assignCount} faculty-subject assignment(s) are linked to it. Remove or reassign them first, or deactivate the branch.`,
    };
  }

  // 3. Dependency check: subjects
  const { count: subjectCount } = await supabase
    .from('subjects')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', id)
    .eq('college_id', effectiveCollegeId);

  if (subjectCount && subjectCount > 0) {
    return {
      success: false,
      error: `Cannot delete branch "${branch.name}": ${subjectCount} subject(s) belong to this branch. Delete or reassign the subjects first, or deactivate the branch.`,
    };
  }

  // 4. Dependency check: faculties
  const { count: facultyCount } = await supabase
    .from('faculties')
    .select('id', { count: 'exact', head: true })
    .eq('college_id', effectiveCollegeId)
    .or(`department.eq."${branch.name}",department.eq."${branch.code}"`);

  if (facultyCount && facultyCount > 0) {
    return {
      success: false,
      error: `Cannot delete branch "${branch.name}": ${facultyCount} faculty member(s) belong to this department. Reassign them first, or deactivate the branch.`,
    };
  }

  // Safely delete branch
  const { error: deleteErr } = await supabase
    .from('branches')
    .delete()
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (deleteErr) {
    return { success: false, error: deleteErr.message };
  }

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_BRANCH',
    'branches',
    id,
    `Deleted branch ${branch.name} (${branch.code}) from institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

// -------------------------------------------------------------
// 4. SEMESTERS CRUD
// -------------------------------------------------------------

export async function createSemesterAction(data: {
  name: string;
  year_number: number;
  semester_number: number;
  is_active: boolean;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();
  const semNum = Number(data.semester_number);

  // Check unique constraint per college (uq_semesters_college_sem_no)
  const { data: existingSem } = await supabase
    .from('semesters')
    .select('id')
    .eq('college_id', authorizedCollegeId)
    .eq('semester_number', semNum)
    .maybeSingle();

  if (existingSem) {
    return { success: false, error: `Semester ${semNum} already exists for this institution.` };
  }

  const { data: newSem, error } = await supabase
    .from('semesters')
    .insert({
      college_id: authorizedCollegeId,
      name: data.name.trim(),
      year_number: Number(data.year_number),
      semester_number: semNum,
      is_active: data.is_active,
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_SEMESTER',
    'semesters',
    newSem.id,
    `Created semester ${newSem.name} in institution ${authorizedCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${authorizedCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, semester: newSem };
}

export async function updateSemesterAction(
  id: string,
  data: { name: string; year_number: number; semester_number: number; is_active: boolean; collegeId?: string }
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid semester ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetSem, error: fetchErr } = await supabase
    .from('semesters')
    .select('id, college_id, name, semester_number')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetSem) {
    return { success: false, error: 'Semester not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetSem.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot modify a semester belonging to another institution.' };
  }

  const effectiveCollegeId = session.isPlatformSuperAdmin ? targetSem.college_id : authorizedCollegeId;
  const semNum = Number(data.semester_number);

  // Check unique constraint per college on other semesters
  const { data: existingSem } = await supabase
    .from('semesters')
    .select('id')
    .eq('college_id', effectiveCollegeId)
    .eq('semester_number', semNum)
    .neq('id', id)
    .maybeSingle();

  if (existingSem) {
    return { success: false, error: `Semester ${semNum} already exists for this institution.` };
  }

  const { error } = await supabase
    .from('semesters')
    .update({
      name: data.name.trim(),
      year_number: Number(data.year_number),
      semester_number: semNum,
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_SEMESTER',
    'semesters',
    id,
    `Updated semester ${data.name} in institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

export async function bulkSetupSemestersAction(data: {
  totalSemesters: 6 | 8;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unable to determine the active institution. Please select an institution and try again.' };
  }

  const total = Number(data.totalSemesters);
  if (total !== 6 && total !== 8) {
    return { success: false, error: 'Standard curriculum structure only supports 6 or 8 semesters.' };
  }

  const supabase = await getAdminDb();

  // Fetch existing semesters for this college
  const { data: existingSemesters, error: fetchErr } = await supabase
    .from('semesters')
    .select('id, semester_number, name')
    .eq('college_id', authorizedCollegeId);

  if (fetchErr) {
    return { success: false, error: fetchErr.message };
  }

  const existingMap = new Map((existingSemesters || []).map((s) => [s.semester_number, s]));
  const toInsert: Array<{
    college_id: string;
    name: string;
    year_number: number;
    semester_number: number;
    is_active: boolean;
  }> = [];

  for (let s = 1; s <= total; s++) {
    if (!existingMap.has(s)) {
      toInsert.push({
        college_id: authorizedCollegeId,
        name: `Semester ${s}`,
        year_number: Math.ceil(s / 2),
        semester_number: s,
        is_active: true,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('semesters').insert(toInsert);
    if (insertErr) {
      return { success: false, error: insertErr.message };
    }
  }

  // Fetch complete sorted list for this college
  const { data: updatedList, error: listErr } = await supabase
    .from('semesters')
    .select('id, name, year_number, semester_number, is_active, created_at')
    .eq('college_id', authorizedCollegeId)
    .order('semester_number', { ascending: true });

  if (listErr) {
    return { success: false, error: listErr.message };
  }

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'BULK_SETUP_SEMESTERS',
    'semesters',
    authorizedCollegeId,
    `Configured ${total}-semester curriculum pattern in institution ${authorizedCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${authorizedCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');

  return { success: true, count: toInsert.length, semesters: updatedList || [] };
}

export async function deleteSemesterAction(id: string, targetCollegeId?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid semester ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, targetCollegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetSem, error: fetchErr } = await supabase
    .from('semesters')
    .select('id, college_id, name, semester_number')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetSem) {
    return { success: false, error: 'Semester not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetSem.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot delete a semester belonging to another institution.' };
  }

  const effectiveCollegeId = targetSem.college_id;

  // 1. Dependency check: feedback_forms
  const { count: formsCount } = await supabase
    .from('feedback_forms')
    .select('id', { count: 'exact', head: true })
    .eq('semester_id', id)
    .eq('college_id', effectiveCollegeId);

  if (formsCount && formsCount > 0) {
    return {
      success: false,
      error: `Cannot delete "${targetSem.name}": ${formsCount} feedback form(s) are linked to it. Deactivate the semester instead.`,
    };
  }

  // 2. Dependency check: faculty_subject_assignments
  const { count: assignCount } = await supabase
    .from('faculty_subject_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('semester_id', id)
    .eq('college_id', effectiveCollegeId);

  if (assignCount && assignCount > 0) {
    return {
      success: false,
      error: `Cannot delete "${targetSem.name}": ${assignCount} faculty-subject assignment(s) are linked to it.`,
    };
  }

  // 3. Dependency check: subjects
  const { count: subCount } = await supabase
    .from('subjects')
    .select('id', { count: 'exact', head: true })
    .eq('semester_id', id)
    .eq('college_id', effectiveCollegeId);

  if (subCount && subCount > 0) {
    return {
      success: false,
      error: `Cannot delete "${targetSem.name}": ${subCount} course subject(s) belong to this semester.`,
    };
  }

  const { error: delErr } = await supabase
    .from('semesters')
    .delete()
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (delErr) {
    return { success: false, error: delErr.message };
  }

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_SEMESTER',
    'semesters',
    id,
    `Deleted ${targetSem.name} from institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');

  return { success: true };
}

// -------------------------------------------------------------
// 5. FACULTIES CRUD
// -------------------------------------------------------------

export async function createFacultyAction(data: {
  name: string;
  employee_id?: string;
  department: string;
  designation: string;
  is_active: boolean;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();
  const empCode = data.employee_id?.trim() || `EMP-${Date.now().toString().slice(-4)}`;

  const payload: Record<string, any> = {
    college_id: authorizedCollegeId,
    name: data.name.trim(),
    department: data.department.trim(),
    designation: data.designation.trim(),
    is_active: data.is_active,
    employee_code: empCode,
  };

  if (data.employee_id?.trim()) {
    payload.employee_id = data.employee_id.trim();
  }

  // Check unique employee_id within college if provided
  if (data.employee_id?.trim()) {
    const { data: existingEmp } = await supabase
      .from('faculties')
      .select('id')
      .eq('college_id', authorizedCollegeId)
      .eq('employee_id', data.employee_id.trim())
      .maybeSingle();

    if (existingEmp) {
      return { success: false, error: `Employee ID "${data.employee_id}" already exists in this institution.` };
    }
  }

  let { data: newFaculty, error } = await supabase
    .from('faculties')
    .insert(payload)
    .select('*')
    .single();

  // If column employee_code does not exist in schema cache
  if (error && (error.message.includes('employee_code') && (error.code === 'PGRST204' || error.message.includes('schema cache')))) {
    delete payload.employee_code;
    const fallbackRes = await supabase
      .from('faculties')
      .insert(payload)
      .select('*')
      .single();
    newFaculty = fallbackRes.data;
    error = fallbackRes.error;
  }

  // If column employee_id is missing in database schema or schema cache
  if (error && (error.message.includes('employee_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.employee_id;
    const fallbackRes = await supabase
      .from('faculties')
      .insert(payload)
      .select('*')
      .single();
    newFaculty = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_FACULTY',
    'faculties',
    newFaculty.id,
    `Created faculty ${newFaculty.name} (${newFaculty.department || 'General'}) in institution ${authorizedCollegeId}`
  );

  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, faculty: newFaculty };
}

export async function updateFacultyAction(
  id: string,
  data: {
    name: string;
    employee_id?: string;
    department: string;
    designation: string;
    is_active: boolean;
    collegeId?: string;
  }
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid faculty ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetFaculty, error: fetchErr } = await supabase
    .from('faculties')
    .select('id, college_id, name')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetFaculty) {
    return { success: false, error: 'Faculty member not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetFaculty.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot modify a faculty member belonging to another institution.' };
  }

  const effectiveCollegeId = session.isPlatformSuperAdmin ? targetFaculty.college_id : authorizedCollegeId;

  const payload: Record<string, any> = {
    name: data.name.trim(),
    department: data.department.trim(),
    designation: data.designation.trim(),
    is_active: data.is_active,
    updated_at: new Date().toISOString(),
  };

  if (data.employee_id?.trim()) {
    payload.employee_id = data.employee_id.trim();
    payload.employee_code = data.employee_id.trim();
  }

  let { error } = await supabase
    .from('faculties')
    .update(payload)
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  // If column employee_code is missing in database schema or schema cache
  if (error && error.message.includes('employee_code')) {
    delete payload.employee_code;
    const fallbackRes = await supabase
      .from('faculties')
      .update(payload)
      .eq('id', id)
      .eq('college_id', effectiveCollegeId);
    error = fallbackRes.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_FACULTY',
    'faculties',
    id,
    `Updated faculty ${data.name} in institution ${effectiveCollegeId}`
  );

  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

export async function deleteFacultyAction(id: string, targetCollegeId?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid faculty ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, targetCollegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetFaculty, error: fetchErr } = await supabase
    .from('faculties')
    .select('id, college_id, name')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetFaculty) {
    return { success: false, error: 'Faculty member not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetFaculty.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot delete a faculty member belonging to another institution.' };
  }

  const effectiveCollegeId = targetFaculty.college_id;

  // Check dependencies
  const { count: assignCount } = await supabase
    .from('faculty_subject_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('faculty_id', id)
    .eq('college_id', effectiveCollegeId);

  if (assignCount && assignCount > 0) {
    return {
      success: false,
      error: `Cannot delete faculty member "${targetFaculty.name}": ${assignCount} course assignment(s) are linked to them.`,
    };
  }

  const { count: formsCount } = await supabase
    .from('feedback_forms')
    .select('id', { count: 'exact', head: true })
    .eq('faculty_id', id)
    .eq('college_id', effectiveCollegeId);

  if (formsCount && formsCount > 0) {
    return {
      success: false,
      error: `Cannot delete faculty member "${targetFaculty.name}": ${formsCount} feedback form(s) are linked to them.`,
    };
  }

  const { count: formItemsCount } = await supabase
    .from('feedback_form_items')
    .select('id', { count: 'exact', head: true })
    .eq('faculty_id', id);

  if (formItemsCount && formItemsCount > 0) {
    return {
      success: false,
      error: `Cannot delete faculty member "${targetFaculty.name}": ${formItemsCount} feedback form item(s) are linked to them.`,
    };
  }

  const { error } = await supabase
    .from('faculties')
    .delete()
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_FACULTY',
    'faculties',
    id,
    `Deleted faculty member ${targetFaculty.name} from institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');

  return { success: true };
}

// -------------------------------------------------------------
// 6. SUBJECTS CRUD
// -------------------------------------------------------------

export async function createSubjectAction(data: {
  name: string;
  code: string;
  semester_id?: string;
  branch_id?: string;
  is_active: boolean;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();
  const subCode = data.code.trim().toUpperCase();

  // Check code uniqueness within college (uq_subjects_college_code)
  const { data: existingSub } = await supabase
    .from('subjects')
    .select('id')
    .eq('college_id', authorizedCollegeId)
    .ilike('code', subCode)
    .maybeSingle();

  if (existingSub) {
    return { success: false, error: `Subject code "${subCode}" already exists in this institution.` };
  }

  let branchId: string | null = null;
  if (data.branch_id && data.branch_id.trim()) {
    const { data: validBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', data.branch_id.trim())
      .eq('college_id', authorizedCollegeId)
      .maybeSingle();

    if (!validBranch) {
      return { success: false, error: 'The selected branch does not exist or does not belong to your institution.' };
    }
    branchId = validBranch.id;
  }

  let semesterId: string | null = null;
  if (data.semester_id && data.semester_id.trim()) {
    const { data: validSem } = await supabase
      .from('semesters')
      .select('id')
      .eq('id', data.semester_id.trim())
      .eq('college_id', authorizedCollegeId)
      .maybeSingle();

    if (!validSem) {
      return { success: false, error: 'The selected semester does not exist or does not belong to your institution.' };
    }
    semesterId = validSem.id;
  }

  const payload: Record<string, any> = {
    college_id: authorizedCollegeId,
    name: data.name.trim(),
    code: subCode,
    semester_id: semesterId,
    branch_id: branchId,
    is_active: data.is_active,
  };

  const { data: newSubject, error } = await supabase
    .from('subjects')
    .insert(payload)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_SUBJECT',
    'subjects',
    newSubject.id,
    `Created subject ${newSubject.name} (${newSubject.code}) in institution ${authorizedCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${authorizedCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, subject: newSubject };
}

export async function updateSubjectAction(
  id: string,
  data: {
    name: string;
    code: string;
    semester_id?: string;
    branch_id?: string;
    is_active: boolean;
    collegeId?: string;
  }
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid subject ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetSub, error: fetchErr } = await supabase
    .from('subjects')
    .select('id, college_id, name, code')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetSub) {
    return { success: false, error: 'Subject not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetSub.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot modify a subject belonging to another institution.' };
  }

  const effectiveCollegeId = session.isPlatformSuperAdmin ? targetSub.college_id : authorizedCollegeId;
  const subCode = data.code.trim().toUpperCase();

  // Check code uniqueness within college on other subjects
  const { data: existingSub } = await supabase
    .from('subjects')
    .select('id')
    .eq('college_id', effectiveCollegeId)
    .ilike('code', subCode)
    .neq('id', id)
    .maybeSingle();

  if (existingSub) {
    return { success: false, error: `Subject code "${subCode}" already exists in this institution.` };
  }

  let branchId: string | null = null;
  if (data.branch_id && data.branch_id.trim()) {
    const { data: validBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', data.branch_id.trim())
      .eq('college_id', effectiveCollegeId)
      .maybeSingle();

    if (!validBranch) {
      return { success: false, error: 'The selected branch does not exist or does not belong to your institution.' };
    }
    branchId = validBranch.id;
  }

  let semesterId: string | null = null;
  if (data.semester_id && data.semester_id.trim()) {
    const { data: validSem } = await supabase
      .from('semesters')
      .select('id')
      .eq('id', data.semester_id.trim())
      .eq('college_id', effectiveCollegeId)
      .maybeSingle();

    if (!validSem) {
      return { success: false, error: 'The selected semester does not exist or does not belong to your institution.' };
    }
    semesterId = validSem.id;
  }

  const payload: Record<string, any> = {
    name: data.name.trim(),
    code: subCode,
    semester_id: semesterId,
    branch_id: branchId,
    is_active: data.is_active,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('subjects')
    .update(payload)
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_SUBJECT',
    'subjects',
    id,
    `Updated subject ${data.name} in institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

export async function deleteSubjectAction(id: string, targetCollegeId?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid subject ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, targetCollegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetSub, error: fetchErr } = await supabase
    .from('subjects')
    .select('id, college_id, name')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetSub) {
    return { success: false, error: 'Subject not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetSub.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot delete a subject belonging to another institution.' };
  }

  const effectiveCollegeId = targetSub.college_id;

  // 1. Dependency check: faculty_subject_assignments
  const { count: assignCount } = await supabase
    .from('faculty_subject_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', id)
    .eq('college_id', effectiveCollegeId);

  if (assignCount && assignCount > 0) {
    return {
      success: false,
      error: `Cannot delete subject "${targetSub.name}": ${assignCount} assignment(s) are linked to it.`,
    };
  }

  // 2. Dependency check: feedback_forms
  const { count: formsCount } = await supabase
    .from('feedback_forms')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', id)
    .eq('college_id', effectiveCollegeId);

  if (formsCount && formsCount > 0) {
    return {
      success: false,
      error: `Cannot delete subject "${targetSub.name}": ${formsCount} feedback form(s) are linked to it.`,
    };
  }

  // 3. Dependency check: feedback_form_items
  const { count: formItemsCount } = await supabase
    .from('feedback_form_items')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', id);

  if (formItemsCount && formItemsCount > 0) {
    return {
      success: false,
      error: `Cannot delete subject "${targetSub.name}": ${formItemsCount} feedback form item(s) are linked to it.`,
    };
  }

  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_SUBJECT',
    'subjects',
    id,
    `Deleted subject ${targetSub.name} from institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');

  return { success: true };
}

// -------------------------------------------------------------
// 7. FACULTY-SUBJECT ASSIGNMENTS CRUD
// -------------------------------------------------------------

export async function createAssignmentAction(data: {
  faculty_id: string;
  subject_id: string;
  academic_year_id: string;
  branch_id?: string;
  semester_id?: string;
  is_active: boolean;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  // Validate that faculty belongs to this authorized college
  const { data: validFac } = await supabase
    .from('faculties')
    .select('id')
    .eq('id', data.faculty_id)
    .eq('college_id', authorizedCollegeId)
    .maybeSingle();

  if (!validFac) {
    return { success: false, error: 'The selected faculty member does not exist or does not belong to your institution.' };
  }

  // Validate that course subject belongs to this authorized college
  const { data: validSub } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', data.subject_id)
    .eq('college_id', authorizedCollegeId)
    .maybeSingle();

  if (!validSub) {
    return { success: false, error: 'The selected course subject does not exist or does not belong to your institution.' };
  }

  // Validate that academic year belongs to this authorized college
  const { data: validYear } = await supabase
    .from('academic_years')
    .select('id')
    .eq('id', data.academic_year_id)
    .eq('college_id', authorizedCollegeId)
    .maybeSingle();

  if (!validYear) {
    return { success: false, error: 'The selected academic session does not exist or does not belong to your institution.' };
  }

  // Validate branch belongs to this authorized college if provided
  let branchId: string | null = null;
  if (data.branch_id && data.branch_id.trim()) {
    const { data: validBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', data.branch_id.trim())
      .eq('college_id', authorizedCollegeId)
      .maybeSingle();

    if (!validBranch) {
      return { success: false, error: 'The selected branch does not belong to your institution.' };
    }
    branchId = validBranch.id;
  }

  // Validate semester belongs to this authorized college if provided
  let semesterId: string | null = null;
  if (data.semester_id && data.semester_id.trim()) {
    const { data: validSem } = await supabase
      .from('semesters')
      .select('id')
      .eq('id', data.semester_id.trim())
      .eq('college_id', authorizedCollegeId)
      .maybeSingle();

    if (!validSem) {
      return { success: false, error: 'The selected semester does not belong to your institution.' };
    }
    semesterId = validSem.id;
  }

  // Check unique assignment within college (uq_faculty_assignments_f_s_y)
  const { data: existingAssign } = await supabase
    .from('faculty_subject_assignments')
    .select('id')
    .eq('college_id', authorizedCollegeId)
    .eq('faculty_id', data.faculty_id)
    .eq('subject_id', data.subject_id)
    .eq('academic_year_id', data.academic_year_id)
    .maybeSingle();

  if (existingAssign) {
    return { success: false, error: 'This faculty member is already assigned to this course subject for the selected academic session in this institution.' };
  }

  const payload: Record<string, any> = {
    college_id: authorizedCollegeId,
    faculty_id: data.faculty_id,
    subject_id: data.subject_id,
    academic_year_id: data.academic_year_id,
    branch_id: branchId,
    semester_id: semesterId,
    is_active: data.is_active,
  };

  const { data: newAssign, error } = await supabase
    .from('faculty_subject_assignments')
    .insert(payload)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'ASSIGN_FACULTY_SUBJECT',
    'faculty_subject_assignments',
    newAssign.id,
    `Assigned faculty to subject in institution ${authorizedCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${authorizedCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, assignment: newAssign };
}

export async function deleteAssignmentAction(id: string, targetCollegeId?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid assignment ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, targetCollegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetAssign, error: fetchErr } = await supabase
    .from('faculty_subject_assignments')
    .select('id, college_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetAssign) {
    return { success: false, error: 'Assignment not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetAssign.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot delete an assignment belonging to another institution.' };
  }

  const effectiveCollegeId = targetAssign.college_id;

  const { error } = await supabase
    .from('faculty_subject_assignments')
    .delete()
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_FACULTY_ASSIGNMENT',
    'faculty_subject_assignments',
    id,
    `Removed faculty-subject assignment from institution ${effectiveCollegeId}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidateTag(`academic_masters_${effectiveCollegeId}`);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

// -------------------------------------------------------------
// 8. FEEDBACK FORMS FOUNDATION (PHASE 1)
// -------------------------------------------------------------

export async function createFeedbackFormDraftAction(data: {
  title: string;
  academic_year_id: string;
  branch_id: string;
  semester_id: string;
  faculty_id: string;
  subject_id: string;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, data.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();
  const slug = `fb-${Date.now()}`;

  const insertPayload: Record<string, any> = {
    college_id: authorizedCollegeId,
    title: data.title.trim(),
    academic_year_id: data.academic_year_id,
    branch_id: data.branch_id,
    semester_id: data.semester_id,
    faculty_id: data.faculty_id,
    subject_id: data.subject_id,
    form_type: 'FACULTY_FEEDBACK',
    status: 'DRAFT',
    slug,
    created_by: session.admin?.id || null,
  };

  const { data: form, error: insertErr } = await supabase
    .from('feedback_forms')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertErr || !form) {
    return { success: false, error: insertErr?.message || 'Failed to create feedback form record in database.' };
  }

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_FEEDBACK_FORM_DRAFT',
    'feedback_forms',
    form.id,
    `Created feedback form draft: ${data.title} in institution ${authorizedCollegeId}`
  );

  revalidatePath('/admin/dashboard');
  return { success: true, form };
}

export async function toggleFeedbackFormStatusAction(formId: string, status: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase
    .from('feedback_forms')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', formId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_FORM_STATUS',
    'feedback_forms',
    formId,
    `Changed form status to ${status}`
  );

  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

export async function deleteFeedbackFormAction(formId: string) {
  return deleteFormInternal(formId);
}

// -------------------------------------------------------------
// 9. HIGH-PERFORMANCE PAGINATED QUERIES
// -------------------------------------------------------------

export async function getPaginatedFacultiesAction(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  department?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, params.collegeId);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unable to determine the active institution. Please select an institution and try again.',
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(5, Math.min(100, params.pageSize || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await getAdminDb();
  let query = supabase
    .from('faculties')
    .select('id, name, department, designation, employee_id, is_active, created_at', { count: 'exact' })
    .eq('college_id', authorizedCollegeId);

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    query = query.or(`name.ilike.%${q}%,department.ilike.%${q}%,employee_id.ilike.%${q}%`);
  }

  if (params.department && params.department !== 'ALL') {
    query = query.eq('department', params.department);
  }

  if (params.status === 'ACTIVE') {
    query = query.eq('is_active', true);
  } else if (params.status === 'INACTIVE') {
    query = query.eq('is_active', false);
  }

  query = query.order('name', { ascending: true }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    return { success: false, error: error.message, data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const total = count || 0;
  return {
    success: true,
    data: (data || []) as any[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getPaginatedSubjectsAction(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  semesterId?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, params.collegeId);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unable to determine the active institution. Please select an institution and try again.',
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(5, Math.min(100, params.pageSize || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await getAdminDb();
  let query = supabase
    .from('subjects')
    .select('id, name, code, branch_id, semester_id, is_active, created_at', { count: 'exact' })
    .eq('college_id', authorizedCollegeId);

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  if (params.branchId && params.branchId !== 'ALL') {
    query = query.eq('branch_id', params.branchId);
  }

  if (params.semesterId && params.semesterId !== 'ALL') {
    query = query.eq('semester_id', params.semesterId);
  }

  if (params.status === 'ACTIVE') {
    query = query.eq('is_active', true);
  } else if (params.status === 'INACTIVE') {
    query = query.eq('is_active', false);
  }

  query = query.order('code', { ascending: true }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    return { success: false, error: error.message, data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const total = count || 0;
  return {
    success: true,
    data: (data || []) as any[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getPaginatedAssignmentsAction(params: {
  page?: number;
  pageSize?: number;
  academicYearId?: string;
  branchId?: string;
  semesterId?: string;
  facultyId?: string;
  subjectId?: string;
  collegeId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, params.collegeId);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unable to determine the active institution. Please select an institution and try again.',
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(5, Math.min(100, params.pageSize || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await getAdminDb();
  let query = supabase
    .from('faculty_subject_assignments')
    .select(
      `
      id,
      faculty_id,
      subject_id,
      academic_year_id,
      branch_id,
      semester_id,
      is_active,
      created_at,
      faculty:faculties(id, name, department),
      subject:subjects(id, name, code),
      academic_year:academic_years(id, name),
      branch:branches(id, name, code),
      semester:semesters(id, name)
    `,
      { count: 'exact' }
    )
    .eq('college_id', authorizedCollegeId);

  if (params.academicYearId && params.academicYearId !== 'ALL') {
    query = query.eq('academic_year_id', params.academicYearId);
  }
  if (params.branchId && params.branchId !== 'ALL') {
    query = query.eq('branch_id', params.branchId);
  }
  if (params.semesterId && params.semesterId !== 'ALL') {
    query = query.eq('semester_id', params.semesterId);
  }
  if (params.facultyId && params.facultyId !== 'ALL') {
    query = query.eq('faculty_id', params.facultyId);
  }
  if (params.subjectId && params.subjectId !== 'ALL') {
    query = query.eq('subject_id', params.subjectId);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    return { success: false, error: error.message, data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const total = count || 0;
  return {
    success: true,
    data: (data || []) as any[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function deleteAcademicYearAction(id: string, targetCollegeId?: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid academic year ID.' };
  }

  let authorizedCollegeId: string;
  try {
    authorizedCollegeId = await resolveAuthorizedCollegeId(session, targetCollegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const supabase = await getAdminDb();

  const { data: targetYear, error: fetchErr } = await supabase
    .from('academic_years')
    .select('id, college_id, name')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !targetYear) {
    return { success: false, error: 'Academic session not found.' };
  }

  if (!session.isPlatformSuperAdmin && targetYear.college_id !== authorizedCollegeId) {
    return { success: false, error: 'Forbidden: You cannot delete an academic session belonging to another institution.' };
  }

  const effectiveCollegeId = targetYear.college_id;

  // Check dependencies
  const { count: formsCount } = await supabase
    .from('feedback_forms')
    .select('id', { count: 'exact', head: true })
    .eq('academic_year_id', id)
    .eq('college_id', effectiveCollegeId);

  if (formsCount && formsCount > 0) {
    return {
      success: false,
      error: `Cannot delete academic session "${targetYear.name}": ${formsCount} feedback form(s) are linked to it.`,
    };
  }

  const { count: assignCount } = await supabase
    .from('faculty_subject_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('academic_year_id', id)
    .eq('college_id', effectiveCollegeId);

  if (assignCount && assignCount > 0) {
    return {
      success: false,
      error: `Cannot delete academic session "${targetYear.name}": ${assignCount} faculty-subject assignment(s) are linked to it.`,
    };
  }

  const { error } = await supabase
    .from('academic_years')
    .delete()
    .eq('id', id)
    .eq('college_id', effectiveCollegeId);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_ACADEMIC_YEAR',
    'academic_years',
    id,
    `Deleted academic year ${targetYear.name} from institution ${effectiveCollegeId}`
  );

  try {
    revalidateTag(ACADEMIC_CACHE_TAG);
    revalidateTag(`academic_masters_${effectiveCollegeId}`);
  } catch {
    // Ignore in unsupported environments
  }
  revalidatePath('/admin/dashboard');
  revalidatePath('/');

  return { success: true };
}


