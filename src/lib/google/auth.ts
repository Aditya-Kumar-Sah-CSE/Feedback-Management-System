import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@/lib/supabase/admin';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

export interface GoogleConfigStatus {
  isConfigured: boolean;
  authType: 'oauth' | 'service_account' | 'none';
  hasAppsScript: boolean;
  message: string;
}

// In-memory token cache for process lifetime
let cachedRefreshToken: string | null = null;

/**
 * Validates returnTo path to ensure it is internal only.
 * Rejects absolute URLs, protocol-relative URLs (//), javascript:, data:, and external domains.
 */
export function validateInternalReturnTo(
  returnTo: string | null | undefined,
  fallback: string = '/admin/dashboard/forms'
): string {
  if (!returnTo || typeof returnTo !== 'string') {
    return fallback;
  }

  const trimmed = returnTo.trim();
  if (!trimmed) return fallback;

  // Must start with '/' and not '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  // Reject URLs with colons or backslashes before query/hash to prevent scheme injection
  const basePath = trimmed.split(/[?#]/)[0];
  if (basePath.includes(':') || basePath.includes('\\')) {
    return fallback;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('/\\') ||
    lower.includes('javascript:') ||
    lower.includes('data:') ||
    lower.includes('vbscript:')
  ) {
    return fallback;
  }

  return trimmed;
}

/**
 * Helper to dynamically read fresh credentials from .env.local in local dev if needed
 */
function loadLocalEnvIfNeeded(): void {
  if (typeof process === 'undefined') return;

  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key && val) {
            // Keep process.env updated if missing or if reading GOOGLE_REFRESH_TOKEN
            if (!process.env[key] || key === 'GOOGLE_REFRESH_TOKEN') {
              process.env[key] = val;
            }
          }
        }
      }
    }
  } catch {
    // Non-fatal if filesystem is restricted or read-only
  }
}

/**
 * Synchronously gets currently available refresh token
 */
export function getStoredRefreshToken(): string | undefined {
  if (cachedRefreshToken) {
    return cachedRefreshToken;
  }

  // In local development, check .env.local to avoid stale in-memory variables
  if (process.env.NODE_ENV !== 'production') {
    loadLocalEnvIfNeeded();
  }

  if (process.env.GOOGLE_REFRESH_TOKEN) {
    cachedRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    return cachedRefreshToken;
  }

  return undefined;
}

/**
 * Async resolution of refresh token from memory, environment, or persistent Supabase storage
 */
export async function getStoredRefreshTokenAsync(): Promise<string | undefined> {
  const syncToken = getStoredRefreshToken();
  if (syncToken) {
    return syncToken;
  }

  // Query persistent database storage (for production / Vercel where .env.local is ephemeral)
  try {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('google_oauth_tokens')
        .select('refresh_token')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data?.refresh_token) {
        cachedRefreshToken = data.refresh_token;
        process.env.GOOGLE_REFRESH_TOKEN = data.refresh_token;
        return data.refresh_token;
      }
    }
  } catch (dbErr) {
    console.warn('Failed to query google_oauth_tokens from database:', dbErr);
  }

  return undefined;
}

/**
 * Securely persists updated refresh token to both database and local environment
 */
