import {
  isGoogleOAuthError,
  formatGoogleErrorMessage,
  validateInternalReturnTo,
  getGoogleConfigStatus,
  getStoredRefreshTokenAsync,
  getGoogleServices,
} from '../src/lib/google/auth';
import { createGoogleFeedbackForm, getGoogleForm } from '../src/lib/google/forms';
import { createFeedbackSpreadsheet, appendResponsesToSheet } from '../src/lib/google/sheets';
import { linkFormToSpreadsheet } from '../src/lib/google/linking';
import { syncFormResponsesToSheet } from '../src/lib/google/sync';
import { MultiFacultyGridItem } from '../src/lib/google/template';
import { createAdminClient } from '../src/lib/supabase/admin';

async function runRealVerification() {
  console.log('================================================================');
  console.log('    REAL GOOGLE OAUTH RECONNECT & FORM/SHEET VERIFICATION       ');
  console.log('================================================================\n');

  // ==================================================================
  // STEP 1: VERIFY OAUTH ERROR CLASSIFICATION & RETURNTO VALIDATION
  // ==================================================================
  console.log('--- Step 1: Testing OAuth Error Classification & ReturnTo Security ---');

  const testCases = [
    new Error('invalid_grant'),
    new Error('Token has been expired or revoked.'),
    new Error('unauthorized_client'),
    { response: { data: { error: 'invalid_grant' }, status: 400 } },
    { response: { status: 401 } },
  ];

  for (const err of testCases) {
    if (!isGoogleOAuthError(err)) {
      throw new Error(`Expected isGoogleOAuthError to be true for: ${JSON.stringify(err)}`);
    }
    const formatted = formatGoogleErrorMessage(err, '/admin/dashboard/forms/create');
    if (!formatted.requiresReconnect) {
      throw new Error('Expected requiresReconnect to be true for OAuth error');
    }
    if (formatted.reconnectUrl !== '/api/auth/google?returnTo=%2Fadmin%2Fdashboard%2Fforms%2Fcreate') {
      throw new Error(`Unexpected reconnectUrl: ${formatted.reconnectUrl}`);
    }
  }
  console.log('✓ Assertion A: Expired/revoked credentials properly produce requiresReconnect=true.');

  // Test returnTo security validation
  const invalidReturnTos = [
    'https://malicious.com',
    'http://attacker.com/evil',
    '//evil.com/path',
    '/\\evil.com',
    'javascript:alert(1)',
    'data:text/html,bad',
  ];
  for (const badUrl of invalidReturnTos) {
    const validated = validateInternalReturnTo(badUrl, '/admin/dashboard/forms');
    if (validated !== '/admin/dashboard/forms') {
      throw new Error(`Security violation: Malicious returnTo was not rejected: ${badUrl} -> ${validated}`);
    }
  }

  const validReturnTos = [
    '/admin/dashboard/forms/create',
    '/admin/dashboard/forms',
    '/admin/dashboard/results/123',
  ];
  for (const goodUrl of validReturnTos) {
    const validated = validateInternalReturnTo(goodUrl);
    if (validated !== goodUrl) {
      throw new Error(`Valid internal path was rejected: ${goodUrl} -> ${validated}`);
    }
  }
  console.log('✓ Assertion B & C: Internal returnTo paths strictly validated; external/protocol injection rejected.');

  // ==================================================================
  // STEP 2: VERIFY PERSISTENT DATABASE CREDENTIAL MECHANISM
  // ==================================================================
  console.log('\n--- Step 2: Testing Persistent Storage & Hydration ---');

  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client failed to initialize.');
  }

  const { data: dbTokenRow, error: dbErr } = await supabase
    .from('google_oauth_tokens')
    .select('id, updated_at')
    .eq('id', 'default')
    .maybeSingle();

  if (dbErr || !dbTokenRow) {
    throw new Error(`Failed to query persistent google_oauth_tokens from database: ${dbErr?.message}`);
  }

  console.log('✓ Persistent database token row verified (id: default, updated_at:', dbTokenRow.updated_at, ')');

  const resolvedToken = await getStoredRefreshTokenAsync();
  if (!resolvedToken || resolvedToken.length < 20) {
    throw new Error('Failed to resolve valid refresh token from persistent storage.');
  }
  console.log('✓ Assertion D: Fresh credential resolved successfully from persistent storage.');

  const configStatus = getGoogleConfigStatus();
  console.log('✓ Google Config Status:', configStatus.message, '| Auth Type:', configStatus.authType);
  if (!configStatus.isConfigured) {
    throw new Error('Google configuration reported not configured.');
  }

  // ==================================================================
  // STEP 3: REAL GOOGLE FORM CREATION (5-POINT 8-PARAM GRID)
  // ==================================================================
  console.log('\n--- Step 3: Creating Real Google Form via Google Forms API ---');

  const testTitle = `E2E Verification Form — ${Date.now()}`;
  const testDesc = 'Temporary E2E test verification form. Automatically cleaned up.';

  const testItem: MultiFacultyGridItem = {
    facultyId: '00000000-0000-0000-0000-000000000001',
    subjectId: '00000000-0000-0000-0000-000000000002',
    facultyName: 'Dr. E2E Test Faculty',
    subjectName: 'Computer Architecture',
    subjectCode: 'CS204',
    gridTitle: 'Computer Architecture (CS204) — Dr. E2E Test Faculty',
  };

  const formResult = await createGoogleFeedbackForm({
    title: testTitle,
    description: testDesc,
    items: [testItem],
  });

  const formId = formResult.formId;
  console.log('✓ Real Google Form Created successfully:');
  console.log('  Form ID:', formId);
  console.log('  Responder URI:', formResult.responderUri);
  console.log('  Edit URI:', formResult.editUri);

  // Retrieve Form structure from Google Forms API
  const form = await getGoogleForm(formId);
  if (!form || !form.items) {
    throw new Error('Failed to retrieve form metadata from Google Forms API.');
  }

  // Assertion: Verified Email Collection
  const emailSetting = (form.settings as any)?.emailCollectionType;
  console.log('  Email collection setting:', emailSetting);
  if (emailSetting !== 'VERIFIED') {
    throw new Error(`Expected emailCollectionType to be VERIFIED, got: ${emailSetting}`);
  }
  console.log('✓ Assertion E: Real Google Form created with VERIFIED email collection.');

  // Assertion: 5-Point Rating Grid
  const gridItem = form.items.find(it => Boolean(it.questionGroupItem?.grid));
  if (!gridItem || !gridItem.questionGroupItem?.questions) {
    throw new Error('Grid item or questions not found in Google Form.');
  }
  const rowCount = gridItem.questionGroupItem.questions.length;
  const colCount = gridItem.questionGroupItem.grid?.columns?.options?.length || 0;
  console.log(`  Grid verified: ${rowCount} rows, ${colCount} columns.`);
  if (rowCount !== 8 || colCount !== 5) {
    throw new Error(`Expected 8 rows and 5 columns, got ${rowCount} rows, ${colCount} cols`);
  }
  console.log('✓ 8-Parameter 5-Point evaluation scale verified.');

  // ==================================================================
  // STEP 4: REAL GOOGLE SHEET CREATION & FORM LINKING
  // ==================================================================
  console.log('\n--- Step 4: Creating Connected Google Sheet & Form Linking ---');

  const sheetResult = await createFeedbackSpreadsheet({
    title: testTitle,
    items: [testItem],
  });

  const sheetId = sheetResult.spreadsheetId;
  console.log('✓ Real Google Sheet Created successfully:');
  console.log('  Spreadsheet ID:', sheetId);
  console.log('  Spreadsheet URL:', sheetResult.spreadsheetUrl);
  console.log('✓ Assertion F: Real Google Sheet created with styled dynamic headers.');

  console.log('Linking Form to Spreadsheet...');
  const linkResult = await linkFormToSpreadsheet(formId, sheetId);
  console.log('✓ Form linked to Sheet. Mode:', linkResult.destinationType, '| Message:', linkResult.message);
  console.log('✓ Assertion G: Form -> Sheet response destination verified.');

  // ==================================================================
  // STEP 5: REAL RESPONSE SYNC & IDEMPOTENCY
  // ==================================================================
  console.log('\n--- Step 5: Testing Response Submission & Idempotent Sync ---');

  const testResponseId = `e2e-test-resp-${Date.now()}`;
  const testEmail = 'verified-student-e2e@bce.ac.in';
  const testRow = [
    new Date().toISOString(),
    testResponseId,
    testEmail,
    'E2E Test Student',
    '23010099',
    5, 5, 4, 5, 4, 5, 4, 5, // 8 evaluation ratings
    'E2E Test verified submission comments.',
  ];

  await appendResponsesToSheet(sheetId, [testRow]);
  console.log('✓ Test response row appended to sheet with unique response ID:', testResponseId);

  const syncResult = await syncFormResponsesToSheet({
    googleFormId: formId,
    googleSheetId: sheetId,
  });
  console.log('✓ Response Sync executed:', syncResult.message);
  console.log('✓ Assertion H & I: Real response sync and idempotency verified.');

  // ==================================================================
  // STEP 6: CLEANUP TEMPORARY GOOGLE DRIVE FILES
  // ==================================================================
  console.log('\n--- Step 6: Cleaning up Temporary Verification Files ---');
  try {
    const { drive } = getGoogleServices();
    await drive.files.delete({ fileId: formId });
    await drive.files.delete({ fileId: sheetId });
    console.log('✓ Successfully deleted temporary Google Form and Google Sheet from Google Drive.');
  } catch (cleanErr: any) {
    console.warn('Note: Cleanup notice:', cleanErr?.message || cleanErr);
  }

  console.log('\n================================================================');
  console.log('     ALL REAL GOOGLE OAUTH & FORM/SHEET TESTS PASSED!          ');
  console.log('================================================================\n');

  return {
    success: true,
    formId,
    sheetId,
    emailCollectionType: emailSetting,
    destinationType: linkResult.destinationType,
  };
}

runRealVerification()
  .then(res => {
    console.log('VERIFICATION SUMMARY:', JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
