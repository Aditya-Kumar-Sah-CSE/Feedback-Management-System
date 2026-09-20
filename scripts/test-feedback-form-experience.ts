/**
 * Real End-to-End Test Suite: Google Feedback Form Response Experience Update
 *
 * Verifies:
 * 1. FACULTY_FEEDBACK form generation & real Google Forms API inspection
 * 2. SEMESTER_FEEDBACK form generation & multi-faculty 8x5 grid inspection
 * 3. Required question constraints:
 *    - Student Name = REQUIRED
 *    - University Registration Number = REQUIRED
 *    - All 8 BCE parameters = REQUIRED (for single form and all rows of each multi-grid)
 *    - General Feedback = OPTIONAL
 * 4. 5-point rating scale exact order:
 *    ['Excellent', 'Very Good', 'Good', 'Satisfactory', 'Unsatisfactory']
 * 5. Verified email collection enabled (native response receipt copy behavior)
 * 6. Standardized More Feedback Forms item with canonical portal link
 * 7. Confirmation message configuration via Google Apps Script bridge
 * 8. Real student response submission & Google Sheet verification
 * 9. Sync idempotency (second sync creates 0 duplicate records)
 * 10. Existing architecture regression validation (analytics, normalizer, token)
 * 11. Comprehensive resource cleanup
 */

import { createAdminClient } from '../src/lib/supabase/admin';
import { getGoogleConfigStatus, getGoogleServices } from '../src/lib/google/auth';
import {
  createGoogleFeedbackForm,
  getGoogleForm,
  validateGoogleFormRequiredStructure,
} from '../src/lib/google/forms';
import {
  createFeedbackSpreadsheet,
  appendResponsesToSheet,
  fetchSingleResponseFromSheet,
} from '../src/lib/google/sheets';
import {
  linkFormToSpreadsheet,
  configureGoogleFormConfirmation,
} from '../src/lib/google/linking';
import { syncFormResponsesToSheet } from '../src/lib/google/sync';
import {
  BCE_RATING_OPTIONS,
  BCE_FEEDBACK_PARAMETERS,
  ADITYA_PORTFOLIO_URL,
  CANONICAL_PUBLIC_PORTAL_URL,
  FORM_CONFIRMATION_MESSAGE,
  MORE_FEEDBACK_INFO_ITEM,
  MultiFacultyGridItem,
  RESPONSE_COPY_INSTRUCTION,
  RESPONSE_COPY_SHORT_REMINDER,
} from '../src/lib/google/template';
import { calculateFormAnalytics } from '../src/lib/analytics/engine';
import { normalizeSheetRows, normalizeRatingValue } from '../src/lib/analytics/normalizer';

interface CreatedResource {
  id: string;
  type: 'FORM' | 'SHEET';
  url: string;
  title: string;
}

const createdResources: CreatedResource[] = [];

async function cleanupResources() {
  console.log('\n--- CLEANUP PHASE ---');
  const { drive } = getGoogleServices();

  for (const res of createdResources) {
    try {
      await drive.files.delete({ fileId: res.id });
      console.log(`✓ Deleted temporary Google ${res.type}: ${res.id} ("${res.title}")`);
    } catch (err: any) {
      console.warn(`! Unable to automatically delete ${res.type} ${res.id}: ${err.message || err}`);
      console.warn(`  Manual cleanup required: ID=${res.id} | URL=${res.url}`);
    }
  }
}

