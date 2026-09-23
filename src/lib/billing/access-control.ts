import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin-auth';
import type { PlanType, CollegeTrialEntitlement, TrialStatus } from '@/types/database';
import {
  FEATURE_GOOGLE_FORM_GENERATION,
  FEATURE_GOOGLE_SHEET_INTEGRATION,
  planHasFeature,
  type BillingStatus,
  type FormAccessResult,
  type SheetIntegrationAccessResult,
  type BasicAnalyticsAccessResult,
  type AnalyticsAccessResult,
  type PdfAccessResult,
} from './constants';
import {
  getCollegeEntitlements,
  hasCollegeFeature,
} from './entitlements';

// Re-export for convenience — consumers can import from either file
export type {
  BillingStatus,
  FormAccessResult,
  SheetIntegrationAccessResult,
  BasicAnalyticsAccessResult,
  AnalyticsAccessResult,
  PdfAccessResult,
} from './constants';

export {
  FEATURE_GOOGLE_FORM_GENERATION,
  FEATURE_GOOGLE_SHEET_INTEGRATION,
  FEATURE_FULL_ANALYTICS_ACCESS,
  FEATURE_BASIC_ANALYTICS,
  FEATURE_ANALYTICS_PDF,
  FEATURE_PRIORITY_SUPPORT,
  planHasFeature,
} from './constants';

export { getCollegeEntitlements, hasCollegeFeature };

async function getAdminDb() {
  return createAdminClient() || await createClient();
}

// ====================================================================
// 1. TENANT BILLING & TRIAL RESOLUTION
// ====================================================================

/**
 * Read the active trial entitlement for a given college (or legacy adminId).
 * Strictly read-only; does not mutate the database.
 */
export async function getActiveTrialEntitlement(collegeId: string): Promise<CollegeTrialEntitlement | null> {
  if (!collegeId) return null;
  const entitlements = await getCollegeEntitlements(collegeId);
  return entitlements.activeTrial;
}

/**
 * Checks if a college currently has a valid active trial entitlement.
 */
export async function hasActiveTrial(collegeId: string): Promise<boolean> {
  const trial = await getActiveTrialEntitlement(collegeId);
  return trial !== null;
}

/**
 * Computes effective access & features for a tenant college.
 * Strictly read-only; delegates to getCollegeEntitlements.
 */
export async function getEffectiveBillingFeatures(collegeId: string): Promise<{
  effectiveFeatures: string[];
  hasActiveTrial: boolean;
  activeTrial: CollegeTrialEntitlement | null;
  billingAccount: any;
  planType: PlanType;
  isUnlocked: boolean;
  hasFormGeneration: boolean;
  hasSheetIntegration: boolean;
  hasBasicAnalytics: boolean;
  hasFullAnalytics: boolean;
  hasPdfAccess: boolean;
  trialStatus: 'NONE' | TrialStatus;
  trialExpiresAt: string | null;
  trialDaysRemaining: number | null;
}> {
  const ent = await getCollegeEntitlements(collegeId);
  return {
    effectiveFeatures: ent.effectiveFeatures,
    hasActiveTrial: ent.hasActiveTrial,
    activeTrial: ent.activeTrial,
    billingAccount: ent.paidPlan ? {
      plan_type: ent.paidPlan.slug,
      expires_at: ent.paidPlan.expiresAt,
      subscription_status: ent.paidPlan.status,
    } : null,
    planType: ent.planType,
    isUnlocked: ent.isUnlocked,
    hasFormGeneration: ent.hasFormGeneration,
    hasSheetIntegration: ent.hasSheetIntegration,
    hasBasicAnalytics: ent.hasBasicAnalytics,
    hasFullAnalytics: ent.hasFullAnalytics,
    hasPdfAccess: ent.hasPdfAccess,
    trialStatus: ent.trialStatus,
    trialExpiresAt: ent.trialExpiresAt,
    trialDaysRemaining: ent.trialDaysRemaining,
  };
}

/**
 * Checks if a specific feature is available for the given college.
 */
export async function hasBillingFeature(collegeId: string, feature: string): Promise<boolean> {
  return hasCollegeFeature(collegeId, feature);
}

// ====================================================================
// 2. BILLING STATUS QUERY (Consumer-facing)
// ====================================================================

/**
 * Read the comprehensive billing state for a tenant college.
 * Returns complete BillingStatus including active trial metadata.
 */
