'use server';

import { getAdminSession } from '@/lib/auth/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchSingleResponseFromSheet } from '@/lib/google/sheets';
import { syncFormResponsesToSheet } from '@/lib/google/sync';
import { isGoogleConfigured } from '@/lib/google/auth';
import { BCE_FEEDBACK_PARAMETERS } from '@/lib/google/template';
import { isValidUUID } from '@/lib/validation';
import { assertBasicAnalyticsAccess } from '@/lib/billing/access-control';

export interface AdminResponseItem {
  id: string;
  formId: string;
  googleResponseId: string;
  studentEmail: string;
  studentName: string | null;
  registrationNumber: string | null;
  submittedAt: string | null;
  syncedAt: string;
  emailStatus: string;
}

export interface AdminResponsesResult {
  success: boolean;
  responses: AdminResponseItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  formTitle: string;
  formType: string;
  error?: string;
  code?: string;
}

export interface ResponseDetailItem {
  facultyName: string;
  subjectName: string;
  ratings: Array<{
    parameterId: number;
    parameterTitle: string;
    rating: string;
  }>;
}

export interface StudentResponseDetail {
  responseId: string;
  studentName: string | null;
  registrationNumber: string | null;
  studentEmail: string;
  submittedAt: string | null;
  facultyEvaluations: ResponseDetailItem[];
  generalFeedback: string | null;
}

async function getAdminDb(client?: any) {
  return createAdminClient() || client || (await createClient());
}

/**
 * Server action to fetch paginated feedback response records with search and filters.
 * Lean columns only — no select("*").
 * Multi-faculty semester feedback guarantees: 1 Google submission = 1 student response record.
 */
