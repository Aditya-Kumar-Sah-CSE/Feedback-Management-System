# Phase 5 Architecture: College-Level Multi-Tenant Billing, Payments & Entitlements

## 1. Executive Summary

Phase 5 completes the migration of the billing, subscription, and entitlement subsystem of the **Feedback Management System (FMS)** from legacy admin-user-level accounts to canonical, college-level multi-tenancy.

Under the legacy architecture, subscriptions and trial entitlements were erroneously bound to individual admin records (`admin_billing_accounts`, `admin_trial_entitlements`, `payment_requests`), creating inconsistencies whenever multiple administrators belonged to the same institution or when administrative personnel changed.

In Phase 5:
- **Billing is strictly institution-level (`college_id`), never admin-user-level.**
- Subscriptions, payment requests, and trial entitlements attach to the college.
- All admin users belonging to an active college inherit the institution's plan entitlements.
- Entitlement checks are derived securely from the authenticated session's `activeCollegeId`.
- The entitlement engine is 100% **read-only**—it never performs lazy database mutations during read evaluations.
- Legacy tables and views (`admin_billing_accounts`, `admin_trial_entitlements`, `payment_requests`, `admins`) are completely eradicated from the active codebase.

---

## 2. Canonical College Billing Schema

All billing data resides in the canonical tenant relations established in migration `20260922000005_phase5_billing_and_entitlements.sql`:

### 2.1 `public.college_billing_accounts`
Maintains the institutional billing status, current plan, and subscription validity for each college:
```sql
CREATE TABLE public.college_billing_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL UNIQUE REFERENCES public.colleges(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'FREE', -- FREE | MONTHLY | YEARLY | CUSTOM | FULL_ACCESS
    access_status VARCHAR(20) NOT NULL DEFAULT 'UNLOCKED', -- UNLOCKED | LOCKED
    subscription_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | EXPIRED | CANCELLED
    current_plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ,
    last_payment_at TIMESTAMPTZ,
    billing_email VARCHAR(255),
    billing_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 2.2 `public.college_trial_entitlements`
Allows Platform Super Admins to grant time-limited, feature-specific trial entitlements to a college:
```sql
CREATE TABLE public.college_trial_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES auth.users(id),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | EXPIRED | REVOKED
    features TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 2.3 `public.college_payment_requests`
Tracks offline and manual payment requests submitted by college administrators for plan upgrades:
```sql
CREATE TABLE public.college_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
    billing_plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL,
    plan_type VARCHAR(50) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'UPI',
    payment_reference VARCHAR(100),
    proof_url TEXT,
    snapshot_plan_name VARCHAR(100),
    snapshot_billing_interval VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
    notes TEXT,
    rejection_reason TEXT,
    submitted_by UUID NOT NULL REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 2.4 `public.billing_plans`
The authoritative pricing catalog defining plan tiers, prices, intervals, and allowed features:
- `FREE`: ₹0 — Basic Analytics only.
- `FULL_ACCESS`: ₹2,999 / semester — Google Form generation, Google Sheet integration, Basic analytics, Full analytics access, Analytics PDF reports.
- `YEARLY`: ₹4,999 / year — Full access suite plus Priority support.

---

## 3. Authorization & Security Guarantees

### 3.1 IDOR Prevention & Tenant Isolation
1. **Never Trust Client-Sent `collegeId`:**
   Server actions (`getMyBillingStatusAction`, `submitPaymentRequestAction`, `uploadPaymentProofAction`) completely ignore client-supplied tenant identifiers for authorization. The tenant context is extracted strictly from the verified session:
   ```typescript
   const session = await requireActiveCollegeAdmin();
   const collegeId = session.activeCollegeId;
   ```
2. **Platform Super Admin Boundaries:**
   Cross-tenant administrative operations (granting/revoking trials, approving/rejecting payments, setting plan overrides) require verified platform super admin privileges via `platform_admins`:
   ```typescript
   const session = await requirePlatformSuperAdmin();
   ```
3. **Database RLS Policies:**
   - Anonymous access (`anon`) is denied across all billing tables.
   - College administrators can only view rows matching their active `college_id`.
   - Only Platform Super Admins have broad select and update capabilities across all college billing records.
4. **Storage Isolation for Payment Proofs:**
   Uploaded payment receipts are stored in the `payment-proofs` bucket organized by college prefix:
   `${session.activeCollegeId}/${Date.now()}-${file.name}`
   Preventing cross-tenant directory traversals or file overrides.

### 3.2 Price Tampering Protection
Clients cannot specify the payment amount when requesting an upgrade. Server actions resolve the pricing catalog entry by `billing_plan_id` in the database:
```typescript
const { data: plan } = await supabase
  .from('billing_plans')
  .select('id, name, price, billing_interval, slug')
  .eq('id', planId)
  .eq('is_active', true)
  .single();

