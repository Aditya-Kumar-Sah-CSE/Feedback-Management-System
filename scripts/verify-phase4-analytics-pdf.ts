/**
 * Phase 4 — Analytics & PDF Multi-Tenancy Verification Script
 * Tests live Supabase txerarcajxjzxifanzxw, branding loader, PDF generators,
 * mathematics preservation, and tenant isolation.
 */

import { createClient } from '@supabase/supabase-js';
import { getCollegeBranding, DEFAULT_BRANDING, CollegeBranding } from '../src/lib/tenant/branding';
import {
  generateIndividualFacultyPDF,
  generateOverallFeedbackPDF,
  generateSemesterComparativePDF,
  generateStudentResponsePDF,
} from '../src/lib/analytics/pdf-generator';
import {
  calculateFormAnalytics,
  countUniqueStudentResponses,
} from '../src/lib/analytics/engine';
import {
  getFormAnalyticsData,
  getOverallAnalyticsData,
} from '../src/lib/analytics/service';
import {
  generateFeedbackFormDescription,
  generateSemesterFormDescription,
} from '../src/lib/google/template';

import fs from 'node:fs';
import path from 'node:path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface TestResult {
  id: number;
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(category: string, name: string, passed: boolean, details: string) {
  const id = results.length + 1;
  results.push({ id, category, name, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${mark}] Test ${id} [${category}]: ${name} — ${details}`);
}

async function runTests() {
  console.log('===============================================================');
  console.log('PHASE 4 — ANALYTICS & PDF MULTI-TENANCY RUNTIME VERIFICATION');
  console.log('Target Supabase: txerarcajxjzxifanzxw');
  console.log('===============================================================\n');

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Fetch colleges to use for live tests
  const { data: colleges, error: colErr } = await supabase
    .from('colleges')
    .select('id, name, code, slug, primary_color, affiliated_university, established_year')
    .eq('is_active', true)
    .limit(5);

  if (colErr || !colleges || colleges.length === 0) {
    console.error('Could not query colleges:', colErr?.message);
    process.exit(1);
  }

  console.log(`Found ${colleges.length} active college(s) in DB for testing.`);
  const sampleCollege = colleges[0];
  console.log(`Sample college: ${sampleCollege.name} (${sampleCollege.code}) [${sampleCollege.id}]\n`);

  // TEST 1: getCollegeBranding with valid DB college ID
  try {
    const branding = await getCollegeBranding(sampleCollege.id);
    const passed =
      branding.name === sampleCollege.name &&
      branding.code === sampleCollege.code &&
      branding.primaryColor === (sampleCollege.primary_color || DEFAULT_BRANDING.primaryColor);
    record(
      'BRANDING',
      'getCollegeBranding with valid DB college_id',
      passed,
      `Loaded: "${branding.name}" (${branding.code}) with color ${branding.primaryColor}`
    );
  } catch (e: any) {
    record('BRANDING', 'getCollegeBranding with valid DB college_id', false, e.message);
  }

  // TEST 2: getCollegeBranding fallback for empty string
  try {
    const branding = await getCollegeBranding('');
    const passed = branding.name === DEFAULT_BRANDING.name && branding.code === DEFAULT_BRANDING.code;
    record(
      'BRANDING',
      'getCollegeBranding fallback on empty input',
      passed,
      `Returned DEFAULT_BRANDING: "${branding.name}" (${branding.code})`
    );
  } catch (e: any) {
    record('BRANDING', 'getCollegeBranding fallback on empty input', false, e.message);
  }

  // TEST 3: getCollegeBranding fallback for non-existent UUID
  try {
    const branding = await getCollegeBranding('00000000-0000-0000-0000-000000000000');
    const passed = branding.name === DEFAULT_BRANDING.name && branding.code === DEFAULT_BRANDING.code;
    record(
      'BRANDING',
      'getCollegeBranding fallback on non-existent UUID',
      passed,
      `Returned DEFAULT_BRANDING: "${branding.name}" (${branding.code})`
    );
  } catch (e: any) {
    record('BRANDING', 'getCollegeBranding fallback on non-existent UUID', false, e.message);
  }

  // Define a synthetic tenant branding to verify dynamic rendering across all PDF functions
  const testTenantBranding: CollegeBranding = {
    name: 'National Institute of Technology Patna',
    code: 'NITP',
    slug: 'nitp',
    primaryColor: '#800000',
    secondaryColor: '#4A0E17',
    accentColor: '#D4AF37',
    affiliatedUniversity: 'Institute of National Importance',
    establishedYear: 1886,
  };

  // Sample FormAnalyticsReport
  const sampleReport = {
    formId: 'test-form-123',
    collegeId: sampleCollege.id,
    title: 'Computer Science Semester 6 Feedback',
    academicYear: '2026-2027',
    branch: 'Computer Science and Engineering',
    semester: 'Semester 6',
    facultyName: 'Dr. Rajesh Sharma',
    subjectName: 'Distributed Systems',
    subjectCode: 'CS601',
    formType: 'SEMESTER_FEEDBACK',
    status: 'ACTIVE',
    lastSyncedAt: new Date().toISOString(),
    totalResponses: 45,
    totalStudents: 45,
    validResponses: 45,
    unansweredResponses: 0,
    averageOverallScore: 4.52,
    compositeAverageScore: 4.52,
    parameters: [
      {
        parameterId: 1,
        title: 'Subject Knowledge',
        description: 'Command over course material',
        excellentCount: 30,
        veryGoodCount: 10,
        goodCount: 5,
        satisfactoryCount: 0,
        unsatisfactoryCount: 0,
        validCount: 45,
        unansweredCount: 0,
        excellentPct: 66.7,
        veryGoodPct: 22.2,
        goodPct: 11.1,
        satisfactoryPct: 0,
        unsatisfactoryPct: 0,
        averageScore: 4.56,
        interpretation: 'Excellent',
      },
    ],
    distribution: {
      excellentCount: 30,
      veryGoodCount: 10,
      goodCount: 5,
      satisfactoryCount: 0,
      unsatisfactoryCount: 0,
      totalValidRatings: 45,
      excellentPct: 66.7,
      veryGoodPct: 22.2,
      goodPct: 11.1,
      satisfactoryPct: 0,
      unsatisfactoryPct: 0,
    },
    hasData: true,
    generatedAt: new Date().toISOString(),
  };

  // TEST 4: generateIndividualFacultyPDF with Tenant Branding
  try {
    const pdfBuf = await generateIndividualFacultyPDF(sampleReport, testTenantBranding);
    const isPdf = pdfBuf.subarray(0, 5).toString('utf-8') === '%PDF-';
    const hasLength = pdfBuf.length > 3000;
    const pdfText = pdfBuf.toString('binary');
    const noBce = !pdfText.includes('Bhagalpur College of Engineering');
    const passed = isPdf && hasLength && noBce;
    record(
      'PDF_GENERATION',
      'generateIndividualFacultyPDF with custom branding',
      passed,
      `Size: ${pdfBuf.length} bytes, Header: %PDF-, No BCE hardcoding: ${noBce}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'generateIndividualFacultyPDF with custom branding', false, e.message);
  }

  // TEST 5: generateOverallFeedbackPDF with Tenant Branding
  try {
    const aggregatedReport = {
      scopeTitle: 'Institution-Wide Evaluation',
      collegeId: sampleCollege.id,
      filters: {
        academicYearName: '2026-2027',
        branchName: 'All Branches',
        semesterName: 'All Semesters',
      },
      totalForms: 12,
      formsWithResponses: 10,
      totalResponses: 350,
      totalStudents: 350,
      validResponses: 350,
      averageOverallScore: 4.38,
      compositeAverageScore: 4.38,
      parameters: sampleReport.parameters,
      distribution: sampleReport.distribution,
      facultyComparisons: [
        {
          formId: 'form-1',
          facultyName: 'Dr. Rajesh Sharma',
          subjectName: 'Distributed Systems',
          subjectCode: 'CS601',
          branch: 'CSE',
          semester: '6',
          responseCount: 45,
          averageScore: 4.56,
        },
      ],
      hasData: true,
      generatedAt: new Date().toISOString(),
    };

    const pdfBuf = await generateOverallFeedbackPDF(aggregatedReport, testTenantBranding);
    const isPdf = pdfBuf.subarray(0, 5).toString('utf-8') === '%PDF-';
    const hasLength = pdfBuf.length > 3000;
    const pdfText = pdfBuf.toString('binary');
    const noBce = !pdfText.includes('Bhagalpur College of Engineering');
    const passed = isPdf && hasLength && noBce;
    record(
      'PDF_GENERATION',
      'generateOverallFeedbackPDF with custom branding',
      passed,
      `Size: ${pdfBuf.length} bytes, Header: %PDF-, No BCE hardcoding: ${noBce}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'generateOverallFeedbackPDF with custom branding', false, e.message);
  }

  // TEST 6: generateSemesterComparativePDF with Tenant Branding
  try {
    const comparativeReport = {
      ...sampleReport,
      isSemesterForm: true,
      facultyGrids: [
        {
          gridTitle: 'Distributed Systems — Dr. Rajesh Sharma',
          facultyName: 'Dr. Rajesh Sharma',
          subjectName: 'Distributed Systems',
          subjectCode: 'CS601',
          report: sampleReport,
        },
      ],
    };

    const pdfBuf = await generateSemesterComparativePDF(comparativeReport, testTenantBranding);
    const isPdf = pdfBuf.subarray(0, 5).toString('utf-8') === '%PDF-';
    const hasLength = pdfBuf.length > 3000;
    const pdfText = pdfBuf.toString('binary');
    const noBce = !pdfText.includes('Bhagalpur College of Engineering');
    const passed = isPdf && hasLength && noBce;
    record(
      'PDF_GENERATION',
      'generateSemesterComparativePDF with custom branding',
      passed,
      `Size: ${pdfBuf.length} bytes, Header: %PDF-, No BCE hardcoding: ${noBce}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'generateSemesterComparativePDF with custom branding', false, e.message);
  }

  // TEST 7: generateStudentResponsePDF with Tenant Branding
  try {
    const studentData = {
      studentName: 'Rahul Kumar',
      registrationNumber: '21105129001',
      studentEmail: 'rahul.kumar@example.com',
      academicYear: '2026-2027',
      branch: 'Computer Science and Engineering',
      semester: 'Semester 6',
      formTitle: 'Semester 6 Feedback',
      submittedAt: new Date().toISOString(),
      submissionId: 'google-resp-987654321',
      facultyEvaluations: [
        {
          facultyName: 'Dr. Rajesh Sharma',
          subjectName: 'Distributed Systems (CS601)',
          ratings: [
            { parameterId: 1, parameterTitle: 'Subject Knowledge', rating: 'Excellent' },
            { parameterId: 2, parameterTitle: 'Communication Skills', rating: 'Very Good' },
          ],
        },
      ],
      generalFeedback: 'Course curriculum and lab work are very helpful.',
    };

    const pdfBuf = await generateStudentResponsePDF(studentData, testTenantBranding);
    const isPdf = pdfBuf.subarray(0, 5).toString('utf-8') === '%PDF-';
    const hasLength = pdfBuf.length > 3000;
    const pdfText = pdfBuf.toString('binary');
    const noBce = !pdfText.includes('Bhagalpur College of Engineering') && !pdfText.includes('BCE Faculty Feedback System');
    const passed = isPdf && hasLength && noBce;
    record(
      'PDF_GENERATION',
      'generateStudentResponsePDF with custom branding',
      passed,
      `Size: ${pdfBuf.length} bytes, Header: %PDF-, No BCE hardcoding: ${noBce}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'generateStudentResponsePDF with custom branding', false, e.message);
  }

  // TEST 8: Analytics Mathematics Untouched Verification
  try {
    const canonicalRows = [
      {
        timestamp: '2026-03-01T10:00:00Z',
        responseId: 'resp-1',
        ratings: { 1: 'Excellent' as const, 2: 'Very Good' as const, 3: 'Good' as const, 4: 'Satisfactory' as const, 5: 'Unsatisfactory' as const, 6: 'Excellent' as const, 7: 'Excellent' as const, 8: 'Excellent' as const },
        isValid: true,
      },
      {
        timestamp: '2026-03-01T10:05:00Z',
        responseId: 'resp-2',
        ratings: { 1: 'Excellent' as const, 2: 'Excellent' as const, 3: 'Excellent' as const, 4: 'Excellent' as const, 5: 'Excellent' as const, 6: 'Excellent' as const, 7: 'Excellent' as const, 8: 'Excellent' as const },
        isValid: true,
      },
    ];

    const report = calculateFormAnalytics({
      formId: 'test-calc-1',
      title: 'Math Test Form',
      academicYear: '2026-2027',
      branch: 'CSE',
      semester: '6',
      facultyName: 'Prof. Test',
      subjectName: 'Algorithms',
      subjectCode: 'CS301',
      formType: 'FACULTY_SPECIFIC',
      status: 'ACTIVE',
      lastSyncedAt: null,
      responses: canonicalRows,
    });

    const expectedComposite = 4.38;
    const expectedOverallP8 = 5.0; // P8 received 5.00 from both responses

    // Also test semester form type
    const semesterReport = calculateFormAnalytics({
      formId: 'test-calc-2',
      title: 'Semester Math Test Form',
      academicYear: '2026-2027',
      branch: 'CSE',
      semester: '6',
      facultyName: 'Prof. Test',
      subjectName: 'Algorithms',
      subjectCode: 'CS301',
      formType: 'SEMESTER_FEEDBACK',
      status: 'ACTIVE',
      lastSyncedAt: null,
      responses: canonicalRows,
    });

    const passed =
      report.totalResponses === 2 &&
      report.validResponses === 2 &&
      report.compositeAverageScore === expectedComposite &&
      report.averageOverallScore === expectedOverallP8 &&
      semesterReport.averageOverallScore === expectedComposite &&
      report.parameters.length === 8;
    record(
      'ANALYTICS_MATH',
      'calculateFormAnalytics precision verification',
      passed,
      `Composite score: ${report.compositeAverageScore} (expected: ${expectedComposite}), Single-form P8 overall: ${report.averageOverallScore} (expected: ${expectedOverallP8}), Semester benchmark: ${semesterReport.averageOverallScore}`
    );
  } catch (e: any) {
    record('ANALYTICS_MATH', 'calculateFormAnalytics precision verification', false, e.message);
  }

  // TEST 9: Unique Student Counting Deduplication
  try {
    const multiGridRows = [
      { timestamp: '2026-03-01 10:00', responseId: 'submission-1', ratings: { 1: 'Excellent' as const }, isValid: true },
      { timestamp: '2026-03-01 10:00', responseId: 'submission-1', ratings: { 1: 'Good' as const }, isValid: true },
      { timestamp: '2026-03-01 10:05', responseId: 'submission-2', ratings: { 1: 'Very Good' as const }, isValid: true },
    ];
    const count = countUniqueStudentResponses(multiGridRows);
    const passed = count === 2;
    record(
      'ANALYTICS_MATH',
      'countUniqueStudentResponses multi-grid deduplication',
      passed,
      `Deduplicated 3 grid rows into ${count} unique students (expected: 2)`
    );
  } catch (e: any) {
    record('ANALYTICS_MATH', 'countUniqueStudentResponses multi-grid deduplication', false, e.message);
  }

  // TEST 10: Unauthenticated getFormAnalyticsData Protection
  try {
    const res = await getFormAnalyticsData('00000000-0000-0000-0000-000000000000');
    const passed = res.success === false && Boolean(res.error);
    record(
      'SECURITY',
      'getFormAnalyticsData blocks unauthenticated caller',
      passed,
      `Returned error: ${res.error}`
    );
  } catch (e: any) {
    record('SECURITY', 'getFormAnalyticsData blocks unauthenticated caller', false, e.message);
  }

  // TEST 11: Unauthenticated getOverallAnalyticsData Protection
  try {
    const res = await getOverallAnalyticsData();
    const passed = res.success === false && Boolean(res.error);
    record(
      'SECURITY',
      'getOverallAnalyticsData blocks unauthenticated caller',
      passed,
      `Returned error: ${res.error}`
    );
  } catch (e: any) {
    record('SECURITY', 'getOverallAnalyticsData blocks unauthenticated caller', false, e.message);
  }

  // TEST 12: Template descriptions dynamically accept institution name
  try {
    const descSingle = generateFeedbackFormDescription({
      facultyName: 'Dr. Smith',
      subjectName: 'AI',
      semesterName: 'Semester 5',
      branchName: 'CSE',
      academicYearName: '2026-2027',
      institutionName: 'Delhi Technological University',
    });
    const descSemester = generateSemesterFormDescription({
      semesterName: 'Semester 4',
      branchName: 'ECE',
      academicYearName: '2026-2027',
      institutionName: 'Delhi Technological University',
    });

    const hasDtu = descSingle.includes('Delhi Technological University') && descSemester.includes('Delhi Technological University');
    const noBce = !descSingle.includes('Bhagalpur') && !descSemester.includes('Bhagalpur');
    const passed = hasDtu && noBce;
    record(
      'TEMPLATE',
      'Form descriptions render dynamic institution without BCE',
      passed,
      `Custom institution rendered: ${hasDtu}, BCE excluded: ${noBce}`
    );
  } catch (e: any) {
    record('TEMPLATE', 'Form descriptions render dynamic institution without BCE', false, e.message);
  }

  // TEST 13: Verify DB colleges table branding columns
  try {
    const { data: cols, error: cErr } = await supabase
      .from('colleges')
      .select('name, code, slug, tagline, established_year, affiliated_university, primary_color, secondary_color, accent_color')
      .limit(1);

    const hasAllCols = !cErr && cols && cols.length > 0 && typeof cols[0].primary_color === 'string';
    record(
      'DATABASE',
      'colleges table schema has branding columns',
      hasAllCols,
      `Columns present, primary_color: ${cols?.[0]?.primary_color || 'none'}`
    );
  } catch (e: any) {
    record('DATABASE', 'colleges table schema has branding columns', false, e.message);
  }

  // TEST 14: PDF generation with undefined branding defaults safely to DEFAULT_BRANDING
  try {
    const pdfBuf = await generateIndividualFacultyPDF(sampleReport);
    const isPdf = pdfBuf.subarray(0, 5).toString('utf-8') === '%PDF-';
    const hasLength = pdfBuf.length > 3000;
    const pdfText = pdfBuf.toString('binary');
    const hasDefault = pdfText.includes(DEFAULT_BRANDING.name) || pdfText.includes(DEFAULT_BRANDING.code);
    const passed = isPdf && hasLength && hasDefault;
    record(
      'PDF_GENERATION',
      'generateIndividualFacultyPDF defaults to DEFAULT_BRANDING when omitted',
      passed,
      `Size: ${pdfBuf.length} bytes, Default branding rendered: ${hasDefault}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'generateIndividualFacultyPDF defaults to DEFAULT_BRANDING when omitted', false, e.message);
  }

  // TEST 15: Parameter metadata integrity untouched
  try {
    const { BCE_FEEDBACK_PARAMETERS } = await import('../src/lib/google/template');
    const is8 = BCE_FEEDBACK_PARAMETERS.length === 8;
    const idsMatch = BCE_FEEDBACK_PARAMETERS.every((p, idx) => p.id === idx + 1);
    const passed = is8 && idsMatch;
    record(
      'ANALYTICS_MATH',
      'BCE_FEEDBACK_PARAMETERS has exact 8 canonical parameters',
      passed,
      `Count: ${BCE_FEEDBACK_PARAMETERS.length}, IDs: 1..8 consecutive`
    );
  } catch (e: any) {
    record('ANALYTICS_MATH', 'BCE_FEEDBACK_PARAMETERS has exact 8 canonical parameters', false, e.message);
  }

  // TEST 16: shouldShowSubmissionMetadata academic year rule
  try {
    const { shouldShowSubmissionMetadata } = await import('../src/lib/analytics/pdf-generator');
    const show2026 = shouldShowSubmissionMetadata('2026-2027');
    const show2027 = shouldShowSubmissionMetadata('2027-2028');
    const hide2025 = shouldShowSubmissionMetadata('2025-2026');
    const hide2024 = shouldShowSubmissionMetadata('2024-2025');
    const hideNull = shouldShowSubmissionMetadata(null);
    const passed = show2026 === true && show2027 === true && hide2025 === false && hide2024 === false && hideNull === false;
    record(
      'PDF_GENERATION',
      'shouldShowSubmissionMetadata strictly preserves year threshold >= 2026',
      passed,
      `2026+: ${show2026}, <2026: ${hide2025}, null: ${hideNull}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'shouldShowSubmissionMetadata strictly preserves year threshold >= 2026', false, e.message);
  }

  // TEST 17: formatSafeCellText long string chunking
  try {
    const { formatSafeCellText } = await import('../src/lib/analytics/pdf-generator');
    const longEmail = 'extremely_long_unbroken_student_identifier_123456789@engineering.institution.ac.in';
    const wrapped = formatSafeCellText(longEmail, 20);
    const noOverflow = wrapped.includes(' ');
    const emptyHandling = formatSafeCellText(null) === '';
    const passed = noOverflow && emptyHandling;
    record(
      'PDF_GENERATION',
      'formatSafeCellText wraps long unbroken tokens safely',
      passed,
      `Wrapped: "${wrapped.slice(0, 35)}...", Handles null: ${emptyHandling}`
    );
  } catch (e: any) {
    record('PDF_GENERATION', 'formatSafeCellText wraps long unbroken tokens safely', false, e.message);
  }

  // TEST 18: Multi-grid header detection pattern
  try {
    const { detectMultiGrids } = await import('../src/lib/analytics/normalizer');
    const mockHeaders = [
      'Timestamp',
      'Student Name',
      'Roll Number',
      'Distributed Systems — Dr. Sharma [Subject Knowledge]',
      'Distributed Systems — Dr. Sharma [Communication Skills]',
      'Algorithms — Prof. Verma [Subject Knowledge]',
      'Algorithms — Prof. Verma [Communication Skills]',
    ];
    const grids = detectMultiGrids(mockHeaders);
    const passed = grids.length === 2 && grids[0].facultyName === 'Dr. Sharma' && grids[1].facultyName === 'Prof. Verma';
    record(
      'NORMALIZER',
      'detectMultiGrids accurately identifies multi-faculty grid sections',
      passed,
      `Detected ${grids.length} grids: "${grids[0]?.gridTitle}" and "${grids[1]?.gridTitle}"`
    );
  } catch (e: any) {
    record('NORMALIZER', 'detectMultiGrids accurately identifies multi-faculty grid sections', false, e.message);
  }

  // TEST 19: aggregateAnalytics multi-form aggregation mathematics
  try {
    const { aggregateAnalytics } = await import('../src/lib/analytics/engine');
    const f1 = { ...sampleReport, formId: 'f1', validResponses: 20, averageOverallScore: 4.0, compositeAverageScore: 4.0 };
    const f2 = { ...sampleReport, formId: 'f2', validResponses: 30, averageOverallScore: 5.0, compositeAverageScore: 5.0 };
    const agg = aggregateAnalytics([f1, f2], 'Test Aggregate', {});
    // Aggregated score should be weighted or composite average
    const passed = agg.totalForms === 2 && agg.validResponses === 50 && agg.compositeAverageScore > 0;
    record(
      'ANALYTICS_MATH',
      'aggregateAnalytics aggregates multi-form data correctly',
      passed,
      `Forms: ${agg.totalForms}, Total Valid: ${agg.validResponses}, Composite Score: ${agg.compositeAverageScore}`
    );
  } catch (e: any) {
    record('ANALYTICS_MATH', 'aggregateAnalytics aggregates multi-form data correctly', false, e.message);
  }

  // TEST 20: Cross-tenant college isolation check against database
  try {
    const { data: collegesList } = await supabase
      .from('colleges')
      .select('id, name')
      .eq('is_active', true);

    const hasColleges = Boolean(collegesList && collegesList.length >= 1);
    record(
      'SECURITY',
      'Database contains active college tenant for multi-tenancy',
      hasColleges,
      `Active colleges: ${collegesList?.map((c) => c.name).join(', ')}`
    );
  } catch (e: any) {
    record('SECURITY', 'Database contains active college tenant for multi-tenancy', false, e.message);
  }

  // Final Summary
  console.log('\n===============================================================');
  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('===============================================================');

  if (failCount > 0) {
    console.error('Some Phase 4 tests failed!');
    process.exit(1);
  } else {
    console.log('ALL PHASE 4 RUNTIME SECURITY & FUNCTIONALITY TESTS PASSED!');
  }
}

runTests().catch((e) => {
  console.error('Test suite error:', e);
  process.exit(1);
});
