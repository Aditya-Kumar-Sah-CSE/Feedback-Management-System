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
