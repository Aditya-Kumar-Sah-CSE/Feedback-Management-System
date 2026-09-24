'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession, resolveAuthorizedCollegeId } from '@/lib/auth/admin-auth';
import { assertFormGenerationAccess, assertSheetIntegrationAccess } from '@/lib/billing/access-control';

async function getAdminDb() {
  return createAdminClient() || await createClient();
}
import { FeedbackForm, FeedbackFormStatus } from '@/types/database';
import {
  isCollegeGoogleConfigured,
  getGoogleConfigStatus,
  formatGoogleErrorMessage,
} from '@/lib/google/auth';
import { createGoogleFeedbackForm } from '@/lib/google/forms';
import { createFeedbackSpreadsheet } from '@/lib/google/sheets';
import { linkFormToSpreadsheet } from '@/lib/google/linking';
import { syncFormResponsesToSheet } from '@/lib/google/sync';
import { getFormConfirmationMessage } from '@/lib/google/template';
import {
  generateFeedbackFormTitle,
  generateFeedbackFormDescription,
  generateSemesterFormTitle,
  generateSemesterFormDescription,
  MultiFacultyGridItem,
} from '@/lib/google/template';
import { isValidUUID, createFormPayloadSchema, formStatusSchema, CreateFormPayload } from '@/lib/validation';

// Helper: Record audit logs
async function logAuditAction(
  supabase: any,
  actor: { adminId?: string | null; email?: string },
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('audit_logs').insert({
      actor_user_id: actor.adminId || null,
      actor_email: actor.email,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      metadata,
    });
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}

/**
 * Check Google configuration status for the active institution in the UI
 */
export async function getGoogleStatusAction() {
  const session = await getAdminSession();
  return getGoogleConfigStatus(session.activeCollegeId || undefined);
}

/**
 * Fetch feedback forms with optional filters
 */
/**
 * Fetch feedback forms with optional filters and pagination
 */
