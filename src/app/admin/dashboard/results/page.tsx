import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { createClient } from '@/lib/supabase/server';
import { getOverallAnalyticsAction } from '@/app/admin/results/actions';
import { ResultsDashboardClient } from '@/components/admin/results/ResultsDashboardClient';
import { AnalyticsAccessGate } from '@/components/admin/billing/AnalyticsAccessGate';
import { assertAnalyticsAccess } from '@/lib/billing/access-control';
import {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FeedbackForm,
} from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminResultsHubPage() {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  // Authoritative server-side analytics access check BEFORE any query/fetch
  const access = await assertAnalyticsAccess(session);

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <AnalyticsAccessGate isSuperAdmin={session.isSuperAdmin} returnUrl="/admin/dashboard" />
      </div>
    );
  }

  const supabase = await createClient();

  let formsQuery = supabase
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

  if (session.activeCollegeId) {
    formsQuery = formsQuery.eq('college_id', session.activeCollegeId);
  }

  // 1. Fetch Academic Entities for Filters
  const [
    { data: academicYears },
    { data: branches },
    { data: semesters },
    { data: faculties },
    { data: subjects },
    { data: forms },
  ] = await Promise.all([
    supabase.from('academic_years').select('*').order('name', { ascending: false }),
    supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('semesters').select('*').order('number', { ascending: true }),
    supabase.from('faculties').select('*').order('name', { ascending: true }),
    supabase.from('subjects').select('*').order('name', { ascending: true }),
    formsQuery,
  ]);

  // 2. Fetch Initial Aggregated Analytics Report
  const analyticsRes = await getOverallAnalyticsAction();

  const initialReport = analyticsRes.report || {
    scopeTitle: 'Institution-Wide (All Active Feedback)',
    filters: {},
    totalForms: (forms || []).length,
    formsWithResponses: 0,
    totalResponses: 0,
    validResponses: 0,
    averageOverallScore: 0,
    compositeAverageScore: 0,
    parameters: [],
    distribution: {
      excellentCount: 0,
      veryGoodCount: 0,
      goodCount: 0,
      satisfactoryCount: 0,
      unsatisfactoryCount: 0,
      totalValidRatings: 0,
      excellentPct: 0,
      veryGoodPct: 0,
      goodPct: 0,
      satisfactoryPct: 0,
      unsatisfactoryPct: 0,
    },
    facultyComparisons: [],
    hasData: false,
    generatedAt: new Date().toISOString(),
  };

  return (
    <ResultsDashboardClient
      initialReport={initialReport}
      academicYears={(academicYears || []) as AcademicYear[]}
      branches={(branches || []) as Branch[]}
      semesters={(semesters || []) as Semester[]}
      faculties={(faculties || []) as Faculty[]}
      subjects={(subjects || []) as Subject[]}
      forms={(forms || []) as FeedbackForm[]}
    />
  );
}
