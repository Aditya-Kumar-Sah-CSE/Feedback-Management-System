import Link from 'next/link';
import { resolveTenantOrNotFound } from '@/lib/tenant/resolver';
import { getCachedAcademicMasters } from '@/lib/supabase/academic-cache';
import { getPublicActiveFormsAction } from '@/app/feedback/actions';
import { StudentDiscoveryFlow } from '@/components/public/StudentDiscoveryFlow';
import { AllFeedbackFormsSection } from '@/components/public/AllFeedbackFormsSection';
import { School, UserCheck, ArrowRight, ExternalLink } from 'lucide-react';
import type { Branch, AcademicYear, Semester } from '@/types/database';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TenantPageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export default async function TenantHomePage({ params }: TenantPageProps) {
  const { tenant: rawSlug } = await params;
  const tenant = await resolveTenantOrNotFound(rawSlug);

  // Fetch tenant-scoped academic data and active forms
  const [{ academicYears, branches, semesters }, initialActiveForms] = await Promise.all([
    getCachedAcademicMasters(tenant.collegeId),
    getPublicActiveFormsAction({ page: 1, pageSize: 12, collegeId: tenant.collegeId }),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-1 sm:gap-2 text-center sm:text-left">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">Feedback Management System (FMS) • {tenant.name}</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-slate-300 text-[10px] sm:text-xs">
            {tenant.websiteUrl && (
              <>
                <a
                  href={tenant.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-amber-300 transition-colors flex items-center gap-1"
                >
                  Official Website <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span>•</span>
              </>
            )}
            <Link href={`/${tenant.slug}/admin/login`} className="hover:text-amber-300 transition-colors flex items-center gap-1 font-medium">
              Admin Portal <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Header with Tenant Branding */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex justify-between items-center gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-slate-900 to-blue-900 text-amber-400 flex items-center justify-center font-bold text-lg sm:text-xl shadow-md border border-slate-800 shrink-0">
              <School className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold tracking-tight text-slate-900 truncate sm:whitespace-normal">
                {tenant.name}
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate sm:whitespace-normal">
                Faculty Feedback & Evaluation Portal ({tenant.shortName})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/${tenant.slug}/feedback`}
              className="hidden md:inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Browse All Forms
            </Link>
            <Link
              href={`/${tenant.slug}/admin/login`}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-all shrink-0 active:scale-98"
            >
              <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="hidden sm:inline">Faculty / Admin Login</span>
              <span className="sm:hidden font-semibold">Admin</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Discovery Flow Area */}
      <main id="discovery-section" className="flex-1 max-w-6xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-6 sm:py-10 scroll-mt-14">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Find Your Feedback Form
            </h2>
            <p className="text-sm text-slate-500">
              Follow the discovery path: Year → Branch → Semester → Faculty & Subject.
            </p>
          </div>
        </div>

        {/* Client-side cascading discovery component */}
        <StudentDiscoveryFlow
          academicYears={(academicYears as AcademicYear[]) || []}
          branches={(branches as Branch[]) || []}
          semesters={(semesters as Semester[]) || []}
        />

        {/* All Published Forms Grid for this Tenant */}
        <div className="mt-14">
          <AllFeedbackFormsSection initialData={initialActiveForms} />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-medium text-slate-700">
            {tenant.name} ({tenant.shortName})
          </p>
          <p>
            Multi-Tenant Feedback Management System • Confidential & Anonymous Institutional Feedback
          </p>
          <p className="text-[11px] text-slate-400">
            Powered by FMS Platform • Secure Tenant: <code className="text-slate-600 font-mono">{tenant.slug}</code>
          </p>
        </div>
      </footer>
    </div>
  );
}
