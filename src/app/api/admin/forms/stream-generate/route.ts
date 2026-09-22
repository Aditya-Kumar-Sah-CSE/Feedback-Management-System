import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { assertFormGenerationAccess } from '@/lib/billing/access-control';
import {
  validateAndPrepareFormDraftAction,
  provisionGoogleFormAndSheetAction,
} from '@/app/admin/forms/actions';
import { CreateFormPayload } from '@/lib/validation';
import {
  ensureGoogleCredentialsLoaded,
  formatGoogleErrorMessage,
  isGoogleOAuthError,
} from '@/lib/google/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session.isAuthenticated || !session.isActive) {
    return NextResponse.json({ error: 'Unauthorized. Active admin session required.' }, { status: 401 });
  }

  // ─── BILLING ACCESS GATE ────────────────────────────────────────
  const accessResult = await assertFormGenerationAccess(session);
  if (!accessResult.allowed) {
    return NextResponse.json({ error: accessResult.reason }, { status: 403 });
  }
  // ────────────────────────────────────────────────────────────────

  // Obtain authenticated client & session while request context is valid
  const sessionClient = await createClient();
  const { data: { session: authSession } } = await sessionClient.auth.getSession();
  const accessToken = authSession?.access_token;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://txerarcajxjzxifanzxw.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_BaBiHYfqG1rIf0ns3b-alQ_fqNRPoHe';

  const authenticatedClient = accessToken
    ? createSupabaseClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : sessionClient;

  let payload: CreateFormPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
  }

  // Set up streaming response
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: {
    status: 'PREPARING' | 'DRAFT_SAVED' | 'PROVISIONING' | 'LINKING' | 'FINALIZING' | 'COMPLETED' | 'ERROR';
    stepNumber: number;
    message: string;
    form?: any;
    error?: string;
    requiresReconnect?: boolean;
    reconnectUrl?: string;
  }) => {
    try {
      const line = JSON.stringify(event) + '\n';
      await writer.write(encoder.encode(line));
    } catch (e) {
      console.warn('Stream write error:', e);
    }
  };

  // Run the staged workflow asynchronously
  (async () => {
    try {
      // Step 0: Ensure Google credentials from Supabase are hydrated into memory before starting
      await ensureGoogleCredentialsLoaded();

      // Step 1: Fast local validation & draft creation
      await sendEvent({
        status: 'PREPARING',
        stepNumber: 1,
        message: 'Validating academic assignment & session configuration...',
      });

      const prepRes = await validateAndPrepareFormDraftAction(payload, authenticatedClient);
      if (!prepRes.success || !prepRes.draftFormId) {
        const isOAuth = (prepRes as any).requiresReconnect || isGoogleOAuthError(prepRes.error);
        const formatted = formatGoogleErrorMessage(prepRes.error, '/admin/dashboard/forms/create');
        await sendEvent({
          status: 'ERROR',
          stepNumber: 1,
          message: isOAuth
            ? 'Google authorization has expired or been revoked. Reconnect your Google account to continue.'
            : (prepRes.error || 'Validation failed.'),
          error: isOAuth
            ? 'Google authorization has expired or been revoked. Reconnect your Google account to continue.'
            : (prepRes.error || 'Validation failed.'),
          requiresReconnect: isOAuth ? true : (prepRes as any).requiresReconnect,
          reconnectUrl: isOAuth ? formatted.reconnectUrl : (prepRes as any).reconnectUrl,
        });
        await writer.close();
        return;
      }

      await sendEvent({
        status: 'DRAFT_SAVED',
        stepNumber: 2,
        message: 'Draft record created. Connecting to Google Forms & Sheets APIs...',
      });

      // Step 2: Provisioning Google Form + Sheet concurrently
      await sendEvent({
        status: 'PROVISIONING',
        stepNumber: 3,
        message: 'Creating Google Form container and connected Google Sheet in parallel...',
      });

      const provRes = await provisionGoogleFormAndSheetAction({
        draftFormId: prepRes.draftFormId,
        title: prepRes.title || 'Faculty Feedback Form',
        description: prepRes.description || '',
        items: (prepRes as any).validatedItems,
        client: authenticatedClient,
      });

      if (!provRes.success || !provRes.form) {
        const isOAuth = (provRes as any).requiresReconnect || isGoogleOAuthError(provRes.error);
        const formatted = formatGoogleErrorMessage(provRes.error, '/admin/dashboard/forms/create');
        await sendEvent({
          status: 'ERROR',
          stepNumber: 4,
          message: isOAuth
            ? 'Google authorization has expired or been revoked. Reconnect your Google account to continue.'
            : (provRes.error || 'Google provisioning failed.'),
          error: isOAuth
            ? 'Google authorization has expired or been revoked. Reconnect your Google account to continue.'
            : (provRes.error || 'Google provisioning failed.'),
          requiresReconnect: isOAuth ? true : (provRes as any).requiresReconnect,
          reconnectUrl: isOAuth ? formatted.reconnectUrl : (provRes as any).reconnectUrl,
        });
        await writer.close();
        return;
      }

      // Step 3: Complete
      await sendEvent({
        status: 'COMPLETED',
        stepNumber: 5,
        message: 'Google Form and response Sheet successfully generated!',
        form: provRes.form,
      });
    } catch (err: unknown) {
      const formatted = formatGoogleErrorMessage(err, '/admin/dashboard/forms/create');
      await sendEvent({
        status: 'ERROR',
        stepNumber: 5,
        message: formatted.requiresReconnect
          ? 'Google authorization has expired or been revoked. Reconnect your Google account to continue.'
          : formatted.message,
        error: formatted.requiresReconnect
          ? 'Google authorization has expired or been revoked. Reconnect your Google account to continue.'
          : formatted.message,
        requiresReconnect: formatted.requiresReconnect,
        reconnectUrl: formatted.reconnectUrl,
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // Stream writer may already be closed
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
