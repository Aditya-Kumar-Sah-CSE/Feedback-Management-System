import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import {
  verifyOAuthState,
  saveCollegeGoogleConnection,
  getCollegeGoogleCredentials,
  getGoogleRedirectUri,
  GOOGLE_SCOPES,
} from '@/lib/google/auth';
import { getAdminSession, requireAdminSession } from '@/lib/auth/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateRaw = searchParams.get('state');
  const origin = request.nextUrl.origin;

  // 1. Verify and Decode Signed State
  const state = verifyOAuthState(stateRaw);
  const fallbackReturnTo = '/admin/dashboard';

  if (!state) {
    console.warn('[Google OAuth Callback] Rejected callback due to missing, tampered, or expired state parameter.');
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">OAuth State Verification Failed</h2>
          <p>The authorization session is invalid, expired, or was tampered with. Please restart the connection flow from the dashboard.</p>
          <a href="${fallbackReturnTo}" style="color: #60a5fa;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  const returnTo = state.returnTo || fallbackReturnTo;

  if (error) {
    console.warn('[Google OAuth Callback] Google reported error:', error);
    let errorTitle = 'Google Authorization Cancelled or Failed';
    let errorDescription = `Google returned error code: ${error}`;

    if (error === 'access_denied') {
      errorTitle = 'Google Authorization Cancelled / Access Denied';
      errorDescription =
        'Authorization was cancelled or denied on the Google consent screen. If Google displays "Google hasn\'t verified this app", click "Advanced" and proceed to allow Feedback Management System to connect your institutional account.';
    } else if (error === 'redirect_uri_mismatch') {
      errorTitle = 'OAuth Redirect URI Mismatch';
      errorDescription =
        'The redirect URI sent by the application does not match the authorized redirect URIs in Google Cloud Console.';
    }

    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">${errorTitle}</h2>
          <p style="color: #cbd5e1; line-height: 1.6;">${errorDescription}</p>
          <a href="${returnTo}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  if (!code) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Authorization Code Missing</h2>
          <p style="color: #cbd5e1;">No authorization code received from Google.</p>
          <a href="${returnTo}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  // 2. Authenticate Current FMS Admin User
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    console.warn('[Google OAuth Callback] Callback attempted with unauthenticated or inactive session.');
    return NextResponse.redirect(new URL('/admin/login', origin));
  }

  // 3. User Identity Check: verify state initiator matches current authenticated user
  if (session.userId !== state.userId) {
    console.error('[Google OAuth Callback] Security Violation: Initiating user does not match callback user.', {
      stateUserId: state.userId,
      sessionUserId: session.userId,
    });
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Security Violation</h2>
          <p style="color: #cbd5e1;">Session identity mismatch. Google authorization callback must be completed by the initiating administrator.</p>
          <a href="${returnTo}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 403 }
    );
  }

  // 4. Critical Re-Authorization Check: verify user is STILL authorized for this college
  try {
    await requireAdminSession({ requireCollegeId: state.collegeId });
  } catch (authErr: any) {
    console.error('[Google OAuth Callback] Re-authorization failed during callback:', {
      userId: session.userId,
      collegeId: state.collegeId,
      error: authErr.message,
    });
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Access Revoked</h2>
          <p style="color: #cbd5e1;">You no longer possess administrative privileges for this institution. Google connection was not saved.</p>
          <a href="${fallbackReturnTo}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 403 }
    );
  }

  // 5. Exchange Authorization Code for Google OAuth Tokens
  try {
    const redirectUri = getGoogleRedirectUri(origin);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // 6. Retrieve Authenticated Google Account Identity (strictly from Google API/token)
    let accountEmail: string | null = null;
    let accountName: string | null = null;

    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      if (userInfo.data.email) {
        accountEmail = userInfo.data.email.trim().toLowerCase();
      }
      accountName = userInfo.data.name || null;
    } catch (profileErr) {
      console.warn('[Google OAuth Callback] userinfo.get() failed, checking id_token fallback:', profileErr);
    }

    if (!accountEmail && tokens.id_token) {
      try {
        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (payload?.email) {
          accountEmail = payload.email.trim().toLowerCase();
          accountName = accountName || payload.name || null;
        }
      } catch (idTokenErr) {
        console.warn('[Google OAuth Callback] id_token verification failed:', idTokenErr);
      }
    }

    if (!accountEmail) {
      throw new Error(
        'Unable to determine the authenticated Google account email from OAuth credentials. Please retry.'
      );
    }

    // 7. Resolve Refresh Token
    let refreshTokenToSave = tokens.refresh_token;
    if (!refreshTokenToSave) {
      // If Google did not return a new refresh token (consent cached), reuse existing valid token if email matches
      const existingCreds = await getCollegeGoogleCredentials(state.collegeId);
      if (
        existingCreds?.refreshToken &&
        existingCreds.accountEmail.toLowerCase() === accountEmail.toLowerCase()
      ) {
        refreshTokenToSave = existingCreds.refreshToken;
      }
    }

    if (!refreshTokenToSave) {
      throw new Error(
        'Google did not return a refresh token. Please disconnect and reconnect with offline consent enabled.'
      );
    }

    // 8. Securely Persist to public.college_google_connections (scoped strictly to state.collegeId)
    await saveCollegeGoogleConnection({
      collegeId: state.collegeId,
      accountEmail,
      accountName,
      refreshToken: refreshTokenToSave,
      scopes: tokens.scope ? tokens.scope.split(' ') : GOOGLE_SCOPES,
      connectedBy: session.userId,
    });

    // 9. Record Audit Log
    const supabase = createAdminClient();
    if (supabase) {
      await supabase.from('audit_logs').insert({
        admin_id: session.userId,
        actor_email: session.email,
        action: 'GOOGLE_ACCOUNT_CONNECTED',
        entity_type: 'college_google_connections',
        entity_id: state.collegeId,
        details: `Connected Google Workspace account (${accountEmail}) for college ID ${state.collegeId}`,
      });
    }

    // 10. Redirect back to validated internal dashboard path
    const targetUrl = new URL(returnTo, origin);
    return NextResponse.redirect(targetUrl);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Google OAuth Callback] Token exchange or connection persistence failed:', errMsg);

    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Google Workspace Connection Failed</h2>
          <p style="color: #cbd5e1; line-height: 1.6;">${errMsg}</p>
          <a href="${returnTo}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }
}