export async function getCollegeBillingStatus(collegeId: string): Promise<BillingStatus> {
  const ent = await getCollegeEntitlements(collegeId);
  return {
    isUnlocked: ent.isUnlocked,
    planType: ent.planType,
    accessStatus: ent.accessStatus,
    subscriptionStatus: ent.subscriptionStatus,
    expiresAt: ent.expiresAt,
    startedAt: ent.startedAt,
    billingAccountId: ent.billingAccountId,
    isExpired: ent.isExpired,
    features: ent.effectiveFeatures,
    hasFormGeneration: ent.hasFormGeneration,
    hasSheetIntegration: ent.hasSheetIntegration,
    hasBasicAnalytics: ent.hasBasicAnalytics,
    hasFullAnalytics: ent.hasFullAnalytics,
    hasPdfAccess: ent.hasPdfAccess,
    hasActiveTrial: ent.hasActiveTrial,
    activeTrial: ent.activeTrial,
    trialStatus: ent.trialStatus,
    trialExpiresAt: ent.trialExpiresAt,
    trialDaysRemaining: ent.trialDaysRemaining,
  };
}

/**
 * Backward-compatible alias for getCollegeBillingStatus.
 */
export async function getAdminBillingStatus(collegeOrAdminId: string): Promise<BillingStatus> {
  return getCollegeBillingStatus(collegeOrAdminId);
}

// ====================================================================
// HELPER: Resolve Context from Session or Parameters
// ====================================================================

interface ResolvedCallerContext {
  isSuperAdmin: boolean;
  isAuthorized: boolean;
  collegeId: string | null;
  errorReason?: string;
  errorCode?: 'UNAUTHORIZED' | 'ACCOUNT_INACTIVE';
}

function resolveContext(
  sessionOrId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string
): ResolvedCallerContext {
  if (!sessionOrId) {
    return {
      isSuperAdmin: false,
      isAuthorized: false,
      collegeId: null,
      errorReason: 'Authentication required. No session or ID provided.',
      errorCode: 'UNAUTHORIZED',
    };
  }

  // Case 1: An AdminSession context object was provided
  if (typeof sessionOrId === 'object') {
    const session = sessionOrId;
    const isSuper = Boolean(session.isSuperAdmin || session.isPlatformSuperAdmin);

    if (isSuper) {
      return {
        isSuperAdmin: true,
        isAuthorized: true,
        collegeId: session.activeCollegeId || null,
      };
    }

    if (!session.isAuthenticated) {
      return {
        isSuperAdmin: false,
        isAuthorized: false,
        collegeId: null,
        errorReason: 'Unauthorized. Please sign in.',
        errorCode: 'UNAUTHORIZED',
      };
    }

    if (!session.isActive) {
      return {
        isSuperAdmin: false,
        isAuthorized: false,
        collegeId: null,
        errorReason: 'Your administrator account is inactive. Please contact the Super Admin.',
        errorCode: 'ACCOUNT_INACTIVE',
      };
    }

    const collegeId = session.activeCollegeId || null;
    if (!collegeId) {
      return {
        isSuperAdmin: false,
        isAuthorized: false,
        collegeId: null,
        errorReason: 'No active college selected for this session.',
        errorCode: 'UNAUTHORIZED',
      };
    }

    return {
      isSuperAdmin: false,
      isAuthorized: true,
      collegeId,
    };
  }

  // Case 2: Individual arguments passed: (id, email, role, status)
  const isSuper = adminRole === 'SUPER_ADMIN'
    || (adminEmail && adminEmail.toLowerCase().trim() === SUPER_ADMIN_EMAIL);

  if (isSuper) {
    return {
      isSuperAdmin: true,
      isAuthorized: true,
      collegeId: String(sessionOrId),
    };
  }

  if (adminStatus && adminStatus !== 'ACTIVE') {
    return {
      isSuperAdmin: false,
      isAuthorized: false,
      collegeId: null,
      errorReason: 'Your administrator account is inactive. Please contact the Super Admin.',
      errorCode: 'ACCOUNT_INACTIVE',
    };
  }

  return {
    isSuperAdmin: false,
    isAuthorized: true,
    collegeId: String(sessionOrId),
  };
}

// ====================================================================
// 3. CENTRALIZED FORM GENERATION ACCESS GATE
// ====================================================================