export async function getFormResponsesAction(
  params: {
    formId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    startDate?: string;
    endDate?: string;
  },
  options?: { client?: any }
): Promise<AdminResponsesResult> {
  const session = await getAdminSession(options?.client);
  if (!session.isAuthenticated || !session.isActive) {
    return {
      success: false,
      responses: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      formTitle: '',
      formType: '',
      error: 'Unauthorized. Active admin session required.',
    };
  }

  // Centralized Billing & Plan Basic Analytics Permission Check
  const access = await assertBasicAnalyticsAccess(
    session.admin?.id,
    session.admin?.email || session.user?.email,
    session.admin?.role,
    session.admin?.status
  );

  if (!access.allowed) {
    return {
      success: false,
      responses: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      formTitle: '',
      formType: '',
      code: access.code || 'BASIC_ANALYTICS_LOCKED',
      error: access.reason || 'Basic analytics access required. Please contact the Super Admin.',
    };
  }

  const { formId, page = 1, pageSize = 20, search, startDate, endDate } = params;
  const validPageSize = [10, 20, 50].includes(pageSize) ? pageSize : 20;

  if (!isValidUUID(formId)) {
    return {
      success: false,
      responses: [],
      totalCount: 0,
      page: 1,
      pageSize: validPageSize,
      totalPages: 0,
      formTitle: '',
      formType: '',
      error: 'Invalid feedback form identifier format.',
    };
  }

  const supabase = await getAdminDb(options?.client);
  if (!supabase) {
    return {
      success: false,
      responses: [],
      totalCount: 0,
      page: 1,
      pageSize: validPageSize,
      totalPages: 0,
      formTitle: '',
      formType: '',
      error: 'Database connection failed.',
    };
  }

  // 1. Fetch form metadata
  const { data: form } = await supabase
    .from('feedback_forms')
    .select('id, college_id, title, form_type, google_form_id, google_sheet_id, google_form_url, google_sheet_url')
    .eq('id', formId)
    .maybeSingle();

  if (!form) {
    return {
      success: false,
      responses: [],
      totalCount: 0,
      page: 1,
      pageSize: validPageSize,
      totalPages: 0,
      formTitle: '',
      formType: '',
      error: 'Form not found.',
    };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin) {
    const hasMembership = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!hasMembership) {
      return {
        success: false,
        responses: [],
        totalCount: 0,
        page: 1,
        pageSize: validPageSize,
        totalPages: 0,
        formTitle: '',
        formType: '',
        code: 'FORBIDDEN',
        error: 'Access denied. You do not have permission to view responses for this form.',
      };
    }
  }

  // 2. Auto-sync if records table is empty or stale (>30s since last sync) and Google is configured
  const { count: currentRecordCount } = await supabase
    .from('feedback_response_records')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', formId);

  const lastSyncedTime = form.last_synced_at ? new Date(form.last_synced_at).getTime() : 0;
  const isStale = Date.now() - lastSyncedTime > 30 * 1000;

  if ((currentRecordCount === 0 || currentRecordCount === null || isStale) && isGoogleConfigured()) {
    const resolvedFormId =
      form.google_form_id ||
      form.google_form_edit_url?.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
      form.google_form_url?.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    const resolvedSheetId =
      form.google_sheet_id ||
      form.google_sheet_url?.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];

    if (resolvedFormId && resolvedSheetId) {
      try {
        await syncFormResponsesToSheet({
          googleFormId: resolvedFormId,
          googleSheetId: resolvedSheetId,
          formId,
          callerSession: session,
          skipAuthCheck: true,
        });
      } catch (syncErr) {
        console.warn('Auto-sync in getFormResponsesAction encountered an issue:', syncErr);
      }
    }
  }

  // 3. Query response records with lean columns and pagination
  const from = (page - 1) * validPageSize;
  const to = from + validPageSize - 1;

  let query = supabase
    .from('feedback_response_records')
    .select(
      'id, form_id, google_response_id, student_email, student_name, registration_number, submitted_at, synced_at, email_status',
      { count: 'exact' }
    )
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });

  if (search && search.trim()) {
    const term = search.trim();
    query = query.or(
      `student_name.ilike.%${term}%,registration_number.ilike.%${term}%,student_email.ilike.%${term}%`
    );
  }

  if (startDate) {
    query = query.gte('submitted_at', startDate);
  }
  if (endDate) {
    query = query.lte('submitted_at', endDate);
  }

  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    return {
      success: false,
      responses: [],
      totalCount: 0,
      page,
      pageSize: validPageSize,
      totalPages: 0,
      formTitle: form.title,
      formType: form.form_type,
      error: error.message,
    };
  }

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / validPageSize);

  const responses: AdminResponseItem[] = (data || []).map((r: any) => ({
    id: r.id,
    formId: r.form_id,
    googleResponseId: r.google_response_id,
    studentEmail: r.student_email,
    studentName: r.student_name,
    registrationNumber: r.registration_number,
    submittedAt: r.submitted_at,
    syncedAt: r.synced_at,
    emailStatus: r.email_status || 'PENDING',
  }));

  return {
    success: true,
    responses,
    totalCount,
    page,
    pageSize: validPageSize,
    totalPages,
    formTitle: form.title,
    formType: form.form_type,
  };
}

/**
 * Server action to fetch individual student response details from authoritative Google Sheet
 */
