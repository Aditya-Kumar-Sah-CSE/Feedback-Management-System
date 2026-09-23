import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { redirect } from 'next/navigation';
import { getGoogleConfigStatus } from '@/lib/google/auth';
import { CreateGoogleFormWizard } from '@/components/admin/forms/CreateGoogleFormWizard';
import { FormAccessGate } from '@/components/admin/billing/FormAccessGate';
import type {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FacultySubjectAssignment,
} from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function CreateFeedbackFormPage() {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  const supabase = await createClient();
  const googleStatus = await getGoogleConfigStatus(session.activeCollegeId || undefined);

  let yearsQuery = supabase.from('academic_years').select('id, name, is_active').order('name', { ascending: false });
  let branchesQuery = supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name');
  let semestersQuery = supabase.from('semesters').select('id, name, semester_number, is_active').order('semester_number');
  let facultiesQuery = supabase.from('faculties').select('id, name, department, is_active').order('name');
  let subjectsQuery = supabase.from('subjects').select('id, name, code, branch_id, semester_id, is_active').order('name');
  let assignmentsQuery = supabase.from('faculty_subject_assignments').select('id, faculty_id, subject_id, academic_year_id, branch_id, semester_id, is_active').eq('is_active', true);

  if (session.activeCollegeId) {
    yearsQuery = yearsQuery.eq('college_id', session.activeCollegeId);
    branchesQuery = branchesQuery.eq('college_id', session.activeCollegeId);
    semestersQuery = semestersQuery.eq('college_id', session.activeCollegeId);
    facultiesQuery = facultiesQuery.eq('college_id', session.activeCollegeId);
    subjectsQuery = subjectsQuery.eq('college_id', session.activeCollegeId);
    assignmentsQuery = assignmentsQuery.eq('college_id', session.activeCollegeId);
  }

  // Fetch active academic masters with lean column projections
  const [
    { data: years },
    { data: branches },
    { data: semesters },
    { data: faculties },
    { data: subjects },
    { data: assignments },
  ] = await Promise.all([
    yearsQuery,
    branchesQuery,
    semestersQuery,
    facultiesQuery,
    subjectsQuery,
    assignmentsQuery,
  ]);

  return (
    <div className="space-y-6">
      <FormAccessGate isSuperAdmin={session.isSuperAdmin}>
        <CreateGoogleFormWizard
          academicYears={(years as unknown as AcademicYear[]) || []}
          branches={(branches as unknown as Branch[]) || []}
          semesters={(semesters as unknown as Semester[]) || []}
          faculties={(faculties as unknown as Faculty[]) || []}
          subjects={(subjects as unknown as Subject[]) || []}
          assignments={(assignments as unknown as FacultySubjectAssignment[]) || []}
          googleStatus={googleStatus}
        />
      </FormAccessGate>
    </div>
  );
}