export async function assertFormGenerationAccess(
  sessionOrId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string,
): Promise<FormAccessResult> {
  const ctx = resolveContext(sessionOrId, adminEmail, adminRole, adminStatus);

  if (!ctx.isAuthorized) {
    return {
      allowed: false,
      reason: ctx.errorReason || 'Unauthorized.',
      code: ctx.errorCode || 'UNAUTHORIZED',
    };
  }

  if (ctx.isSuperAdmin) {
    return { allowed: true, reason: 'Super Admin access granted.' };
  }

  if (!ctx.collegeId) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      reason: 'No college tenant context found.',
    };
  }

  const billingStatus = await getCollegeBillingStatus(ctx.collegeId);
  const hasFormGen = planHasFeature(billingStatus.features, FEATURE_GOOGLE_FORM_GENERATION);

  if (!hasFormGen) {
    return {
      allowed: false,
      code: 'FORM_GENERATION_LOCKED',
      reason: 'Google Form generation is locked on the FREE base plan. Please request a Free Trial from the Super Admin or upgrade to a paid plan.',
      billingStatus,
    };
  }

  return { allowed: true, reason: 'Access granted.', billingStatus };
}

export async function canGenerateForms(
  sessionOrAdminId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string
): Promise<boolean> {
  const res = await assertFormGenerationAccess(sessionOrAdminId, adminEmail, adminRole, adminStatus);
  return res.allowed;
}

// ====================================================================
// 4. CENTRALIZED SHEET INTEGRATION ACCESS GATE
// ====================================================================

export async function assertSheetIntegrationAccess(
  sessionOrId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string,
): Promise<SheetIntegrationAccessResult> {
  const ctx = resolveContext(sessionOrId, adminEmail, adminRole, adminStatus);

  if (!ctx.isAuthorized) {
    return {
      allowed: false,
      reason: ctx.errorReason || 'Unauthorized.',
      code: ctx.errorCode || 'UNAUTHORIZED',
    };
  }

  if (ctx.isSuperAdmin) {
    return { allowed: true, reason: 'Super Admin access granted.' };
  }

  if (!ctx.collegeId) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      reason: 'No college tenant context found.',
    };
  }

  const billingStatus = await getCollegeBillingStatus(ctx.collegeId);
  const hasSheet = planHasFeature(billingStatus.features, FEATURE_GOOGLE_SHEET_INTEGRATION);

  if (!hasSheet) {
    return {
      allowed: false,
      code: 'SHEET_INTEGRATION_LOCKED',
      reason: 'Google Sheet integration & sync management is not included in the FREE plan. Please request a Free Trial from the Super Admin or upgrade to a paid plan.',
      billingStatus,
    };
  }

  return { allowed: true, reason: 'Access granted.', billingStatus };
}

export async function canIntegrateSheets(
  sessionOrAdminId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string
): Promise<boolean> {
  const res = await assertSheetIntegrationAccess(sessionOrAdminId, adminEmail, adminRole, adminStatus);
  return res.allowed;
}

// ====================================================================
// 5. CENTRALIZED ANALYTICS ACCESS GATE
// ====================================================================

export async function assertAnalyticsAccess(
  sessionOrId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string,
): Promise<AnalyticsAccessResult> {
  const ctx = resolveContext(sessionOrId, adminEmail, adminRole, adminStatus);

  if (!ctx.isAuthorized) {
    return {
      allowed: false,
      code: ctx.errorCode || 'UNAUTHORIZED',
      reason: ctx.errorReason || 'Unauthorized.',
    };
  }

  if (ctx.isSuperAdmin) {
    return { allowed: true, reason: 'Super Admin access granted.' };
  }

  if (!ctx.collegeId) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      reason: 'No college tenant context found.',
    };
  }

  const billingStatus = await getCollegeBillingStatus(ctx.collegeId);

  if (!billingStatus.hasFullAnalytics) {
    return {
      allowed: false,
      code: 'ANALYTICS_UPGRADE_REQUIRED',
      reason: 'Full Analytics Access is required to view results, charts, and export reports. Please request a Free Trial or upgrade your plan.',
      billingStatus,
    };
  }

  return { allowed: true, reason: 'Full analytics access granted.', billingStatus };
}

