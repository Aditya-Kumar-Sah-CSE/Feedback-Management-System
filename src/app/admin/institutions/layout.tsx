import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { AdminHeaderSignOut } from '@/components/admin/AdminHeaderSignOut';
import { TenantSwitcher } from '@/components/admin/TenantSwitcher';
import { School, ShieldCheck, ArrowLeft, LayoutDashboard } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminInstitutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  if (session.isPending) {
    redirect('/admin/pending');
  }

  // Strictly enforce PLATFORM_SUPER_ADMIN access
  if (!session.isPlatformSuperAdmin) {
    redirect('/admin/dashboard');
  }

  const adminName = session.name || 'Platform Super Admin';
  const adminEmail = session.email || '';
  const activeCollege = session.activeCollege;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 w-full max-w-full overflow-x-hidden">
      {/* Admin Top Header */}
      <header className="bg-bce-navy text-white border-b border-bce-cobalt/60 shadow-md sticky top-0 z-40 w-full min-w-0">
        <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white flex items-center justify-center font-bold text-sm sm:text-lg shadow-sm border border-slate-200 shrink-0 overflow-hidden p-1">
              {activeCollege?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeCollege.logoUrl}
                  alt={`${activeCollege.name} Logo`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-bce-cobalt to-amber-500 rounded-lg flex items-center justify-center text-amber-300">
                  <School className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-xs sm:text-base tracking-tight text-white truncate">
                  Platform Administration
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                  Super Admin
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">
                Active Tenant: {activeCollege ? activeCollege.name : 'All Institutions'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Multi-Tenant Switcher */}
            <TenantSwitcher
              colleges={session.colleges}
              activeCollegeId={session.activeCollegeId}
              isPlatformSuperAdmin={session.isPlatformSuperAdmin}
            />

            {/* User Profile Badge */}
            <div className="hidden sm:flex flex-col items-end text-right">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white">{adminName}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs">
                  <ShieldCheck className="w-3 h-3" /> Super Admin
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{adminEmail}</span>
            </div>

            {/* Back to Dashboard Link */}
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-slate-800/90 hover:bg-slate-800 hover:text-amber-200 border border-amber-500/30 transition-colors"
              title="Return to Main Dashboard"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Dashboard</span>
            </Link>

            <Link
              href={activeCollege ? `/${activeCollege.slug}` : '/'}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-white border border-slate-700 transition-colors"
              title="View Public Portal"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden md:inline">View Public Portal</span>
            </Link>

            <AdminHeaderSignOut />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 min-w-0">
        {children}
      </main>

      {/* Admin Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-3 sm:px-4 text-center text-xs text-slate-500 mt-auto w-full min-w-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>Institutional Feedback Platform • Super Admin Console</span>
          <span className="truncate max-w-full">
            Authenticated as: <strong className="text-slate-700 font-mono">{adminEmail}</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
