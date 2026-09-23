'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { generateResponseToken, verifyResponseToken } from '@/lib/feedback/response-token';
import { sendStudentSubmissionConfirmationEmail } from '@/lib/email/service';

export interface VerifiedConfirmationData {
  isValid: boolean;
  formTitle: string;
  academicYear: string;
  branch: string;
  semester: string;
  submittedAt: string | null;
  studentEmail: string;
  studentName: string | null;
  registrationNumber: string | null;
  downloadUrl: string;
  emailStatus: string;
  errorMessage?: string;
}

/**
 * Validates an HMAC token and returns the verified student confirmation details
 */
export async function getConfirmationByTokenAction(
  token: string
): Promise<VerifiedConfirmationData | null> {
  const payload = verifyResponseToken(token);
  if (!payload) {
    return null;
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  const { data: rec } = await supabase
    .from('feedback_response_records')
    .select(`
      id,
      google_response_id,
      student_email,
      student_name,
      registration_number,
      submitted_at,
      email_status,
      form:feedback_forms(
        id,
        title,
        branch:branches(name),
        semester:semesters(name),
        academic_year:academic_years(name)
      )
    `)
    .eq('form_id', payload.formId)
    .eq('google_response_id', payload.responseId)
    .maybeSingle();

  if (!rec || !rec.form) {
    return null;
  }

  const form: any = rec.form;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://feedback-management-system-kappa.vercel.app';
  const downloadUrl = `${baseUrl}/api/feedback/response/download?token=${encodeURIComponent(token)}`;

  return {
    isValid: true,
    formTitle: form.title,
    academicYear: form.academic_year?.name || 'Academic Session',
    branch: form.branch?.name || 'Department',
    semester: form.semester?.name || 'Semester',
    submittedAt: rec.submitted_at,
    studentEmail: rec.student_email,
    studentName: rec.student_name,
    registrationNumber: rec.registration_number,
    downloadUrl,
    emailStatus: rec.email_status || 'PENDING',
  };
}

/**
 * Looks up a verified submission by student email and formId, returning a signed token
 */
export async function verifyStudentSubmissionAction(params: {
  formId: string;
  email: string;
}): Promise<{ success: boolean; data?: VerifiedConfirmationData; token?: string; message: string }> {
  const { formId, email } = params;

  if (!formId || !email || !email.includes('@')) {
    return {
      success: false,
      message: 'Please provide a valid feedback form and student email.',
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      success: false,
      message: 'Database service is currently unavailable.',
    };
  }

  const { data: rec } = await supabase
    .from('feedback_response_records')
    .select(`
      id,
      google_response_id,
      student_email,
      student_name,
      registration_number,
      submitted_at,
      email_status,
      form:feedback_forms(
        id,
        title,
        branch:branches(name),
        semester:semesters(name),
        academic_year:academic_years(name)
      )
    `)
    .eq('form_id', formId)
    .ilike('student_email', normalizedEmail)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rec || !rec.form) {
    return {
      success: false,
      message:
        'No verified submission found for this email on the selected form. If you just submitted Google Forms, please allow 1–2 minutes for the system sync.',
    };
  }

  const form: any = rec.form;
  const token = generateResponseToken({
    responseId: rec.google_response_id,
    formId,
    email: rec.student_email,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://feedback-management-system-kappa.vercel.app';
  const downloadUrl = `${baseUrl}/api/feedback/response/download?token=${encodeURIComponent(token)}`;

  return {
    success: true,
    message: 'Submission successfully verified from institutional records.',
    token,
    data: {
      isValid: true,
      formTitle: form.title,
      academicYear: form.academic_year?.name || 'Academic Session',
      branch: form.branch?.name || 'Department',
      semester: form.semester?.name || 'Semester',
      submittedAt: rec.submitted_at,
      studentEmail: rec.student_email,
      studentName: rec.student_name,
      registrationNumber: rec.registration_number,
      downloadUrl,
      emailStatus: rec.email_status || 'PENDING',
    },
  };
}

/**
 * Resends the confirmation email for a verified submission
 */
export async function resendConfirmationEmailAction(params: {
  formId: string;
  email: string;
}): Promise<{ success: boolean; message: string }> {
  const verified = await verifyStudentSubmissionAction(params);
  if (!verified.success || !verified.data) {
    return { success: false, message: verified.message };
  }

  const data = verified.data;
  const emailRes = await sendStudentSubmissionConfirmationEmail({
    studentEmail: data.studentEmail,
    studentName: data.studentName,
    registrationNumber: data.registrationNumber,
    formTitle: data.formTitle,
    academicYear: data.academicYear,
    branch: data.branch,
    semester: data.semester,
    submittedAt: data.submittedAt,
    downloadUrl: data.downloadUrl,
  });

  if (emailRes.status === 'SENT') {
    return {
      success: true,
      message: `Confirmation email successfully dispatched to ${data.studentEmail}.`,
    };
  } else if (emailRes.status === 'EMAIL_NOT_CONFIGURED') {
    return {
      success: false,
      message: 'Email service is not configured on the institution server. Please use "Download My Response" directly.',
    };
  } else {
    return {
      success: false,
      message: `Failed to dispatch email: ${emailRes.error || 'Unknown error'}`,
    };
  }
}
