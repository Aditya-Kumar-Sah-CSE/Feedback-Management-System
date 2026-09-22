import { NextResponse } from 'next/server';
import { getAdminSession, ACTIVE_TENANT_COOKIE } from '@/lib/auth/admin-auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    let body: { targetCollegeId?: string; targetCollegeSlug?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const session = await getAdminSession();

    if (!session.isAuthenticated) {
      return NextResponse.json(
        { isAuthenticated: false, error: 'Unauthenticated session.' },
        { status: 401 }
      );
    }

    let resolvedTargetCollegeId: string | null = null;

    if (body.targetCollegeId || body.targetCollegeSlug) {
      const supabase = await createClient();
      let query = supabase.from('colleges').select('id, name, slug, code, is_active').eq('is_active', true);

      if (body.targetCollegeId) {
        query = query.eq('id', body.targetCollegeId);
      } else if (body.targetCollegeSlug) {
        query = query.eq('slug', body.targetCollegeSlug.toLowerCase().trim());
      }

      const { data: matchedCollege } = await query.maybeSingle();

      if (!matchedCollege) {
        return NextResponse.json(
          {
            isAuthenticated: true,
            authorizedForCollege: false,
            error: 'Target institution does not exist or is inactive.',
          },
          { status: 404 }
        );
      }

      resolvedTargetCollegeId = matchedCollege.id;

      // Check authorization server-side strictly against auth.uid() session
      const isSuper = session.isPlatformSuperAdmin;
      const isMember = session.colleges.some(
        (c) => c.collegeId === resolvedTargetCollegeId && c.status === 'ACTIVE'
      );

      if (!isSuper && !isMember) {
        return NextResponse.json(
          {
            isAuthenticated: true,
            authorizedForCollege: false,
            error: 'You do not have administrator access to this institution.',
          },
          { status: 403 }
        );
      }
    }

    // Determine cookie value to set
    const cookieCollegeId = resolvedTargetCollegeId || session.activeCollegeId;

    const response = NextResponse.json({
      ...session,
      authorizedForCollege: true,
      activeCollegeId: cookieCollegeId,
    });

    if (cookieCollegeId) {
      response.cookies.set(ACTIVE_TENANT_COOKIE, cookieCollegeId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    return response;
  } catch (error: any) {
    console.error('Session verification error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
