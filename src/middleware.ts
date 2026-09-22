import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);

  // Extract potential tenant slug from first segment (e.g. /bce-bgp -> "bce-bgp")
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();

  // Known non-tenant reserved prefixes
  const reservedPrefixes = ['admin', 'api', 'auth', 'offline', 'favicon.ico'];
  if (firstSegment && !reservedPrefixes.includes(firstSegment) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(firstSegment)) {
    requestHeaders.set('x-tenant-slug', firstSegment);
  }

  // Forward active admin tenant hint cookie if present (routing/display hint only, not auth proof)
  const activeTenantCookie = request.cookies.get('fms_active_tenant_id')?.value;
  if (activeTenantCookie) {
    requestHeaders.set('x-active-tenant-id', activeTenantCookie);
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (firstSegment && !reservedPrefixes.includes(firstSegment)) {
    response.headers.set('x-tenant-slug', firstSegment);
  }

  // Only initialize Supabase Auth and refresh session cookies for protected/auth routes
  // This completely eliminates database and auth overhead on public pages
  const isAdminRoute = pathname.startsWith('/admin') || pathname.includes('/admin/');
  const isAuthRoute = pathname.startsWith('/auth');

  if (isAdminRoute || isAuthRoute) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://txerarcajxjzxifanzxw.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_BaBiHYfqG1rIf0ns3b-alQ_fqNRPoHe';

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    // Protect admin dashboard routes
    if (pathname.startsWith('/admin/dashboard')) {
      if (!user) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }
    }

    // If already authenticated and accessing login/signup, redirect to destination or dashboard
    if ((pathname === '/admin/login' || pathname === '/admin/signup') && user) {
      const redirectParam = request.nextUrl.searchParams.get('redirect');
      const dest = redirectParam && redirectParam.startsWith('/admin') ? redirectParam : '/admin/dashboard';
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Static asset extensions (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
