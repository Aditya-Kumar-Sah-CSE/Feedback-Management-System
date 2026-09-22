# Phase 2B Architecture: Admin Multi-Tenant Authorization, Memberships & Tenant Switcher

## 1. Executive Summary

Phase 2B transitions the administrative tier of the **Feedback Management System (FMS)** from legacy, single-tenant, email-based authorization (`admins` and `admin_requests`) to a canonical, multi-tenant, identity-first architecture centered on:
- `auth.users` (canonical identity: `auth.uid()` / `user.id`)
- `public.platform_admins` (`PLATFORM_SUPER_ADMIN`)
- `public.college_memberships` (`COLLEGE_ADMIN`, `status = ACTIVE`)
- `public.college_admin_requests` (`status = PENDING`)
- `public.colleges` (institutional boundaries)

All administrative access, route protection, server actions, and dashboard UI now operate on verified tenant memberships. The existing Platform Super Admin (`iambestadi@gmail.com` / `e606b509-7864-4150-8666-a6e47a63abc4`) retains uninterrupted platform-wide privileges, while college administrators are strictly isolated to their authorized institutions.

---

## 2. Canonical Identity Model (`auth.uid()`)

### 2.1 The Principle
In the legacy system, user authorization was frequently derived from string email comparisons (`if (email === SUPER_ADMIN_EMAIL)`). In Phase 2B, **email is never an authorization identity**.

1. **Authentication:** Authenticated sessions are established via Supabase Auth. The canonical identifier is strictly `auth.uid()`.
2. **Authorization:** System privileges are determined by querying PostgreSQL relations keyed on `user_id = auth.uid()`:
   - `platform_admins`: grants platform-wide governance.
   - `college_memberships`: grants institution-scoped administrative authority.
3. **Email Role:** Email is retained strictly as metadata for display, notification, and communication—never as an authorization boundary.

### 2.2 Canonical Session Interface (`src/types/auth.ts`)
```typescript
export type PlatformRole = 'PLATFORM_SUPER_ADMIN';
export type CollegeRole = 'COLLEGE_ADMIN';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED';
export type CollegeAdminRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminCollegeMembership {
  collegeId: string;
  slug: string;
  name: string;
  code: string;
  logoUrl: string | null;
  role: CollegeRole;
  status: MembershipStatus;
}

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  isPlatformSuperAdmin: boolean;
  colleges: AdminCollegeMembership[];
  activeCollegeId: string | null;
  activeCollege: AdminCollegeMembership | null;
  isAuthenticated: boolean;
  isActive: boolean;
  isPending: boolean;
  isRejected: boolean;

  // Compatibility aliases for gradual legacy migration
  isSuperAdmin: boolean;
  isApproved: boolean;
  admin: {
    id: string;
    user_id: string;
    email: string;
    name: string;
    role: string;
    status: string;
  } | null;
  user?: {
    id: string;
    email: string;
    user_metadata?: Record<string, any>;
  } | null;
}
```

---

## 3. Multi-Tenant Authorization Engine (`src/lib/auth/admin-auth.ts`)

### 3.1 `getAdminSession()`
The session resolver executes a 5-step verification process:
1. **Supabase User Check:** Fetches the authenticated user using `supabase.auth.getUser()`. If missing or invalid, returns an unauthenticated, zero-permission session.
2. **Platform Admin Check:** Queries `public.platform_admins` for `user_id = user.id` and `is_active = true`.
3. **College Memberships Query:** Queries `public.college_memberships` joined to `public.colleges`. Only memberships with `status = 'ACTIVE'` are accepted.
4. **Platform Super Admin Expansion:** If the user is a `PLATFORM_SUPER_ADMIN`, all active institutions from `public.colleges` are added to their authorized college list, allowing them to inspect and manage any active tenant.
5. **Active College Resolution:**
   - Evaluates the routing hint cookie `fms_active_tenant_id`.
   - For **Platform Super Admins**: any active college matching the cookie is selected. If invalid or missing, falls back deterministically to the first active college in alphabetical order (never hardcoded to BCE).
   - For **College Admins**: only an institution where the user possesses an `ACTIVE` membership is accepted. If a forged or invalid cookie is passed, it is rejected and deterministically defaults to their first authorized membership.
6. **No-Access & Pending Resolution:** If the user possesses neither platform privileges nor active memberships, queries `public.college_admin_requests` for pending/rejected submissions to establish `isPending: true` or `isRejected: true`.