// Authoritative amount from catalog
const amount = plan.price;
```
During Super Admin approval, the transaction re-verifies the requested amount against the catalog.

---

## 4. Read-Only Entitlement Engine (`src/lib/billing/entitlements.ts`)

### 4.1 Invariant: No Lazy Database Mutations
Legacy billing systems frequently executed "lazy updates" upon reading records (e.g., executing an `UPDATE ... SET status = 'EXPIRED'` inside a `GET` request). 

**The Phase 5 entitlement engine operates as a strictly pure, read-only calculator:**
- Reads current state from `college_billing_accounts`, `college_trial_entitlements`, and `billing_plans`.
- If a trial has expired (`now >= expiresAt`), the engine computes `trialStatus = 'EXPIRED'` and yields `trialFeatures = []` in memory.
- If a paid plan has expired (`now >= expiresAt`), `isPaidExpired` evaluates to `true`, and paid plan features are stripped in memory, falling back gracefully to `FREE` catalog features.
- Zero write transactions are triggered during read evaluation.

### 4.2 Capability Flags
The engine exposes consolidated capability booleans to downstream consumers:
```typescript
export interface CollegeEntitlements {
  collegeId: string;
  isUnlocked: boolean;
  effectiveFeatures: string[];
  hasFormGeneration: boolean;
  hasSheetIntegration: boolean;
  hasBasicAnalytics: boolean;
  hasFullAnalytics: boolean;
  hasPdfAccess: boolean;
  accessStatus: 'LOCKED' | 'UNLOCKED';
  subscriptionStatus: string;
  isExpired: boolean;
  planType: string;
  hasActiveTrial: boolean;
  trialStatus: 'NONE' | TrialStatus;
  trialDaysRemaining: number | null;
}
```

---

## 5. Feature Gate Enforcement (`src/lib/billing/access-control.ts`)

Downstream application routes and server actions enforce feature gates by verifying the session's active college entitlements:

```typescript
export async function requireCollegeFeature(
  feature: FeatureKey,
  actionName = 'perform this action'
): Promise<{ session: AdminSession; entitlements: CollegeEntitlements }> {
  const session = await requireActiveCollegeAdmin();
  const entitlements = await getCollegeEntitlements(session.activeCollegeId);

  if (!entitlements.isUnlocked) {
    throw new BillingError(`Access locked for ${session.activeCollege?.name || 'this college'}.`, 'ACCESS_LOCKED');
  }

  if (!entitlements.effectiveFeatures.includes(feature)) {
    throw new BillingError(`Feature '${feature}' requires an upgraded plan or active trial.`, 'FEATURE_LOCKED');
  }

  return { session, entitlements };
}
```

### 5.1 Guarded Operations:
- **Google Form Creation / Streaming Generation:** Gated on `Google Form generation`.
- **Google Sheet Sync / Responses Import:** Gated on `Google Sheet integration`.
- **Advanced Feedback Analytics & Faculty Metrics:** Gated on `Full analytics access`.
- **PDF Generation & Exports:** Gated on `Analytics PDF reports`.

---

## 6. Runtime Verification Results

The live Supabase verification suite (`scripts/verify-phase5-billing.mjs`) verified all 23 runtime and security assertions:

| Test ID | Test Category | Description | Result |
|:-------:|:--------------|:------------|:------:|
| **A** | Tenant Isolation | College admin can read own college billing account | **PASS** |
| **B** | Tenant Isolation | College admin cannot read other college's billing account | **PASS** |
| **C** | Tenant Isolation | Cross-tenant billing account updates blocked by RLS | **PASS** |
| **D** | Tenant Isolation | Cross-tenant trial entitlement read blocked by RLS | **PASS** |
| **E** | Tenant Isolation | Cross-tenant payment request read blocked by RLS | **PASS** |
| **F** | Payment Security | College admin submits payment request for own college | **PASS** |
| **G** | Payment Security | Client cannot submit payment request using foreign `college_id` | **PASS** |
| **H** | Payment Security | Client cannot upload payment proof into foreign college storage prefix | **PASS** |
| **I** | Payment Security | Payment amount derived strictly from catalog database plan | **PASS** |
| **J** | Payment Security | Approval action validates amount against catalog and rejects tampering | **PASS** |
| **K** | Entitlement Engine | Expired trial yields ZERO features in memory | **PASS** |
| **L** | Entitlement Engine | Active trial grants all configured feature capabilities | **PASS** |
| **M** | Entitlement Engine | Revoked trial disables all trial features | **PASS** |
| **N** | Entitlement Engine | Expired paid plan falls back to FREE tier features | **PASS** |
| **O** | Entitlement Engine | Active paid plan enables all plan tier features | **PASS** |
| **P** | Platform Admin | Super Admin manages BCE college billing | **PASS** |
| **Q** | Platform Admin | Super Admin manages GEC college billing | **PASS** |
| **R** | Anonymous Access | Anonymous client strictly denied billing table access | **PASS** |
| **S** | Plan Calculation | FREE entitlement includes Basic Analytics only | **PASS** |
| **T** | Plan Calculation | BASIC entitlement includes Basic Analytics | **PASS** |
| **U** | Plan Calculation | FULL_ACCESS entitlement includes Form Gen, Sheet, Analytics & PDF | **PASS** |
| **V** | Plan Calculation | YEARLY entitlement resolves all features correctly | **PASS** |
| **W** | Build Verification | TypeScript typecheck and Next.js production build pass with 0 errors | **PASS** |
| **Invariant** | Engine Purity | Read-only entitlement calculation does not mutate database rows | **PASS** |

---

## 7. Migration Checklist Complete

- [x] Canonical database schema `college_billing_accounts`, `college_trial_entitlements`, `college_payment_requests` deployed.
- [x] Zero references to legacy `admin_billing_accounts`, `admin_trial_entitlements`, `payment_requests`, or `admins` in active code.
- [x] Read-only entitlement calculation engine implemented and verified.
- [x] Session-derived authorization gates implemented across all API endpoints, server actions, and UI views.
- [x] 23/23 live runtime tests passed against remote Supabase instance.
- [x] Architecture and security documentation completed.
