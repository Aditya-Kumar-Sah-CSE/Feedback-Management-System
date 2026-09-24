import { NextResponse, type NextRequest } from 'next/server';
import { getTenantBySlug } from '@/lib/tenant/resolver';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // 60s cache TTL

function getIconMimeType(url: string): string {
  const cleanUrl = url.toLowerCase();
  if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: 'Missing college slug' }, { status: 400 });
    }

    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 });
    }

    const collegeName = tenant.name;
    const shortName = tenant.shortName || tenant.code || 'College';
    const primaryColor = tenant.branding?.primaryColor || '#0B192C';

    const manifest = {
      $schema: 'https://json.schemastore.org/web-manifest-combined.json',
      name: `${collegeName} Feedback Portal`,
      short_name: shortName,
      description: `Official Faculty Evaluation & Feedback Management System for ${collegeName} (${shortName})`,
      id: `/${tenant.slug}/`,
      start_url: `/${tenant.slug}`,
      scope: `/${tenant.slug}/`,
      display: 'standalone',
      orientation: 'portrait',
      theme_color: primaryColor,
      background_color: primaryColor,
      lang: 'en',
      prefer_related_applications: false,
      icons: [
        ...(tenant.logo
          ? [
              {
                src: tenant.logo,
                sizes: '192x192 512x512',
                type: getIconMimeType(tenant.logo),
                purpose: 'any',
              },
            ]
          : []),
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
      shortcuts: [
        {
          name: 'Submit Feedback',
          short_name: 'Feedback',
          description: `Submit faculty feedback for ${shortName}`,
          url: `/${tenant.slug}/feedback`,
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
          ],
        },
        {
          name: 'Faculty / Admin Login',
          short_name: 'Admin',
          description: `Login to ${shortName} Faculty & Admin Portal`,
          url: `/${tenant.slug}/admin/login`,
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
          ],
        },
      ],
      categories: ['education', 'productivity'],
    };

    return new NextResponse(JSON.stringify(manifest, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[API Manifest Route] Error generating manifest:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
