import type { PlanType, CollegeTrialEntitlement, TrialStatus } from '@/types/database';

// ====================================================================
// BILLING STATUS TYPE
// ====================================================================

export interface BillingStatus {
  isUnlocked: boolean;
  planType: PlanType;
  accessStatus: 'LOCKED' | 'UNLOCKED';
  subscriptionStatus: string;
  expiresAt: string | null;
  startedAt: string | null;
  billingAccountId: string | null;
  isExpired: boolean;
  features: string[];
  hasFormGeneration: boolean;
  hasSheetIntegration: boolean;
  hasBasicAnalytics: boolean;
  hasFullAnalytics: boolean;
  hasPdfAccess: boolean;
  // Trial Entitlement info
  hasActiveTrial: boolean;
  activeTrial?: CollegeTrialEntitlement | null;
  trialStatus?: 'NONE' | TrialStatus;
  trialExpiresAt?: string | null;
  trialDaysRemaining?: number | null;
}

export interface FormAccessResult {
  allowed: boolean;
  reason: string;
  code?: 'FORM_GENERATION_LOCKED' | 'UNAUTHORIZED' | 'ACCOUNT_INACTIVE';
  billingStatus?: BillingStatus;
}

export interface SheetIntegrationAccessResult {
  allowed: boolean;
  reason?: string;
  code?: 'SHEET_INTEGRATION_LOCKED' | 'UNAUTHORIZED' | 'ACCOUNT_INACTIVE';
  billingStatus?: BillingStatus;
}

export interface BasicAnalyticsAccessResult {
  allowed: boolean;
  reason?: string;
  code?: 'BASIC_ANALYTICS_LOCKED' | 'UNAUTHORIZED' | 'ACCOUNT_INACTIVE';
  billingStatus?: BillingStatus;
}

export interface AnalyticsAccessResult {
  allowed: boolean;
  reason: string;
  code?: 'ANALYTICS_UPGRADE_REQUIRED' | 'UNAUTHORIZED' | 'ACCOUNT_INACTIVE';
  billingStatus?: BillingStatus;
}

export interface PdfAccessResult {
  allowed: boolean;
  reason: string;
  code?: 'PDF_EXPORT_LOCKED' | 'UNAUTHORIZED' | 'ACCOUNT_INACTIVE';
  billingStatus?: BillingStatus;
}

// ====================================================================
// FEATURE VOCABULARY CONSTANTS
// ====================================================================

export const FEATURE_GOOGLE_FORM_GENERATION = 'Google Form generation';
export const FEATURE_GOOGLE_SHEET_INTEGRATION = 'Google Sheet integration';
export const FEATURE_FULL_ANALYTICS_ACCESS = 'Full analytics access';
export const FEATURE_BASIC_ANALYTICS = 'Basic analytics';
export const FEATURE_ANALYTICS_PDF = 'Analytics PDF reports';
export const FEATURE_PRIORITY_SUPPORT = 'Priority support';

// ====================================================================
// STATUS/TYPE CONSTANTS (NOT pricing — pricing comes from DB)
// ====================================================================

export const ACCESS_STATUSES = ['LOCKED', 'UNLOCKED'] as const;
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING'] as const;
export const PLAN_TYPES: PlanType[] = ['FREE', 'MONTHLY', 'YEARLY'];

/**
 * Normalizes and tests whether a feature list contains a required feature.
 * Supports both human-readable strings ('Google Form generation') and capability keys ('form_generation').
 */
export function planHasFeature(features: string[] | null | undefined, featureName: string): boolean {
  if (!features || !Array.isArray(features)) return false;

  const target = featureName.trim().toLowerCase().replace(/[\s_-]+/g, ' ');

  // Mapping alias groups
  const aliasGroups: Record<string, string[]> = {
    form: ['google form generation', 'form generation', 'form_generation'],
    sheet: ['google sheet integration', 'sheet integration', 'sheet_integration', 'sheet sync'],
    basic: ['basic analytics', 'basic_analytics'],
    full: ['full analytics access', 'full analytics', 'full_analytics'],
    pdf: ['analytics pdf reports', 'analytics pdf', 'analytics_pdf', 'pdf reports', 'pdf_reports', 'pdf reports and exports', 'pdf reports/exports', 'pdf export', 'pdf exports'],
    priority: ['priority support', 'priority_support'],
  };

  return features.some((f) => {
    const norm = String(f).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    if (norm === target || norm.includes(target) || target.includes(norm)) return true;

    for (const group of Object.values(aliasGroups)) {
      const matchesF = group.some(alias => norm.includes(alias) || alias.includes(norm));
      const matchesTarget = group.some(alias => target.includes(alias) || alias.includes(target));
      if (matchesF && matchesTarget) return true;
    }

    return false;
  });
}
