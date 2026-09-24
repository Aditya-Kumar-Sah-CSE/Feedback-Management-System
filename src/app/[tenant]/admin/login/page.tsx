import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveTenantOrNotFound } from '@/lib/tenant/resolver';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { TenantLoginForm } from '@/components/admin/TenantLoginForm';
import { School, Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TenantAdminLoginPageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export async function generateMetadata({ params }: TenantAdminLoginPageProps): Promise<Metadata> {
  const { tenant: rawSlug } = await params;
  const tenant = await resolveTenantOrNotFound(rawSlug);

  return {
    title: `${tenant.name} (${tenant.shortName}) Admin Login | Feedback Management System`,
    description: `Administrator sign-in portal for ${tenant.name} faculty feedback evaluations.`,
  };
}

export default async function TenantAdminLoginPage({ params }: TenantAdminLoginPageProps) {
  const { tenant: rawSlug } = await params;
  const tenant = await resolveTenantOrNotFound(rawSlug);

  const session = await getAdminSession();
  if (session.isAuthenticated && session.isActive) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-5 sm:py-12 px-2.5 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Dynamic Institution Logo or Monogram */}
        <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 p-0.5 shadow-xl flex items-center justify-center border border-slate-700">
          <div className="w-full h-full bg-slate-900 rounded-2xl flex items-center justify-center p-2 sm:p-2.5 overflow-hidden">
            {tenant.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo}
                alt={`${tenant.name} Logo`}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <School className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400" />
            )}
          </div>
        </div>

        {/* Institution Branding */}
        <div className="mt-3.5 sm:mt-4">
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 mb-2">
            Institutional Admin Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight">
            {tenant.name}
          </h1>
          <p className="mt-1 text-xs text-slate-400 font-medium">
            {tenant.code} • Faculty Feedback Management System
          </p>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 sm:mx-auto sm:w-full sm:max-w-md px-1 sm:px-0">
        <Suspense
          fallback={
            <div className="bg-slate-800/90 py-12 px-6 rounded-2xl border border-slate-700/60 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
              <p className="text-xs text-slate-400">Loading {tenant.shortName} admin portal...</p>
            </div>
          }
        >
          <TenantLoginForm
            collegeId={tenant.collegeId}
            collegeSlug={tenant.slug}
            collegeName={tenant.name}
            collegeCode={tenant.code}
            isTenantSpecific={true}
          />
        </Suspense>

        <div className="mt-6 text-center text-xs text-slate-500">
          <span>Protected institutional system. Authorized faculty and administrators only.</span>
        </div>
      </div>
    </div>
  );
}
