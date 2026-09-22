import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TenantLoginForm } from '@/components/admin/TenantLoginForm';
import { School, Loader2, Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Platform Admin Login | Feedback Management System',
  description: 'Multi-tenant administrator sign-in portal for institutional feedback evaluations.',
};

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Platform Identity */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-amber-500 p-0.5 shadow-xl flex items-center justify-center">
          <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
            <School className="w-7 h-7 text-amber-400" />
          </div>
        </div>

        <div className="mt-4">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 mb-2">
            <Shield className="w-3 h-3" /> Platform Administration
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Feedback Management System
          </h1>
          <p className="mt-1 text-xs text-slate-400 font-medium">
            Super Admin & Institutional Portal Sign In
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Suspense
          fallback={
            <div className="bg-slate-800/90 py-12 px-6 rounded-2xl border border-slate-700/60 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
              <p className="text-xs text-slate-400">Loading admin portal...</p>
            </div>
          }
        >
          <TenantLoginForm isTenantSpecific={false} />
        </Suspense>

        <div className="mt-6 text-center text-xs text-slate-500">
          <span>Multi-tenant institutional system • Authorized access only</span>
        </div>
      </div>
    </div>
  );
}