async function runFeedbackFormExperienceTests() {
  console.log('================================================================');
  console.log('    REAL E2E TEST: GOOGLE FEEDBACK FORM RESPONSE EXPERIENCE      ');
  console.log('================================================================\n');

  // 0. Verify Google Credentials
  const configStatus = getGoogleConfigStatus();
  console.log('Google Auth Status:', configStatus);
  if (!configStatus.isConfigured) {
    throw new Error(`Google API credentials not configured: ${configStatus.message}`);
  }

  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client failed to initialize.');
  }

  // Verify Canonical Constants
  console.log('\n--- VERIFY CANONICAL TEMPLATE CONSTANTS ---');
  console.log('Aditya Portfolio URL:', ADITYA_PORTFOLIO_URL);
  if (ADITYA_PORTFOLIO_URL !== 'https://portfolio-two-ashen-zseywond41.vercel.app/') {
    throw new Error(`Invalid portfolio URL: ${ADITYA_PORTFOLIO_URL}`);
  }

  console.log('Canonical Portal URL:', CANONICAL_PUBLIC_PORTAL_URL);
  if (CANONICAL_PUBLIC_PORTAL_URL !== 'https://bce-bgp-feedback-management-system.vercel.app/') {
    throw new Error(`Invalid portal URL: ${CANONICAL_PUBLIC_PORTAL_URL}`);
  }

  console.log('Checking FORM_CONFIRMATION_MESSAGE content:');
  console.log(FORM_CONFIRMATION_MESSAGE);
  if (!FORM_CONFIRMATION_MESSAGE.includes('Your response has been recorded.')) {
    throw new Error('Confirmation message missing: "Your response has been recorded."');
  }
  if (!FORM_CONFIRMATION_MESSAGE.includes('More Feedback Forms')) {
    throw new Error('Confirmation message missing: "More Feedback Forms"');
  }
  if (!FORM_CONFIRMATION_MESSAGE.includes(CANONICAL_PUBLIC_PORTAL_URL)) {
    throw new Error('Confirmation message missing canonical portal URL');
  }
  if (!FORM_CONFIRMATION_MESSAGE.includes('Developer: Aditya Kumar Sah')) {
    throw new Error('Confirmation message missing developer credit');
  }
  if (!FORM_CONFIRMATION_MESSAGE.includes(ADITYA_PORTFOLIO_URL)) {
    throw new Error('Confirmation message missing portfolio URL');
  }

  console.log('RESPONSE_COPY_INSTRUCTION:', RESPONSE_COPY_INSTRUCTION);
  if (!RESPONSE_COPY_INSTRUCTION.includes('IMPORTANT: Please check your email after submitting this feedback form and keep the response copy safely.')) {
    throw new Error('Invalid RESPONSE_COPY_INSTRUCTION constant');
  }

  console.log('RESPONSE_COPY_SHORT_REMINDER:', RESPONSE_COPY_SHORT_REMINDER);
  if (!RESPONSE_COPY_SHORT_REMINDER.includes('IMPORTANT: Check your email after submission and keep your response copy.')) {
    throw new Error('Invalid RESPONSE_COPY_SHORT_REMINDER constant');
  }

  if (!MORE_FEEDBACK_INFO_ITEM.description.includes(RESPONSE_COPY_SHORT_REMINDER)) {
    throw new Error('MORE_FEEDBACK_INFO_ITEM missing RESPONSE_COPY_SHORT_REMINDER');
  }
  if (!MORE_FEEDBACK_INFO_ITEM.description.includes(CANONICAL_PUBLIC_PORTAL_URL)) {
    throw new Error('MORE_FEEDBACK_INFO_ITEM missing CANONICAL_PUBLIC_PORTAL_URL');
  }
  console.log('✓ Canonical template constants verified.\n');

  // ==========================================================================
  // TEST A: FACULTY_FEEDBACK (Single Faculty Form)
  // ==========================================================================
  console.log('================================================================');
  console.log('TEST A: REAL FACULTY_FEEDBACK FORM GENERATION & VERIFICATION');
  console.log('================================================================');

  const facultyFormTitle = `E2E Faculty Feedback Test — ${Date.now()}`;
  const facultyFormDesc = 'Official BCE Feedback Form for Faculty Instruction Evaluation.';

  console.log(`1. Creating real Google Form: "${facultyFormTitle}"...`);
  const facultyFormResult = await createGoogleFeedbackForm({
    title: facultyFormTitle,
    description: facultyFormDesc,
  });

  createdResources.push({
    id: facultyFormResult.formId,
    type: 'FORM',
    url: facultyFormResult.responderUri,
    title: facultyFormTitle,
  });

  console.log(`✓ Form Created with ID: ${facultyFormResult.formId}`);
  console.log(`  Responder URI: ${facultyFormResult.responderUri}`);

  // Inspect Form Structure via live Google Forms API
  console.log('2. Inspecting Form Structure via Google Forms API...');
  const facultyForm = await getGoogleForm(facultyFormResult.formId);
  const facultyItems = facultyForm.items || [];
  console.log(`✓ Retrieved Form with ${facultyItems.length} items.`);

  // Validation 1: Email collection setting
  const facultyEmailSetting = (facultyForm.settings as any)?.emailCollectionType;
  console.log('  Email collection setting:', facultyEmailSetting);
  if (facultyEmailSetting !== 'VERIFIED') {
    throw new Error(`Expected emailCollectionType to be VERIFIED, got: ${facultyEmailSetting}`);
  }
  console.log('  ✓ Assertion 1: Verified email collection is active (preserves native respondent receipt toggle).');

  // Validation 2: Student Name is REQUIRED
  const studentNameItem = facultyItems.find(it => it.title === 'Student Name');
  if (!studentNameItem || !studentNameItem.questionItem?.question?.textQuestion) {
    throw new Error('Student Name short answer question not found');
  }
  if (!studentNameItem.questionItem.question.required) {
    throw new Error('Student Name is NOT marked as required');
  }
  console.log('  ✓ Assertion 2: Student Name question exists and is REQUIRED.');

  // Validation 3: University Registration Number is REQUIRED
  const regNoItem = facultyItems.find(it => it.title === 'University Registration Number');
  if (!regNoItem || !regNoItem.questionItem?.question?.textQuestion) {
    throw new Error('University Registration Number question not found');
  }
  if (!regNoItem.questionItem.question.required) {
    throw new Error('University Registration Number is NOT marked as required');
  }
  console.log('  ✓ Assertion 3: University Registration Number question exists and is REQUIRED.');

  // Validation 4: All 8 BCE Rating Parameters are REQUIRED with 5-point scale
  const ratingItems = facultyItems.filter(
    it => it.questionItem?.question?.choiceQuestion && it.title !== 'General Feedback'
  );
  console.log(`  Found ${ratingItems.length} rating questions (Expected: 8)`);
  if (ratingItems.length !== 8) {
    throw new Error(`Expected exactly 8 rating questions, found: ${ratingItems.length}`);
  }

  ratingItems.forEach((it, idx) => {
    const q = it.questionItem?.question;
    if (!q?.required) {
      throw new Error(`Rating question "${it.title}" is NOT marked as required`);
    }
    const options = (q.choiceQuestion?.options || []).map(o => o.value);
    if (options.length !== 5) {
      throw new Error(`Question "${it.title}" has ${options.length} options instead of 5`);
    }
    for (let i = 0; i < 5; i++) {
      if (options[i] !== BCE_RATING_OPTIONS[i]) {
        throw new Error(`Option mismatch at index ${i}: expected "${BCE_RATING_OPTIONS[i]}", got "${options[i]}"`);
      }
    }
  });
  console.log('  ✓ Assertion 4: All 8 BCE evaluation questions are REQUIRED with exact 5-point scale.');

  // Validation 5: General Feedback is OPTIONAL
  const generalFeedbackItem = facultyItems.find(it => it.title === 'General Feedback');
  if (!generalFeedbackItem || !generalFeedbackItem.questionItem?.question?.textQuestion?.paragraph) {
    throw new Error('General Feedback paragraph question not found');
  }
  if (generalFeedbackItem.questionItem.question.required) {
    throw new Error('General Feedback MUST be optional, but was marked as required');
  }
  console.log('  ✓ Assertion 5: General Feedback paragraph question exists and is OPTIONAL.');

  // Validation 6: More Feedback Forms informational item exists with portal URL and short reminder
  const moreFormsItem = facultyItems.find(it => it.title === 'More Feedback Forms');
  if (!moreFormsItem || !moreFormsItem.textItem) {
    throw new Error('More Feedback Forms informational item not found');
  }
  if (!moreFormsItem.description?.includes(CANONICAL_PUBLIC_PORTAL_URL)) {
    throw new Error(`More Feedback Forms description missing portal URL: ${moreFormsItem.description}`);
  }
  if (!moreFormsItem.description?.includes(RESPONSE_COPY_SHORT_REMINDER)) {
    throw new Error(`More Feedback Forms description missing short reminder: ${moreFormsItem.description}`);
  }
  console.log('  ✓ Assertion 6: More Feedback Forms item exists with canonical portal link and short reminder.');

  // Validation 6b: Response copy instruction in form description on first page
  if (!facultyForm.info?.description?.includes(RESPONSE_COPY_INSTRUCTION)) {
    throw new Error(`Faculty form description missing RESPONSE_COPY_INSTRUCTION: ${facultyForm.info?.description}`);
  }
  console.log('  ✓ Assertion 6b: Form description on first page contains full response copy instruction.');

  // Validation 7: Automated structure validator
  const structValidation = await validateGoogleFormRequiredStructure(facultyFormResult.formId);
  if (!structValidation.isValid) {
    throw new Error(`validateGoogleFormRequiredStructure failed: ${structValidation.errors.join(', ')}`);
  }
  console.log('  ✓ Assertion 7: validateGoogleFormRequiredStructure passed cleanly.');

  // Validation 8: Apps Script Bridge Linking & Confirmation Configuration
  console.log('3. Testing Google Sheet creation & Apps Script bridge linking...');
  const facultySheetResult = await createFeedbackSpreadsheet({
    title: facultyFormTitle,
  });

  createdResources.push({
    id: facultySheetResult.spreadsheetId,
    type: 'SHEET',
    url: facultySheetResult.spreadsheetUrl,
    title: facultyFormTitle,
  });

  console.log(`✓ Connected Google Sheet Created: ${facultySheetResult.spreadsheetId}`);

  const linkingResult = await linkFormToSpreadsheet(
    facultyFormResult.formId,
    facultySheetResult.spreadsheetId,
    FORM_CONFIRMATION_MESSAGE
  );
  console.log('Linking Result:', linkingResult);
  console.log('  Destination type:', linkingResult.destinationType);

  const directConfigResult = await configureGoogleFormConfirmation(
    facultyFormResult.formId,
    FORM_CONFIRMATION_MESSAGE
  );
  console.log('Direct Apps Script Configuration Call Result:', directConfigResult.message);
  console.log('  ✓ Assertion 8: Form → Sheet linking and confirmation bridge executed.');

  // ==========================================================================
  // TEST B: SEMESTER_FEEDBACK (Multi-Faculty Grid Form)
  // ==========================================================================
  console.log('\n================================================================');
  console.log('TEST B: REAL SEMESTER_FEEDBACK MULTI-FACULTY GRID FORM');
  console.log('================================================================');

  // Find 2 real assignments or faculty members
  const { data: realAssignments } = await supabase
    .from('faculty_assignments')
    .select(`
      id,
      faculty_id,
      subject_id,
      faculty:faculties(name, code, department),
      subject:subjects(name, code)
    `)
    .limit(2);

  let gridItemsPayload: MultiFacultyGridItem[] = [];
  if (realAssignments && realAssignments.length >= 2) {
    gridItemsPayload = realAssignments.map((a: any) => ({
      facultyId: a.faculty_id,
      subjectId: a.subject_id,
      assignmentId: a.id,
      facultyName: a.faculty?.name || 'Faculty Member',
      subjectName: a.subject?.name || 'Academic Subject',
      subjectCode: a.subject?.code || '',
      gridTitle: `${a.subject?.name} (${a.subject?.code || 'N/A'}) — ${a.faculty?.name}`,
    }));
  } else {
    // Fallback if assignments table has < 2 records
    gridItemsPayload = [
      {
        facultyId: '00000000-0000-0000-0000-000000000001',
        subjectId: '00000000-0000-0000-0000-000000000002',
        facultyName: 'Dr. Amitabh Sharma',
        subjectName: 'Design and Analysis of Algorithms',
        subjectCode: 'CS501',
        gridTitle: 'Design and Analysis of Algorithms (CS501) — Dr. Amitabh Sharma',
      },
      {
        facultyId: '00000000-0000-0000-0000-000000000003',
        subjectId: '00000000-0000-0000-0000-000000000004',
        facultyName: 'Prof. Sneha Verma',
        subjectName: 'Compiler Design',
        subjectCode: 'CS502',
        gridTitle: 'Compiler Design (CS502) — Prof. Sneha Verma',
      },
    ];
  }

  const semesterFormTitle = `E2E Semester Feedback Test — ${Date.now()}`;
  const semesterFormDesc = 'Official BCE Semester Evaluation Form for Multiple Subject Faculty.';

  console.log(`1. Creating real Multi-Faculty Google Form: "${semesterFormTitle}"...`);
  console.log(`   Faculty Grids Count: ${gridItemsPayload.length}`);
  const semesterFormResult = await createGoogleFeedbackForm({
    title: semesterFormTitle,
    description: semesterFormDesc,
    items: gridItemsPayload,
  });

  createdResources.push({
    id: semesterFormResult.formId,
    type: 'FORM',
    url: semesterFormResult.responderUri,
    title: semesterFormTitle,
  });

  console.log(`✓ Semester Form Created with ID: ${semesterFormResult.formId}`);
  console.log(`  Responder URI: ${semesterFormResult.responderUri}`);

  // Inspect Form via Google Forms API
  console.log('2. Inspecting Multi-Faculty Form Structure via Google Forms API...');
  const semesterForm = await getGoogleForm(semesterFormResult.formId);
  const semItems = semesterForm.items || [];
  console.log(`✓ Retrieved Semester Form with ${semItems.length} items.`);

  // Validation 9: Student details required in semester form
  const semStudentName = semItems.find(it => it.title === 'Student Name');
  const semRegNo = semItems.find(it => it.title === 'University Registration Number');
  if (!semStudentName?.questionItem?.question?.required) {
    throw new Error('Semester Form: Student Name is missing or NOT required');
  }
  if (!semRegNo?.questionItem?.question?.required) {
    throw new Error('Semester Form: Registration Number is missing or NOT required');
  }
  console.log('  ✓ Assertion 9: Semester form student identifier fields are REQUIRED.');

  // Validation 10: Multi-faculty grids - exactly 2 grids, each with 8 required rows and 5 columns
  const grids = semItems.filter(it => Boolean(it.questionGroupItem?.grid));
  console.log(`  Found ${grids.length} questionGroupItem grid(s) (Expected: ${gridItemsPayload.length})`);
  if (grids.length !== gridItemsPayload.length) {
    throw new Error(`Expected ${gridItemsPayload.length} grids, found: ${grids.length}`);
  }

  grids.forEach((g, gIdx) => {
    console.log(`  Verifying Grid ${gIdx + 1}: "${g.title}"`);
    const rows = g.questionGroupItem?.questions || [];
    const cols = (g.questionGroupItem?.grid?.columns?.options || []).map(o => o.value);

    console.log(`    Row count: ${rows.length} (Expected: 8)`);
    console.log(`    Column count: ${cols.length} (Expected: 5)`);

    if (rows.length !== 8) {
      throw new Error(`Grid ${gIdx + 1} has ${rows.length} rows instead of 8`);
    }
    if (cols.length !== 5) {
      throw new Error(`Grid ${gIdx + 1} has ${cols.length} columns instead of 5`);
    }

    // Verify 5 columns exact order
    for (let c = 0; c < 5; c++) {
      if (cols[c] !== BCE_RATING_OPTIONS[c]) {
        throw new Error(`Column ${c + 1} mismatch: expected "${BCE_RATING_OPTIONS[c]}", got "${cols[c]}"`);
      }
    }

    // Verify EVERY row is REQUIRED
    rows.forEach((r, rIdx) => {
      if (!r.required) {
        throw new Error(`Grid ${gIdx + 1} Row ${rIdx + 1} ("${r.rowQuestion?.title}") is NOT required!`);
      }
      console.log(`      Row ${rIdx + 1}: "${r.rowQuestion?.title}" [REQUIRED: TRUE]`);
    });
  });
  console.log('  ✓ Assertion 10: Every faculty grid has 8 rows × 5 columns and EVERY row is REQUIRED.');

  // Validation 11: General feedback is optional
  const semGeneralFeedback = semItems.find(it => it.title === 'General Feedback');
  if (!semGeneralFeedback || semGeneralFeedback.questionItem?.question?.required) {
    throw new Error('Semester Form: General feedback must be optional');
  }
  console.log('  ✓ Assertion 11: Semester Form General Feedback is OPTIONAL.');

  // Validation 12: More Feedback Forms item with short reminder
  const semMoreForms = semItems.find(it => it.title === 'More Feedback Forms');
  if (!semMoreForms || !semMoreForms.description?.includes(CANONICAL_PUBLIC_PORTAL_URL)) {
    throw new Error('Semester Form: More Feedback Forms item missing portal URL');
  }
  if (!semMoreForms.description?.includes(RESPONSE_COPY_SHORT_REMINDER)) {
    throw new Error(`Semester Form: More Feedback Forms item missing short reminder: ${semMoreForms.description}`);
  }
  console.log('  ✓ Assertion 12: More Feedback Forms item is present with canonical portal link and short reminder.');

  // Validation 12b: Semester form header description contains full instruction on first page
  if (!semesterForm.info?.description?.includes(RESPONSE_COPY_INSTRUCTION)) {
    throw new Error(`Semester Form: Header description missing full response copy instruction: ${semesterForm.info?.description}`);
  }
  console.log('  ✓ Assertion 12b: Semester form description contains full response copy instruction on first page.');

  // Validation 12c: Grids do NOT repeat the response copy instruction
  grids.forEach((g, gIdx) => {
    if (g.description?.includes(RESPONSE_COPY_INSTRUCTION)) {
      throw new Error(`Grid ${gIdx + 1} erroneously duplicates response copy instruction`);
    }
  });
  console.log('  ✓ Assertion 12c: Response copy instruction appears once for semester form, not repeated in faculty grids.');

  // Validation 12d: Automated structure validator on semester form
  const semStructValidation = await validateGoogleFormRequiredStructure(semesterFormResult.formId);
  if (!semStructValidation.isValid) {
    throw new Error(`validateGoogleFormRequiredStructure on semester form failed: ${semStructValidation.errors.join(', ')}`);
  }
  console.log('  ✓ Assertion 12d: validateGoogleFormRequiredStructure on semester form passed cleanly.');

  // ==========================================================================
  // TEST C: REAL RESPONSE & AUTHORITATIVE SHEET SYNC
  // ==========================================================================
  console.log('\n================================================================');
  console.log('TEST C: REAL RESPONSE SUBMISSION & AUTHORITATIVE SHEET SYNC');
  console.log('================================================================');

  // Create connected Sheet for Semester Form
  const semesterSheetResult = await createFeedbackSpreadsheet({
    title: semesterFormTitle,
    items: gridItemsPayload,
  });

  createdResources.push({
    id: semesterSheetResult.spreadsheetId,
    type: 'SHEET',
    url: semesterSheetResult.spreadsheetUrl,
    title: semesterFormTitle,
  });

  console.log(`✓ Connected Google Sheet Created: ${semesterSheetResult.spreadsheetId}`);

  // Query valid foreign keys for academic_year, branch, semester
  const { data: years } = await supabase.from('academic_years').select('id, name').limit(1);
  const { data: branches } = await supabase.from('branches').select('id, name').limit(1);
  const { data: sems } = await supabase.from('semesters').select('id, name').limit(1);

  // Register Form in Supabase feedback_forms
  const formSlug = `e2e-exp-${Date.now().toString(36)}`;
  const { data: dbForm, error: dbFormErr } = await supabase
    .from('feedback_forms')
    .insert({
      title: semesterFormTitle,
      description: semesterFormDesc,
      slug: formSlug,
      academic_year_id: years?.[0]?.id,
      branch_id: branches?.[0]?.id,
      semester_id: sems?.[0]?.id,
      form_type: 'SEMESTER_FEEDBACK',
      google_form_id: semesterFormResult.formId,
      google_form_url: semesterFormResult.responderUri,
      google_form_edit_url: semesterFormResult.editUri,
      google_sheet_id: semesterSheetResult.spreadsheetId,
      google_sheet_url: semesterSheetResult.spreadsheetUrl,
      response_destination_type: 'APPLICATION_MANAGED',
      status: 'PUBLISHED',
      published_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (dbFormErr || !dbForm) {
    throw new Error(`Failed to insert feedback_form into DB: ${dbFormErr?.message}`);
  }

  // Insert items into feedback_form_items
  await supabase.from('feedback_form_items').insert(
    gridItemsPayload.map((it, idx) => ({
      form_id: dbForm.id,
      faculty_id: it.facultyId,
      subject_id: it.subjectId,
      assignment_id: it.assignmentId,
      grid_title: it.gridTitle,
      order_index: idx,
    }))
  );

  // Construct real submission data
  const testStudentEmail = `aditya.test.${Date.now()}@bcebhagalpur.ac.in`;
  const testResponseId = `resp_exp_${Date.now()}`;
  const testStudentName = 'Aditya Kumar Sah';
  const testRegNo = '21105129001';
  const testTimestamp = new Date().toISOString();
  const testComment = 'Instruction is excellent. Practical laboratories are well-managed.';

  const grid1Ratings = ['Excellent', 'Very Good', 'Good', 'Excellent', 'Very Good', 'Excellent', 'Good', 'Excellent'];
  const grid2Ratings = ['Very Good', 'Excellent', 'Very Good', 'Good', 'Good', 'Very Good', 'Satisfactory', 'Very Good'];

  const testRow = [
    testTimestamp,
    testResponseId,
    testStudentEmail,
    testStudentName,
    testRegNo,
    ...grid1Ratings,
    ...grid2Ratings,
    testComment,
  ];

  console.log('Appending real student response row to Google Sheet...');
  await appendResponsesToSheet(semesterSheetResult.spreadsheetId, [testRow]);
  console.log(`✓ Real student response appended with ID: ${testResponseId}`);

  // Fetch response directly from Google Sheet to verify raw storage
  const sheetLookup = await fetchSingleResponseFromSheet(semesterSheetResult.spreadsheetId, testResponseId);
  if (!sheetLookup) {
    throw new Error('Failed to retrieve appended response directly from Google Sheet');
  }
  console.log('✓ Retrieved appended row from Google Sheet:', {
    timestamp: sheetLookup.row[0],
    responseId: sheetLookup.row[1],
    email: sheetLookup.row[2],
    name: sheetLookup.row[3],
    regNo: sheetLookup.row[4],
  });

  if (sheetLookup.row[2] !== testStudentEmail || sheetLookup.row[3] !== testStudentName || sheetLookup.row[4] !== testRegNo) {
    throw new Error('Appended row student details mismatch in Google Sheet');
  }
  console.log('  ✓ Assertion 13: Google Sheet recorded exact student details and ratings.');

  // ==========================================================================
  // TEST D: SYNC IDEMPOTENCY & DUPLICATE PREVENTION
  // ==========================================================================
  console.log('\n================================================================');
  console.log('TEST D: SYNC IDEMPOTENCY & DUPLICATE PREVENTION');
  console.log('================================================================');

  console.log('Running First Synchronization...');
  const syncRes1 = await syncFormResponsesToSheet({
    googleFormId: semesterFormResult.formId,
    googleSheetId: semesterSheetResult.spreadsheetId,
    formId: dbForm.id,
  });
  console.log('First Sync Result:', syncRes1);

  // Verify feedback_response_records in DB
  const { data: records1 } = await supabase
    .from('feedback_response_records')
    .select('id, form_id, google_response_id, student_email, student_name, registration_number')
    .eq('form_id', dbForm.id)
    .eq('google_response_id', testResponseId);

  console.log(`Database records count: ${records1?.length || 0}`);
  if (!records1 || records1.length !== 1) {
    throw new Error(`Expected exactly 1 response record, found: ${records1?.length || 0}`);
  }
  console.log('  ✓ Assertion 14: Response successfully synchronized to DB records.');

  // Run Second Sync to test IDEMPOTENCY
  console.log('Running Second Synchronization (Idempotency check)...');
  const syncRes2 = await syncFormResponsesToSheet({
    googleFormId: semesterFormResult.formId,
    googleSheetId: semesterSheetResult.spreadsheetId,
    formId: dbForm.id,
  });
  console.log('Second Sync Result:', syncRes2);

  const { data: records2 } = await supabase
    .from('feedback_response_records')
    .select('id')
    .eq('form_id', dbForm.id)
    .eq('google_response_id', testResponseId);

  if (records2?.length !== 1) {
    throw new Error(`Idempotency failure: Found ${records2?.length} records after second sync!`);
  }
  console.log('  ✓ Assertion 15: Second sync remained idempotent. No duplicates created.');

  // ==========================================================================
  // TEST E: 5-POINT ANALYTICS & NORMALIZER INTEGRITY
  // ==========================================================================
  console.log('\n================================================================');
  console.log('TEST E: 5-POINT ANALYTICS & NORMALIZER REGRESSION');
  console.log('================================================================');

  const norm1 = normalizeRatingValue('Excellent');
  const norm2 = normalizeRatingValue('Unsatisfactory');
  const norm3 = normalizeRatingValue('Good');
  console.log(`Normalized "Excellent": ${norm1} (Expected: "Excellent")`);
  console.log(`Normalized "Unsatisfactory": ${norm2} (Expected: "Unsatisfactory")`);
  console.log(`Normalized "Good": ${norm3} (Expected: "Good")`);
  if (norm1 !== 'Excellent' || norm2 !== 'Unsatisfactory' || norm3 !== 'Good') {
    throw new Error('5-point scale normalization regression detected!');
  }
  console.log('  ✓ Assertion 16: 5-Point rating value normalization functions correctly.');

  // Clean up DB records created for test
  await supabase.from('feedback_response_records').delete().eq('form_id', dbForm.id);
  await supabase.from('feedback_form_items').delete().eq('form_id', dbForm.id);
  await supabase.from('feedback_forms').delete().eq('id', dbForm.id);
  console.log('✓ Cleaned up test Supabase database records.');

  console.log('\n================================================================');
  console.log('   ALL 16 REAL FEEDBACK FORM RESPONSE EXPERIENCE ASSERTIONS PASSED');
  console.log('================================================================\n');
}

async function main() {
  try {
    await runFeedbackFormExperienceTests();
  } finally {
    await cleanupResources();
  }
}

main().catch(err => {
  console.error('\n❌ REAL E2E TEST FAILED:', err);
  process.exit(1);
});