export async function canAccessAnalytics(
  sessionOrAdminId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string
): Promise<boolean> {
  const res = await assertAnalyticsAccess(sessionOrAdminId, adminEmail, adminRole, adminStatus);
  return res.allowed;
}

// ====================================================================
// 6. CENTRALIZED BASIC ANALYTICS ACCESS GATE
// ====================================================================

export async function assertBasicAnalyticsAccess(
  sessionOrId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string,
): Promise<BasicAnalyticsAccessResult> {
  const ctx = resolveContext(sessionOrId, adminEmail, adminRole, adminStatus);

  if (!ctx.isAuthorized) {
    return {
      allowed: false,
      code: ctx.errorCode || 'UNAUTHORIZED',
      reason: ctx.errorReason || 'Unauthorized.',
    };
  }

  if (ctx.isSuperAdmin) {
    return { allowed: true, reason: 'Super Admin access granted.' };
  }

  if (!ctx.collegeId) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      reason: 'No college tenant context found.',
    };
  }

  const billingStatus = await getCollegeBillingStatus(ctx.collegeId);
  const hasBasic = billingStatus.hasBasicAnalytics || billingStatus.hasFullAnalytics;

  if (!hasBasic) {
    return {
      allowed: false,
      code: 'BASIC_ANALYTICS_LOCKED',
      reason: 'Basic analytics access is locked on your current account. Please contact the Super Admin.',
      billingStatus,
    };
  }

  return { allowed: true, reason: 'Basic analytics access granted.', billingStatus };
}

export async function canAccessBasicAnalytics(
  sessionOrAdminId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string
): Promise<boolean> {
  const res = await assertBasicAnalyticsAccess(sessionOrAdminId, adminEmail, adminRole, adminStatus);
  return res.allowed;
}

// ====================================================================
// 7. CENTRALIZED PDF REPORTS ACCESS GATE
// ====================================================================

export async function assertPdfAccess(
  sessionOrId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string,
): Promise<PdfAccessResult> {
  const ctx = resolveContext(sessionOrId, adminEmail, adminRole, adminStatus);

  if (!ctx.isAuthorized) {
    return {
      allowed: false,
      code: ctx.errorCode || 'UNAUTHORIZED',
      reason: ctx.errorReason || 'Unauthorized.',
    };
  }

  if (ctx.isSuperAdmin) {
    return { allowed: true, reason: 'Super Admin access granted.' };
  }

  if (!ctx.collegeId) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      reason: 'No college tenant context found.',
    };
  }

  const billingStatus = await getCollegeBillingStatus(ctx.collegeId);
  return {
    allowed: true,
    reason: 'PDF reports and exports access granted.',
    billingStatus: { ...billingStatus, hasPdfAccess: true },
  };
}

export async function canAccessPdf(
  sessionOrAdminId: any,
  adminEmail?: string,
  adminRole?: string,
  adminStatus?: string
): Promise<boolean> {
  const res = await assertPdfAccess(sessionOrAdminId, adminEmail, adminRole, adminStatus);
  return res.allowed;
}

// ====================================================================
// 8. ENSURE COLLEGE BILLING ACCOUNT
// ====================================================================

/**
 * Ensure a billing account exists for a college tenant.
 * Defaults to UNLOCKED + FREE so every college automatically starts
 * with the permanent FREE base plan.
 */
export async function ensureCollegeBillingAccount(
  collegeId: string,
  defaults?: { accessStatus?: 'LOCKED' | 'UNLOCKED'; planType?: PlanType }
): Promise<void> {
  if (!collegeId) return;

  const supabase = await getAdminDb();

  const { data: existing } = await supabase
    .from('college_billing_accounts')
    .select('id')
    .eq('college_id', collegeId)
    .maybeSingle();

  if (existing) return;

  await supabase
    .from('college_billing_accounts')
    .insert({
      college_id: collegeId,
      plan_type: defaults?.planType || 'FREE',
      access_status: defaults?.accessStatus || 'UNLOCKED',
      subscription_status: 'ACTIVE',
      started_at: new Date().toISOString(),
    });
}

/**
 * Backward-compatible alias for ensureCollegeBillingAccount.
 */
export async function ensureBillingAccount(
  collegeOrAdminId: string,
  defaults?: { accessStatus?: 'LOCKED' | 'UNLOCKED'; planType?: PlanType }
): Promise<void> {
  return ensureCollegeBillingAccount(collegeOrAdminId, defaults);
}
