import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { getFormAnalyticsAction } from '@/app/admin/results/actions';
import { FormResultsConsole } from '@/components/admin/results/FormResultsConsole';
import { AnalyticsAccessGate } from '@/components/admin/billing/AnalyticsAccessGate';
import { assertAnalyticsAccess } from '@/lib/billing/access-control';

export const dynamic = 'force-dynamic';

export default async function FormResultsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  const { id } = await params;
  if (!id) {
    notFound();
  }

  // Authoritative server-side analytics access check BEFORE any query/fetch
  const access = await assertAnalyticsAccess(session);

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <AnalyticsAccessGate isSuperAdmin={session.isSuperAdmin} formId={id} />
      </div>
    );
  }

  const res = await getFormAnalyticsAction(id);

  if (!res.success || !res.report) {
    notFound();
  }

  return <FormResultsConsole initialReport={res.report} />;
}
