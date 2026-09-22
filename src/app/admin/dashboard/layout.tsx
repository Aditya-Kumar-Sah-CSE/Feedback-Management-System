import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { AdminHeaderSignOut } from '@/components/admin/AdminHeaderSignOut';
import { TenantSwitcher } from '@/components/admin/TenantSwitcher';
import { School, ShieldCheck, UserCheck, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDashboardLayout({
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

  if (!session.isActive) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-red-800/80 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-900/50 text-red-400 mx-auto flex items-center justify-center font-bold text-xl">
            !
          </div>
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-xs text-slate-300">
            Your administrator account is currently marked as <strong>INACTIVE</strong> or has no institutional memberships. Please contact the Super Admin for activation.
          </p>
          <div className="pt-2">
            <AdminHeaderSignOut />
          </div>
        </div>
      </div>
    );
  }

  const isSuper = session.isPlatformSuperAdmin;
  const adminName = session.name || 'Administrator';
  const adminEmail = session.email || '';
  const activeCollege = session.activeCollege;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 w-full max-w-full overflow-x-hidden">
      {/* Admin Top Header */}
      <header className="bg-bce-navy text-white border-b border-bce-cobalt/60 shadow-md sticky top-0 z-40 w-full min-w-0">
        <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-bce-cobalt to-amber-500 flex items-center justify-center font-bold text-sm sm:text-lg shadow-sm border border-amber-400/30 text-amber-300 shrink-0">
              <School className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-xs sm:text-base tracking-tight text-white truncate">
                  {activeCollege ? activeCollege.code : 'FMS'} Feedback
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                  Admin
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">
                Active College: {activeCollege ? activeCollege.name : 'Select Institution'}
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
                {isSuper ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs">
                    <ShieldCheck className="w-3 h-3" /> Super Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-500 text-white">
                    <UserCheck className="w-3 h-3" /> Admin
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{adminEmail}</span>
            </div>

            <Link
              href="/"
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

      {/* Main Admin Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 min-w-0">
        {children}
      </main>

      {/* Admin Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-3 sm:px-4 text-center text-xs text-slate-500 mt-auto w-full min-w-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>BCE Faculty Feedback Management System • Phase 1 Foundation</span>
          <span className="truncate max-w-full">Authenticated as: <strong className="text-slate-700 font-mono">{adminEmail}</strong></span>
        </div>
      </footer>
    </div>
  );
}
