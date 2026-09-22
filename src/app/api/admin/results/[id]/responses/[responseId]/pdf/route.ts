import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSingleResponseFromSheet } from '@/lib/google/sheets';
import { syncFormResponsesToSheet } from '@/lib/google/sync';
import { BCE_FEEDBACK_PARAMETERS } from '@/lib/google/template';
import { generateStudentResponsePDF, StudentResponsePDFData } from '@/lib/analytics/pdf-generator';
import { getCollegeBranding } from '@/lib/tenant/branding';
import { isValidUUID } from '@/lib/validation';
import { assertPdfAccess } from '@/lib/billing/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; responseId: string }> }
) {
  let formId = 'unknown';
  let responseId = 'unknown';

  try {
    const params = await context.params;
    formId = params?.id || 'unknown';
    responseId = params?.responseId || 'unknown';

    // 1. Mandatory Active Admin Authentication Check
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized. Active admin credentials required to access student response PDF.' },
        { status: 401 }
      );
    }

    // 2. Mandatory PDF Reports & Exports Authorization Check
    const access = await assertPdfAccess(session);

    if (!access.allowed) {
      return NextResponse.json(
        {
          error: access.reason || 'PDF Reports & Exports are locked on your current plan. Please upgrade to Full Access to download PDF reports.',
          code: access.code || 'PDF_EXPORT_LOCKED',
        },
        { status: 403 }
      );
    }

    // 2. Validate Form ID format
    if (!formId || !isValidUUID(formId)) {
      return NextResponse.json(
        { error: 'Valid Feedback Form ID is required.' },
        { status: 400 }
      );
    }

    // 3. Decode and validate Response ID
    const decodedResponseId = decodeURIComponent(responseId).trim();
    if (!decodedResponseId || decodedResponseId === 'unknown') {
      return NextResponse.json(
        { error: 'Valid Student Response ID is required.' },
        { status: 400 }
      );
    }

    // 4. Fetch Form Metadata with accurate relations
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database service unavailable.' },
        { status: 503 }
      );
    }

    const { data: form, error: formErr } = await supabase
      .from('feedback_forms')
      .select(`
        id,
        college_id,
        title,
        form_type,
        google_form_id,
        google_sheet_id,
        google_sheet_url,
        branch:branches(name),
        semester:semesters(name),
        academic_year:academic_years(name),
        faculty:faculties(name),
        subject:subjects(name, code),
        items:feedback_form_items(
          grid_title,
          order_index,
          faculty:faculties(name),
          subject:subjects(name, code)
        )
      `)
      .eq('id', formId)
      .maybeSingle();

    if (formErr || !form) {
      return NextResponse.json(
        { error: 'Feedback form not found.' },
        { status: 404 }
      );
    }

    // Verify admin authorization for this form's institution
    if (!session.isPlatformSuperAdmin) {
      const isMember = session.colleges?.some(
        (c) => c.collegeId === form.college_id && c.status === 'ACTIVE'
      );
      if (!isMember) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have permission to access responses for this institution.' },
          { status: 403 }
        );
      }
    }

    // 5. Try resolving response from cached feedback_response_records first
    let targetGoogleResponseId = decodedResponseId;
    let cachedRecord = null;

    if (isValidUUID(decodedResponseId)) {
      const { data: rec } = await supabase
        .from('feedback_response_records')
        .select('*')
        .eq('form_id', formId)
        .eq('id', decodedResponseId)
        .maybeSingle();

      if (rec) {
        cachedRecord = rec;
        targetGoogleResponseId = rec.google_response_id || decodedResponseId;
      }
    } else {
      const { data: rec } = await supabase
        .from('feedback_response_records')
        .select('*')
        .eq('form_id', formId)
        .eq('google_response_id', decodedResponseId)
        .maybeSingle();

      if (rec) {
        cachedRecord = rec;
      }
    }

    // 6. Locate authoritative Google Sheet
    const sheetId =
      form.google_sheet_id ||
      form.google_sheet_url?.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];

    if (!sheetId) {
      return NextResponse.json(
        { error: 'Connected Google Sheet not found for this feedback form.' },
        { status: 404 }
      );
    }

    // 7. Fetch authoritative raw response from Google Sheet using college connection
    let sheetData = await fetchSingleResponseFromSheet(sheetId, targetGoogleResponseId, form.college_id);
    if (!sheetData && targetGoogleResponseId !== decodedResponseId) {
      sheetData = await fetchSingleResponseFromSheet(sheetId, decodedResponseId, form.college_id);
    }

    if (!sheetData && form.google_form_id) {
      // Attempt on-demand sync if response was newly submitted
      try {
        await syncFormResponsesToSheet({
          googleFormId: form.google_form_id,
          googleSheetId: sheetId,
          formId,
          callerSession: session,
        });
        sheetData = await fetchSingleResponseFromSheet(sheetId, targetGoogleResponseId, form.college_id);
        if (!sheetData && targetGoogleResponseId !== decodedResponseId) {
          sheetData = await fetchSingleResponseFromSheet(sheetId, decodedResponseId, form.college_id);
        }
      } catch (syncErr) {
        console.warn('[STUDENT_RESPONSE_PDF] Sync retry failed:', syncErr);
      }
    }

    if (!sheetData) {
      return NextResponse.json(
        { error: 'Student response record not found in authoritative Google Sheet.' },
        { status: 404 }
      );
    }

    const { headers, row } = sheetData;

    // 8. Extract Student Metadata (with cached record fallback)
    let studentName: string | null = cachedRecord?.student_name || null;
    let registrationNumber: string | null = cachedRecord?.registration_number || null;
    let studentEmail = cachedRecord?.student_email || '';
    let submittedAt: string | null = cachedRecord?.submitted_at || null;
    let generalFeedback: string | null = null;

    headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      const val = row[idx] || '';

      if (lower.includes('timestamp') || lower === 'date' || lower === 'time') {
        if (val) submittedAt = val;
      } else if (lower.includes('email') || lower.includes('username')) {
        if (val) studentEmail = val;
      } else if (
        lower.includes('student name') ||
        (lower.includes('name') && !lower.includes('faculty') && !lower.includes('subject'))
      ) {
        if (val) studentName = val;
      } else if (lower.includes('registration') || lower.includes('reg') || lower.includes('roll')) {
        if (val) registrationNumber = val;
      } else if (
        lower.includes('general feedback') ||
        lower.includes('suggestion') ||
        lower.includes('comment')
      ) {
        if (val) generalFeedback = val;
      }
    });

    // 9. Extract Faculty Evaluation Ratings
    const facultyEvaluations: StudentResponsePDFData['facultyEvaluations'] = [];

    if (form.form_type === 'SEMESTER_FEEDBACK' && form.items && form.items.length > 0) {
      const sortedItems = [...form.items].sort(
        (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
      );

      for (const item of sortedItems) {
        const fName = (item.faculty as any)?.name || 'Faculty Member';
        const sName = (item.subject as any)?.name || 'Subject';
        const sCode = (item.subject as any)?.code || '';
        const fullSubject = sCode ? `${sName} (${sCode})` : sName;
        const expectedPrefix = (item.grid_title || `${sName} — ${fName}`).toLowerCase();

        const ratings: Array<{ parameterId: number; parameterTitle: string; rating: string }> = [];

        for (const param of BCE_FEEDBACK_PARAMETERS) {
          let ratingVal = 'Not Rated';
          const pLower = param.title.toLowerCase();

          for (let c = 0; c < headers.length; c++) {
            const hLower = headers[c].toLowerCase();
            if (
              (hLower.includes(expectedPrefix) ||
                expectedPrefix.includes(hLower.split('[')[0].trim())) &&
              hLower.includes(pLower)
            ) {
              ratingVal = row[c] || 'Not Rated';
              break;
            }
          }

          ratings.push({
            parameterId: param.id,
            parameterTitle: param.title,
            rating: ratingVal,
          });
        }

        facultyEvaluations.push({
          facultyName: fName,
          subjectName: fullSubject,
          ratings,
        });
      }
    } else {
      const fName = (form.faculty as any)?.name || 'Faculty Member';
      const sName = (form.subject as any)?.name || 'Subject';
      const sCode = (form.subject as any)?.code || '';
      const fullSubject = sCode ? `${sName} (${sCode})` : sName;

      const ratings: Array<{ parameterId: number; parameterTitle: string; rating: string }> = [];

      for (const param of BCE_FEEDBACK_PARAMETERS) {
        let ratingVal = 'Not Rated';
        const pLower = param.title.toLowerCase();

        for (let c = 0; c < headers.length; c++) {
          const hLower = headers[c].toLowerCase();
          if (
            hLower.startsWith(`${param.id}.`) ||
            hLower.startsWith(`${param.id}:`) ||
            hLower.startsWith(`${param.id} `) ||
            hLower.includes(pLower)
          ) {
            ratingVal = row[c] || 'Not Rated';
            break;
          }
        }

        ratings.push({
          parameterId: param.id,
          parameterTitle: param.title,
          rating: ratingVal,
        });
      }

      facultyEvaluations.push({
        facultyName: fName,
        subjectName: fullSubject,
        ratings,
      });
    }

    // 10. Generate Student Response PDF Binary with Tenant Branding
    const branding = await getCollegeBranding(form.college_id);
    const pdfBuffer = await generateStudentResponsePDF({
      studentName,
      registrationNumber,
      studentEmail,
      academicYear: (form.academic_year as any)?.name || 'Academic Session',
      branch: (form.branch as any)?.name || 'Engineering',
      semester: (form.semester as any)?.name || 'Semester',
      formTitle: form.title,
      submittedAt,
      submissionId: targetGoogleResponseId || decodedResponseId,
      facultyEvaluations,
      generalFeedback,
    }, branding);

    const safeReg = (registrationNumber || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeRespId = targetGoogleResponseId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 10);
    const filename = `${branding.code}-student-response-${safeReg}-${safeRespId}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    console.error('[ADMIN_RESPONSE_PDF_ERROR]', {
      formId,
      responseId,
      errorName: errorObj.name,
      message: errorObj.message,
      stack: errorObj.stack?.split('\n').slice(0, 8).join('\n'),
    });
    return NextResponse.json(
      { error: 'Failed to generate student response PDF.', detail: errorObj.message },
      { status: 500 }
    );
  }
}
