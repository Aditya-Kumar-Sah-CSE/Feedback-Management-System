import { google } from 'googleapis';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface CollegeGoogleConnectionMetadata {
  collegeId: string;
  accountEmail: string;
  accountName: string | null;
  scopes: string[];
  isValid: boolean;
  status: 'CONNECTED' | 'INVALID' | 'NOT_CONNECTED';
  lastError: string | null;
  lastVerifiedAt: string | null;
  connectedBy: string | null;
  connectedAt: string;
  updatedAt: string;
}

export interface GoogleConfigStatus {
  isConfigured: boolean;
  configured: boolean;
  status: 'CONNECTED' | 'INVALID' | 'NOT_CONNECTED';
  accountEmail: string | null;
  accountName: string | null;
  connectedAt: string | null;
  message?: string;
  hasAppsScript?: boolean;
  scopes?: string[];
}

interface CollegeGoogleCredentialsInternal {
  collegeId: string;
  accountEmail: string;
  accountName: string | null;
  refreshToken: string;
  scopes: string[];
  isValid: boolean;
  lastError: string | null;
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
 * Resolves the OAuth redirect URI with strict priority:
 * 1. Explicit GOOGLE_REDIRECT_URI if configured
 * 2. NEXT_PUBLIC_APP_URL if pointing to production or custom domain
 * 3. Request origin if available
 * 4. Local development default (http://localhost:3000/api/auth/google/callback)
 */
export function getGoogleRedirectUri(origin?: string): string {
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  }

  if (origin && origin.trim()) {
    return `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
  }

  return 'http://localhost:3000/api/auth/google/callback';
}

// -------------------------------------------------------------
// OAUTH STATE SIGNING & VERIFICATION (HMAC-SHA256)
// -------------------------------------------------------------

const OAUTH_STATE_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'fms_secure_state_salt';

export interface OAuthStatePayload {
  collegeId: string;
  userId: string;
  returnTo: string;
  timestamp: number;
  nonce: string;
}

/**
 * Generates a tamper-proof, signed OAuth state containing collegeId, userId, and returnTo.
 */
export function generateOAuthState(payload: {
  collegeId: string;
  userId: string;
  returnTo: string;
}): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const data: OAuthStatePayload = {
    collegeId: payload.collegeId,
    userId: payload.userId,
    returnTo: payload.returnTo,
    timestamp,
    nonce,
  };

  const serialized = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', OAUTH_STATE_SECRET)
    .update(serialized)
    .digest('hex');

  return Buffer.from(JSON.stringify({ data: serialized, sig: signature })).toString('base64url');
}

/**
 * Verifies OAuth state signature, integrity, and 15-minute maximum lifetime.
 * Returns decoded payload if valid; null if tampered, expired, or malformed.
 */
export function verifyOAuthState(stateRaw: string | null): OAuthStatePayload | null {
  if (!stateRaw || typeof stateRaw !== 'string') return null;

  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
    if (!parsed || !parsed.data || !parsed.sig) return null;

    const expectedSig = crypto
      .createHmac('sha256', OAUTH_STATE_SECRET)
      .update(parsed.data)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(parsed.sig, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.warn('[OAuth State] Invalid HMAC signature on OAuth state.');
      return null;
    }

    const payload: OAuthStatePayload = JSON.parse(parsed.data);

    // Validate 15 minute timestamp expiry (plus 60s clock skew tolerance)
    const MAX_AGE_MS = 15 * 60 * 1000;
    const now = Date.now();
    if (now - payload.timestamp > MAX_AGE_MS || payload.timestamp > now + 60000) {
      console.warn('[OAuth State] OAuth state has expired.');
      return null;
    }

    return payload;
  } catch (err) {
    console.warn('[OAuth State] Failed to parse or verify OAuth state:', err);
    return null;
  }
}

// -------------------------------------------------------------
// INTERNAL TENANT CREDENTIAL ACCESS (SERVICE-ROLE ONLY)
// -------------------------------------------------------------

/**
 * Internal server-only helper to fetch raw refresh token for a college.
 * NEVER return this to client components, API responses, or UI.
 */
export async function getCollegeGoogleCredentials(
  collegeId: string
): Promise<CollegeGoogleCredentialsInternal | null> {
  if (!collegeId) return null;

  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client unavailable for Google credential lookup.');
  }

  const { data, error } = await supabase
    .from('college_google_connections')
    .select('college_id, account_email, account_name, refresh_token, scopes, is_valid, last_error')
    .eq('college_id', collegeId)
    .maybeSingle();

  if (error) {
    console.error(`[Google Auth] Database query failed for college [${collegeId}]:`, error);
    throw new Error(`Failed to retrieve Google credentials: ${error.message}`);
  }

  if (!data) return null;

  return {
    collegeId: data.college_id,
    accountEmail: data.account_email,
    accountName: data.account_name,
    refreshToken: data.refresh_token,
    scopes: data.scopes || [],
    isValid: data.is_valid,
    lastError: data.last_error,
  };
}

/**
 * Marks a college's Google connection as invalid in the database (e.g. on invalid_grant).
 * Strictly scopes the invalidation to that single college.
 */
export async function markCollegeGoogleConnectionInvalid(
  collegeId: string,
  errorReason: string
): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;

  await supabase
    .from('college_google_connections')
    .update({
      is_valid: false,
      last_error: errorReason,
      updated_at: new Date().toISOString(),
    })
    .eq('college_id', collegeId);
}

// -------------------------------------------------------------
// PUBLIC SAFE TENANT METADATA API
// -------------------------------------------------------------

/**
 * Returns safe connection metadata for a college (NEVER includes refresh_token).
 */
export async function getCollegeGoogleConnectionMetadata(
  collegeId: string
): Promise<CollegeGoogleConnectionMetadata | null> {
  if (!collegeId) return null;

  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('college_google_connections')
    .select(
      'college_id, account_email, account_name, scopes, is_valid, last_error, last_verified_at, connected_by, connected_at, updated_at'
    )
    .eq('college_id', collegeId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    collegeId: data.college_id,
    accountEmail: data.account_email,
    accountName: data.account_name,
    scopes: data.scopes || [],
    isValid: data.is_valid,
    status: data.is_valid ? 'CONNECTED' : 'INVALID',
    lastError: data.last_error,
    lastVerifiedAt: data.last_verified_at,
    connectedBy: data.connected_by,
    connectedAt: data.connected_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Checks if a specific college has an active, valid Google connection.
 */
export async function isCollegeGoogleConfigured(collegeId: string): Promise<boolean> {
  if (!collegeId) return false;
  const meta = await getCollegeGoogleConnectionMetadata(collegeId);
  return Boolean(meta && meta.isValid);
}

/**
 * Retrieves safe Google configuration status for an institution or runtime environment.
 */
export async function getGoogleConfigStatus(collegeId?: string): Promise<GoogleConfigStatus> {
  const hasAppsScript = Boolean(process.env.GOOGLE_APPS_SCRIPT_URL);
  if (!collegeId) {
    return {
      isConfigured: false,
      configured: false,
      status: 'NOT_CONNECTED',
      accountEmail: null,
      accountName: null,
      connectedAt: null,
      message: 'No institution selected or Google Workspace not connected.',
      hasAppsScript,
      scopes: [],
    };
  }
  const meta = await getCollegeGoogleConnectionMetadata(collegeId);
  const isConfigured = Boolean(meta && meta.isValid);
  return {
    isConfigured,
    configured: isConfigured,
    status: meta ? (meta.isValid ? 'CONNECTED' : 'INVALID') : 'NOT_CONNECTED',
    accountEmail: meta?.accountEmail || null,
    accountName: meta?.accountName || null,
    connectedAt: meta?.connectedAt || null,
    message: isConfigured
      ? `Connected as ${meta?.accountEmail}`
      : 'Google account is not connected for this college.',
    hasAppsScript,
    scopes: meta?.scopes || [],
  };
}

/**
 * Compatibility wrapper to access Google services for a specified college.
 */
export async function getGoogleServices(collegeId?: string) {
  if (!collegeId) {
    throw new Error('collegeId is required to access Google services.');
  }
  return getCollegeGoogleServices(collegeId);
}

/**
 * Compatibility helper for existing call sites checking if Google is configured.
 * Requires explicit collegeId in Phase 3.
 */
export function isGoogleConfigured(): boolean {
  // Runtime code must not assume a global singleton token.
  // Returns true if server credentials (client id & secret) exist.
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// -------------------------------------------------------------
// TENANT-SCOPED GOOGLE CLIENT & SERVICES FACTORY
// -------------------------------------------------------------

/**
 * Constructs an authenticated OAuth2Client bound to the specified college's refresh token.
 * Throws GOOGLE_CONNECTION_REQUIRED if no valid connection exists for that college.
 */
export async function getCollegeGoogleAuthClient(collegeId: string) {
  if (!collegeId || typeof collegeId !== 'string') {
    const err: any = new Error('Tenant resolution error: collegeId is required for Google operations.');
    err.code = 'TENANT_REQUIRED';
    throw err;
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth client ID or client secret is not configured on the server.');
  }

  const creds = await getCollegeGoogleCredentials(collegeId);
  if (!creds || !creds.refreshToken || !creds.isValid) {
    const err: any = new Error(`Google Workspace account is not connected for this college.`);
    err.code = 'GOOGLE_CONNECTION_REQUIRED';
    err.collegeId = collegeId;
    throw err;
  }

  const redirectUri = getGoogleRedirectUri();
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: creds.refreshToken,
  });

  return oauth2Client;
}

/**
 * Returns authenticated Google API service clients scoped to a specific college.
 */
export async function getCollegeGoogleServices(collegeId: string) {
  const auth = await getCollegeGoogleAuthClient(collegeId);
  return {
    forms: google.forms({ version: 'v1', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

/**
 * Executes a Google API operation with automatic error trapping for the specified college.
 * If invalid_grant is returned, marks that college's connection as invalid and fails closed.
 */
export async function executeWithCollegeGoogleOAuthRetry<T>(
  collegeId: string,
  operation: (services: {
    forms: ReturnType<typeof google.forms>;
    sheets: ReturnType<typeof google.sheets>;
    drive: ReturnType<typeof google.drive>;
  }) => Promise<T>
): Promise<T> {
  const services = await getCollegeGoogleServices(collegeId);
  try {
    return await operation(services);
  } catch (err: unknown) {
    if (isGoogleOAuthError(err)) {
      console.warn(
        `[Google Auth] OAuth invalid_grant detected for college [${collegeId}]. Marking connection invalid in database...`
      );
      await markCollegeGoogleConnectionInvalid(
        collegeId,
        err instanceof Error ? err.message : 'OAuth authorization expired or revoked'
      );
      const connErr: any = new Error(
        `Google authorization has expired or was revoked for this institution. Reconnection required.`
      );
      connErr.code = 'GOOGLE_CONNECTION_REQUIRED';
      connErr.collegeId = collegeId;
      throw connErr;
    }
    throw err;
  }
}

// -------------------------------------------------------------
// PERSISTENCE & LIFECYCLE
// -------------------------------------------------------------

/**
 * Securely persists or updates a validated Google connection for a college.
 * Conceptual uniqueness: exactly one active Google connection per college.
 */
export async function saveCollegeGoogleConnection(params: {
  collegeId: string;
  accountEmail: string;
  accountName?: string | null;
  refreshToken: string;
  scopes?: string[];
  connectedBy?: string | null;
}): Promise<void> {
  if (!params.collegeId || !params.refreshToken) {
    throw new Error('collegeId and refreshToken are required to save Google connection.');
  }

  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client unavailable for Google connection persistence.');
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('college_google_connections').upsert(
    {
      college_id: params.collegeId,
      account_email: params.accountEmail.trim().toLowerCase(),
      account_name: params.accountName || null,
      refresh_token: params.refreshToken.trim(),
      scopes: params.scopes || GOOGLE_SCOPES,
      is_valid: true,
      last_error: null,
      last_verified_at: nowIso,
      connected_by: params.connectedBy || null,
      updated_at: nowIso,
    },
    { onConflict: 'college_id' }
  );

  if (error) {
    console.error('[Google Auth] Failed to save college Google connection:', error);
    throw new Error(`Failed to save Google connection: ${error.message}`);
  }
}

/**
 * Disconnects and removes a college's Google connection.
 * Attempts token revocation on Google servers before deleting local record.
 */
export async function disconnectCollegeGoogleConnection(collegeId: string): Promise<void> {
  if (!collegeId) return;

  const creds = await getCollegeGoogleCredentials(collegeId);
  if (creds?.refreshToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getGoogleRedirectUri()
      );
      await oauth2Client.revokeToken(creds.refreshToken);
    } catch (revokeErr) {
      console.warn(
        '[Google Auth] Token revocation on Google servers failed (token may already be invalid):',
        revokeErr
      );
    }
  }

  const supabase = createAdminClient();
  if (supabase) {
    await supabase.from('college_google_connections').delete().eq('college_id', collegeId);
  }
}

// -------------------------------------------------------------
// ERROR CLASSIFICATION & FORMATTING
// -------------------------------------------------------------

/**
 * Returns true if error indicates expired/revoked/invalid OAuth grant or credentials.
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
 * Formats Google API errors into structured user-facing messages and reconnect data.
 */
export function formatGoogleErrorMessage(
  err: unknown,
  collegeId?: string,
  returnTo: string = '/admin/dashboard/forms/create'
): {
  message: string;
  requiresReconnect: boolean;
  reconnectUrl: string;
} {
  const safeReturnTo = validateInternalReturnTo(returnTo);
  const queryParams = new URLSearchParams({ returnTo: safeReturnTo });
  if (collegeId) {
    queryParams.set('collegeId', collegeId);
  }
  const reconnectUrl = `/api/auth/google?${queryParams.toString()}`;

  const anyErr = err as any;
  if (anyErr?.code === 'GOOGLE_CONNECTION_REQUIRED' || isGoogleOAuthError(err)) {
    return {
      message:
        err instanceof Error
          ? err.message
          : 'Google Workspace account is not connected or authorization expired. Connect your Google account to continue.',
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
 * Backward-compatibility helper for any legacy callers that cannot supply collegeId immediately.
 * In Phase 3, this always enforces explicit tenant resolution.
 */
export async function ensureGoogleCredentialsLoaded(collegeId?: string): Promise<void> {
  if (collegeId) {
    const configured = await isCollegeGoogleConfigured(collegeId);
    if (!configured) {
      const err: any = new Error(`Google account is not connected for college [${collegeId}].`);
      err.code = 'GOOGLE_CONNECTION_REQUIRED';
      err.collegeId = collegeId;
      throw err;
    }
  }
}