### 3.2 `requireAdminSession()`
Server Components, Route Handlers, and Server Actions enforce strict access controls via:
```typescript
requireAdminSession(options?: {
  requireCollegeId?: string;
  redirectTo?: string;
  client?: any;
  cookieTenantId?: string;
}): Promise<AdminSession>
```
**Enforcement Rules:**
- Unauthenticated users are redirected to `/admin/login`.
- Users with pending requests are redirected to `/admin/pending`.
- Inactive users are rejected with an explicit unauthorized error.
- If `requireCollegeId` is provided:
  - **Platform Super Admin**: Allowed only if the requested college exists and is active.
  - **College Admin**: Allowed only if the user has an `ACTIVE` membership for that exact `collegeId`.
  - Client-submitted college IDs are **never** trusted without server-side validation.

---

## 4. Active Tenant Resolution & Switcher

### 4.1 Routing Hint Cookie (`fms_active_tenant_id`)
- **Name:** `fms_active_tenant_id`
- **Attributes:** `HttpOnly`, `SameSite=Lax`, `Secure` (production), `Path=/`, `Max-Age=30 days`.
- **Semantics:** The cookie is purely a **routing/display hint**, never an authorization boundary. If the client forges or manipulates this cookie, `getAdminSession` detects that the user lacks an active membership for that institution and overrides the selection with an authorized tenant.

### 4.2 Dedicated Server Action (`src/lib/auth/tenant-actions.ts`)
```typescript
export async function setActiveCollegeAction(collegeId: string): Promise<{
  success?: boolean;
  activeCollegeId?: string;
  error?: string;
}>
```
- Fully isolated in a dedicated `'use server'` action file to prevent `next/headers` leakage into client bundles.
- Authenticates the caller, verifies membership/platform rights for `collegeId`, updates the cookie, and returns a verified status.

### 4.3 Tenant Switcher Component (`src/app/admin/dashboard/components/TenantSwitcher.tsx`)
- Displayed in the admin dashboard navigation header when:
  - The user is a `PLATFORM_SUPER_ADMIN`, OR
  - The user has multiple active college memberships.
- Displays college name, institution code, logo (if present), and active indicator badge.
- Triggers `setActiveCollegeAction(collegeId)` followed by `router.refresh()` to reload all dashboard server components in the new tenant context.

---

## 5. Tenant-Scoped Request Access & Onboarding

### 5.1 Request Access Route (`src/app/api/admin/request-access/route.ts`)
Migrated from legacy `admin_requests` to `public.college_admin_requests`.
- **Mandatory Authentication:** Requires authenticated user session via `auth.uid()`.
- **Mandatory College Selection:** Rejects submissions lacking `collegeId` or `collegeSlug` (no silent defaulting to BCE).
- **Institution Validation:** Validates `collegeId` or `collegeSlug` against `public.colleges` (`is_active = true`).
- **Idempotency & Duplicate Prevention:**
  - Checks if the user already has an `ACTIVE` membership for the college.
  - Checks for existing `PENDING` requests for `(college_id, LOWER(email))`.
- **Canonical Schema:** Records `user_id`, `college_id`, `email`, `name`, and `status = 'PENDING'`.

### 5.2 Signup UI (`src/app/admin/signup/page.tsx`)
- Dynamically queries `/api/public/colleges` upon mount.
- Provides an institution selector dropdown requiring the user to explicitly designate which college they are requesting administrative access for.
- On successful account creation, registers the request in `college_admin_requests` and routes to `/admin/pending`.

---

## 6. Forms & Results Tenant Authorization

### 6.1 Forms Actions (`src/app/admin/forms/actions.ts`)
- **Query Scoping:** `getFeedbackFormsAction` filters forms by `session.activeCollegeId`.
- **Creation Scoping:** `validateAndPrepareFormDraftAction` injects `college_id: targetCollegeId` for both semester and single-faculty forms.
- **Modification Guard:** `updateFormStatusAction` and `deleteFeedbackFormAction` fetch the target form's `college_id` and ensure non-super-admins hold an `ACTIVE` membership in that institution before applying changes.

### 6.2 Results & Analytics (`src/app/admin/results/actions.ts` & `src/lib/analytics/service.ts`)
- `getFormAnalyticsAction`: Queries `feedback_forms` to verify that non-super-admins have an active membership for the form's college before reading analytics.
- `getOverallAnalyticsAction`: Enforces `session.activeCollegeId` by scoping queries to `college_id = activeCollegeId`.
- `syncSingleFormResponsesAction`: Enforces institutional ownership before executing Google response synchronization.