export async function getResponseDetailAction(
  params: {
    formId: string;
    responseId: string;
  },
  options?: { client?: any }
): Promise<{ success: boolean; detail?: StudentResponseDetail; error?: string; code?: string }> {
  const session = await getAdminSession(options?.client);
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin session required.' };
  }

  // Centralized Billing & Plan Basic Analytics Permission Check
  const access = await assertBasicAnalyticsAccess(
    session.admin?.id,
    session.admin?.email || session.user?.email,
    session.admin?.role,
    session.admin?.status
  );

  if (!access.allowed) {
    return {
      success: false,
      code: 'ANALYTICS_UPGRADE_REQUIRED',
      error: access.reason || 'Basic analytics access required. Please contact the Super Admin.',
    };
  }

  const { formId, responseId } = params;

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  const supabase = await getAdminDb(options?.client);
  if (!supabase) {
    return { success: false, error: 'Database service unavailable.' };
  }

  const { data: form } = await supabase
    .from('feedback_forms')
    .select(`
      id,
      college_id,
      title,
      form_type,
      google_sheet_id,
      google_sheet_url,
      faculty:faculties(name),
      subject:subjects(name, code),
      items:feedback_form_items(
        grid_title,
        order_index,
        faculty:faculties(name),
        subject:subjects(name, code)
      )
    `)
    .eq('id', formId)
    .maybeSingle();

  if (!form) {
    return { success: false, error: 'Feedback form not found.' };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin) {
    const hasMembership = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!hasMembership) {
      return {
        success: false,
        error: 'Access denied. You do not have permission to view responses for this form.',
        code: 'FORBIDDEN',
      };
    }
  }

  const sheetId =
    form.google_sheet_id ||
    form.google_sheet_url?.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];

  if (!sheetId) {
    return { success: false, error: 'Connected Google Sheet not found.' };
  }

  const sheetData = await fetchSingleResponseFromSheet(sheetId, responseId, form.college_id);
  if (!sheetData) {
    return { success: false, error: 'Response record not found in Google Sheet.' };
  }

  const { headers, row } = sheetData;

  let studentName: string | null = null;
  let registrationNumber: string | null = null;
  let studentEmail = '';
  let submittedAt: string | null = null;
  let generalFeedback: string | null = null;

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    const val = row[idx] || '';

    if (lower.includes('timestamp') || lower === 'date' || lower === 'time') {
      submittedAt = val;
    } else if (lower.includes('email') || lower.includes('username')) {
      studentEmail = val;
    } else if (lower.includes('student name') || (lower.includes('name') && !lower.includes('faculty') && !lower.includes('subject'))) {
      studentName = val;
    } else if (lower.includes('registration') || lower.includes('reg') || lower.includes('roll')) {
      registrationNumber = val;
    } else if (lower.includes('general feedback') || lower.includes('suggestion') || lower.includes('comment')) {
      generalFeedback = val;
    }
  });

  const facultyEvaluations: ResponseDetailItem[] = [];

  if (form.form_type === 'SEMESTER_FEEDBACK' && form.items && form.items.length > 0) {
    const sortedItems = [...form.items].sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

    for (const item of sortedItems) {
      const fName = (item.faculty as any)?.name || 'Faculty Member';
      const sName = (item.subject as any)?.name || 'Subject';
      const sCode = (item.subject as any)?.code || '';
      const fullSubject = sCode ? `${sName} (${sCode})` : sName;
      const expectedPrefix = (item.grid_title || `${sName} — ${fName}`).toLowerCase();

      const ratings: Array<{ parameterId: number; parameterTitle: string; rating: string }> = [];

      for (const param of BCE_FEEDBACK_PARAMETERS) {
        let ratingVal = 'Not Rated';
        const pLower = param.title.toLowerCase();

        for (let c = 0; c < headers.length; c++) {
          const hLower = headers[c].toLowerCase();
          if (
            (hLower.includes(expectedPrefix) || expectedPrefix.includes(hLower.split('[')[0].trim())) &&
            hLower.includes(pLower)
          ) {
            ratingVal = row[c] || 'Not Rated';
            break;
          }
        }

        ratings.push({
          parameterId: param.id,
          parameterTitle: param.title,
          rating: ratingVal,
        });
      }

      facultyEvaluations.push({
        facultyName: fName,
        subjectName: fullSubject,
        ratings,
      });
    }
  } else {
    const fName = (form.faculty as any)?.name || 'Faculty Member';
    const sName = (form.subject as any)?.name || 'Subject';
    const sCode = (form.subject as any)?.code || '';
    const fullSubject = sCode ? `${sName} (${sCode})` : sName;

    const ratings: Array<{ parameterId: number; parameterTitle: string; rating: string }> = [];

    for (const param of BCE_FEEDBACK_PARAMETERS) {
      let ratingVal = 'Not Rated';
      const pLower = param.title.toLowerCase();

      for (let c = 0; c < headers.length; c++) {
        const hLower = headers[c].toLowerCase();
        if (
          hLower.startsWith(`${param.id}.`) ||
          hLower.startsWith(`${param.id}:`) ||
          hLower.startsWith(`${param.id} `) ||
          hLower.includes(pLower)
        ) {
          ratingVal = row[c] || 'Not Rated';
          break;
        }
      }

      ratings.push({
        parameterId: param.id,
        parameterTitle: param.title,
        rating: ratingVal,
      });
    }

    facultyEvaluations.push({
      facultyName: fName,
      subjectName: fullSubject,
      ratings,
    });
  }

  return {
    success: true,
    detail: {
      responseId,
      studentName,
      registrationNumber,
      studentEmail,
      submittedAt,
      facultyEvaluations,
      generalFeedback,
    },
  };
}