export async function saveStoredRefreshToken(refreshToken: string): Promise<void> {
  if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
    return; // Never overwrite with null/empty
  }

  const token = refreshToken.trim();
  cachedRefreshToken = token;
  process.env.GOOGLE_REFRESH_TOKEN = token;

  // 1. Persist to local .env.local if running in local environment with write access
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(
          /GOOGLE_REFRESH_TOKEN=.*/g,
          `GOOGLE_REFRESH_TOKEN=${token}`
        );
      } else {
        envContent += `\nGOOGLE_REFRESH_TOKEN=${token}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  } catch {
    // Expected on serverless/read-only environments like Vercel
  }

  // 2. Persist to Supabase google_oauth_tokens table (production-safe persistent store)
  try {
    const supabase = createAdminClient();
    if (supabase) {
      await supabase.from('google_oauth_tokens').upsert({
        id: 'default',
        refresh_token: token,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (dbErr) {
    console.warn('Could not persist refresh token to database:', dbErr);
  }
}

/**
 * Returns true if error indicates expired/revoked/invalid OAuth grant or credentials
 */
export function isGoogleOAuthError(err: unknown): boolean {
  if (!err) return false;

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes('invalid_grant') ||
    lower.includes('token has been expired or revoked') ||
    lower.includes('unauthorized_client') ||
    lower.includes('invalid_client') ||
    lower.includes('invalid credentials') ||
    lower.includes('bad request: invalid_grant') ||
    lower.includes('unauthorized')
  ) {
    return true;
  }

  const anyErr = err as any;
  if (
    anyErr.response?.data?.error === 'invalid_grant' ||
    anyErr.response?.data?.error === 'unauthorized_client' ||
    anyErr.response?.data?.error === 'invalid_client' ||
    anyErr.response?.status === 401
  ) {
    return true;
  }

  return false;
}

/**
 * Formats Google API errors into structured user-facing messages and reconnect data
 */
export function formatGoogleErrorMessage(
  err: unknown,
  returnTo: string = '/admin/dashboard/forms/create'
): {
  message: string;
  requiresReconnect: boolean;
  reconnectUrl: string;
} {
  const safeReturnTo = validateInternalReturnTo(returnTo);
  const reconnectUrl = `/api/auth/google?returnTo=${encodeURIComponent(safeReturnTo)}`;

  if (isGoogleOAuthError(err)) {
    return {
      message:
        'Google authorization has expired or been revoked. Reconnect your Google account to continue.',
      requiresReconnect: true,
      reconnectUrl,
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  return {
    message: rawMsg || 'An unknown Google API error occurred.',
    requiresReconnect: false,
    reconnectUrl,
  };
}

/**
 * Returns configuration status without exposing credentials
 */
export function getGoogleConfigStatus(): GoogleConfigStatus {
  const refreshToken = getStoredRefreshToken();
  const hasOAuth = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    refreshToken
  );

  const hasServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );

  const hasAppsScript = Boolean(process.env.GOOGLE_APPS_SCRIPT_URL);

  if (hasOAuth) {
    return {
      isConfigured: true,
      authType: 'oauth',
      hasAppsScript,
      message: 'Google OAuth 2.0 configured with Refresh Token',
    };
  }

  if (hasServiceAccount) {
    return {
      isConfigured: true,
      authType: 'service_account',
      hasAppsScript,
      message: 'Google Service Account configured',
    };
  }

  return {
    isConfigured: false,
    authType: 'none',
    hasAppsScript,
    message: 'Google API credentials not configured in environment variables',
  };
}

export function isGoogleConfigured(): boolean {
  const status = getGoogleConfigStatus();
  return status.isConfigured;
}

/**
 * Ensures Google credentials from environment or persistent DB are loaded
 */
export async function ensureGoogleCredentialsLoaded(): Promise<boolean> {
  const token = await getStoredRefreshTokenAsync();
  return Boolean(token);
}

/**
 * Creates authenticated Google Client server-side
 */
export function getGoogleAuthClient() {
  const status = getGoogleConfigStatus();

  if (status.authType === 'oauth') {
    const refreshToken = getStoredRefreshToken();
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    );

    if (refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });
    }

    // Automatically capture and persist token rotation
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        saveStoredRefreshToken(tokens.refresh_token).catch(() => {});
      }
    });

    return oauth2Client;
  }

  if (status.authType === 'service_account') {
    const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: GOOGLE_SCOPES,
    });
  }

  throw new Error(
    'Google API credentials missing. Please configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN (or GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) in .env.local'
  );
}

/**
 * Returns authenticated Google API service clients
 */
export function getGoogleServices() {
  const auth = getGoogleAuthClient();

  return {
    forms: google.forms({ version: 'v1', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

/**
 * Async version that ensures database-persisted credentials are hydrated before obtaining services
 */
export async function getGoogleServicesAsync() {
  await ensureGoogleCredentialsLoaded();
  return getGoogleServices();
}
