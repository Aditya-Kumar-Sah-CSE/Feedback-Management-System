import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { canAccessAnalytics } from '@/lib/billing/access-control';
import { getGoogleConfigStatus } from '@/lib/google/auth';
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
  const targetCollegeId = activeCollegeId || '00000000-0000-0000-0000-000000000000';

  // Build queries strictly scoped to active college (fail-closed)
  const yearQuery = supabase.from('academic_years').select('id, name, is_active, created_at').eq('college_id', targetCollegeId).order('name', { ascending: false });
  const branchQuery = supabase.from('branches').select('id, name, code, is_active, created_at').eq('college_id', targetCollegeId).order('name', { ascending: true });
  const semesterQuery = supabase.from('semesters').select('id, name, year_number, semester_number, is_active, created_at').eq('college_id', targetCollegeId).order('semester_number', { ascending: true });
  const facultyQuery = supabase.from('faculties').select('id, name, employee_id, department, designation, is_active, created_at', { count: 'exact' }).eq('college_id', targetCollegeId).order('name', { ascending: true }).range(0, 19);
  const subjectQuery = supabase.from('subjects').select('id, name, code, semester_id, branch_id, is_active, created_at', { count: 'exact' }).eq('college_id', targetCollegeId).order('code', { ascending: true }).range(0, 19);
  const assignQuery = supabase.from('faculty_subject_assignments').select('id, faculty_id, subject_id, academic_year_id, branch_id, semester_id, created_at', { count: 'exact' }).eq('college_id', targetCollegeId).order('created_at', { ascending: false }).range(0, 19);
  const formQuery = supabase.from('feedback_forms').select('*', { count: 'exact' }).eq('college_id', targetCollegeId).order('created_at', { ascending: false }).range(0, 49);
  const auditQuery = adminDb.from('audit_logs').select('*').eq('college_id', targetCollegeId).order('created_at', { ascending: false }).limit(20);
  const activeFacultyCountQuery = supabase.from('faculties').select('id', { count: 'exact', head: true }).eq('college_id', targetCollegeId).eq('is_active', true);
  const activeSubjectCountQuery = supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('college_id', targetCollegeId).eq('is_active', true);
  const pubFormCountQuery = supabase.from('feedback_forms').select('id', { count: 'exact', head: true }).eq('college_id', targetCollegeId).eq('status', 'PUBLISHED');

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
    (session.isPlatformSuperAdmin
      ? adminDb.from('college_admin_requests').select('*, colleges(id, name, code, slug)').order('created_at', { ascending: false })
      : adminDb.from('college_admin_requests').select('*, colleges(id, name, code, slug)').eq('college_id', targetCollegeId).order('created_at', { ascending: false })
    ),
    adminDb.from('college_memberships').select('id, user_id, role, status, created_at, college_id, colleges(id, name, code, slug)').eq('college_id', targetCollegeId).order('created_at', { ascending: false }),
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
  try {
    const { data: usersData } = await adminDb.auth.admin.listUsers();
    const userMap = new Map((usersData?.users || []).map((u: any) => [u.id, u]));

    // 1. Fetch active platform admins to identify all current Super Admins
    const { data: platformAdmins } = await adminDb
      .from('platform_admins')
      .select('id, user_id, role, is_active, created_at')
      .eq('is_active', true);

    const activePlatformAdminMap = new Map(
      (platformAdmins || []).map((pa: any) => [pa.user_id, pa])
    );

    // 2. Resolve college membership admins
    if (adminsList && adminsList.length > 0) {
      resolvedAdminsList = adminsList.map((m: any) => {
        const u = userMap.get(m.user_id);
        const isSuper = activePlatformAdminMap.has(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          college_id: m.college_id,
          college: m.colleges || null,
          email: u?.email || 'admin@college.local',
          name: (u?.user_metadata?.name as string) || (u?.email ? u.email.split('@')[0] : 'Administrator'),
          role: (isSuper ? 'SUPER_ADMIN' : 'ADMIN') as any,
          status: m.status as any,
          created_at: m.created_at,
        };
      });
    }

    // 3. Always inject Platform Super Admins who don't have a direct membership record for this college
    if (platformAdmins && platformAdmins.length > 0) {
      const existingUserIds = new Set(resolvedAdminsList.map((a) => a.user_id));
      for (const pa of platformAdmins) {
        if (!existingUserIds.has(pa.user_id)) {
          const u = userMap.get(pa.user_id);
          resolvedAdminsList.unshift({
            id: pa.id,
            user_id: pa.user_id,
            college_id: null as any,
            college: null,
            email: u?.email || 'admin@platform.local',
            name: (u?.user_metadata?.name as string) || (u?.email ? u.email.split('@')[0] : 'Platform Admin'),
            role: 'SUPER_ADMIN' as any,
            status: 'ACTIVE' as any,
            created_at: pa.created_at,
          });
        }
      }
    }
  } catch {
    resolvedAdminsList = (adminsList || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      college_id: m.college_id,
      college: m.colleges || null,
      email: 'admin@college.local',
      name: 'Administrator',
      role: 'ADMIN' as any,
      status: m.status as any,
      created_at: m.created_at,
    }));
  }

  const resolvedAdminRequests: AdminRequest[] = (adminRequests || []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    college_id: r.college_id,
    email: r.email,
    name: r.name,
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    college: r.colleges || null,
  }));

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
      <AdminDashboardTabs
        academicYears={(academicYears as AcademicYear[]) || []}
        branches={(branches as Branch[]) || []}
        semesters={(semesters as Semester[]) || []}
        faculties={(faculties as Faculty[]) || []}
        subjects={(subjects as Subject[]) || []}
        assignments={(assignments as FacultySubjectAssignment[]) || []}
        adminRequests={resolvedAdminRequests}
        adminsList={resolvedAdminsList}
        feedbackForms={(feedbackForms as FeedbackForm[]) || []}
        auditLogs={(auditLogs as AuditLog[]) || []}
        isSuperAdmin={session.isSuperAdmin}
        hasFullAnalytics={hasFullAnalytics}
        currentUserEmail={session.admin?.email || session.user?.email || ''}
        currentUserName={session.name || session.user?.user_metadata?.name || ''}
        counts={counts}
        adminReqError={adminReqError ? adminReqError.message : null}
        activeCollegeId={activeCollegeId || undefined}
        activeCollegeName={session.activeCollege?.name || 'Your Institution'}
        activeCollegeCode={session.activeCollege?.code || undefined}
        activeCollegeSlug={session.activeCollege?.slug || undefined}
        googleStatus={
          googleStatus
            ? {
                connected: Boolean(googleStatus.configured),
                status: googleStatus.status || 'NOT_CONNECTED',
                accountEmail: googleStatus.accountEmail,
                accountName: googleStatus.accountName,
                connectedAt: googleStatus.connectedAt,
              }
            : null
        }
      />
    </div>
  );
}
