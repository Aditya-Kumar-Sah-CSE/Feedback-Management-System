import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import {
  validateInternalReturnTo,
  saveStoredRefreshToken,
  getStoredRefreshTokenAsync,
} from '@/lib/google/auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateRaw = searchParams.get('state');

  // Decode and strictly validate returnTo from state
  let returnTo = '/admin/dashboard/forms';
  if (stateRaw) {
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
      if (parsed && typeof parsed.returnTo === 'string') {
        returnTo = validateInternalReturnTo(parsed.returnTo, '/admin/dashboard/forms');
      }
    } catch {
      returnTo = '/admin/dashboard/forms';
    }
  }

  if (error) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Google Authorization Failed</h2>
          <p>${error}</p>
          <a href="${returnTo}" style="color: #60a5fa;">Return to BCE Portal</a>
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
          <p>No authorization code received from Google.</p>
          <a href="${returnTo}" style="color: #60a5fa;">Return to BCE Portal</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  try {
    const origin = request.nextUrl.origin;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    // Securely persist refresh token if provided
    if (refreshToken) {
      await saveStoredRefreshToken(refreshToken);
    } else {
      // If Google didn't return a refresh token (e.g. repeated consent without prompt),
      // ensure we preserve the existing stored refresh token
      const existing = await getStoredRefreshTokenAsync();
      if (!existing) {
        console.warn('Google OAuth completed but no refresh token was issued or existing.');
      }
    }

    // Redirect directly to validated returnTo path
    const targetUrl = new URL(returnTo, origin);
    return NextResponse.redirect(targetUrl);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Google OAuth token exchange failed:', errMsg);

    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; background: #0b192c; color: #fff;">
          <h2 style="color: #ef4444;">Token Exchange Failed</h2>
          <p>${errMsg}</p>
          <a href="${returnTo}" style="color: #60a5fa;">Return to BCE Portal</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }
}
