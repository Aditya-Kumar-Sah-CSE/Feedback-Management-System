import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import crypto from 'crypto';
import { GOOGLE_SCOPES, validateInternalReturnTo } from '@/lib/google/auth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const rawReturnTo = url.searchParams.get('returnTo');
  const returnTo = validateInternalReturnTo(rawReturnTo, '/admin/dashboard/forms');

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

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const statePayload = {
    returnTo,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent prompt to guarantee fresh refresh token generation
    scope: GOOGLE_SCOPES,
    state,
  });

  return NextResponse.redirect(authUrl);
}
