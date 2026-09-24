import type { Metadata } from 'next';
import { resolveTenantOrNotFound } from '@/lib/tenant/resolver';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { CollegePwaInstallPrompt } from '@/components/pwa/CollegePwaInstallPrompt';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    tenant: string;
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant: rawSlug } = await params;
  try {
    const tenant = await resolveTenantOrNotFound(rawSlug);

    const title = `${tenant.name} | Faculty Feedback Portal`;
    const description = `Official Faculty Evaluation & Feedback Management System for ${tenant.name} (${tenant.shortName || tenant.code}). Submit anonymous institutional feedback.`;

    return {
      title: {
        default: title,
        template: `%s | ${tenant.shortName || tenant.name}`,
      },
      description,
      manifest: `/api/manifest/${tenant.slug}`,
      appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: tenant.shortName || tenant.name,
      },
      applicationName: `${tenant.shortName || tenant.name} Feedback`,
      icons: {
        icon: tenant.logo
          ? [
              { url: tenant.logo, sizes: 'any' },
              { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ]
          : [
              { url: '/favicon.ico', sizes: '32x32' },
              { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
        apple: tenant.logo
          ? [{ url: tenant.logo, sizes: '180x180' }]
          : [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
      },
    };
  } catch {
    return {
      title: 'College Feedback Portal',
    };
  }
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { tenant: rawSlug } = await params;
  const tenant = await resolveTenantOrNotFound(rawSlug);

  return (
    <TenantProvider tenant={tenant}>
      {children}
      <CollegePwaInstallPrompt tenant={tenant} />
    </TenantProvider>
  );
}
