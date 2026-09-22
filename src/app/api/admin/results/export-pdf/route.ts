import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { getOverallAnalyticsData } from '@/lib/analytics/service';
import { generateOverallFeedbackPDF } from '@/lib/analytics/pdf-generator';
import { getCollegeBranding } from '@/lib/tenant/branding';
import { assertPdfAccess } from '@/lib/billing/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // 1. Mandatory Active Admin Authentication Check
    const session = await getAdminSession();
    if (!session.isAuthenticated || !session.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized. Active admin credentials required to access institutional report PDFs.' },
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

    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get('academicYearId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const semesterId = searchParams.get('semesterId') || undefined;
    const facultyId = searchParams.get('facultyId') || undefined;
    const subjectId = searchParams.get('subjectId') || undefined;

    const targetCollegeId = session.activeCollegeId;
    if (!targetCollegeId && !session.isPlatformSuperAdmin) {
      return NextResponse.json(
        { error: 'Active college context is required.' },
        { status: 400 }
      );
    }

    // 2. Compute Aggregated Analytics using pure service
    const result = await getOverallAnalyticsData({
      collegeId: targetCollegeId || undefined,
      academicYearId,
      branchId,
      semesterId,
      facultyId,
      subjectId,
    });

    if (!result.success || !result.report) {
      return NextResponse.json(
        { error: result.error || 'Failed to generate analytics report.' },
        { status: 400 }
      );
    }

    // 3. Generate PDF Buffer with Tenant Branding
    const branding = await getCollegeBranding(result.report.collegeId || targetCollegeId || '');
    const pdfBuffer = await generateOverallFeedbackPDF(result.report, branding);

    const safeScopeName = result.report.scopeTitle
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 40);
    const filename = `${branding.code}-Institutional-Feedback-${safeScopeName}.pdf`;

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
    console.error('[INSTITUTIONAL_PDF_GENERATION_ERROR]', {
      errorName: errorObj.name,
      message: errorObj.message,
      cause: (errorObj as NodeJS.ErrnoException).code,
      path: (errorObj as NodeJS.ErrnoException).path,
      stack: errorObj.stack?.split('\n').slice(0, 8).join('\n'),
    });
    return NextResponse.json(
      { error: 'Failed to generate institutional report PDF.', detail: errorObj.message },
      { status: 500 }
    );
  }
}
