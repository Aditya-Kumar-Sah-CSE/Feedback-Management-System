'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession } from '@/lib/auth/admin-auth';
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
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only an authorized administrator can approve requests.' };
  }

  const supabase = await getAdminDb();

  // First check if this is a multi-tenant college_admin_requests record
  const { data: collegeReq } = await supabase
    .from('college_admin_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (collegeReq) {
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
  if (!session.isAuthenticated || !session.isSuperAdmin) {
    return { success: false, error: 'Only an authorized administrator can reject requests.' };
  }

  const supabase = await getAdminDb();

  // First check college_admin_requests
  const { data: collegeReq } = await supabase
    .from('college_admin_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (collegeReq) {
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
// 2. ACADEMIC YEARS CRUD
// -------------------------------------------------------------

export async function createAcademicYearAction(data: { name: string; is_active: boolean }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { data: newYear, error } = await supabase
    .from('academic_years')
    .insert({
      name: data.name.trim(),
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
    `Created academic year ${newYear.name}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, year: newYear };
}

export async function updateAcademicYearAction(id: string, data: { name: string; is_active: boolean }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase
    .from('academic_years')
    .update({
      name: data.name.trim(),
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_ACADEMIC_YEAR',
    'academic_years',
    id,
    `Updated academic year ${data.name}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

// -------------------------------------------------------------
// 3. BRANCHES CRUD
// -------------------------------------------------------------

export async function createBranchAction(data: { name: string; code: string; is_active: boolean }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const validation = branchSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid branch details.' };
  }

  const { name, code, is_active } = validation.data;
  const supabase = await getAdminDb();

  // Prevent duplicate branch code (case-insensitive check)
  const { data: existingCode } = await supabase
    .from('branches')
    .select('id, code')
    .ilike('code', code)
    .maybeSingle();

  if (existingCode) {
    return { success: false, error: `Branch code "${code}" is already in use.` };
  }

  const { data: newBranch, error } = await supabase
    .from('branches')
    .insert({
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
    `Created branch ${newBranch.name} (${newBranch.code})`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, branch: newBranch };
}

export async function updateBranchAction(id: string, data: { name: string; code: string; is_active: boolean }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid branch ID.' };
  }

  const validation = branchSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Invalid branch details.' };
  }

  const { name, code, is_active } = validation.data;
  const supabase = await getAdminDb();

  // Prevent duplicate branch code on other branches
  const { data: existingCode } = await supabase
    .from('branches')
    .select('id, code')
    .ilike('code', code)
    .neq('id', id)
    .maybeSingle();

  if (existingCode) {
    return { success: false, error: `Branch code "${code}" is already assigned to another branch.` };
  }

  const { error } = await supabase
    .from('branches')
    .update({
      name,
      code,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_BRANCH',
    'branches',
    id,
    `Updated branch ${name} (${code})`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

export async function deleteBranchAction(id: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid branch ID.' };
  }

  const supabase = await getAdminDb();

  // Fetch branch details
  const { data: branch, error: branchErr } = await supabase
    .from('branches')
    .select('id, name, code')
    .eq('id', id)
    .maybeSingle();

  if (branchErr || !branch) {
    return { success: false, error: 'Branch not found.' };
  }

  // 1. Dependency check: feedback_forms
  const { count: formsCount } = await supabase
    .from('feedback_forms')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', id);

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
    .eq('branch_id', id);

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
    .eq('branch_id', id);

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
    .eq('id', id);

  if (deleteErr) {
    return { success: false, error: deleteErr.message };
  }

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_BRANCH',
    'branches',
    id,
    `Deleted branch ${branch.name} (${branch.code})`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true };
}

// -------------------------------------------------------------
// 4. SEMESTERS CRUD
// -------------------------------------------------------------

export async function createSemesterAction(data: { name: string; year_number: number; semester_number: number; is_active: boolean }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { data: newSem, error } = await supabase
    .from('semesters')
    .insert({
      name: data.name.trim(),
      year_number: Number(data.year_number),
      semester_number: Number(data.semester_number),
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
    `Created semester ${newSem.name}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, semester: newSem };
}

export async function updateSemesterAction(id: string, data: { name: string; year_number: number; semester_number: number; is_active: boolean }) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase
    .from('semesters')
    .update({
      name: data.name.trim(),
      year_number: Number(data.year_number),
      semester_number: Number(data.semester_number),
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_SEMESTER',
    'semesters',
    id,
    `Updated semester ${data.name}`
  );

  revalidateTag(ACADEMIC_CACHE_TAG);
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
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();

  const empCode = data.employee_id?.trim() || `EMP-${Date.now().toString().slice(-4)}`;

  const payload: Record<string, any> = {
    name: data.name.trim(),
    department: data.department.trim(),
    designation: data.designation.trim(),
    is_active: data.is_active,
    employee_code: empCode,
  };

  if (data.employee_id?.trim()) {
    payload.employee_id = data.employee_id.trim();
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

  // If employee_code not-null constraint was violated
  if (error && error.message.includes('employee_code') && error.message.includes('not-null')) {
    payload.employee_code = empCode;
    const fallbackRes = await supabase
      .from('faculties')
      .insert(payload)
      .select('*')
      .single();
    newFaculty = fallbackRes.data;
    error = fallbackRes.error;
  }

  // If department or designation are also missing in bare schema
  if (error && (error.message.includes('column') || error.message.includes('schema cache') || error.code === 'PGRST204' || error.code === '42703')) {
    const minimalRes = await supabase
      .from('faculties')
      .insert({
        name: data.name.trim(),
        employee_code: empCode,
        is_active: data.is_active,
      })
      .select('*')
      .single();
    newFaculty = minimalRes.data;
    error = minimalRes.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_FACULTY',
    'faculties',
    newFaculty.id,
    `Created faculty ${newFaculty.name} (${newFaculty.department || 'General'})`
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
  }
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();

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
    .eq('id', id);

  // If column employee_code is missing in database schema or schema cache
  if (error && error.message.includes('employee_code')) {
    delete payload.employee_code;
    const fallbackRes = await supabase
      .from('faculties')
      .update(payload)
      .eq('id', id);
    error = fallbackRes.error;
  }

  // If column employee_id is missing in database schema or schema cache
  if (error && (error.message.includes('employee_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.employee_id;
    const fallbackRes = await supabase
      .from('faculties')
      .update(payload)
      .eq('id', id);
    error = fallbackRes.error;
  }

  if (error && (error.message.includes('column') || error.message.includes('schema cache') || error.code === 'PGRST204' || error.code === '42703')) {
    const minimalRes = await supabase
      .from('faculties')
      .update({
        name: data.name.trim(),
        is_active: data.is_active,
      })
      .eq('id', id);
    error = minimalRes.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_FACULTY',
    'faculties',
    id,
    `Updated faculty ${data.name}`
  );

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
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const payload: Record<string, any> = {
    name: data.name.trim(),
    code: data.code.trim().toUpperCase(),
    semester_id: data.semester_id || null,
    branch_id: data.branch_id || null,
    is_active: data.is_active,
  };

  let { data: newSubject, error } = await supabase
    .from('subjects')
    .insert(payload)
    .select('*')
    .single();

  if (error && (error.message.includes('branch_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.branch_id;
    const res = await supabase.from('subjects').insert(payload).select('*').single();
    newSubject = res.data;
    error = res.error;
  }

  if (error && (error.message.includes('semester_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.semester_id;
    const res = await supabase.from('subjects').insert(payload).select('*').single();
    newSubject = res.data;
    error = res.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_SUBJECT',
    'subjects',
    newSubject.id,
    `Created subject ${newSubject.name} (${newSubject.code})`
  );

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
  }
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const payload: Record<string, any> = {
    name: data.name.trim(),
    code: data.code.trim().toUpperCase(),
    semester_id: data.semester_id || null,
    branch_id: data.branch_id || null,
    is_active: data.is_active,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from('subjects')
    .update(payload)
    .eq('id', id);

  if (error && (error.message.includes('branch_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.branch_id;
    const res = await supabase.from('subjects').update(payload).eq('id', id);
    error = res.error;
  }

  if (error && (error.message.includes('semester_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.semester_id;
    const res = await supabase.from('subjects').update(payload).eq('id', id);
    error = res.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'UPDATE_SUBJECT',
    'subjects',
    id,
    `Updated subject ${data.name}`
  );

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
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const payload: Record<string, any> = {
    faculty_id: data.faculty_id,
    subject_id: data.subject_id,
    academic_year_id: data.academic_year_id,
    branch_id: data.branch_id || null,
    semester_id: data.semester_id || null,
    is_active: data.is_active,
  };

  let { data: newAssign, error } = await supabase
    .from('faculty_subject_assignments')
    .insert(payload)
    .select('*')
    .single();

  if (error && (error.message.includes('branch_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.branch_id;
    const retryRes = await supabase
      .from('faculty_subject_assignments')
      .insert(payload)
      .select('*')
      .single();
    newAssign = retryRes.data;
    error = retryRes.error;
  }

  if (error && (error.message.includes('semester_id') || error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.semester_id;
    const retryRes = await supabase
      .from('faculty_subject_assignments')
      .insert(payload)
      .select('*')
      .single();
    newAssign = retryRes.data;
    error = retryRes.error;
  }

  if (error && (error.message.includes('column') || error.code === 'PGRST204' || error.code === '42703')) {
    const minimalRes = await supabase
      .from('faculty_subject_assignments')
      .insert({
        faculty_id: data.faculty_id,
        subject_id: data.subject_id,
        academic_year_id: data.academic_year_id,
        is_active: data.is_active,
      })
      .select('*')
      .single();
    newAssign = minimalRes.data;
    error = minimalRes.error;
  }

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'ASSIGN_FACULTY_SUBJECT',
    'faculty_subject_assignments',
    newAssign.id,
    `Assigned faculty to subject in session`
  );

  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  return { success: true, assignment: newAssign };
}

export async function deleteAssignmentAction(id: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase
    .from('faculty_subject_assignments')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_FACULTY_ASSIGNMENT',
    'faculty_subject_assignments',
    id,
    `Removed faculty-subject assignment`
  );

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
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const slug = `bce-fb-${Date.now()}`;

  const insertPayload: Record<string, any> = {
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

  let form: any = null;
  const currentPayload = { ...insertPayload };

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: inserted, error: insertErr } = await supabase
      .from('feedback_forms')
      .insert(currentPayload)
      .select('*')
      .single();

    if (!insertErr && inserted) {
      form = inserted;
      break;
    }

    if (insertErr) {
      const missingColMatch = insertErr.message.match(/Could not find the '([^']+)' column/i);
      const undefColMatch = insertErr.message.match(/column "([^"]+)"/i);
      const colToRemove = missingColMatch?.[1] || undefColMatch?.[1];

      if (colToRemove && colToRemove in currentPayload) {
        delete currentPayload[colToRemove];
        continue;
      }

      return { success: false, error: insertErr.message };
    }
  }

  if (!form) {
    return { success: false, error: 'Failed to create feedback form record in database.' };
  }

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'CREATE_FEEDBACK_FORM_DRAFT',
    'feedback_forms',
    form.id,
    `Created feedback form draft: ${data.title}`
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
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(5, Math.min(100, params.pageSize || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await getAdminDb();
  let query = supabase
    .from('faculties')
    .select('id, name, department, designation, employee_id, is_active, created_at', { count: 'exact' });

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

export async function deleteFacultyAction(id: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase.from('faculties').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_FACULTY',
    'faculties',
    id,
    'Deleted faculty member'
  );

  return { success: true };
}

export async function getPaginatedSubjectsAction(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  semesterId?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(5, Math.min(100, params.pageSize || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await getAdminDb();
  let query = supabase
    .from('subjects')
    .select('id, name, code, branch_id, semester_id, is_active, created_at', { count: 'exact' });

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

export async function deleteSubjectAction(id: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_SUBJECT',
    'subjects',
    id,
    'Deleted subject'
  );

  return { success: true };
}

export async function getPaginatedAssignmentsAction(params: {
  page?: number;
  pageSize?: number;
  academicYearId?: string;
  branchId?: string;
  semesterId?: string;
  facultyId?: string;
  subjectId?: string;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.', data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
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
    );

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


export async function deleteAcademicYearAction(id: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supabase = await getAdminDb();
  const { error } = await supabase.from('academic_years').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  await logAuditAction(
    supabase,
    { adminId: session.admin?.id, email: session.user?.email },
    'DELETE_ACADEMIC_YEAR',
    'academic_years',
    id,
    'Deleted academic year'
  );

  try {
    revalidateTag(ACADEMIC_CACHE_TAG);
  } catch {
    // Ignore in unsupported environments
  }

  return { success: true };
}

