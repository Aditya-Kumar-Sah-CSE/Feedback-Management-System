import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { CollegeTrialEntitlement, TrialStatus } from '@/types/database';
import {
  FEATURE_GOOGLE_FORM_GENERATION,
  FEATURE_GOOGLE_SHEET_INTEGRATION,
  FEATURE_FULL_ANALYTICS_ACCESS,
  FEATURE_BASIC_ANALYTICS,
  FEATURE_PRIORITY_SUPPORT,
  planHasFeature,
} from './constants';

async function getAdminDb() {
  return createAdminClient() || await createClient();
}

// ====================================================================
// AUTHORITATIVE ENTITLEMENT TYPES
// ====================================================================

export interface CollegeEntitlements {
  collegeId: string;
  isUnlocked: boolean;
  basePlan: { slug: string; features: string[] };
  paidPlan: {
    slug: string;
    features: string[];
    expiresAt: string | null;
    status: string;
  } | null;
  trial: {
    id: string;
    features: string[];
    expiresAt: string;
    daysRemaining: number;
  } | null;
  effectiveFeatures: string[];
  // Convenience capability flags
  hasFormGeneration: boolean;
  hasSheetIntegration: boolean;
  hasBasicAnalytics: boolean;
  hasFullAnalytics: boolean;
  hasPdfAccess: boolean;
  // UI & Metadata
  accessStatus: 'LOCKED' | 'UNLOCKED';
  subscriptionStatus: string;
  isExpired: boolean;
  planType: string;
  expiresAt: string | null;
  startedAt: string | null;
  billingAccountId: string | null;
  hasActiveTrial: boolean;
  activeTrial: CollegeTrialEntitlement | null;
  trialStatus: 'NONE' | TrialStatus;
  trialExpiresAt: string | null;
  trialDaysRemaining: number | null;
}

export interface EffectivePlanInfo {
  collegeId: string;
  planType: string;
  isTrial: boolean;
  features: string[];
  expiresAt: string | null;
}

// ====================================================================
// AUTHORITATIVE READ-ONLY ENTITLEMENT ENGINE
// ====================================================================

/**
 * Calculates complete, effective tenant entitlements strictly as a READ-ONLY operation.
 * Per Hardening Rule 4, does NOT perform any database mutations or lazy status updates.
 * Expired trials and subscriptions contribute ZERO features in memory.
 */
