import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import {
  GOOGLE_SCOPES,
  validateInternalReturnTo,
  getGoogleRedirectUri,
  generateOAuthState,
} from '@/lib/google/auth';
import { getAdminSession, requireAdminSession } from '@/lib/auth/admin-auth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const rawReturnTo = url.searchParams.get('returnTo');
  const returnTo = validateInternalReturnTo(rawReturnTo, '/admin/dashboard');

  // 1. Mandatory Admin Authentication
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return NextResponse.redirect(new URL('/admin/login', origin));
  }

  // 2. Resolve Target College
  // Never trust client-submitted collegeId without server-side validation
  const requestedCollegeId = url.searchParams.get('collegeId');
  const targetCollegeId = requestedCollegeId || session.activeCollegeId;

  if (!targetCollegeId) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Tenant Resolution Error</h2>
          <p>No active institution selected to connect Google Workspace account. Please select an active college first.</p>
          <a href="${returnTo}" style="color: #60a5fa;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  // 3. Authorize caller for the specific college
  try {
    await requireAdminSession({ requireCollegeId: targetCollegeId });
  } catch (authErr: any) {
    console.warn('[Google OAuth Initiation] Unauthorized attempt to connect college:', {
      userId: session.userId,
      targetCollegeId,
      error: authErr.message,
    });
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Access Denied</h2>
          <p>You do not possess administrative permissions to connect a Google account for this institution.</p>
          <a href="${returnTo}" style="color: #60a5fa;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 403 }
    );
  }

  // 4. Verify Google Client ID & Secret
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Google OAuth Configuration Error</h2>
          <p>GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from server environment variables.</p>
          <a href="${returnTo}" style="color: #60a5fa;">Return</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }

  const redirectUri = getGoogleRedirectUri(origin);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  // 5. Generate Signed, Tamper-Proof OAuth State
  const state = generateOAuthState({
    collegeId: targetCollegeId,
    userId: session.userId,
    returnTo,
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account', // Force account selector and consent to guarantee intended Google account selection
    scope: GOOGLE_SCOPES,
    state,
  });

  return NextResponse.redirect(authUrl);
}