export async function getFeedbackFormsAction(filters?: {
  academicYearId?: string;
  branchId?: string;
  semesterId?: string;
  status?: FeedbackFormStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.', forms: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  const supabase = await getAdminDb();
  const page = filters?.page ? Math.max(1, filters.page) : 1;
  const pageSize = filters?.pageSize ? Math.max(5, Math.min(100, filters.pageSize)) : 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('feedback_forms')
    .select(`
      id,
      title,
      description,
      academic_year_id,
      branch_id,
      semester_id,
      faculty_id,
      subject_id,
      form_type,
      status,
      slug,
      google_form_url,
      google_sheet_url,
      response_destination_type,
      response_count,
      created_at,
      published_at,
      closed_at,
      faculty:faculties(id, name, department),
      subject:subjects(id, name, code),
      academic_year:academic_years(id, name),
      branch:branches(id, name, code),
      semester:semesters(id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (session.activeCollegeId) {
    query = query.eq('college_id', session.activeCollegeId);
  }

  if (filters?.academicYearId && filters.academicYearId !== 'ALL') {
    query = query.eq('academic_year_id', filters.academicYearId);
  }
  if (filters?.branchId && filters.branchId !== 'ALL') {
    query = query.eq('branch_id', filters.branchId);
  }
  if (filters?.semesterId && filters.semesterId !== 'ALL') {
    query = query.eq('semester_id', filters.semesterId);
  }
  if (filters?.status && (filters.status as string) !== 'ALL') {
    query = query.eq('status', filters.status);
  }
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim();
    query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  if (filters?.page) {
    query = query.range(from, to);
  }

  const { data, count, error } = await query;

  if (error) {
    return { success: false, error: error.message, forms: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const total = count || 0;
  const forms = (data || []) as unknown as FeedbackForm[];

  return {
    success: true,
    forms,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Fetch a single feedback form with its details and audit logs
 */
export async function getFeedbackFormByIdAction(formId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  const supabase = await getAdminDb();

  const { data: form, error } = await supabase
    .from('feedback_forms')
    .select(`
      *,
      faculty:faculties(*),
      subject:subjects(*),
      academic_year:academic_years(*),
      branch:branches(*),
      semester:semesters(*)
    `)
    .eq('id', formId)
    .single();

  if (error || !form) {
    return { success: false, error: error?.message || 'Form not found' };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin && form.college_id) {
    const isAuthorized = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!isAuthorized) {
      return { success: false, error: 'Forbidden: You do not have permissions to view forms from this institution.' };
    }
  }

  // Fetch form-specific audit logs
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_id', formId)
    .order('created_at', { ascending: false });

  return {
    success: true,
    form: form as FeedbackForm,
    auditLogs: logs || [],
  };
}
/**
 * 6-Step Admin Form Generation Flow
 * Prepares and provisions feedback form (delegating to staged actions).
 */
export async function createGoogleFeedbackFormAction(payload: CreateFormPayload) {
  const supabase = await getAdminDb();
  const prepRes = await validateAndPrepareFormDraftAction(payload, supabase);
  if (!prepRes.success || !prepRes.draftFormId) {
    return { success: false, error: prepRes.error || 'Validation failed.' };
  }

  const provRes = await provisionGoogleFormAndSheetAction({
    draftFormId: prepRes.draftFormId,
    title: prepRes.title || 'Feedback Form',
    description: prepRes.description || '',
    items: (prepRes as any).validatedItems,
    client: supabase,
  });

  return provRes;
}

/**
 * Step 1 of Staged Form Creation:
 * Fast Local Preparation (<150ms).
 * Validates assignment & idempotency, and stores Supabase DRAFT record.
 */
export async function validateAndPrepareFormDraftAction(payload: CreateFormPayload, customClient?: any) {
  const session = await getAdminSession(customClient);
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  // ─── BILLING ACCESS GATE ────────────────────────────────────────
  const accessResult = await assertFormGenerationAccess(session);
  if (!accessResult.allowed) {
    return { success: false, error: accessResult.reason };
  }
  // ────────────────────────────────────────────────────────────────

  const validation = createFormPayloadSchema.safeParse(payload);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    return { success: false, error: issue ? issue.message : 'Invalid form creation parameters.' };
  }

  const adminId = session.admin?.id || null;
  const adminEmail = session.admin?.email || session.user?.email || '';
  const supabase = customClient || (await getAdminDb());

  let targetCollegeId: string;
  try {
    targetCollegeId = await resolveAuthorizedCollegeId(session, payload.collegeId);
  } catch (err: any) {
    return { success: false, error: err.message || 'Unauthorized: Target institution resolution failed.' };
  }

  const isGoogleReady = await isCollegeGoogleConfigured(targetCollegeId);
  if (!isGoogleReady) {
    return {
      success: false,
      error: 'Google Workspace is not connected for this institution. Please connect Google Workspace in Settings before generating forms.',
      code: 'GOOGLE_CONNECTION_REQUIRED',
    };
  }

  // -------------------------------------------------------------
  // A. Multi-Faculty SEMESTER_FEEDBACK Flow
  // -------------------------------------------------------------
  if (payload.formType === 'SEMESTER_FEEDBACK') {
    const [
      { data: academicYear },
      { data: branch },
      { data: semester },
    ] = await Promise.all([
      supabase.from('academic_years').select('id, name, is_active').eq('id', payload.academicYearId).eq('college_id', targetCollegeId).single(),
      supabase.from('branches').select('id, name, code, is_active').eq('id', payload.branchId).eq('college_id', targetCollegeId).single(),
      supabase.from('semesters').select('id, name, is_active').eq('id', payload.semesterId).eq('college_id', targetCollegeId).single(),
    ]);

    if (!academicYear || !academicYear.is_active) {
      return { success: false, error: 'Selected Academic Year is invalid or inactive.' };
    }
    if (!branch || !branch.is_active) {
      return { success: false, error: 'Selected Branch is invalid or inactive.' };
    }
    if (!semester || !semester.is_active) {
      return { success: false, error: 'Selected Semester is invalid or inactive.' };
    }

    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'At least one subject and faculty must be selected for the semester feedback form.' };
    }

    // Idempotency: Duplicate semester form check
    const { data: existingForm } = await supabase
      .from('feedback_forms')
      .select('id, status, title')
      .eq('college_id', targetCollegeId)
      .eq('academic_year_id', payload.academicYearId)
      .eq('branch_id', payload.branchId)
      .eq('semester_id', payload.semesterId)
      .eq('form_type', 'SEMESTER_FEEDBACK')
      .in('status', ['DRAFT', 'PUBLISHED'])
      .maybeSingle();

    if (existingForm) {
      return {
        success: false,
        error: `A semester feedback form already exists for ${branch.name} — ${semester.name} in this session (${existingForm.title}, Status: ${existingForm.status}). Please edit, publish, or archive the existing form instead of creating a duplicate.`,
      };
    }

    // Server-side verification of all selected items against active assignments
    const validatedItems: MultiFacultyGridItem[] = [];

    const { data: allYearAssignments, error: assignErr } = await supabase
      .from('faculty_subject_assignments')
      .select(`
        id,
        academic_year_id,
        branch_id,
        semester_id,
        faculty_id,
        subject_id,
        is_active,
        faculty:faculties(id, name, is_active),
        subject:subjects(id, name, code, is_active)
      `)
      .eq('academic_year_id', payload.academicYearId)
      .eq('college_id', targetCollegeId)
      .eq('is_active', true);

    if (assignErr) {
      return { success: false, error: `Database error verifying assignments: ${assignErr.message}` };
    }

    for (const item of payload.items) {
      const match = (allYearAssignments as any[] || []).find((a: any) => {
        const matchFac = a.faculty_id === item.facultyId;
        const matchSub = a.subject_id === item.subjectId;
        const matchBranch = !a.branch_id || a.branch_id === payload.branchId;
        const matchSem = !a.semester_id || a.semester_id === payload.semesterId;
        return matchFac && matchSub && matchBranch && matchSem;
      });

      if (!match || !match.faculty || !match.subject) {
        return {
          success: false,
          error: `Invalid assignment: The selected faculty and subject combination (Faculty ID: ${item.facultyId}, Subject ID: ${item.subjectId}) does not have an active assignment in ${branch.name} — ${semester.name}.`,
        };
      }

      const facultyName = (match.faculty as any).name || 'Faculty';
      const subjectName = (match.subject as any).name || 'Subject';
      const subjectCode = (match.subject as any).code || '';

      validatedItems.push({
        facultyId: item.facultyId,
        subjectId: item.subjectId,
        assignmentId: match.id,
        facultyName,
        subjectName,
        subjectCode,
        gridTitle: `${subjectName}${subjectCode ? ` (${subjectCode})` : ''} — ${facultyName}`,
      });
    }

    const title = generateSemesterFormTitle({
      semesterName: semester.name,
      branchName: branch.name,
      academicYearName: academicYear.name,
    });
    const description = generateSemesterFormDescription({
      semesterName: semester.name,
      branchName: branch.name,
      academicYearName: academicYear.name,
      facultyCount: validatedItems.length,
      institutionName: session.activeCollege?.name,
    });

    const cleanSlug = `semester-feedback-${branch.code || branch.name}-${semester.name}-${academicYear.name}-${Date.now()}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const draftPayload = {
      college_id: targetCollegeId,
      title,
      description,
      academic_year_id: payload.academicYearId,
      branch_id: payload.branchId,
      semester_id: payload.semesterId,
      faculty_id: null,
      subject_id: null,
      form_type: 'SEMESTER_FEEDBACK',
      status: 'DRAFT',
      slug: cleanSlug,
      response_count: 0,
      created_by: adminId,
    };

    const { data: draftRecord, error: insertErr } = await supabase
      .from('feedback_forms')
      .insert(draftPayload)
      .select()
      .single();

    if (insertErr || !draftRecord) {
      return {
        success: false,
        error: `Failed to initialize draft feedback form record: ${insertErr?.message || 'Database error'}`,
      };
    }

    await logAuditAction(
      supabase,
      { adminId, email: adminEmail },
      'FORM_CREATE_STARTED',
      'feedback_forms',
      draftRecord.id,
      `Initiated semester form generation for ${title} (${validatedItems.length} faculty/subject evaluations)`
    );

    return {
      success: true,
      draftFormId: draftRecord.id,
      title,
      description,
      validatedItems,
      formType: 'SEMESTER_FEEDBACK',
    };
  }

  // -------------------------------------------------------------
  // B. Single-Faculty FACULTY_FEEDBACK Flow (Preserving Legacy)
  // -------------------------------------------------------------
  const [
    { data: academicYear },
    { data: branch },
    { data: semester },
    { data: faculty },
    { data: subject },
  ] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active').eq('id', payload.academicYearId).eq('college_id', targetCollegeId).single(),
    supabase.from('branches').select('id, name, code, is_active').eq('id', payload.branchId).eq('college_id', targetCollegeId).single(),
    supabase.from('semesters').select('id, name, is_active').eq('id', payload.semesterId).eq('college_id', targetCollegeId).single(),
    supabase.from('faculties').select('id, name, is_active').eq('id', payload.facultyId!).eq('college_id', targetCollegeId).single(),
    supabase.from('subjects').select('id, name, code, is_active').eq('id', payload.subjectId!).eq('college_id', targetCollegeId).single(),
  ]);

  if (!academicYear || !academicYear.is_active) {
    return { success: false, error: 'Selected Academic Year is invalid or inactive.' };
  }
  if (!branch || !branch.is_active) {
    return { success: false, error: 'Selected Branch is invalid or inactive.' };
  }
  if (!semester || !semester.is_active) {
    return { success: false, error: 'Selected Semester is invalid or inactive.' };
  }
  if (!faculty || !faculty.is_active) {
    return { success: false, error: 'Selected Faculty is invalid or inactive.' };
  }
  if (!subject || !subject.is_active) {
    return { success: false, error: 'Selected Subject is invalid or inactive.' };
  }

  // Validate Faculty-Subject assignment
  const { data: assignment } = await supabase
    .from('faculty_subject_assignments')
    .select('id')
    .eq('college_id', targetCollegeId)
    .eq('academic_year_id', payload.academicYearId)
    .eq('branch_id', payload.branchId)
    .eq('semester_id', payload.semesterId)
    .eq('faculty_id', payload.facultyId!)
    .eq('subject_id', payload.subjectId!)
    .eq('is_active', true)
    .maybeSingle();

  if (!assignment) {
    return {
      success: false,
      error: `Invalid assignment: ${faculty.name} is not assigned to teach ${subject.name} (${subject.code}) in ${branch.name} — ${semester.name} for ${academicYear.name}. Please assign them in Academic Management first.`,
    };
  }

  // Build validatedItems containing exactly one faculty/subject evaluation item
  const validatedItems: MultiFacultyGridItem[] = [
    {
      facultyId: faculty.id,
      subjectId: subject.id,
      assignmentId: assignment.id,
      facultyName: faculty.name,
      subjectName: subject.name,
      subjectCode: subject.code,
      gridTitle: `${subject.name}${subject.code ? ` (${subject.code})` : ''} — ${faculty.name}`,
    },
  ];

  // Idempotency check: Form already exists?
  const { data: existingForm } = await supabase
    .from('feedback_forms')
    .select('id, status, title')
    .eq('college_id', targetCollegeId)
    .eq('academic_year_id', payload.academicYearId)
    .eq('branch_id', payload.branchId)
    .eq('semester_id', payload.semesterId)
    .eq('faculty_id', payload.facultyId!)
    .eq('subject_id', payload.subjectId!)
    .in('status', ['DRAFT', 'PUBLISHED'])
    .maybeSingle();

  if (existingForm) {
    return {
      success: false,
      error: `A feedback form already exists for this faculty and subject in this session (${existingForm.title}, Status: ${existingForm.status}). Please edit or archive the existing form instead of creating a duplicate.`,
    };
  }

  const metaInputs = {
    facultyName: faculty.name,
    subjectName: `${subject.name} (${subject.code})`,
    semesterName: semester.name,
    academicYearName: academicYear.name,
    branchName: branch.name,
  };

  const title = generateFeedbackFormTitle(metaInputs);
  const description = generateFeedbackFormDescription({
    ...metaInputs,
    institutionName: session.activeCollege?.name,
  });

  const cleanSlug = `${faculty.name}-${subject.code}-${semester.name}-${academicYear.name}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const draftPayload = {
    college_id: targetCollegeId,
    title,
    description,
    academic_year_id: payload.academicYearId,
    branch_id: payload.branchId,
    semester_id: payload.semesterId,
    faculty_id: payload.facultyId,
    subject_id: payload.subjectId,
    form_type: payload.formType,
    status: 'DRAFT',
    slug: cleanSlug,
    response_count: 0,
    created_by: adminId,
  };

  const { data: draftRecord, error: insertErr } = await supabase
    .from('feedback_forms')
    .insert(draftPayload)
    .select()
    .single();

  if (insertErr || !draftRecord) {
    return {
      success: false,
      error: `Failed to initialize draft feedback form record: ${insertErr?.message || 'Database error'}`,
    };
  }

  await logAuditAction(
    supabase,
    { adminId, email: adminEmail },
    'FORM_CREATE_STARTED',
    'feedback_forms',
    draftRecord.id,
    `Initiated form generation for ${title}`
  );

  return {
    success: true,
    draftFormId: draftRecord.id,
    title,
    description,
    validatedItems,
    meta: metaInputs,
    formType: payload.formType,
  };
}

/**
 * Step 2 of Staged Form Creation:
 * Remote Google API Work.
 * Concurrently creates Google Form + Google Sheet, links destination, and finalizes Supabase record.
 */
export async function provisionGoogleFormAndSheetAction(params: {
  draftFormId: string;
  title: string;
  description: string;
  items?: MultiFacultyGridItem[];
  client?: any;
}) {
  const session = await getAdminSession(params.client);
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  const adminId = session.admin?.id || null;
  const adminEmail = session.admin?.email || session.user?.email || '';
  const supabase = params.client || (await getAdminDb());

  // Authoritatively lookup draft form to extract institution
  const { data: draftRecord, error: draftFetchErr } = await supabase
    .from('feedback_forms')
    .select('id, college_id, college:colleges(id, slug)')
    .eq('id', params.draftFormId)
    .maybeSingle();

  if (draftFetchErr || !draftRecord) {
    console.error('provisionGoogleFormAndSheetAction draft form lookup error:', draftFetchErr);
    return { success: false, error: `Draft form record not found: ${draftFetchErr?.message || 'Record missing'}` };
  }

  const targetCollegeId = draftRecord.college_id;
  if (!targetCollegeId) {
    return { success: false, error: 'Draft form has no associated institution.' };
  }

  const collegeObj = (draftRecord as any).college;
  const targetCollegeSlug =
    collegeObj?.slug ||
    session.colleges?.find((c) => c.collegeId === targetCollegeId)?.slug ||
    '';

  if (!session.isPlatformSuperAdmin) {
    const isMember = session.colleges?.some(
      (c) => c.collegeId === targetCollegeId && c.status === 'ACTIVE'
    );
    if (!isMember) {
      return { success: false, error: 'Forbidden: You do not have permission to provision forms for this institution.' };
    }
  }

  const isReady = await isCollegeGoogleConfigured(targetCollegeId);
  if (!isReady) {
    return {
      success: false,
      error: 'Google Workspace is not connected for this institution. Please connect an institutional Google account in Settings.',
      code: 'GOOGLE_CONNECTION_REQUIRED',
    };
  }

  let googleFormResult;
  let googleSheetResult;

  try {
    // Concurrent creation of Google Form (+ Multiple Choice Grids if items provided) and Google Sheet
    const [formResult, sheetResult] = await Promise.all([
      createGoogleFeedbackForm({
        collegeId: targetCollegeId,
        title: params.title,
        description: params.description,
        items: params.items,
        tenantSlug: targetCollegeSlug,
      }),
      createFeedbackSpreadsheet({
        collegeId: targetCollegeId,
        title: params.title,
        items: params.items,
      }),
    ]);
    googleFormResult = formResult;
    googleSheetResult = sheetResult;

    // Link Form to Sheet
    const confirmationMessage = getFormConfirmationMessage(targetCollegeSlug);
    const linkingResult = await linkFormToSpreadsheet(
      googleFormResult.formId,
      googleSheetResult.spreadsheetId,
      confirmationMessage,
      targetCollegeId
    );

    // If multi-faculty items exist, save to feedback_form_items junction table
    if (params.items && params.items.length > 0) {
      const itemsToInsert = params.items.map((it, idx) => ({
        form_id: params.draftFormId,
        faculty_id: it.facultyId!,
        subject_id: it.subjectId!,
        assignment_id: it.assignmentId || null,
        grid_title: it.gridTitle || `${it.subjectName} — ${it.facultyName}`,
        order_index: idx,
      }));

      const { error: itemsErr } = await supabase
        .from('feedback_form_items')
        .insert(itemsToInsert);

      if (itemsErr) {
        console.warn('Failed to insert feedback_form_items:', itemsErr);
      }
    }

    // Update Supabase draft record with finalized Google details
    const { data: updatedForm, error: updateErr } = await supabase
      .from('feedback_forms')
      .update({
        google_form_id: googleFormResult.formId,
        google_form_url: googleFormResult.responderUri,
        google_form_edit_url: googleFormResult.editUri,
        google_sheet_id: googleSheetResult.spreadsheetId,
        google_sheet_url: googleSheetResult.spreadsheetUrl,
        response_destination_type: linkingResult.destinationType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.draftFormId)
      .select(`
        id,
        title,
        description,
        academic_year_id,
        branch_id,
        semester_id,
        faculty_id,
        subject_id,
        form_type,
        status,
        slug,
        google_form_id,
        google_form_url,
        google_form_edit_url,
        google_sheet_id,
        google_sheet_url,
        response_destination_type,
        response_count,
        created_at
      `)
      .single();

    if (updateErr) {
      console.warn('Failed to update draft record with Google details:', updateErr);
    }

    await Promise.all([
      logAuditAction(
        supabase,
        { adminId, email: adminEmail },
        'FORM_CREATED',
        'feedback_forms',
        googleFormResult.formId,
        `Created Google Form (${googleFormResult.formId}) with ${params.items?.length ? `${params.items.length} faculty evaluation grids` : '8 standard BCE evaluation parameters'}`
      ),
      logAuditAction(
        supabase,
        { adminId, email: adminEmail },
        'SHEET_CREATED',
        'feedback_forms',
        googleSheetResult.spreadsheetId,
        `Created Google Sheet (${googleSheetResult.spreadsheetId}) with styled headers`
      ),
      logAuditAction(
        supabase,
        { adminId, email: adminEmail },
        'FORM_SHEET_LINKED',
        'feedback_forms',
        googleFormResult.formId,
        `Form-to-Sheet response connection mode: ${linkingResult.destinationType}. ${linkingResult.message}`,
        {
          formId: googleFormResult.formId,
          sheetId: googleSheetResult.spreadsheetId,
          destinationType: linkingResult.destinationType,
        }
      ),
    ]);

    try {
      revalidatePath('/admin/dashboard');
      revalidatePath('/admin/dashboard/forms');
      revalidatePath('/feedback');
      revalidatePath('/');
    } catch {
      // Safe fallback when called outside a static generation / request context
    }

    return {
      success: true,
      form: updatedForm || {
        id: params.draftFormId,
        title: params.title,
        google_form_url: googleFormResult.responderUri,
        google_form_edit_url: googleFormResult.editUri,
        google_sheet_url: googleSheetResult.spreadsheetUrl,
        response_destination_type: linkingResult.destinationType,
      },
      destinationType: linkingResult.destinationType,
      message: `Google Form successfully created in DRAFT state. Response destination: ${
        linkingResult.destinationType === 'NATIVE_SHEET'
          ? 'Native Google Form Destination (Google Apps Script)'
          : 'Application-Managed Synchronization (Forms Responses API + Sheets API)'
      }.`,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Remote Google API provisioning failed:', err);

    // Clean up draft record on total failure so no orphan broken record remains
    try {
      await supabase.from('feedback_forms').delete().eq('id', params.draftFormId);
    } catch {
      // Ignore cleanup error
    }

    await logAuditAction(
      supabase,
      { adminId, email: adminEmail },
      'FORM_CREATE_FAILED',
      'feedback_forms',
      googleFormResult?.formId || params.draftFormId,
      `Form creation aborted: ${errMsg}`,
      { error: errMsg }
    );

    const formatted = formatGoogleErrorMessage(err, '/admin/dashboard/forms/create');

    return {
      success: false,
      error: formatted.message,
      requiresReconnect: formatted.requiresReconnect,
      reconnectUrl: formatted.reconnectUrl,
    };
  }
}


/**
 * Manage Form Status Lifecycle:
 * DRAFT → PUBLISHED → CLOSED → ARCHIVED
 */
export async function updateFormStatusAction(
  formId: string,
  newStatus: FeedbackFormStatus
) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  if (!formStatusSchema.safeParse(newStatus).success) {
    return { success: false, error: 'Invalid feedback form status value.' };
  }

  const adminId = session.admin?.id || session.user?.id || null;
  const adminEmail = session.admin?.email || session.user?.email || '';

  const supabase = await getAdminDb();

  // Fetch current form
  const { data: form, error: fetchErr } = await supabase
    .from('feedback_forms')
    .select('id, title, status, college_id')
    .eq('id', formId)
    .single();

  if (fetchErr || !form) {
    return { success: false, error: 'Form not found' };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin && form.college_id) {
    const isAuthorized = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!isAuthorized) {
      return { success: false, error: 'Forbidden: You do not have permissions to modify forms for this institution.' };
    }
  }

  const currentStatus = form.status as FeedbackFormStatus;

  // Validate allowed transitions
  const allowedTransitions: Record<FeedbackFormStatus, FeedbackFormStatus[]> = {
    DRAFT: ['PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['CLOSED', 'ARCHIVED'],
    CLOSED: ['PUBLISHED', 'ARCHIVED'], // Can reopen or archive
    ARCHIVED: ['DRAFT'], // Un-archive to draft
  };

  if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
    return {
      success: false,
      error: `Invalid status transition: Cannot change form from ${currentStatus} to ${newStatus}.`,
    };
  }

  const updateData: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  const nowIso = new Date().toISOString();
  if (newStatus === 'PUBLISHED') updateData.published_at = nowIso;
  if (newStatus === 'CLOSED') updateData.closed_at = nowIso;
  if (newStatus === 'ARCHIVED') updateData.archived_at = nowIso;

  const { error: updateErr } = await supabase
    .from('feedback_forms')
    .update(updateData)
    .eq('id', formId);

  if (updateErr) {
    // Retry without new timestamp columns if database schema hasn't run migration
    const { error: fallbackErr } = await supabase
      .from('feedback_forms')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('id', formId);

    if (fallbackErr) {
      return { success: false, error: fallbackErr.message };
    }
  }

  // Audit log
  const auditActionMap: Record<FeedbackFormStatus, string> = {
    DRAFT: 'FORM_UPDATED',
    PUBLISHED: 'FORM_PUBLISHED',
    CLOSED: 'FORM_CLOSED',
    ARCHIVED: 'FORM_ARCHIVED',
  };

  await logAuditAction(
    supabase,
    { adminId, email: adminEmail },
    auditActionMap[newStatus],
    'feedback_forms',
    formId,
    `Form "${form.title}" status changed from ${currentStatus} to ${newStatus}`
  );

  revalidatePath('/admin/dashboard/forms');
  revalidatePath(`/admin/dashboard/forms/${formId}`);
  revalidatePath('/');

  return {
    success: true,
    message: `Form status updated to ${newStatus}.`,
  };
}

/**
 * Trigger Response Synchronization (Application-Managed)
 */
export async function syncFormResponsesAction(formId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  // ─── BILLING ACCESS GATE: Sheet integration & sync management ───
  const accessResult = await assertSheetIntegrationAccess(session);
  if (!accessResult.allowed) {
    return {
      success: false,
      error: accessResult.reason || 'Google Sheet integration is required to manage response synchronization.',
    };
  }
  // ────────────────────────────────────────────────────────────────

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  const adminId = session.admin?.id || session.user?.id || null;
  const adminEmail = session.admin?.email || session.user?.email || '';

  const supabase = await getAdminDb();

  const { data: form, error: fetchErr } = await supabase
    .from('feedback_forms')
    .select('*')
    .eq('id', formId)
    .single();

  if (fetchErr || !form) {
    return { success: false, error: `Form not found: ${fetchErr?.message || ''}` };
  }

  const targetCollegeId = form.college_id;
  if (!session.isPlatformSuperAdmin) {
    const isMember = session.colleges?.some(
      (c) => c.collegeId === targetCollegeId && c.status === 'ACTIVE'
    );
    if (!isMember) {
      return { success: false, error: 'Forbidden: You do not have permission to sync responses for this form.' };
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
    return {
      success: false,
      error: 'Form is missing Google Form ID or Google Sheet ID.',
    };
  }

  const syncResult = await syncFormResponsesToSheet({
    googleFormId: resolvedFormId,
    googleSheetId: resolvedSheetId,
    formId,
    callerSession: session,
  });

  if (!syncResult.success) {
    return { success: false, error: syncResult.message };
  }

  // Update Supabase sync metadata
  const nowIso = new Date().toISOString();
  try {
    await supabase
      .from('feedback_forms')
      .update({
        response_count: syncResult.totalResponses,
        last_synced_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', formId);
  } catch (err) {
    console.warn('Sync metadata update skipped (column may not exist yet):', err);
  }

  // Audit log
  await logAuditAction(
    supabase,
    { adminId, email: adminEmail },
    'FORM_RESPONSES_SYNCED',
    'feedback_forms',
    formId,
    `Synchronized responses for "${form.title}": ${syncResult.syncedCount} new row(s), total ${syncResult.totalResponses}`,
    {
      syncedCount: syncResult.syncedCount,
      totalResponses: syncResult.totalResponses,
    }
  );


  revalidatePath('/admin/dashboard/forms');
  revalidatePath(`/admin/dashboard/forms/${formId}`);

  return {
    success: true,
    message: syncResult.message,
    syncedCount: syncResult.syncedCount,
    totalResponses: syncResult.totalResponses,
  };
}

/**
 * Delete a feedback form permanently from the database.
 * Linked Google Drive resources remain safe in Drive.
 */
export async function deleteFeedbackFormAction(formId: string) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  const supabase = await getAdminDb();
  const adminId = session.admin?.id || session.user?.id || null;
  const adminEmail = session.admin?.email || session.user?.email || '';

  // 1. Fetch form info for audit log
  const { data: form, error: fetchErr } = await supabase
    .from('feedback_forms')
    .select('id, title, google_form_id, google_sheet_id, status, college_id')
    .eq('id', formId)
    .maybeSingle();

  if (fetchErr) {
    return { success: false, error: fetchErr.message || 'Failed to retrieve form details before deletion.' };
  }

  if (!form) {
    return { success: false, error: 'Feedback form not found or already deleted.' };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin && form.college_id) {
    const isAuthorized = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!isAuthorized) {
      return { success: false, error: 'Forbidden: You do not have permissions to delete forms from this institution.' };
    }
  }

  // 2. Delete the feedback form
  const { error: deleteErr } = await supabase
    .from('feedback_forms')
    .delete()
    .eq('id', formId);

  if (deleteErr) {
    return { success: false, error: deleteErr.message || 'Failed to delete feedback form.' };
  }

  // 3. Write audit log
  await logAuditAction(
    supabase,
    { adminId, email: adminEmail },
    'DELETE_FEEDBACK_FORM',
    'feedback_forms',
    formId,
    `Deleted feedback form "${form.title}" (Status: ${form.status})`,
    {
      deletedFormId: formId,
      deletedFormTitle: form.title,
      status: form.status,
      googleFormId: form.google_form_id,
      googleSheetId: form.google_sheet_id,
    }
  );

  // 4. Revalidate cache
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/dashboard/forms');
  revalidatePath('/feedback');
  revalidatePath('/');

  return {
    success: true,
    message: `Form "${form.title}" deleted successfully.`,
  };
}