export const getCollegeEntitlements = cache(async (collegeId: string): Promise<CollegeEntitlements> => {
  if (!collegeId) {
    return createEmptyLockedEntitlements('');
  }

  const supabase = await getAdminDb();
  const now = new Date();

  // 1. Fetch billing account, active trial, and catalog plans concurrently
  const [billingRes, trialRes, catalogRes] = await Promise.all([
    supabase
      .from('college_billing_accounts')
      .select('*')
      .eq('college_id', collegeId)
      .maybeSingle(),
    supabase
      .from('college_trial_entitlements')
      .select('*')
      .eq('college_id', collegeId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('billing_plans')
      .select('id, name, slug, features, is_active'),
  ]);

  const billing = billingRes.data || null;
  const activeTrialRow = trialRes.data || null;
  const catalogPlans = catalogRes.data || [];

  // Build catalog features map: slug -> features array
  const catalogMap = new Map<string, string[]>();
  const idCatalogMap = new Map<string, string[]>();
  for (const p of catalogPlans) {
    if (Array.isArray(p.features)) {
      const featList = p.features.map(f => String(f).trim());
      catalogMap.set(p.slug.toUpperCase(), featList);
      idCatalogMap.set(p.id, featList);
    }
  }

  // 2. Base Plan (FREE) resolution
  const freeFeatures = catalogMap.get('FREE') || [FEATURE_BASIC_ANALYTICS];
  const basePlan = {
    slug: 'FREE',
    features: freeFeatures,
  };

  // 3. Paid Plan evaluation (READ-ONLY in-memory expiration check)
  const rawPlanType = (billing?.plan_type || 'FREE').toUpperCase();
  const isPaid = rawPlanType !== 'FREE';
  const isPaidExpired = Boolean(
    isPaid && billing?.expires_at && new Date(billing.expires_at) <= now
  );
  const isAccountUnlocked = billing?.access_status === 'UNLOCKED';

  let paidPlanInfo: CollegeEntitlements['paidPlan'] = null;
  let paidFeatures: string[] = [];

  if (isPaid && !isPaidExpired && isAccountUnlocked) {
    // Resolve paid plan features: try current_plan_id first, then slug
    if (billing?.current_plan_id && idCatalogMap.has(billing.current_plan_id)) {
      paidFeatures = idCatalogMap.get(billing.current_plan_id)!;
    } else if (catalogMap.has(rawPlanType)) {
      paidFeatures = catalogMap.get(rawPlanType)!;
    } else {
      // Deterministic fallback for standard paid plans
      paidFeatures = [
        FEATURE_GOOGLE_FORM_GENERATION,
        FEATURE_GOOGLE_SHEET_INTEGRATION,
        FEATURE_FULL_ANALYTICS_ACCESS,
        FEATURE_PRIORITY_SUPPORT,
      ];
    }

    paidPlanInfo = {
      slug: rawPlanType,
      features: paidFeatures,
      expiresAt: billing?.expires_at || null,
      status: billing?.subscription_status || 'ACTIVE',
    };
  }

  // 4. Trial Entitlement evaluation (READ-ONLY in-memory validity check)
  let activeTrial: CollegeTrialEntitlement | null = null;
  let trialInfo: CollegeEntitlements['trial'] = null;
  let trialFeatures: string[] = [];
  let trialDaysRemaining: number | null = null;
  let trialStatus: 'NONE' | TrialStatus = 'NONE';

  if (activeTrialRow) {
    const startsAt = new Date(activeTrialRow.starts_at);
    const expiresAt = new Date(activeTrialRow.expires_at);

    if (now >= expiresAt) {
      // Expired in memory: contributes ZERO features
      trialStatus = 'EXPIRED';
    } else if (now < startsAt) {
      // Future trial: not yet started
      trialStatus = 'ACTIVE';
    } else {
      // Valid active trial
      activeTrial = activeTrialRow as CollegeTrialEntitlement;
      trialStatus = 'ACTIVE';
      trialFeatures = Array.isArray(activeTrialRow.features)
        ? (activeTrialRow.features as any[]).map((f: any) => String(f).trim())
        : [];

      const diffMs = expiresAt.getTime() - now.getTime();
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      trialInfo = {
        id: activeTrialRow.id,
        features: trialFeatures,
        expiresAt: activeTrialRow.expires_at,
        daysRemaining: trialDaysRemaining,
      };
    }
  }

  // 5. Union of Effective Features
  // Base FREE + Active Paid + Active Trial
  // If account is explicitly LOCKED, paid plan access is disabled, but trial or base access rules apply
  const effectiveFeatureSet = new Set<string>();

  // Always include free base features unless account is locked with no trial
  for (const f of basePlan.features) {
    effectiveFeatureSet.add(f);
  }

  // Add paid plan features if active and unexpired
  for (const f of paidFeatures) {
    effectiveFeatureSet.add(f);
  }

  // Add active trial features
  for (const f of trialFeatures) {
    effectiveFeatureSet.add(f);
  }

  const effectiveFeatures = Array.from(effectiveFeatureSet);

  // 6. Capability flags (derived strictly from effectiveFeatures)
  const hasFormGeneration = planHasFeature(effectiveFeatures, FEATURE_GOOGLE_FORM_GENERATION);
  const hasSheetIntegration = planHasFeature(effectiveFeatures, FEATURE_GOOGLE_SHEET_INTEGRATION);
  const hasBasicAnalytics = planHasFeature(effectiveFeatures, FEATURE_BASIC_ANALYTICS);
  const hasFullAnalytics = planHasFeature(effectiveFeatures, FEATURE_FULL_ANALYTICS_ACCESS);
  const hasPdfAccess = true; // Enabled across all colleges for full institutional, faculty, and response PDF exports

  const isUnlocked = hasFormGeneration;
  const accessStatus: 'LOCKED' | 'UNLOCKED' = isUnlocked ? 'UNLOCKED' : (billing?.access_status || 'LOCKED');

  return {
    collegeId,
    isUnlocked,
    basePlan,
    paidPlan: paidPlanInfo,
    trial: trialInfo,
    effectiveFeatures,
    hasFormGeneration,
    hasSheetIntegration,
    hasBasicAnalytics,
    hasFullAnalytics,
    hasPdfAccess,
    accessStatus,
    subscriptionStatus: isPaidExpired ? 'EXPIRED' : (billing?.subscription_status || 'ACTIVE'),
    isExpired: isPaidExpired,
    planType: rawPlanType,
    expiresAt: billing?.expires_at || null,
    startedAt: billing?.started_at || null,
    billingAccountId: billing?.id || null,
    hasActiveTrial: activeTrial !== null,
    activeTrial,
    trialStatus,
    trialExpiresAt: activeTrial?.expires_at || null,
    trialDaysRemaining,
  };
});

/**
 * Checks if a specific capability/feature is available for the given college.
 */
export async function hasCollegeFeature(collegeId: string, feature: string): Promise<boolean> {
  if (!collegeId) return false;
  const entitlements = await getCollegeEntitlements(collegeId);
  return planHasFeature(entitlements.effectiveFeatures, feature);
}

/**
 * Asserts that a college has a specific capability. Throws an Error if denied.
 */
export async function requireCollegeFeature(collegeId: string, feature: string): Promise<void> {
  const allowed = await hasCollegeFeature(collegeId, feature);
  if (!allowed) {
    throw new Error(`College ${collegeId} does not have required entitlement for "${feature}".`);
  }
}

/**
 * Returns effective plan description and active features for display.
 */
export async function getEffectiveCollegePlan(collegeId: string): Promise<EffectivePlanInfo> {
  const entitlements = await getCollegeEntitlements(collegeId);

  if (entitlements.trial) {
    return {
      collegeId,
      planType: 'TRIAL',
      isTrial: true,
      features: entitlements.effectiveFeatures,
      expiresAt: entitlements.trial.expiresAt,
    };
  }

  if (entitlements.paidPlan) {
    return {
      collegeId,
      planType: entitlements.paidPlan.slug,
      isTrial: false,
      features: entitlements.effectiveFeatures,
      expiresAt: entitlements.paidPlan.expiresAt,
    };
  }

  return {
    collegeId,
    planType: 'FREE',
    isTrial: false,
    features: entitlements.effectiveFeatures,
    expiresAt: null,
  };
}

function createEmptyLockedEntitlements(collegeId: string): CollegeEntitlements {
  return {
    collegeId,
    isUnlocked: false,
    basePlan: { slug: 'FREE', features: [FEATURE_BASIC_ANALYTICS] },
    paidPlan: null,
    trial: null,
    effectiveFeatures: [FEATURE_BASIC_ANALYTICS],
    hasFormGeneration: false,
    hasSheetIntegration: false,
    hasBasicAnalytics: true,
    hasFullAnalytics: false,
    hasPdfAccess: false,
    accessStatus: 'LOCKED',
    subscriptionStatus: 'EXPIRED',
    isExpired: true,
    planType: 'FREE',
    expiresAt: null,
    startedAt: null,
    billingAccountId: null,
    hasActiveTrial: false,
    activeTrial: null,
    trialStatus: 'NONE',
    trialExpiresAt: null,
    trialDaysRemaining: null,
  };
}
