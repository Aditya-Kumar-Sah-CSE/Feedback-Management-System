import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { getFormAnalyticsData } from '@/lib/analytics/service';
import {
  generateIndividualFacultyPDF,
  generateSemesterComparativePDF,
} from '@/lib/analytics/pdf-generator';
import { getCollegeBranding } from '@/lib/tenant/branding';
import { isValidUUID } from '@/lib/validation';
import { assertPdfAccess } from '@/lib/billing/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let formId = 'unknown';
  try {
    const params = await context.params;
    formId = params?.id || 'unknown';

    // 1. Mandatory Active Admin Authentication Check
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized. Active admin credentials required to access report PDFs.' },
        { status: 401 }
      );
    }

    if (!formId || !isValidUUID(formId)) {
      return NextResponse.json({ error: 'Valid Feedback Form ID is required.' }, { status: 400 });
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

    // 3. Fetch Form Analytics using shared authoritative service (guaranteeing 100% parity with dashboard)
    const result = await getFormAnalyticsData(formId);
    if (!result.success || !result.report) {
      return NextResponse.json(
        { error: result.error || 'Feedback form not found or analytics unavailable.' },
        { status: 404 }
      );
    }

    const report = result.report;
    const branding = await getCollegeBranding(report.collegeId || session.activeCollegeId || '');
    const isSemester = report.isSemesterForm || report.formType === 'SEMESTER_FEEDBACK';
    const targetFaculty = request.nextUrl.searchParams.get('faculty');
    const requestedScope = request.nextUrl.searchParams.get('scope');

    // 3. Select Report Mode: Individual Faculty or Overall Semester Comparative
    let pdfBuffer: Buffer;
    let filename: string;
    const safeSlug = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (isSemester && (requestedScope === 'SEMESTER' || !targetFaculty)) {
      // Comparative Semester PDF
      pdfBuffer = await generateSemesterComparativePDF(report, branding);
      filename = `${branding.code}-Semester-Comparative-${safeSlug || report.formId}.pdf`;
    } else if (isSemester && targetFaculty) {
      // Specific Faculty inside semester form
      const matchedGrid = report.facultyGrids?.find(
        fg =>
          fg.facultyName.toLowerCase() === targetFaculty.toLowerCase() ||
          fg.gridTitle.toLowerCase().includes(targetFaculty.toLowerCase())
      );

      const targetReport = matchedGrid ? matchedGrid.report : report;
      pdfBuffer = await generateIndividualFacultyPDF(targetReport, branding);
      const facSlug = (matchedGrid?.facultyName || targetFaculty).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      filename = `${branding.code}-Faculty-Feedback-${facSlug}-${safeSlug || report.formId}.pdf`;
    } else {
      // Single faculty form
      pdfBuffer = await generateIndividualFacultyPDF(report, branding);
      filename = `${branding.code}-Faculty-Feedback-${safeSlug || report.formId}.pdf`;
    }

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    console.error('[PDF_GENERATION_ERROR]', {
      formId,
      errorName: errorObj.name,
      message: errorObj.message,
      cause: (errorObj as NodeJS.ErrnoException).code,
      path: (errorObj as NodeJS.ErrnoException).path,
      stack: errorObj.stack?.split('\n').slice(0, 8).join('\n'),
    });
    return NextResponse.json(
      { error: 'Failed to generate report PDF.', detail: errorObj.message },
      { status: 500 }
    );
  }
}
