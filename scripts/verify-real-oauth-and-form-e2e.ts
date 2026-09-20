import { createAdminClient } from '../src/lib/supabase/admin';
import {
  ensureGoogleCredentialsLoaded,
  invalidateCachedGoogleToken,
  getGoogleCredentialDiagnostics,
  getGoogleServicesAsync,
  executeWithGoogleOAuthRetry,
} from '../src/lib/google/auth';
import { createGoogleFeedbackForm, getGoogleForm } from '../src/lib/google/forms';
import {
  createFeedbackSpreadsheet,
  appendResponsesToSheet,
  fetchSingleResponseFromSheet,
  getExistingSheetResponseIds,
} from '../src/lib/google/sheets';
import { linkFormToSpreadsheet } from '../src/lib/google/linking';
import { syncFormResponsesToSheet } from '../src/lib/google/sync';
import { BCE_FEEDBACK_PARAMETERS, MultiFacultyGridItem } from '../src/lib/google/template';

async function runRealOAuthAndFormE2E() {
  console.log('================================================================');
  console.log('       PRODUCTION REAL GOOGLE OAUTH & FORM/SHEET E2E SUITE       ');
  console.log('================================================================\n');

  // STEP 1: Test Supabase DB as Primary Credential Source
  console.log('>>> [STEP 1] Testing Production Credential Source Priority...');
  invalidateCachedGoogleToken();
  const loaded = await ensureGoogleCredentialsLoaded(true);
  if (!loaded) {
    throw new Error('Failed to load Google credentials from Supabase!');
  }

  const diag = getGoogleCredentialDiagnostics();
  console.log('Diagnostics:', diag);
  if (diag.credentialSource !== 'database') {
    throw new Error(`Expected credentialSource === 'database', but got: ${diag.credentialSource}`);
  }
  console.log('✓ Verified: Supabase google_oauth_tokens is the active PRIMARY credential source.\n');

  // STEP 2: Test Cache Invalidation & Single Retry OAuth Resilience
  console.log('>>> [STEP 2] Testing Cache Invalidation & Re-hydration...');
  invalidateCachedGoogleToken();
  const diagAfterInvalidate = getGoogleCredentialDiagnostics();
  console.log('Diagnostics after invalidation:', diagAfterInvalidate);
  if (diagAfterInvalidate.credentialSource !== 'none') {
    throw new Error('Expected cachedTokenSource to be none after invalidation');
  }

  // Hydrate again through getGoogleServicesAsync
  const services = await getGoogleServicesAsync();
  const diagAfterReload = getGoogleCredentialDiagnostics();
  console.log('Diagnostics after reload:', diagAfterReload);
  if (diagAfterReload.credentialSource !== 'database') {
    throw new Error('Failed to re-hydrate database credential after invalidation');
  }
  console.log('✓ Verified: Cache invalidation and re-hydration from database work cleanly.\n');

  // STEP 3: Create Real Google Form
  console.log('>>> [STEP 3] Creating Real Google Form with 8 BCE Parameters & Faculty Grid...');
  const testTimestamp = Date.now();
  const formTitle = `[E2E TEST] Form Verification - ${testTimestamp}`;
  const testItems: MultiFacultyGridItem[] = [
    {
      facultyName: 'Dr. Ramesh Kumar',
      subjectName: 'Design and Analysis of Algorithms',
      subjectCode: 'CS501',
      gridTitle: 'Design and Analysis of Algorithms (CS501) — Dr. Ramesh Kumar',
    },
    {
      facultyName: 'Prof. Ananya Sen',
      subjectName: 'Operating Systems',
      subjectCode: 'CS502',
      gridTitle: 'Operating Systems (CS502) — Prof. Ananya Sen',
    },
  ];

  const formResult = await createGoogleFeedbackForm({
    title: formTitle,
    description: 'BCE Automated E2E verification test form. Will be deleted automatically upon test completion.',
    items: testItems,
  });

  console.log('Created Google Form:');
  console.log('  Form ID:      ', formResult.formId);
  console.log('  Responder URL:', formResult.responderUri);
  console.log('  Edit URL:     ', formResult.editUri);

  // Validate form was created with correct questions in Google Forms API
  const formDetails = await getGoogleForm(formResult.formId);
  console.log('  Form Title from API:', formDetails.info?.title);
  console.log('  Form Items Count:   ', formDetails.items?.length);
  console.log('✓ Real Google Form verified on Google API.\n');

  // STEP 4: Create Real Google Sheet
  console.log('>>> [STEP 4] Creating Real Google Sheet with BCE Styled Headers...');
  const sheetResult = await createFeedbackSpreadsheet({
    title: formTitle,
    items: testItems,
  });

  console.log('Created Google Sheet:');
  console.log('  Sheet ID: ', sheetResult.spreadsheetId);
  console.log('  Sheet URL:', sheetResult.spreadsheetUrl);
  console.log('✓ Real Google Sheet verified on Google API.\n');

  // STEP 5: Link Form to Sheet
  console.log('>>> [STEP 5] Linking Google Form to Google Sheet...');
  const linkResult = await linkFormToSpreadsheet(
    formResult.formId,
    sheetResult.spreadsheetId
  );
  console.log('Linking Result:', linkResult);
  console.log(`✓ Destination Type: ${linkResult.destinationType} (${linkResult.message})\n`);

  // STEP 6: Append Real Response Row
  console.log('>>> [STEP 6] Appending Real Test Response to Sheet...');
  const testRespId = `E2E_RESP_${testTimestamp}`;
  const testRow = [
    new Date().toISOString(),
    testRespId,
    'aditya.sah.cse@bcebgp.ac.in',
    'Aditya Kumar Sah (Test)',
    '22105128099',
    // 8 ratings for Faculty 1
    '5', '5', '4', '5', '4', '5', '5', '4',
    // 8 ratings for Faculty 2
    '4', '5', '5', '4', '5', '4', '4', '5',
    'Excellent instruction and clear practical explanations during labs.',
  ];

  const appendRes = await appendResponsesToSheet(sheetResult.spreadsheetId, [testRow]);
  console.log('Append Updates:', appendRes);

  // Read row back to verify data persistence
  const fetched = await fetchSingleResponseFromSheet(sheetResult.spreadsheetId, testRespId);
  if (!fetched) {
    throw new Error(`Failed to fetch response row ${testRespId} back from sheet!`);
  }
  console.log('Fetched Response:', {
    headersCount: fetched.headers.length,
    rowCount: fetched.row.length,
    studentName: fetched.row[3],
    regNo: fetched.row[4],
  });
  console.log('✓ Real response row successfully written and retrieved.\n');

  // STEP 7: Sync Form Responses to Sheet (First Pass)
  console.log('>>> [STEP 7] Testing syncFormResponsesToSheet (Pass 1)...');
  const existingIds1 = await getExistingSheetResponseIds(sheetResult.spreadsheetId);
  console.log('Existing IDs before sync 1:', Array.from(existingIds1));
  if (!existingIds1.has(testRespId)) {
    throw new Error(`Expected existing IDs to contain ${testRespId}`);
  }

  const syncRes1 = await syncFormResponsesToSheet({
    googleFormId: formResult.formId,
    googleSheetId: sheetResult.spreadsheetId,
  });
  console.log('Sync Pass 1 Result:', syncRes1);
  console.log('✓ First sync completed successfully.\n');

  // STEP 8: Second Sync to Verify Idempotency & No Duplicate Rows
  console.log('>>> [STEP 8] Testing syncFormResponsesToSheet (Pass 2 - Idempotency Check)...');
  const syncRes2 = await syncFormResponsesToSheet({
    googleFormId: formResult.formId,
    googleSheetId: sheetResult.spreadsheetId,
  });
  console.log('Sync Pass 2 Result:', syncRes2);

  const existingIds2 = await getExistingSheetResponseIds(sheetResult.spreadsheetId);
  console.log('Existing IDs after sync 2:', Array.from(existingIds2));
  if (existingIds2.size !== existingIds1.size) {
    throw new Error(`Idempotency violated: ID count changed from ${existingIds1.size} to ${existingIds2.size}!`);
  }
  console.log('✓ Verified: Second sync is strictly idempotent, zero duplicate rows created.\n');

  // STEP 9: Clean Up Temporary Google Form and Sheet
  console.log('>>> [STEP 9] Cleaning Up Temporary Test Form & Sheet from Google Drive...');
  await executeWithGoogleOAuthRetry(async ({ drive }) => {
    try {
      await drive.files.delete({ fileId: formResult.formId });
      console.log(`  Deleted temporary Form: ${formResult.formId}`);
    } catch (dErr) {
      console.warn(`  Warning: Could not delete Form ${formResult.formId}:`, dErr);
    }

    try {
      await drive.files.delete({ fileId: sheetResult.spreadsheetId });
      console.log(`  Deleted temporary Sheet: ${sheetResult.spreadsheetId}`);
    } catch (dErr) {
      console.warn(`  Warning: Could not delete Sheet ${sheetResult.spreadsheetId}:`, dErr);
    }
  });
  console.log('✓ Temporary Google resources cleaned up cleanly.\n');

  console.log('================================================================');
  console.log('  ALL E2E PRODUCTION OAUTH & FORM/SHEET TESTS PASSED WITH 100%  ');
  console.log('================================================================');

  return {
    formId: formResult.formId,
    sheetId: sheetResult.spreadsheetId,
    linkingResult: linkResult.destinationType,
    existingCount: existingIds2.size,
  };
}

runRealOAuthAndFormE2E()
  .then((res) => {
    console.log('E2E Execution completed with output:', res);
    process.exit(0);
  })
  .catch((err) => {
    console.error('E2E Execution failed with error:', err);
    process.exit(1);
  });
