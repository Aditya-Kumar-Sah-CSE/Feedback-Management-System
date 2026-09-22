import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { canAccessAnalytics } from '@/lib/billing/access-control';
import { getGoogleConfigStatus } from '@/lib/google/auth';
import { GoogleConnectionCard } from '@/components/admin/GoogleConnectionCard';
import { AdminDashboardTabs } from '@/components/admin/AdminDashboardTabs';
import type {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FacultySubjectAssignment,
  Admin,
  AdminRequest,
  FeedbackForm,
  AuditLog
} from '@/types/database';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDashboardPage() {
  const session = await getAdminSession();

  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  if (session.isPending) {
    redirect('/admin/pending');
  }

  const supabase = await createClient();
  const adminDb = createAdminClient() || supabase;

  const activeCollegeId = session.activeCollegeId;

  // Build queries scoped to active college
  let yearQuery = supabase.from('academic_years').select('id, name, is_active, created_at').order('name', { ascending: false });
  let branchQuery = supabase.from('branches').select('id, name, code, is_active, created_at').order('name', { ascending: true });
  let semesterQuery = supabase.from('semesters').select('id, name, year_number, semester_number, is_active, created_at').order('semester_number', { ascending: true });
  let facultyQuery = supabase.from('faculties').select('id, name, employee_id, department, designation, is_active, created_at', { count: 'exact' }).order('name', { ascending: true }).range(0, 19);
  let subjectQuery = supabase.from('subjects').select('id, name, code, semester_id, branch_id, is_active, created_at', { count: 'exact' }).order('code', { ascending: true }).range(0, 19);
  let assignQuery = supabase.from('faculty_subject_assignments').select('id, faculty_id, subject_id, academic_year_id, branch_id, semester_id, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(0, 19);
  let formQuery = supabase.from('feedback_forms').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(0, 49);
  let auditQuery = adminDb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
  let activeFacultyCountQuery = supabase.from('faculties').select('id', { count: 'exact', head: true }).eq('is_active', true);
  let activeSubjectCountQuery = supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('is_active', true);
  let pubFormCountQuery = supabase.from('feedback_forms').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED');

  if (activeCollegeId) {
    yearQuery = yearQuery.eq('college_id', activeCollegeId);
    branchQuery = branchQuery.eq('college_id', activeCollegeId);
    semesterQuery = semesterQuery.eq('college_id', activeCollegeId);
    facultyQuery = facultyQuery.eq('college_id', activeCollegeId);
    subjectQuery = subjectQuery.eq('college_id', activeCollegeId);
    assignQuery = assignQuery.eq('college_id', activeCollegeId);
    formQuery = formQuery.eq('college_id', activeCollegeId);
    activeFacultyCountQuery = activeFacultyCountQuery.eq('college_id', activeCollegeId);
    activeSubjectCountQuery = activeSubjectCountQuery.eq('college_id', activeCollegeId);
    pubFormCountQuery = pubFormCountQuery.eq('college_id', activeCollegeId);
    auditQuery = auditQuery.eq('college_id', activeCollegeId);
  }

  // Parallel lean data fetching for the admin portal with exact counts & range limits
  const [
    { data: academicYears },
    { data: branches },
    { data: semesters },
    { data: faculties, count: totalFacultiesCount },
    { data: subjects, count: totalSubjectsCount },
    { data: assignments, count: totalAssignmentsCount },
    { data: adminRequests, error: adminReqError },
    { data: adminsList, error: adminsListError },
    { data: feedbackForms, count: totalFormsCount },
    { data: auditLogs },
    { count: activeFacultiesCount },
    { count: activeSubjectsCount },
    { count: publishedFormsCount },
  ] = await Promise.all([
    yearQuery,
    branchQuery,
    semesterQuery,
    facultyQuery,
    subjectQuery,
    assignQuery,
    adminDb.from('college_admin_requests').select('*').order('created_at', { ascending: false }),
    (activeCollegeId
      ? adminDb.from('college_memberships').select('id, user_id, role, status, created_at, college_id').eq('college_id', activeCollegeId).order('created_at', { ascending: false })
      : adminDb.from('college_memberships').select('id, user_id, role, status, created_at, college_id').order('created_at', { ascending: false })
    ),
    formQuery,
    auditQuery,
    activeFacultyCountQuery,
    activeSubjectCountQuery,
    pubFormCountQuery,
  ]);

  // Structured logging for admin request queries
  if (adminReqError) {
    console.error('[ADMIN_REQUEST_QUERY]', { error: adminReqError.message, code: adminReqError.code });
  } else {
    console.log('[ADMIN_REQUEST_QUERY]', { count: adminRequests?.length ?? 0 });
  }
  if (adminsListError) {
    console.error('[ADMINS_LIST_QUERY]', { error: adminsListError.message, code: adminsListError.code });
  }

  // Resolve admin user profiles from auth.users (strictly replacing legacy admins table)
  let resolvedAdminsList: Admin[] = [];
  if (adminsList && adminsList.length > 0) {
    try {
      const { data: usersData } = await adminDb.auth.admin.listUsers();
      const userMap = new Map((usersData?.users || []).map((u: any) => [u.id, u]));
      resolvedAdminsList = adminsList.map((m: any) => {
        const u = userMap.get(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          email: u?.email || 'admin@college.local',
          name: (u?.user_metadata?.name as string) || (u?.email ? u.email.split('@')[0] : 'Administrator'),
          role: m.role as any,
          status: m.status as any,
          created_at: m.created_at,
        };
      });
    } catch {
      resolvedAdminsList = adminsList.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        email: 'admin@college.local',
        name: 'Administrator',
        role: m.role as any,
        status: m.status as any,
        created_at: m.created_at,
      }));
    }
  }

  const counts = {
    totalFaculties: totalFacultiesCount ?? (faculties?.length || 0),
    activeFaculties: activeFacultiesCount ?? 0,
    totalSubjects: totalSubjectsCount ?? (subjects?.length || 0),
    activeSubjects: activeSubjectsCount ?? 0,
    totalAssignments: totalAssignmentsCount ?? (assignments?.length || 0),
    totalForms: totalFormsCount ?? (feedbackForms?.length || 0),
    publishedForms: publishedFormsCount ?? 0,
  };

  const hasFullAnalytics = await canAccessAnalytics(session);

  const googleStatus = activeCollegeId ? await getGoogleConfigStatus(activeCollegeId) : null;

  return (
    <div className="space-y-6">
      {activeCollegeId && (
        <GoogleConnectionCard
          collegeId={activeCollegeId}
          collegeName={session.activeCollege?.name || 'Your Institution'}
          status={{
            connected: Boolean(googleStatus?.configured),
            status: googleStatus?.status || 'NOT_CONNECTED',
            accountEmail: googleStatus?.accountEmail,
            accountName: googleStatus?.accountName,
            connectedAt: googleStatus?.connectedAt,
          }}
        />
      )}
      <AdminDashboardTabs
        academicYears={(academicYears as AcademicYear[]) || []}
        branches={(branches as Branch[]) || []}
        semesters={(semesters as Semester[]) || []}
        faculties={(faculties as Faculty[]) || []}
        subjects={(subjects as Subject[]) || []}
        assignments={(assignments as FacultySubjectAssignment[]) || []}
        adminRequests={(adminRequests as AdminRequest[]) || []}
        adminsList={resolvedAdminsList}
        feedbackForms={(feedbackForms as FeedbackForm[]) || []}
        auditLogs={(auditLogs as AuditLog[]) || []}
        isSuperAdmin={session.isSuperAdmin}
        hasFullAnalytics={hasFullAnalytics}
        currentUserEmail={session.admin?.email || session.user?.email || ''}
        counts={counts}
        adminReqError={adminReqError ? adminReqError.message : null}
      />
    </div>
  );
}
