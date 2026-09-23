import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requestAccessSchema, isValidUUID } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = requestAccessSchema.safeParse(body);

    if (!validation.success) {
      const issue = validation.error.issues[0];
      return NextResponse.json(
        { error: issue ? issue.message : 'Invalid request submission data.' },
        { status: 400 }
      );
    }

    const { name, email, collegeId, collegeSlug } = validation.data;
    const cleanEmail = email.trim().toLowerCase();
    const formattedName = name.trim();

    // Use SSR client first to respect authentication; fallback to service client if available
    const supabase = await createClient();
    const adminSupabase = createAdminClient() || supabase;

    // 1. Resolve Auth User ID (canonical identity)
    let resolvedUserId: string | null = null;
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (authUser) {
      resolvedUserId = authUser.id;
    } else if (body.userId && isValidUUID(body.userId)) {
      resolvedUserId = body.userId;
    } else {
      // Lookup or create in auth.users if password provided
      const adminClient = createAdminClient();
      if (adminClient) {
        try {
          const { data: userListData } = await adminClient.auth.admin.listUsers();
          const matchedUser = userListData?.users?.find(
            (u) => u.email?.toLowerCase() === cleanEmail
          );
          if (matchedUser) {
            resolvedUserId = matchedUser.id;
          } else if (
            body.password &&
            typeof body.password === 'string' &&
            body.password.length >= 6
          ) {
            const { data: newAuthData } = await adminClient.auth.admin.createUser({
              email: cleanEmail,
              password: body.password,
              email_confirm: true,
              user_metadata: { name: formattedName },
            });
            if (newAuthData?.user) {
              resolvedUserId = newAuthData.user.id;
            }
          }
        } catch (lookupErr) {
          console.warn('[REQUEST_ACCESS_AUTH_LOOKUP]', lookupErr);
        }
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json(
        { error: 'User registration required prior to submitting an administrator request.' },
        { status: 400 }
      );
    }

    // 2. Validate and resolve Target College
    // Do NOT default to BCE. User must explicitly request an institution.
    let targetCollegeId: string | null = null;

    if (collegeId) {
      const { data: col } = await adminSupabase
        .from('colleges')
        .select('id, name, is_active')
        .eq('id', collegeId)
        .eq('is_active', true)
        .maybeSingle();

      if (col) targetCollegeId = col.id;
    } else if (collegeSlug) {
      const { data: col } = await adminSupabase
        .from('colleges')
        .select('id, name, is_active')
        .eq('slug', collegeSlug.toLowerCase().trim())
        .eq('is_active', true)
        .maybeSingle();

      if (col) targetCollegeId = col.id;
    }

    if (!targetCollegeId) {
      return NextResponse.json(
        { error: 'Please select a valid, active institution to request administrator access.' },
        { status: 400 }
      );
    }

    // 3. Check if applicant is already an active member of this college
    const { data: existingMembership } = await adminSupabase
      .from('college_memberships')
      .select('id, role, status')
      .eq('user_id', resolvedUserId)
      .eq('college_id', targetCollegeId)
      .maybeSingle();

    if (existingMembership && existingMembership.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'You are already an active administrator for this institution. Please sign in.' },
        { status: 409 }
      );
    }

    // 4. Check for existing pending/rejected requests in college_admin_requests
    const { data: existingReq } = await adminSupabase
      .from('college_admin_requests')
      .select('id, status, created_at')
      .eq('college_id', targetCollegeId)
      .or(`user_id.eq.${resolvedUserId},email.eq.${cleanEmail}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let reqData;

    if (existingReq) {
      if (existingReq.status === 'PENDING') {
        return NextResponse.json({
          success: true,
          status: 'PENDING',
          alreadyPending: true,
          message: 'An access request for this institution is already pending approval from an administrator.',
        });
      }

      if (existingReq.status === 'APPROVED') {
        return NextResponse.json(
          { error: 'Your access request for this institution was already approved. Please sign in.' },
          { status: 409 }
        );
      }

      // If previously REJECTED, update back to PENDING
      const { data: updatedData, error: updateErr } = await adminSupabase
        .from('college_admin_requests')
        .update({
          user_id: resolvedUserId,
          name: formattedName,
          email: cleanEmail,
          status: 'PENDING',
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReq.id)
        .select('*')
        .single();

      if (updateErr) {
        console.error('[COLLEGE_ADMIN_REQUEST_UPDATE_ERROR]', updateErr);
        return NextResponse.json({ error: 'Failed to record admin request.' }, { status: 500 });
      }
      reqData = updatedData;
    } else {
      // 5. Insert new PENDING request into college_admin_requests
      const { data: insertedData, error: insertErr } = await adminSupabase
        .from('college_admin_requests')
        .insert({
          user_id: resolvedUserId,
          college_id: targetCollegeId,
          email: cleanEmail,
          name: formattedName,
          status: 'PENDING',
        })
        .select('*')
        .single();

      if (insertErr) {
        console.error('[COLLEGE_ADMIN_REQUEST_INSERT_ERROR]', insertErr);
        return NextResponse.json({ error: 'Failed to record admin request.' }, { status: 500 });
      }
      reqData = insertedData;
    }

    // 6. Record audit log
    try {
      await adminSupabase.from('audit_logs').insert({
        college_id: targetCollegeId,
        action: 'REQUEST_ADMIN_ACCESS',
        details: `Administrator access requested by ${formattedName} (${cleanEmail})`,
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      status: 'PENDING',
      isSuperAdmin: false,
      request: reqData,
    });
  } catch (error: any) {
    console.error('[REQUEST_ACCESS_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred while processing your request.' },
      { status: 500 }
    );
  }
}
