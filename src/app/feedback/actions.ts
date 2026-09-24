'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Faculty, Subject, Branch } from '@/types/database';
import { isValidUUID } from '@/lib/validation';

/**
 * Obtain a database client for public operations.
 * Prioritizes admin client (service_role) to eliminate session-cookie expiration failures.
 * Falls back safely to createClient() when service_role is unavailable.
 */
async function getPublicDb() {
  return createAdminClient() || (await createClient());
}


export interface PublicFormSummary {
  id: string;
  title: string;
  description?: string | null;
  form_type: string;
  status: string;
  google_form_url?: string | null;
  published_at?: string | null;
  closed_at?: string | null;
  college?: {
    id: string;
    name: string;
    code: string;
    slug?: string;
    logo_url?: string | null;
  };
  faculty?: {
    id: string;
    name: string;
    department: string;
    designation: string;
  };
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  academic_year?: {
    id: string;
    name: string;
  };
  branch?: {
    id: string;
    name: string;
    code: string;
  };
  semester?: {
    id: string;
    name: string;
    semester_number: number;
  };
}

/**
 * Fetch faculties assigned to teach in a specific Year + Branch + Semester.
 * Only returns active faculties who have an active assignment.
 */
export async function getPublicFacultiesForSelectionAction(
  yearId: string,
  branchId: string,
  semesterId: string,
  collegeId?: string
): Promise<{ success: boolean; faculties: Faculty[]; error?: string }> {
  try {
    if (!isValidUUID(yearId) || !isValidUUID(branchId) || !isValidUUID(semesterId)) {
      return { success: false, faculties: [], error: 'Invalid academic parameters.' };
    }

    const supabase = await getPublicDb();

    let query = supabase
      .from('faculty_subject_assignments')
      .select(`
        faculty_id,
        branch_id,
        semester_id,
        is_active,
        faculty:faculties(id, name, department, designation, is_active)
      `)
      .eq('academic_year_id', yearId)
      .eq('is_active', true);

    if (collegeId && isValidUUID(collegeId)) {
      query = query.eq('college_id', collegeId);
    }

    const { data: assignments, error } = await query;

    if (error) {
      return { success: false, faculties: [], error: 'Unable to load faculty list.' };
    }

    // Filter by branch and semester
    const filtered = (assignments || []).filter((a: any) => {
      const matchBranch = !a.branch_id || a.branch_id === branchId;
      const matchSem = !a.semester_id || a.semester_id === semesterId;
      const facultyActive = a.faculty && a.faculty.is_active !== false;
      return matchBranch && matchSem && facultyActive;
    });

    // Extract unique faculties
    const facultyMap = new Map<string, Faculty>();
    filtered.forEach((a: any) => {
      if (a.faculty && !facultyMap.has(a.faculty.id)) {
        facultyMap.set(a.faculty.id, a.faculty as Faculty);
      }
    });

    const faculties = Array.from(facultyMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return { success: true, faculties };
  } catch (err) {
    console.error('getPublicFacultiesForSelectionAction error:', err);
    return { success: false, faculties: [], error: 'Failed to load faculties.' };
  }
}

/**
 * Fetch subjects assigned to a specific faculty in a specific Year + Branch + Semester.
 */
export async function getPublicSubjectsForFacultyAction(
  yearId: string,
  branchId: string,
  semesterId: string,
  facultyId: string,
  collegeId?: string
): Promise<{ success: boolean; subjects: Subject[]; error?: string }> {
  try {
    if (
      !isValidUUID(yearId) ||
      !isValidUUID(branchId) ||
      !isValidUUID(semesterId) ||
      !isValidUUID(facultyId)
    ) {
      return { success: false, subjects: [], error: 'Invalid academic parameters.' };
    }

    const supabase = await getPublicDb();

    let query = supabase
      .from('faculty_subject_assignments')
      .select(`
        subject_id,
        branch_id,
        semester_id,
        is_active,
        subject:subjects(id, name, code, is_active)
      `)
      .eq('academic_year_id', yearId)
      .eq('faculty_id', facultyId)
      .eq('is_active', true);

    if (collegeId && isValidUUID(collegeId)) {
      query = query.eq('college_id', collegeId);
    }

    const { data: assignments, error } = await query;

    if (error) {
      return { success: false, subjects: [], error: 'Unable to load subject list.' };
    }

    // Filter by branch and semester
    const filtered = (assignments || []).filter((a: any) => {
      const matchBranch = !a.branch_id || a.branch_id === branchId;
      const matchSem = !a.semester_id || a.semester_id === semesterId;
      const subjectActive = a.subject && a.subject.is_active !== false;
      return matchBranch && matchSem && subjectActive;
    });

    // Extract unique subjects
    const subjectMap = new Map<string, Subject>();
    filtered.forEach((a: any) => {
      if (a.subject && !subjectMap.has(a.subject.id)) {
        subjectMap.set(a.subject.id, a.subject as Subject);
      }
    });

    const subjects = Array.from(subjectMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return { success: true, subjects };
  } catch (err) {
    console.error('getPublicSubjectsForFacultyAction error:', err);
    return { success: false, subjects: [], error: 'Failed to load subjects.' };
  }
}

/**
 * Fetch public feedback form for an exact combination (Year, Branch, Sem, Faculty, Subject).
 * Strictly queries only PUBLISHED or CLOSED forms.
 * Never returns edit URLs or private sheet credentials.
 */
export async function getPublicFeedbackFormAction(
  yearId: string,
  branchId: string,
  semesterId: string,
  facultyId: string,
  subjectId: string,
  collegeId?: string
): Promise<{
  success: boolean;
  form: PublicFormSummary | null;
  status: 'PUBLISHED' | 'CLOSED' | 'NONE';
  message: string;
}> {
  try {
    if (
      !isValidUUID(yearId) ||
      !isValidUUID(branchId) ||
      !isValidUUID(semesterId) ||
      !isValidUUID(facultyId) ||
      !isValidUUID(subjectId)
    ) {
      return {
        success: false,
        form: null,
        status: 'NONE',
        message: 'Invalid academic parameters.',
      };
    }

    const supabase = await getPublicDb();

    let query = supabase
      .from('feedback_forms')
      .select(`
        id,
        title,
        description,
        form_type,
        status,
        google_form_url,
        published_at,
        closed_at,
        college:colleges(id, name, code, slug, logo_url),
        faculty:faculties(id, name, department, designation),
        subject:subjects(id, name, code),
        academic_year:academic_years(id, name),
        branch:branches(id, name, code),
        semester:semesters(id, name, semester_number)
      `)
      .eq('academic_year_id', yearId)
      .eq('branch_id', branchId)
      .eq('semester_id', semesterId)
      .eq('faculty_id', facultyId)
      .eq('subject_id', subjectId)
      .in('status', ['PUBLISHED', 'CLOSED']);

    if (collegeId && isValidUUID(collegeId)) {
      query = query.eq('college_id', collegeId);
    }

    const { data: form, error } = await query.maybeSingle();

    if (error) {
      console.error('getPublicFeedbackFormAction query error:', error);
      return {
        success: false,
        form: null,
        status: 'NONE',
        message: 'Unable to check feedback form availability. Please try again.',
      };
    }

    if (!form) {
      return {
        success: true,
        form: null,
        status: 'NONE',
        message: 'No feedback form is currently available for this selection.',
      };
    }

    if (form.status === 'CLOSED') {
      return {
        success: true,
        form: form as unknown as PublicFormSummary,
        status: 'CLOSED',
        message: 'This feedback form is closed and is no longer accepting submissions.',
      };
    }

    return {
      success: true,
      form: form as unknown as PublicFormSummary,
      status: 'PUBLISHED',
      message: 'Feedback form is active and accepting student evaluations.',
    };
  } catch (err) {
    console.error('getPublicFeedbackFormAction error:', err);
    return {
      success: false,
      form: null,
      status: 'NONE',
      message: 'Unable to check feedback form availability.',
    };
  }
}

/**
 * Fetch a single feedback form by ID for direct links (/feedback/[id]).
 * Returns only public safe fields and enforces that DRAFT/ARCHIVED forms are not exposed.
 */
export async function getPublicFeedbackFormByIdAction(
  formId: string,
  collegeId?: string
): Promise<{
  success: boolean;
  form: PublicFormSummary | null;
  status: 'PUBLISHED' | 'CLOSED' | 'UNAVAILABLE';
  message: string;
}> {
  try {
    if (!formId || !isValidUUID(formId)) {
      return {
        success: false,
        form: null,
        status: 'UNAVAILABLE',
        message: 'This feedback form link is invalid.',
      };
    }

    const supabase = await getPublicDb();

    let query = supabase
      .from('feedback_forms')
      .select(`
        id,
        title,
        description,
        form_type,
        status,
        google_form_url,
        published_at,
        closed_at,
        college:colleges(id, name, code, slug, logo_url),
        faculty:faculties(id, name, department, designation),
        subject:subjects(id, name, code),
        academic_year:academic_years(id, name),
        branch:branches(id, name, code),
        semester:semesters(id, name, semester_number)
      `)
      .eq('id', formId);

    if (collegeId && isValidUUID(collegeId)) {
      query = query.eq('college_id', collegeId);
    }

    const { data: form, error } = await query.maybeSingle();

    if (error || !form) {
      return {
        success: false,
        form: null,
        status: 'UNAVAILABLE',
        message: 'This feedback form is no longer available or the link is invalid.',
      };
    }

    if (form.status === 'DRAFT' || form.status === 'ARCHIVED') {
      return {
        success: false,
        form: null,
        status: 'UNAVAILABLE',
        message: 'This feedback form is not currently available for public evaluations.',
      };
    }

    if (form.status === 'CLOSED') {
      return {
        success: true,
        form: form as unknown as PublicFormSummary,
        status: 'CLOSED',
        message: 'This feedback form is closed and is no longer accepting submissions.',
      };
    }

    return {
      success: true,
      form: form as unknown as PublicFormSummary,
      status: 'PUBLISHED',
      message: 'Feedback form is currently active.',
    };
  } catch (err) {
    console.error('getPublicFeedbackFormByIdAction error:', err);
    return {
      success: false,
      form: null,
      status: 'UNAVAILABLE',
      message: 'Unable to load feedback form.',
    };
  }
}

/**
 * Fetch active semester feedback form for selected Year + Branch + Semester.
 */
export async function getPublicSemesterFeedbackFormAction(
  yearId: string,
  branchId: string,
  semesterId: string,
  collegeId?: string
): Promise<{
  success: boolean;
  form: PublicFormSummary | null;
  status: 'PUBLISHED' | 'CLOSED' | 'NONE';
  itemsCount?: number;
  message: string;
}> {
  try {
    if (!isValidUUID(yearId) || !isValidUUID(branchId) || !isValidUUID(semesterId)) {
      return { success: false, form: null, status: 'NONE', message: 'Invalid academic parameters.' };
    }

    const supabase = await getPublicDb();

    let query = supabase
      .from('feedback_forms')
      .select(`
        id,
        title,
        description,
        form_type,
        status,
        google_form_url,
        published_at,
        closed_at,
        academic_year:academic_years(id, name),
        branch:branches(id, name, code),
        semester:semesters(id, name, semester_number)
      `)
      .eq('academic_year_id', yearId)
      .eq('branch_id', branchId)
      .eq('semester_id', semesterId)
      .eq('form_type', 'SEMESTER_FEEDBACK')
      .in('status', ['PUBLISHED', 'CLOSED'])
      .order('created_at', { ascending: false });

    if (collegeId && isValidUUID(collegeId)) {
      query = query.eq('college_id', collegeId);
    }

    const { data: form, error } = await query.maybeSingle();

    if (error || !form) {
      return {
        success: true,
        form: null,
        status: 'NONE',
        message: 'No semester feedback form available.',
      };
    }

    const { count } = await supabase
      .from('feedback_form_items')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', form.id);

    return {
      success: true,
      form: form as unknown as PublicFormSummary,
      status: form.status as 'PUBLISHED' | 'CLOSED',
      itemsCount: count || 0,
      message:
        form.status === 'PUBLISHED'
          ? 'Official Semester Feedback Form Available — Includes All Subjects & Teachers'
          : 'Semester feedback form is closed.',
    };
  } catch (err) {
    console.error('getPublicSemesterFeedbackFormAction error:', err);
    return { success: false, form: null, status: 'NONE', message: 'Error checking semester feedback form.' };
  }
}

export interface PublicActiveFormCard {
  id: string;
  title: string;
  formType: 'SEMESTER_FEEDBACK' | 'FACULTY_FEEDBACK';
  status: string;
  googleFormUrl: string | null;
  publishedAt: string | null;
  academicYear: string;
  branch: string;
  branchCode: string;
  semester: string;
  facultySubjectDisplay: string;
  itemsCount?: number;
}

export interface PublicActiveFormsResult {
  success: boolean;
  forms: PublicActiveFormCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/**
 * Fetch all currently PUBLISHED / ACTIVE feedback forms with server-side pagination.
 * Sorts newest published first.
 * Safe public projection: Zero credentials, private sheets, response records, or PII exposed.
 */
export async function getPublicActiveFormsAction(params?: {
  page?: number;
  pageSize?: number;
  branchId?: string;
  search?: string;
  collegeId?: string;
}): Promise<PublicActiveFormsResult> {
  try {
    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.min(50, Math.max(6, params?.pageSize || 12));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await getPublicDb();

    let query = supabase
      .from('feedback_forms')
      .select(
        `
        id,
        title,
        form_type,
        status,
        google_form_url,
        published_at,
        created_at,
        branch:branches(id, name, code),
        semester:semesters(id, name, semester_number),
        academic_year:academic_years(id, name),
        faculty:faculties(id, name),
        subject:subjects(id, name, code),
        items:feedback_form_items(id)
      `,
        { count: 'exact' }
      )
      .eq('status', 'PUBLISHED')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (params?.collegeId && isValidUUID(params.collegeId)) {
      query = query.eq('college_id', params.collegeId);
    }

    if (params?.branchId && isValidUUID(params.branchId)) {
      query = query.eq('branch_id', params.branchId);
    }

    if (params?.search && params.search.trim()) {
      const term = params.search.trim();
      query = query.or(`title.ilike.%${term}%`);
    }

    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('getPublicActiveFormsAction error:', {
        message: error.message || 'Unknown error',
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return {
        success: false,
        forms: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        error: 'Failed to load feedback forms.',
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    const forms: PublicActiveFormCard[] = (data || []).map((f: any) => {
      const isSemester = f.form_type === 'SEMESTER_FEEDBACK';
      const itemsCount = f.items ? f.items.length : 0;

      let facultySubjectDisplay = 'All Faculty';
      if (isSemester) {
        facultySubjectDisplay = itemsCount > 0 ? `All Faculty (${itemsCount} Teachers Evaluated)` : 'All Faculty (Semester Cohort)';
      } else {
        const facName = f.faculty?.name || 'Faculty Member';
        const subName = f.subject?.name ? `${f.subject.name}${f.subject.code ? ` (${f.subject.code})` : ''}` : 'Subject';
        facultySubjectDisplay = `${facName} — ${subName}`;
      }

      return {
        id: f.id,
        title: f.title,
        formType: f.form_type,
        status: f.status,
        googleFormUrl: f.google_form_url || null,
        publishedAt: f.published_at || f.created_at,
        academicYear: f.academic_year?.name || 'Academic Session',
        branch: f.branch?.name || 'Department',
        branchCode: f.branch?.code || 'BCE',
        semester: f.semester?.name || 'Semester',
        facultySubjectDisplay,
        itemsCount,
      };
    });

    return {
      success: true,
      forms,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: unknown) {
    const errorDetails =
      err instanceof Error
        ? { message: err.message, stack: err.stack }
        : { message: String(err) };
    console.error('getPublicActiveFormsAction exception:', errorDetails);
    return {
      success: false,
      forms: [],
      totalCount: 0,
      page: 1,
      pageSize: 12,
      totalPages: 0,
      error: 'Unexpected error loading forms.',
    };
  }
}

/**
 * Dynamically fetch all active branches from the database table.
 * Filtered by is_active = true and sorted alphabetically by name.
 */
export async function getActiveBranchesAction(collegeId?: string): Promise<{
  success: boolean;
  branches: Branch[];
  error?: string;
}> {
  try {
    const supabase = await getPublicDb();
    let query = supabase
      .from('branches')
      .select('id, name, code, is_active, created_at, updated_at')
      .eq('is_active', true);

    if (collegeId && isValidUUID(collegeId)) {
      query = query.eq('college_id', collegeId);
    }

    const { data: branches, error } = await query.order('name', { ascending: true });

    if (error) {
      console.error('[GET_ACTIVE_BRANCHES]', error);
      return { success: false, branches: [], error: error.message };
    }

    return { success: true, branches: (branches || []) as Branch[] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error loading branches.';
    console.error('[GET_ACTIVE_BRANCHES]', err);
    return { success: false, branches: [], error: message };
  }
}