---

## 7. Middleware Architecture (`src/middleware.ts`)

- **Zero Database Overhead on Static Assets:** Bypasses non-admin and public routes.
- **Session Refresh:** Refreshes Supabase SSR session cookies on `/admin/*` and `/auth/*` routes.
- **Route Guard:** Redirects unauthenticated access on `/admin/dashboard/*` to `/admin/login`.
- **Tenant Hint Forwarding:** Forwards `fms_active_tenant_id` cookie as the `x-active-tenant-id` request header.
- **Strict Boundary:** Middleware never executes database authorization queries and never treats the cookie as proof of authorization. Server-side validation remains authoritative.

---

## 8. Client Bundle Security Audit

The client bundle has been audited and verified:
- `SUPABASE_SERVICE_ROLE_KEY` is exclusively consumed in server-only utilities (`src/lib/supabase/admin.ts`, `src/lib/feedback/response-token.ts`).
- `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` are strictly restricted to server modules (`src/lib/google/auth.ts`, `src/app/api/auth/google/*`).
- No private secrets are prefixed with `NEXT_PUBLIC_`.
- Server Actions called by client components are isolated in `'use server'` modules, preventing `next/headers` or server-only SDK leakage.

---

## 9. Verification & Test Matrix

### 9.1 Static Validation Suite
- **TypeScript Compiler (`npx tsc --noEmit`):** **PASS** (0 errors).
- **ESLint (`npm run lint`):** **PASS** (0 warnings, 0 errors).
- **Production Build (`npm run build`):** **PASS** (Exit code 0, all 32 dynamic and static routes compiled and optimized).

### 9.2 Runtime Authorization & IDOR Test Suite (`scratch/test_phase2b_auth.mjs`)
Executed against the live Supabase project `txerarcajxjzxifanzxw`:

| Test Code | Scenario | Expected Behavior | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Test A** | College Admin → own college | ALLOW | Resolved authorized college `TAI-TEST` | **PASS** |
| **Test B** | College Admin → unauthorized college | DENY | Rejected with `Forbidden: You do not possess administrative permissions` | **PASS** |
| **Test C** | College Admin → forged tenant cookie | REJECT / fallback | Ignored forged BCE cookie, resolved authorized college `TAI-TEST` | **PASS** |
| **Test D** | Platform Super Admin → BCE | ALLOW | Resolved active college `Bhagalpur College of Engineering` | **PASS** |
| **Test E** | Platform Super Admin → second active college | ALLOW | Switched to and resolved `Test Autonomous Institute` | **PASS** |
| **Test F** | Anonymous user → `/admin/dashboard` | Redirect / Deny | Threw `NEXT_REDIRECT` to `/admin/login` | **PASS** |
| **Test G** | Authenticated user with no membership | Pending / No-Access | `isPending=true`, `isActive=false`, redirected to `/admin/pending` | **PASS** |
| **Test H** | Client-submitted `college_id` for another tenant | DENY | Server-side validation blocked mismatched tenant | **PASS** |
| **Test I** | Invalid or inactive `college_id` | DENY | Rejected nonexistent college with error message | **PASS** |
| **Test J** | Direct user-token RLS query | Cross-tenant access denied | BCE memberships: 0, BCE forms: 0, TAI memberships: 1 | **PASS** |

---

## 10. Legacy Migration Status & Deferred Scope

### 10.1 Legacy Status
- **Active Auth Flow:** Fully migrated to `platform_admins`, `college_memberships`, and `college_admin_requests`.
- **Legacy Compatibility:** Backwards-compatibility aliases (`isSuperAdmin`, `isApproved`, `admin`, `user`) are retained in `AdminSession` to allow billing, PDF export, and legacy admin tab actions to compile and run without breaking.
- **Legacy Tables:** Legacy `admins` and `admin_requests` tables remain in the remote database for rollback safety, but all active authentication queries originate from the multi-tenant tables.

### 10.2 Explicitly Deferred to Subsequent Phases
- **Phase 3:** Multi-tenant Google OAuth & Sheets/Forms connection mapping per college (`college_google_connections`).
- **Phase 4:** Multi-tenant billing, quotas, and subscription enforcement (`college_subscriptions`).
- **Phase 5:** Multi-tenant PDF branding, reports, and institution-scoped visual styling.
