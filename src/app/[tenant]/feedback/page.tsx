import Link from 'next/link';
import { resolveTenantOrNotFound } from '@/lib/tenant/resolver';
import { getCachedAcademicMasters } from '@/lib/supabase/academic-cache';
import { getPublicActiveFormsAction } from '@/app/feedback/actions';
import { StudentDiscoveryFlow } from '@/components/public/StudentDiscoveryFlow';
import { AllFeedbackFormsSection } from '@/components/public/AllFeedbackFormsSection';
import { School, ArrowLeft, ShieldCheck, GraduationCap } from 'lucide-react';
import type { AcademicYear, Branch, Semester } from '@/types/database';

export const dynamic = 'force-dynamic';

interface TenantFeedbackPageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export default async function TenantFeedbackPortalPage({ params }: TenantFeedbackPageProps) {
  const { tenant: rawSlug } = await params;
  const tenant = await resolveTenantOrNotFound(rawSlug);

  // Fetch tenant-scoped academic masters and active forms
  const [{ academicYears, branches, semesters }, initialActiveForms] = await Promise.all([
    getCachedAcademicMasters(tenant.collegeId),
    getPublicActiveFormsAction({ page: 1, pageSize: 12, collegeId: tenant.collegeId }),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-1 sm:gap-2 text-center sm:text-left">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">Feedback Management System • {tenant.name}</span>
          </div>
          <Link
            href={`/${tenant.slug}`}
            className="text-slate-300 hover:text-white flex items-center gap-1 text-[10px] sm:text-xs shrink-0"
          >
            <ArrowLeft className="w-3 h-3" /> {tenant.shortName} Home
          </Link>
        </div>
      </div>

      {/* Header with Tenant Branding */}
      <header className="bg-white border-b border-slate-200 shadow-xs sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex justify-between items-center gap-2">
          <Link href={`/${tenant.slug}`} className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-slate-900 to-blue-900 text-amber-400 flex items-center justify-center font-bold text-base sm:text-lg shadow-md border border-slate-800 shrink-0">
              <School className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                {tenant.name}
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                Student Feedback & Faculty Evaluation Portal ({tenant.shortName})
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 sm:px-3 py-1.5 rounded-full border border-emerald-200 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="hidden sm:inline">100% Anonymous • No Login Required</span>
            <span className="sm:hidden text-[11px]">100% Anonymous</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-2">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Student Feedback Portal</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Find & Submit Your Faculty Feedback
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Select your academic session, department, semester, faculty member, and subject below to access your real Google Feedback Form for {tenant.shortName}.
          </p>
        </div>

        <StudentDiscoveryFlow
          academicYears={(academicYears as AcademicYear[]) || []}
          branches={(branches as Branch[]) || []}
          semesters={(semesters as Semester[]) || []}
          collegeId={tenant.collegeId}
        />

        {/* All Currently Active Feedback Forms Section for this Tenant */}
        <AllFeedbackFormsSection initialData={initialActiveForms} collegeId={tenant.collegeId} />
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-6 px-4 border-t border-slate-800 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-center sm:text-left">
          <div>
            <span>{tenant.name} ({tenant.shortName}) • Official Student Evaluation Portal</span>
            <div className="text-[11px] text-slate-400 mt-1">
              Developed by{' '}
              <a
                href="https://portfolio-two-ashen-zseywond41.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline font-medium"
              >
                Aditya Kumar Sah
              </a>
              {' '}•{' '}
              <a
                href="https://portfolio-two-ashen-zseywond41.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-200 hover:underline transition-colors"
              >
                Portfolio
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/${tenant.slug}`} className="text-slate-300 hover:text-white transition-colors">
              Portal Home
            </Link>
            <span className="text-slate-600">•</span>
            <Link href={`/${tenant.slug}/admin/login`} className="text-amber-400 hover:underline">
              Admin Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
