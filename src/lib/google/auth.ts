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
let cachedTokenSource: 'database' | 'environment' | 'none' = 'none';

/**
 * Invalidates the in-memory token cache so the next request re-hydrates from persistent storage
 */
export function invalidateCachedGoogleToken(): void {
  cachedRefreshToken = null;
  cachedTokenSource = 'none';
}

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
 * Synchronously gets currently cached or available refresh token
 */
export function getStoredRefreshToken(): string | undefined {
  if (cachedRefreshToken) {
    return cachedRefreshToken;
  }

  // In local development, check .env.local to avoid stale in-memory variables
  if (process.env.NODE_ENV !== 'production') {
    loadLocalEnvIfNeeded();
  }

  return process.env.GOOGLE_REFRESH_TOKEN || undefined;
}

/**
 * Async resolution of refresh token with STRICT PRODUCTION PRIORITY:
 * 1. Supabase google_oauth_tokens table is the primary persistent credential source.
 * 2. If DB contains a valid token: always use DB token.
 * 3. If DB query fails: DO NOT silently fall back to potentially stale env token; fail safely with an error.
 * 4. If DB has no credential row: environment token may be used only as a fallback.
 *
 * @param forceFresh - If true, bypasses the in-memory cache and re-queries Supabase.
 */
export async function getStoredRefreshTokenAsync(forceFresh = false): Promise<string | undefined> {
  if (!forceFresh && cachedRefreshToken) {
    return cachedRefreshToken;
  }

  // 1. Supabase google_oauth_tokens is the PRIMARY credential source
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Database client configuration missing: Unable to query persistent Google credentials.');
      }
    } else {
      const { data, error } = await supabase
        .from('google_oauth_tokens')
        .select('refresh_token')
        .eq('id', 'default')
        .maybeSingle();

      if (error) {
        console.error('[Google Auth] Persistent google_oauth_tokens query failed:', error);
        // Fail safely on database errors - do NOT silently fall back to stale env tokens
        throw new Error(`Failed to query persistent Google credentials from database: ${error.message}`);
      }

      if (data?.refresh_token && typeof data.refresh_token === 'string' && data.refresh_token.trim()) {
        const token = data.refresh_token.trim();
        cachedRefreshToken = token;
        cachedTokenSource = 'database';
        process.env.GOOGLE_REFRESH_TOKEN = token;
        return token;
      }
    }
  } catch (dbErr) {
    // If DB query or connection failed, do NOT silently fall back to stale env tokens
    console.error('[Google Auth] Database error querying persistent credentials:', dbErr);
    throw dbErr instanceof Error
      ? dbErr
      : new Error(`Database error querying persistent Google credentials: ${String(dbErr)}`);
  }

  // 2. Fallback ONLY if DB query succeeded but row was not found (data is null and error is null)
  if (process.env.NODE_ENV !== 'production') {
    loadLocalEnvIfNeeded();
  }

  if (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_REFRESH_TOKEN.trim()) {
    const envToken = process.env.GOOGLE_REFRESH_TOKEN.trim();
    cachedRefreshToken = envToken;
    cachedTokenSource = 'environment';
    return envToken;
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
  cachedTokenSource = 'database';
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
      const { error } = await supabase.from('google_oauth_tokens').upsert({
        id: 'default',
        refresh_token: token,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn('[Google Auth] Database token persistence error:', error);
      }
    }
  } catch (dbErr) {
    console.warn('Could not persist refresh token to database:', dbErr);
  }
}

/**
 * Returns safe diagnostics without exposing tokens or secrets
 */
export function getGoogleCredentialDiagnostics(): {
  credentialSource: 'database' | 'environment' | 'none';
  tokenExists: boolean;
  clientIdFingerprint: string;
  redirectUri: string;
  hasClientSecret: boolean;
} {
  loadLocalEnvIfNeeded();
  const token = cachedRefreshToken || getStoredRefreshToken();
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const fingerprint = clientId
    ? `${clientId.slice(0, 8)}...${clientId.slice(-12)}`
    : 'missing';

  return {
    credentialSource: cachedTokenSource,
    tokenExists: Boolean(token),
    clientIdFingerprint: fingerprint,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'default',
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  };
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
 * Ensures Google credentials from persistent DB or environment are loaded into memory
 * @param forceFresh - If true, re-queries Supabase directly bypassing memory cache
 */
export async function ensureGoogleCredentialsLoaded(forceFresh = false): Promise<boolean> {
  const token = await getStoredRefreshTokenAsync(forceFresh);
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
      if (tokens.refresh_token && typeof tokens.refresh_token === 'string' && tokens.refresh_token.trim()) {
        saveStoredRefreshToken(tokens.refresh_token.trim()).catch((err) => {
          console.warn('[Google Auth] Failed to persist rotated token:', err);
        });
      }
      // If only access_token is returned, existing refresh_token is retained
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
    'Google API credentials missing. Please configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local or reconnect your Google account.'
  );
}

/**
 * Returns authenticated Google API service clients synchronously
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
 * @param forceFresh - If true, re-queries persistent database storage directly
 */
export async function getGoogleServicesAsync(forceFresh = false) {
  await ensureGoogleCredentialsLoaded(forceFresh);
  return getGoogleServices();
}

/**
 * Executes a Google API operation with automatic OAuth cache invalidation and single-retry:
 * If operation encounters invalid_grant:
 * 1. Invalidates cached in-memory token
 * 2. Reloads persistent token from Supabase
 * 3. Retries operation exactly ONCE
 * If persistent token also fails: stops retrying and throws for structured reconnection handling.
 */
export async function executeWithGoogleOAuthRetry<T>(
  operation: (services: {
    forms: ReturnType<typeof google.forms>;
    sheets: ReturnType<typeof google.sheets>;
    drive: ReturnType<typeof google.drive>;
  }) => Promise<T>
): Promise<T> {
  const services = await getGoogleServicesAsync();
  try {
    return await operation(services);
  } catch (err: unknown) {
    if (isGoogleOAuthError(err)) {
      console.warn('[Google Auth] OAuth invalid_grant detected. Invalidating cache and re-hydrating from database...');
      invalidateCachedGoogleToken();
      // Re-hydrate fresh credential from persistent database storage
      await ensureGoogleCredentialsLoaded(true);
      const freshServices = await getGoogleServicesAsync();
      try {
        return await operation(freshServices);
      } catch (retryErr: unknown) {
        console.error('[Google Auth] Persistent token retry also failed with OAuth error. Stopping retries.', retryErr);
        throw retryErr; // Caught by formatGoogleErrorMessage to trigger requiresReconnect
      }
    }
    throw err;
  }
}

