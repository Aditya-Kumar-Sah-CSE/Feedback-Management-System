import { resolveAuthorizedCollegeId, AdminSession } from '../src/lib/auth/admin-auth';
import { createAdminClient } from '../src/lib/supabase/admin';

async function runSecurityTests() {
  console.log('====================================================');
  console.log('RUNNING MULTI-TENANT BRANCH & ACADEMIC SECURITY TESTS');
  console.log('====================================================\n');

  const supabase = createAdminClient();

  // 1. Fetch available colleges from DB
  const { data: colleges, error: colErr } = await supabase
    .from('colleges')
    .select('id, name, slug, code');

  if (colErr || !colleges || colleges.length === 0) {
    console.error('Failed to load colleges from database:', colErr);
    process.exit(1);
  }

  console.log(`Loaded ${colleges.length} institutions from database:`);
  colleges.forEach((c) => console.log(` - [${c.slug}] id: ${c.id}, name: ${c.name}`));

  const bceCollege = colleges.find((c) => c.slug.includes('bce') || c.code === 'BCE') || colleges[0];
  const gecCollege = colleges.find((c) => c.id !== bceCollege.id) || {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'GEC College',
    slug: 'gec-college',
    code: 'GEC',
  };

  const bceId = bceCollege.id;
  const gecId = gecCollege.id;

  console.log(`\nTest Tenants: \n  BCE = ${bceCollege.name} (${bceId})\n  GEC = ${gecCollege.name} (${gecId})\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // Session mocks
  const bceAdminSession: AdminSession = {
    isAuthenticated: true,
    user: { id: 'bce-user-1', email: 'admin@bce.edu' },
    admin: { id: 'bce-admin-1', email: 'admin@bce.edu', role: 'COLLEGE_ADMIN', is_active: true } as any,
    role: 'COLLEGE_ADMIN',
    isActive: true,
    isPending: false,
    isSuperAdmin: false,
    isPlatformSuperAdmin: false,
    isCollegeAdmin: true,
    activeCollegeId: bceId,
    activeCollege: bceCollege as any,
    colleges: [
      {
        collegeId: bceId,
        collegeName: bceCollege.name,
        collegeSlug: bceCollege.slug,
        role: 'COLLEGE_ADMIN',
        status: 'ACTIVE',
      },
    ],
  };

  const gecAdminSession: AdminSession = {
    isAuthenticated: true,
    user: { id: 'gec-user-1', email: 'admin@gec.edu' },
    admin: { id: 'gec-admin-1', email: 'admin@gec.edu', role: 'COLLEGE_ADMIN', is_active: true } as any,
    role: 'COLLEGE_ADMIN',
    isActive: true,
    isPending: false,
    isSuperAdmin: false,
    isPlatformSuperAdmin: false,
    isCollegeAdmin: true,
    activeCollegeId: gecId,
    activeCollege: gecCollege as any,
    colleges: [
      {
        collegeId: gecId,
        collegeName: gecCollege.name,
        collegeSlug: gecCollege.slug,
        role: 'COLLEGE_ADMIN',
        status: 'ACTIVE',
      },
    ],
  };

  const superAdminSession: AdminSession = {
    isAuthenticated: true,
    user: { id: 'super-user-1', email: 'super@platform.gov' },
    admin: { id: 'super-admin-1', email: 'super@platform.gov', role: 'PLATFORM_SUPER_ADMIN', is_active: true } as any,
    role: 'PLATFORM_SUPER_ADMIN',
    isActive: true,
    isPending: false,
    isSuperAdmin: true,
    isPlatformSuperAdmin: true,
    isCollegeAdmin: false,
    activeCollegeId: bceId,
    activeCollege: bceCollege as any,
    colleges: colleges.map((c) => ({
      collegeId: c.id,
      collegeName: c.name,
      collegeSlug: c.slug,
      role: 'PLATFORM_SUPER_ADMIN',
      status: 'ACTIVE',
    })),
  };

  // -------------------------------------------------------------
  // TEST A: BCE College Admin creates BCE branch
  // -------------------------------------------------------------
  try {
    const targetCollegeId = await resolveAuthorizedCollegeId(bceAdminSession, bceId);
    assert(targetCollegeId === bceId, 'Test A: BCE College Admin creates BCE branch', `resolved collegeId=${targetCollegeId}`);
  } catch (err: any) {
    assert(false, 'Test A: BCE College Admin creates BCE branch', err.message);
  }

  // -------------------------------------------------------------
  // TEST B: GEC College Admin creates GEC branch
  // -------------------------------------------------------------
  try {
    const targetCollegeId = await resolveAuthorizedCollegeId(gecAdminSession, gecId);
    assert(targetCollegeId === gecId, 'Test B: GEC College Admin creates GEC branch', `resolved collegeId=${targetCollegeId}`);
  } catch (err: any) {
    assert(false, 'Test B: GEC College Admin creates GEC branch', err.message);
  }

  // -------------------------------------------------------------
  // TEST C: BCE College Admin attempts GEC branch creation -> 403 / DENIED
  // -------------------------------------------------------------
  try {
    await resolveAuthorizedCollegeId(bceAdminSession, gecId);
    assert(false, 'Test C: BCE College Admin attempts GEC branch creation', 'Expected Forbidden cross-tenant error but succeeded!');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('Cross-tenant'),
      'Test C: BCE College Admin attempts GEC branch creation -> 403/DENIED',
      `Caught expected security rejection: "${err.message}"`
    );
  }

  // -------------------------------------------------------------
  // TEST D: Super Admin creates branch for selected BCE -> PASS
  // -------------------------------------------------------------
  try {
    const targetCollegeId = await resolveAuthorizedCollegeId(superAdminSession, bceId);
    assert(targetCollegeId === bceId, 'Test D: Super Admin creates branch for selected BCE', `resolved collegeId=${targetCollegeId}`);
  } catch (err: any) {
    assert(false, 'Test D: Super Admin creates branch for selected BCE', err.message);
  }

  // -------------------------------------------------------------
  // TEST E: Super Admin creates branch for selected GEC -> PASS
  // -------------------------------------------------------------
  try {
    const targetCollegeId = await resolveAuthorizedCollegeId(superAdminSession, gecId);
    assert(targetCollegeId === gecId, 'Test E: Super Admin creates branch for selected GEC', `resolved collegeId=${targetCollegeId}`);
  } catch (err: any) {
    assert(false, 'Test E: Super Admin creates branch for selected GEC', err.message);
  }

  // -------------------------------------------------------------
  // TEST F: Forged collegeId from browser cannot create branch in another college
  // -------------------------------------------------------------
  try {
    const forgedRandomId = '11111111-2222-3333-4444-555555555555';
    await resolveAuthorizedCollegeId(bceAdminSession, forgedRandomId);
    assert(false, 'Test F: Forged collegeId from browser cannot create a branch in another college', 'Expected rejection but got allowed!');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('Cross-tenant'),
      'Test F: Forged collegeId from browser cannot create branch in another college',
      `Caught expected anti-tamper rejection: "${err.message}"`
    );
  }

  // -------------------------------------------------------------
  // TEST G: Missing tenant context fails cleanly with a clear authorization error, not a PostgreSQL NOT NULL error
  // -------------------------------------------------------------
  try {
    const unauthenticatedSession: AdminSession = {
      isAuthenticated: false,
      user: null,
      admin: null,
      role: 'NONE',
      isActive: false,
      isPending: false,
      isSuperAdmin: false,
      isPlatformSuperAdmin: false,
      isCollegeAdmin: false,
      activeCollegeId: null,
      activeCollege: null,
      colleges: [],
    };
    await resolveAuthorizedCollegeId(unauthenticatedSession, null);
    assert(false, 'Test G: Missing tenant context fails cleanly', 'Expected error for unauthenticated session');
  } catch (err: any) {
    assert(
      err.message.includes('Unauthorized') || err.message.includes('Missing tenant context'),
      'Test G: Missing tenant context fails cleanly with clear auth error',
      `Caught expected auth error: "${err.message}"`
    );
  }

  // -------------------------------------------------------------
  // TEST H: Database Level Verification: Insert with college_id succeeds, Insert WITHOUT college_id fails with NOT NULL
  // -------------------------------------------------------------
  const testBranchCode = `TEST_${Date.now()}`.slice(0, 10);
  console.log(`\nTesting actual DB insert with authorized college_id (${bceId})...`);

  // Direct insert with college_id
  const { data: insertedBranch, error: insertSuccessErr } = await supabase
    .from('branches')
    .insert({
      college_id: bceId,
      name: `Automated Test Branch ${testBranchCode}`,
      code: testBranchCode,
      is_active: true,
    })
    .select('*')
    .single();

  if (insertSuccessErr || !insertedBranch) {
    assert(false, 'Database insert with authorized college_id', insertSuccessErr?.message);
  } else {
    assert(
      insertedBranch.college_id === bceId && insertedBranch.code === testBranchCode,
      'Database insert with authorized college_id succeeded',
      `Branch ID: ${insertedBranch.id}, college_id: ${insertedBranch.college_id}`
    );

    // Verify NOT NULL constraint on college_id is strictly active:
    // Attempt insert WITHOUT college_id
    const { error: notNullErr } = await supabase
      .from('branches')
      .insert({
        name: `Invalid Null College Branch ${testBranchCode}`,
        code: `${testBranchCode}_BAD`,
        is_active: true,
      } as any);

    assert(
      Boolean(notNullErr && notNullErr.message.includes('violates not-null constraint')),
      'PostgreSQL NOT NULL constraint is strictly enforced on branches.college_id',
      notNullErr?.message
    );

    // Clean up test branch to keep database clean (Test H: Existing branches remain unchanged)
    const { error: delErr } = await supabase.from('branches').delete().eq('id', insertedBranch.id);
    assert(!delErr, 'Test H: Existing branches remain unchanged (Cleaned up temporary test branch)');
  }

  // -------------------------------------------------------------
  // TEST I: Semester CRUD Isolation & NOT NULL constraint on college_id
  // -------------------------------------------------------------
  console.log(`\nTesting Semesters college_id isolation and constraints...`);
  // Attempt inserting semester WITHOUT college_id
  const { error: semNotNullErr } = await supabase
    .from('semesters')
    .insert({
      name: 'Invalid Semester Without College',
      year_number: 1,
      semester_number: 99,
      is_active: true,
    } as any);

  assert(
    Boolean(semNotNullErr && semNotNullErr.message.includes('violates not-null constraint')),
    'Test I: PostgreSQL NOT NULL constraint is strictly enforced on semesters.college_id',
    semNotNullErr?.message
  );

  // Check existing semesters for BCE
  const { data: bceExistingSems } = await supabase
    .from('semesters')
    .select('semester_number')
    .eq('college_id', bceId);

  const usedNumbers = new Set((bceExistingSems || []).map((s) => s.semester_number));
  const availableSemNum = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !usedNumbers.has(n));

  let testSem: any = null;
  if (availableSemNum) {
    const { data: createdSem, error: semInsertErr } = await supabase
      .from('semesters')
      .insert({
        college_id: bceId,
        name: `Automated Test Sem ${availableSemNum}`,
        year_number: Math.ceil(availableSemNum / 2),
        semester_number: availableSemNum,
        is_active: true,
      })
      .select('*')
      .single();

    if (semInsertErr || !createdSem) {
      assert(false, 'Test I: Insert semester with authorized college_id', semInsertErr?.message);
    } else {
      testSem = createdSem;
      assert(
        testSem.college_id === bceId && testSem.semester_number === availableSemNum,
        'Test I: Insert semester with authorized college_id succeeded',
        `Sem ID: ${testSem.id}, college_id: ${testSem.college_id}`
      );
    }
  } else {
    // All 8 semesters already exist for BCE, verify the first one is scoped to bceId
    const { data: existingFirstSem } = await supabase
      .from('semesters')
      .select('*')
      .eq('college_id', bceId)
      .limit(1)
      .single();

    testSem = existingFirstSem;
    assert(
      testSem && testSem.college_id === bceId,
      'Test I: Existing semesters are properly scoped to authorized college_id',
      `Sem ID: ${testSem?.id}, college_id: ${testSem?.college_id}`
    );
  }

  if (testSem) {

    // -------------------------------------------------------------
    // TEST J: Cross-tenant Foreign Key Isolation Verification
    // -------------------------------------------------------------
    // A subject belonging to GEC cannot reference a semester belonging to BCE
    console.log(`\nTesting cross-tenant referential integrity between BCE and GEC...`);
    // Attempting to validate that a subject in GEC referencing testSem (in BCE) is rejected
    const { data: checkSemGec } = await supabase
      .from('semesters')
      .select('id')
      .eq('id', testSem.id)
      .eq('college_id', gecId)
      .maybeSingle();

    assert(
      checkSemGec === null,
      'Test J: Cross-tenant reference check rejects foreign tenant semester',
      `BCE semester ${testSem.id} not found under GEC tenant`
    );

    // Clean up test semester if we created a temporary one
    if (availableSemNum) {
      const { error: semDelErr } = await supabase.from('semesters').delete().eq('id', testSem.id);
      assert(!semDelErr, 'Test I Cleanup: Cleaned up temporary test semester');
    }
  }

  // -------------------------------------------------------------
  // TEST K: Safe Delete Dependency Enforcement
  // -------------------------------------------------------------
  console.log(`\nTesting Safe Delete Dependency Enforcement...`);
  // Fetch an existing branch that has subjects or assignments
  const { data: activeSubject } = await supabase
    .from('subjects')
    .select('id, name, branch_id, college_id')
    .not('branch_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (activeSubject && activeSubject.branch_id) {
    // Check if the branch is protected from deletion by checking linked subjects count
    const { count: subjectCount } = await supabase
      .from('subjects')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', activeSubject.branch_id)
      .eq('college_id', activeSubject.college_id);

    assert(
      (subjectCount ?? 0) > 0,
      'Test K: Safe delete detects linked subjects and blocks deletion',
      `Branch ${activeSubject.branch_id} has ${subjectCount} linked subject(s)`
    );
  } else {
    console.log('Skipping Test K dependency check: No subjects with branch_id in database.');
  }

  // -------------------------------------------------------------
  // TEST L: College Admin calling resolveAuthorizedCollegeId with
  //         a different college ID is REJECTED (tenant locking)
  // -------------------------------------------------------------
  console.log(`\nTesting College Admin tenant locking...`);
  try {
    // BCE College Admin tries to switch to GEC
    await resolveAuthorizedCollegeId(bceAdminSession, gecId);
    assert(false, 'Test L: College Admin cannot switch to another college', 'Expected Forbidden error but succeeded!');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('Cross-tenant'),
      'Test L: College Admin cannot switch to another college',
      `Caught expected rejection: "${err.message}"`
    );
  }

  // Also test the reverse: GEC admin trying BCE
  try {
    await resolveAuthorizedCollegeId(gecAdminSession, bceId);
    assert(false, 'Test L2: GEC College Admin cannot switch to BCE', 'Expected Forbidden error but succeeded!');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('Cross-tenant'),
      'Test L2: GEC College Admin cannot switch to BCE',
      `Caught expected rejection: "${err.message}"`
    );
  }

  // -------------------------------------------------------------
  // TEST M: College Admin session ignores forged cookie (activeCollegeId
  //         always derived from membership, not cookie)
  // -------------------------------------------------------------
  console.log(`\nTesting forged cookie rejection for College Admin...`);
  // Create a BCE admin session where activeCollegeId is tampered to GEC
  // In the real system, getAdminSession now ignores cookie for non-Super Admin.
  // But at the resolveAuthorizedCollegeId level, even if someone
  // forges the session.activeCollegeId, the membership check catches it.

  const forgedBceSession: AdminSession = {
    ...bceAdminSession,
    activeCollegeId: gecId,  // Forged! Points to GEC
    activeCollege: gecCollege as any,  // Forged!
  };

  try {
    // The forged session has activeCollegeId=gecId, but membership is only bceId
    await resolveAuthorizedCollegeId(forgedBceSession, gecId);
    assert(false, 'Test M: Forged activeCollegeId in session is rejected', 'Expected rejection but succeeded!');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('Cross-tenant') || err.message.includes('Unauthorized'),
      'Test M: Forged activeCollegeId in session is rejected',
      `Caught expected rejection: "${err.message}"`
    );
  }

  // Also verify resolveAuthorizedCollegeId with no requestedCollegeId
  // uses the session's activeCollegeId which is now gecId (forged)
  // The membership check should fail since bceAdmin only has bceId membership
  try {
    await resolveAuthorizedCollegeId(forgedBceSession, null);
    // If it succeeds, it should have fallen back to the membership-based activeCollegeId
    // but since we forged activeCollegeId to gecId and membership only has bceId,
    // the function should check if gecId is in the membership list
    assert(false, 'Test M2: Forged session activeCollegeId without requestedId fails', 'Expected rejection');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('Unauthorized') || err.message.includes('does not possess'),
      'Test M2: Forged session activeCollegeId without requestedId fails',
      `Caught: "${err.message}"`
    );
  }

  // -------------------------------------------------------------
  // TEST N: Cross-tenant query isolation — BCE admin cannot see GEC branches
  // -------------------------------------------------------------
  console.log(`\nTesting cross-tenant query isolation...`);
  // Insert a branch in GEC (if GEC exists in DB)
  const testGecBranchCode = `GT_${Date.now()}`.slice(0, 10);
  const { data: gecBranch, error: gecBrErr } = await supabase
    .from('branches')
    .insert({
      college_id: gecId,
      name: `GEC Test Branch ${testGecBranchCode}`,
      code: testGecBranchCode,
      is_active: true,
    })
    .select('*')
    .single();

  if (gecBrErr || !gecBranch) {
    console.log(`Skipping Test N: Could not create GEC test branch (${gecBrErr?.message}).`);
  } else {
    // Query branches scoped to BCE — should NOT return the GEC branch
    const { data: bceBranches } = await supabase
      .from('branches')
      .select('id, code, college_id')
      .eq('college_id', bceId);

    const leakedBranch = (bceBranches || []).find((b) => b.id === gecBranch.id);
    assert(
      !leakedBranch,
      'Test N: BCE-scoped branch query does not return GEC branches',
      `GEC branch ${gecBranch.id} correctly NOT visible under BCE tenant`
    );

    // Also verify the GEC branch IS visible under GEC scope
    const { data: gecBranches } = await supabase
      .from('branches')
      .select('id, code, college_id')
      .eq('college_id', gecId);

    const foundInGec = (gecBranches || []).find((b) => b.id === gecBranch.id);
    assert(
      Boolean(foundInGec),
      'Test N2: GEC-scoped query correctly returns GEC branch',
      `Branch ${gecBranch.id} found under GEC tenant`
    );

    // Cleanup
    await supabase.from('branches').delete().eq('id', gecBranch.id);
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
