import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { createClient } from '@/lib/supabase/server';
import { FeedbackForm, AuditLog } from '@/types/database';
import { FormDetailConsole } from '@/components/admin/forms/FormDetailConsole';
import { assertAnalyticsAccess } from '@/lib/billing/access-control';
import { syncFormResponsesToSheet } from '@/lib/google/sync';
import { isGoogleConfigured } from '@/lib/google/auth';

export const dynamic = 'force-dynamic';

export default async function FeedbackFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  const { id } = await params;
  const supabase = await createClient();

  // Fetch form with relations (with robust fallback)
  let form: any = null;
  const { data: joinedForm, error: joinErr } = await supabase
    .from('feedback_forms')
    .select(`
      *,
      faculty:faculties(*),
      subject:subjects(*),
      academic_year:academic_years(*),
      branch:branches(*),
      semester:semesters(*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (joinedForm) {
    form = joinedForm;
  } else {
    // Fallback: If relational join fails due to schema cache mismatch, fetch base record and resolve relations
    console.warn('Nested join failed for form ID', id, joinErr?.message, 'Trying base query...');
    const { data: baseForm, error: baseErr } = await supabase
      .from('feedback_forms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (baseForm) {
      const [
        { data: faculty },
        { data: subject },
        { data: year },
        { data: branch },
        { data: semester },
      ] = await Promise.all([
        supabase.from('faculties').select('*').eq('id', baseForm.faculty_id).maybeSingle(),
        supabase.from('subjects').select('*').eq('id', baseForm.subject_id).maybeSingle(),
        supabase.from('academic_years').select('*').eq('id', baseForm.academic_year_id).maybeSingle(),
        supabase.from('branches').select('*').eq('id', baseForm.branch_id).maybeSingle(),
        supabase.from('semesters').select('*').eq('id', baseForm.semester_id).maybeSingle(),
      ]);

      form = {
        ...baseForm,
        faculty,
        subject,
        academic_year: year,
        branch,
        semester,
      };
    } else {
      console.error('FeedbackFormDetailPage form not found for ID', id, ':', baseErr || joinErr);
      notFound();
    }
  }

  // Tenant authorization & boundary check
  if (!session.isPlatformSuperAdmin && form?.college_id) {
    const isAuthorized = session.colleges.some(
      (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
    );
    if (!isAuthorized || (session.activeCollegeId && form.college_id !== session.activeCollegeId)) {
      redirect('/admin/dashboard/forms');
    }
  }

  // Fetch form items if multi-faculty
  const { data: formItems } = await supabase
    .from('feedback_form_items')
    .select(`
      *,
      faculty:faculties(*),
      subject:subjects(*)
    `)
    .eq('form_id', id)
    .order('order_index');

  if (form) {
    form.items = formItems || [];
  }

  // Auto-sync responses if stale (>30s)
  if (form && isGoogleConfigured()) {
    const lastSyncedTime = form.last_synced_at ? new Date(form.last_synced_at).getTime() : 0;
    if (Date.now() - lastSyncedTime > 30 * 1000) {
      const resolvedFormId =
        form.google_form_id ||
        form.google_form_edit_url?.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
        form.google_form_url?.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      const resolvedSheetId =
        form.google_sheet_id ||
        form.google_sheet_url?.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];

      if (resolvedFormId && resolvedSheetId) {
        try {
          const syncRes = await syncFormResponsesToSheet({
            googleFormId: resolvedFormId,
            googleSheetId: resolvedSheetId,
            formId: id,
            callerSession: session,
            skipAuthCheck: true,
          });
          if (syncRes.success) {
            form.response_count = syncRes.totalResponses;
            form.last_synced_at = new Date().toISOString();
          }
        } catch (syncErr) {
          console.warn('Auto-sync on form detail page load notice:', syncErr);
        }
      }
    }
  }

  // Fetch audit logs for this form
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_id', id)
    .order('created_at', { ascending: false });

  // Check server-side analytics access permission
  const analyticsAccess = await assertAnalyticsAccess(session);

  return (
    <div className="space-y-6">
      <FormDetailConsole
        form={form as FeedbackForm}
        auditLogs={(auditLogs || []) as AuditLog[]}
        currentUserEmail={session.admin?.email || session.user?.email || ''}
        hasAnalyticsAccess={analyticsAccess.allowed}
      />
    </div>
  );

}
