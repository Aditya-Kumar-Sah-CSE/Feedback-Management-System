import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { fetchRawSheetResponses } from '@/lib/analytics/sheets-reader';
import {
  normalizeSheetRows,
  detectMultiGrids,
  normalizeSheetRowsForSpecificGrid,
} from '@/lib/analytics/normalizer';
import {
  calculateFormAnalytics,
  aggregateAnalytics,
  countUniqueStudentResponses,
} from '@/lib/analytics/engine';
import type {
  FormAnalyticsReport,
  AggregatedAnalyticsReport,
  FacultyGridAnalyticsItem,
} from '@/lib/analytics/types';
import { isGoogleConfigured } from '@/lib/google/auth';
import { isValidUUID } from '@/lib/validation';

async function getAdminDb(client?: any) {
  return createAdminClient() || client || (await createClient());
}

export interface ScopeFilters {
  collegeId?: string;
  academicYearId?: string;
  branchId?: string;
  semesterId?: string;
  facultyId?: string;
  subjectId?: string;
}

/**
 * Fetches real-time analytics for a specific feedback form.
 * Directly sources responses from the connected Google Sheet and normalizes them.
 * Authoritative single source of truth for both dashboard and PDF reporting.
 */
export async function getFormAnalyticsData(
  formId: string,
  options?: { client?: any }
): Promise<{
  success: boolean;
  error?: string;
  report?: FormAnalyticsReport;
}> {
  // 1. Admin Authentication Check
  const session = await getAdminSession(options?.client);
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin credentials required.' };
  }

  if (!isValidUUID(formId)) {
    return { success: false, error: 'Invalid feedback form identifier format.' };
  }

  const supabase = await getAdminDb(options?.client);

  // 2. Fetch Form Metadata
  const { data: form, error: formErr } = await supabase
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

  if (formErr || !form) {
    return { success: false, error: formErr?.message || 'Feedback form not found.' };
  }

  // Tenant authorization check
  if (!session.isPlatformSuperAdmin) {
    const hasMembership = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!hasMembership) {
      return { success: false, error: 'Access denied. You do not have permission to view analytics for this form.' };
    }
  }

  // 3. Fetch Real Response Data from Google Sheet
  let canonicalRows: ReturnType<typeof normalizeSheetRows> = [];
  const isSemester = form.form_type === 'SEMESTER_FEEDBACK';
  let facultyGrids: FacultyGridAnalyticsItem[] = [];

  if (form.google_sheet_id && isGoogleConfigured()) {
    try {
      const sheetData = await fetchRawSheetResponses(form.google_sheet_id, form.college_id);

      if (sheetData.rows.length > 0) {
        if (isSemester) {
          const detectedGrids = detectMultiGrids(sheetData.headers);

          if (detectedGrids.length > 0) {
            facultyGrids = detectedGrids.map(grid => {
              const gridRows = normalizeSheetRowsForSpecificGrid(
                sheetData.headers,
                sheetData.rows,
                grid.paramColIndices
              );

              const gridReport = calculateFormAnalytics({
                formId: form.id,
                title: `${grid.subjectName} — ${grid.facultyName}`,
                academicYear: form.academic_year?.name || 'Academic Session',
                branch: form.branch?.name || 'Branch',
                semester: form.semester?.name || 'Semester',
                facultyName: grid.facultyName || 'Faculty Member',
                subjectName: grid.subjectName || 'Subject',
                subjectCode: grid.subjectCode || '',
                formType: 'SEMESTER_FEEDBACK',
                status: form.status,
                lastSyncedAt: form.last_synced_at,
                googleSheetUrl: form.google_sheet_url,
                googleFormUrl: form.google_form_url,
                responses: gridRows,
              });

              return {
                gridTitle: grid.gridTitle,
                facultyName: grid.facultyName,
                subjectName: grid.subjectName,
                subjectCode: grid.subjectCode,
                report: gridReport,
              };
            });

            // Combined: Each student's grid evaluation becomes a logical evaluation record
            canonicalRows = detectedGrids.flatMap(grid =>
              normalizeSheetRowsForSpecificGrid(
                sheetData.headers,
                sheetData.rows,
                grid.paramColIndices
              )
            );
          } else {
            canonicalRows = normalizeSheetRows(sheetData.headers, sheetData.rows);
          }
        } else {
          canonicalRows = normalizeSheetRows(sheetData.headers, sheetData.rows);
        }

        // Authoritative unique student response count (1 Google response ID = 1 student response)
        const uniqueStudentCount = countUniqueStudentResponses(canonicalRows);

        // Update database response_count if changed
        if (form.response_count !== uniqueStudentCount && uniqueStudentCount > 0) {
          await supabase
            .from('feedback_forms')
            .update({
              response_count: uniqueStudentCount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', formId);
        }
      }
    } catch (sheetErr) {
      console.warn(`Could not read sheet for form ${formId}:`, sheetErr);
    }
  }

  // 4. Compute Unified Analytics
  const report = calculateFormAnalytics({
    formId: form.id,
    title: form.title,
    academicYear: form.academic_year?.name || 'Academic Session',
    branch: form.branch?.name || 'Branch',
    semester: form.semester?.name || 'Semester',
    facultyName: isSemester ? 'All Assigned Faculty' : form.faculty?.name || 'Faculty Member',
    subjectName: isSemester ? 'All Semester Subjects' : form.subject?.name || 'Subject',
    subjectCode: form.subject?.code || '',
    formType: form.form_type || 'FACULTY_SPECIFIC',
    status: form.status,
    lastSyncedAt: form.last_synced_at,
    googleSheetUrl: form.google_sheet_url,
    googleFormUrl: form.google_form_url,
    responses: canonicalRows,
  });

  if (isSemester) {
    report.isSemesterForm = true;
    report.facultyGrids = facultyGrids;
    const uniqueStudents = countUniqueStudentResponses(canonicalRows);
    if (uniqueStudents > 0) {
      report.totalResponses = uniqueStudents;
      report.totalStudents = uniqueStudents;
    }
  }

  report.collegeId = form.college_id;

  return { success: true, report };
}

/**
 * Fetches institutional scope analytics aggregated across matching feedback forms.
 */
export async function getOverallAnalyticsData(
  filters?: ScopeFilters,
  options?: { client?: any }
): Promise<{
  success: boolean;
  error?: string;
  report?: AggregatedAnalyticsReport;
}> {
  const session = await getAdminSession(options?.client);
  if (!session.isAuthenticated || !session.isActive) {
    return { success: false, error: 'Unauthorized. Active admin credentials required.' };
  }

  // Internal Tenant Enforcement
  let targetCollegeId: string | undefined = filters?.collegeId;

  if (!session.isPlatformSuperAdmin) {
    const activeCollegeIds = session.colleges
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => c.collegeId);

    if (activeCollegeIds.length === 0) {
      return { success: false, error: 'Access denied. No active college memberships found.' };
    }

    if (targetCollegeId) {
      if (!activeCollegeIds.includes(targetCollegeId)) {
        return { success: false, error: 'Access denied. You do not have permission to access analytics for this college.' };
      }
    } else {
      if (session.activeCollegeId && activeCollegeIds.includes(session.activeCollegeId)) {
        targetCollegeId = session.activeCollegeId;
      } else {
        targetCollegeId = activeCollegeIds[0];
      }
    }
  } else {
    // Platform super admin: use session.activeCollegeId if none provided in filter
    if (!targetCollegeId && session.activeCollegeId) {
      targetCollegeId = session.activeCollegeId;
    }
  }

  // Validate filter UUIDs if present
  if (targetCollegeId && !isValidUUID(targetCollegeId)) {
    return { success: false, error: 'Invalid College filter format.' };
  }
  if (filters?.academicYearId && filters.academicYearId !== 'ALL' && !isValidUUID(filters.academicYearId)) {
    return { success: false, error: 'Invalid Academic Year filter format.' };
  }
  if (filters?.branchId && filters.branchId !== 'ALL' && !isValidUUID(filters.branchId)) {
    return { success: false, error: 'Invalid Branch filter format.' };
  }
  if (filters?.semesterId && filters.semesterId !== 'ALL' && !isValidUUID(filters.semesterId)) {
    return { success: false, error: 'Invalid Semester filter format.' };
  }
  if (filters?.facultyId && filters.facultyId !== 'ALL' && !isValidUUID(filters.facultyId)) {
    return { success: false, error: 'Invalid Faculty filter format.' };
  }
  if (filters?.subjectId && filters.subjectId !== 'ALL' && !isValidUUID(filters.subjectId)) {
    return { success: false, error: 'Invalid Subject filter format.' };
  }

  const supabase = await getAdminDb(options?.client);

  // Query matching feedback forms
  let query = supabase
    .from('feedback_forms')
    .select(`
      *,
      faculty:faculties(*),
      subject:subjects(*),
      academic_year:academic_years(*),
      branch:branches(*),
      semester:semesters(*)
    `)
    .order('created_at', { ascending: false });

  if (targetCollegeId && isValidUUID(targetCollegeId)) {
    query = query.eq('college_id', targetCollegeId);
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
  if (filters?.facultyId && filters.facultyId !== 'ALL') {
    query = query.eq('faculty_id', filters.facultyId);
  }
  if (filters?.subjectId && filters.subjectId !== 'ALL') {
    query = query.eq('subject_id', filters.subjectId);
  }

  const { data: forms, error: formsErr } = await query;

  if (formsErr) {
    return { success: false, error: formsErr.message };
  }

  const allForms = forms || [];

  // Compute individual form reports
  const formReports: FormAnalyticsReport[] = [];

  for (const form of allForms) {
    let canonicalRows: ReturnType<typeof normalizeSheetRows> = [];
    const isSemesterForm = form.form_type === 'SEMESTER_FEEDBACK';
    let facultyGrids: FacultyGridAnalyticsItem[] = [];

    if (form.google_sheet_id && isGoogleConfigured()) {
      try {
        const sheetData = await fetchRawSheetResponses(form.google_sheet_id, form.college_id);
        if (sheetData.rows.length > 0) {
          if (isSemesterForm) {
            const detectedGrids = detectMultiGrids(sheetData.headers);
            if (detectedGrids.length > 0) {
              facultyGrids = detectedGrids.map(grid => {
                const gridRows = normalizeSheetRowsForSpecificGrid(
                  sheetData.headers,
                  sheetData.rows,
                  grid.paramColIndices
                );
                const gridReport = calculateFormAnalytics({
                  formId: form.id,
                  title: `${grid.subjectName} — ${grid.facultyName}`,
                  academicYear: form.academic_year?.name || 'Academic Session',
                  branch: form.branch?.name || 'Branch',
                  semester: form.semester?.name || 'Semester',
                  facultyName: grid.facultyName || 'Faculty Member',
                  subjectName: grid.subjectName || 'Subject',
                  subjectCode: grid.subjectCode || '',
                  formType: 'SEMESTER_FEEDBACK',
                  status: form.status,
                  lastSyncedAt: form.last_synced_at,
                  googleSheetUrl: form.google_sheet_url,
                  googleFormUrl: form.google_form_url,
                  responses: gridRows,
                });
                return {
                  gridTitle: grid.gridTitle,
                  facultyName: grid.facultyName,
                  subjectName: grid.subjectName,
                  subjectCode: grid.subjectCode,
                  report: gridReport,
                };
              });

              canonicalRows = detectedGrids.flatMap(grid =>
                normalizeSheetRowsForSpecificGrid(
                  sheetData.headers,
                  sheetData.rows,
                  grid.paramColIndices
                )
              );
            } else {
              canonicalRows = normalizeSheetRows(sheetData.headers, sheetData.rows);
            }
          } else {
            canonicalRows = normalizeSheetRows(sheetData.headers, sheetData.rows);
          }
        }
      } catch (err) {
        console.warn(`Error reading sheet for form ${form.id}:`, err);
      }
    }

    const singleReport = calculateFormAnalytics({
      formId: form.id,
      title: form.title,
      academicYear: form.academic_year?.name || 'Academic Session',
      branch: form.branch?.name || 'Branch',
      semester: form.semester?.name || 'Semester',
      facultyName: isSemesterForm ? 'All Assigned Faculty' : form.faculty?.name || 'Faculty Member',
      subjectName: isSemesterForm ? 'All Semester Subjects' : form.subject?.name || 'Subject',
      subjectCode: form.subject?.code || '',
      formType: form.form_type || 'FACULTY_SPECIFIC',
      status: form.status,
      lastSyncedAt: form.last_synced_at,
      googleSheetUrl: form.google_sheet_url,
      googleFormUrl: form.google_form_url,
      responses: canonicalRows,
    });

    if (isSemesterForm) {
      singleReport.isSemesterForm = true;
      singleReport.facultyGrids = facultyGrids;
    }

    formReports.push(singleReport);
  }

  // Determine human-readable scope title
  const parts: string[] = [];
  let academicYearName = '';
  let branchName = '';
  let semesterName = '';
  let facultyName = '';
  let subjectName = '';

  if (formReports.length > 0) {
    if (filters?.academicYearId && filters.academicYearId !== 'ALL') {
      academicYearName = formReports[0].academicYear;
      parts.push(academicYearName);
    }
    if (filters?.branchId && filters.branchId !== 'ALL') {
      branchName = formReports[0].branch;
      parts.push(branchName);
    }
    if (filters?.semesterId && filters.semesterId !== 'ALL') {
      semesterName = formReports[0].semester;
      parts.push(semesterName);
    }
    if (filters?.facultyId && filters.facultyId !== 'ALL') {
      facultyName = formReports[0].facultyName;
      parts.push(facultyName);
    }
    if (filters?.subjectId && filters.subjectId !== 'ALL') {
      subjectName = `${formReports[0].subjectName} (${formReports[0].subjectCode})`;
      parts.push(subjectName);
    }
  }

  const scopeTitle = parts.length > 0 ? parts.join(' → ') : 'Institution-Wide (All Active Feedback)';

  const aggregated = aggregateAnalytics(formReports, scopeTitle, {
    academicYearId: filters?.academicYearId,
    academicYearName,
    branchId: filters?.branchId,
    branchName,
    semesterId: filters?.semesterId,
    semesterName,
    facultyId: filters?.facultyId,
    facultyName,
    subjectId: filters?.subjectId,
    subjectName,
  });

  aggregated.collegeId = targetCollegeId;

  return { success: true, report: aggregated };
}
