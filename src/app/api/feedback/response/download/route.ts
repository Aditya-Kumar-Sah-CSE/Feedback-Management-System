import { NextRequest, NextResponse } from 'next/server';
import { verifyResponseToken } from '@/lib/feedback/response-token';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchSingleResponseFromSheet } from '@/lib/google/sheets';
import { BCE_FEEDBACK_PARAMETERS } from '@/lib/google/template';
import { generateStudentResponsePDF, StudentResponsePDFData } from '@/lib/analytics/pdf-generator';
import { getCollegeBranding } from '@/lib/tenant/branding';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const queryFormId = searchParams.get('formId');
  const queryResponseId = searchParams.get('responseId');

  let verifiedFormId: string | null = null;
  let verifiedResponseId: string | null = null;
  let adminUserId: string | null = null;

  // 1. Verify Student Token
  if (token) {
    const payload = verifyResponseToken(token);
    if (payload) {
      verifiedFormId = payload.formId;
      verifiedResponseId = payload.responseId;
    }
  }

  // 2. Alternatively check for active Admin Session
  if (!verifiedFormId && queryFormId && queryResponseId) {
    const supabaseUser = await createClient();
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (user) {
      const supabaseAdmin = createAdminClient();
      if (supabaseAdmin) {
        const { data: adminCheck } = await supabaseAdmin.rpc('is_admin', {
          target_user_id: user.id,
        });
        if (adminCheck) {
          verifiedFormId = queryFormId;
          verifiedResponseId = queryResponseId;
          adminUserId = user.id;
        }
      }
    }
  }

  if (!verifiedFormId || !verifiedResponseId) {
    return new NextResponse(
      JSON.stringify({
        error: 'Unauthorized or expired download token. Please request a new verification link.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Fetch Form Metadata
  const supabase = createAdminClient();
  if (!supabase) {
    return new NextResponse('Database connection unavailable', { status: 500 });
  }

  const { data: form } = await supabase
    .from('feedback_forms')
    .select(`
      id,
      college_id,
      title,
      form_type,
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
    .eq('id', verifiedFormId)
    .maybeSingle();

  if (!form) {
    return new NextResponse('Feedback form not found', { status: 404 });
  }

  // Verify admin authorization for this form's college if accessed via admin session
  if (adminUserId) {
    const { data: isSuperAdmin } = await supabase.rpc('is_platform_super_admin', {
      target_user_id: adminUserId,
    });
    if (!isSuperAdmin) {
      const { data: hasMembership } = await supabase
        .from('college_admins')
        .select('id')
        .eq('user_id', adminUserId)
        .eq('college_id', form.college_id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (!hasMembership) {
        return new NextResponse('Forbidden: You do not have permission to access responses for this institution', {
          status: 403,
        });
      }
    }
  }

  const sheetId =
    form.google_sheet_id ||
    form.google_sheet_url?.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];

  if (!sheetId) {
    return new NextResponse('Connected Google Sheet not found for this form', { status: 404 });
  }

  // 4. Fetch the authoritative raw response row from Google Sheet
  const sheetData = await fetchSingleResponseFromSheet(sheetId, verifiedResponseId, form.college_id);
  if (!sheetData) {
    return new NextResponse('Response record not found in authoritative Google Sheet', { status: 404 });
  }

  const { headers, row } = sheetData;

  // Extract base student columns
  let studentName: string | null = null;
  let registrationNumber: string | null = null;
  let studentEmail = '';
  let submittedAt: string | null = null;
  let generalFeedback: string | null = null;

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    const val = row[idx] || '';

    if (lower.includes('timestamp') || lower === 'date' || lower === 'time') {
      submittedAt = val;
    } else if (lower.includes('email') || lower.includes('username')) {
      studentEmail = val;
    } else if (lower.includes('student name') || (lower.includes('name') && !lower.includes('faculty') && !lower.includes('subject'))) {
      studentName = val;
    } else if (lower.includes('registration') || lower.includes('reg') || lower.includes('roll')) {
      registrationNumber = val;
    } else if (lower.includes('general feedback') || lower.includes('suggestion') || lower.includes('comment')) {
      generalFeedback = val;
    }
  });

  // Extract faculty evaluations
  const facultyEvaluations: StudentResponsePDFData['facultyEvaluations'] = [];

  if (form.form_type === 'SEMESTER_FEEDBACK' && form.items && form.items.length > 0) {
    // Multi-faculty semester form
    const sortedItems = [...form.items].sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

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

        // Locate header containing both the grid identifier and the parameter title
        for (let c = 0; c < headers.length; c++) {
          const hLower = headers[c].toLowerCase();
          if (
            (hLower.includes(expectedPrefix) || expectedPrefix.includes(hLower.split('[')[0].trim())) &&
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
    // Single-faculty feedback form
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

  // Generate PDF
  try {
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
      submissionId: verifiedResponseId,
      facultyEvaluations,
      generalFeedback,
    }, branding);

    const safeReg = (registrationNumber || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${branding.code}_Feedback_Response_${safeReg}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    console.error('[STUDENT_RESPONSE_DOWNLOAD_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to generate response PDF.' },
      { status: 500 }
    );
  }
}

