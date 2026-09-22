# Phase 2A — Application Tenant Resolver Architecture & Design
## Multi-Tenant Feedback Management System (FMS) Platform

**Document Version:** 1.1.0  
**Phase:** 2A — Tenant Resolver Foundation  
**Status:** Completed & Verified  
**Target Environment:** New Supabase Project (`txerarcajxjzxifanzxw`)  

---

## Executive Summary

Phase 2A establishes the runtime tenant resolution foundation for the Feedback Management System (FMS). Following the successful deployment and verification of the 7 multi-tenant PostgreSQL migrations in Phase 1D, the application must transition from a single-tenant BCE deployment to a scalable multi-tenant architecture supporting dynamic tenant slugs (`/bce-bgp`, `/gec-gaya`, `/mce-munger`) running against the single database.

```
                    FMS
                     │
              Tenant Resolver
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       /bce-bgp   /gec-gaya   /mce-munger
          │          │          │
          ▼          ▼          ▼
       college_id  college_id  college_id
          │          │          │
          └──────────┼──────────┘
                     ▼
              Same application
                     │
                     ▼
             Same Supabase (txerarcajxjzxifanzxw)
```

---

## 1. Target URL Architecture

### 1.1 Public Routing

| Route Pattern | Target View | Context |
| :--- | :--- | :--- |
| `/` | Platform Directory / Tenant Gateway | Displays active colleges directory with quick navigation to `/bce-bgp` |
| `/[tenant]` | Tenant Public Homepage | Resolves tenant via slug; displays tenant-branded header, hero, and discovery flow |
| `/[tenant]/feedback` | Tenant Feedback Forms Directory | Displays active published feedback forms filtered strictly by tenant `college_id` |
| `/[tenant]/feedback/[id]` | Tenant Feedback Form | Validates form belongs to resolved tenant; displays student feedback questionnaire |
| `/[tenant]/feedback/confirmation` | Tenant Submission Receipt | Displays verified submission receipt with tenant-specific college branding |

### 1.2 Administrative Routing Decision

* **Current Architecture:** `/admin/...` (`/admin/login`, `/admin/dashboard`, `/admin/forms`, `/admin/billing`, etc.).
* **Architectural Decision:** Preserve existing global `/admin/...` routes for authentication and administrative workflows during Phase 2A.
* **Rationale:**
  1. Administrative authentication is tied to `auth.users` through Supabase Auth, which is global across the platform.
  2. Platform Super Admins manage multiple colleges from a single pane of glass.
  3. College Admins belong to tenants via `college_memberships`.
  4. Moving or rewriting all `/admin` routes in Phase 2A would risk regressions in auth session cookies, CSRF protection, Google OAuth callback handlers, and dashboard actions.
  5. In Phase 2B/2C, the admin dashboard will consume the active college context via tenant switcher or query context, while `/admin` remains safe, stable, and backward-compatible.

---

## 2. Server-Side Tenant Resolver Design

### 2.1 Core Invariants
* **Database Resolution:** Slug → `public.colleges` WHERE `slug = :slug` AND `is_active = true`.
* **Canonical Identity:** Resolution returns canonical database `id` (UUID) as `collegeId`.
* **Not-Found Handling:** Unknown or inactive slugs return `null` or invoke Next.js `notFound()`.
* **No Trust in Client college_id:** The URL slug or client-submitted `college_id` is an input for lookup, **never** an authorization credential. Authorization is always validated against `auth.uid()` via Supabase RLS and `college_memberships`.
* **Zero Secret Leakage:** Resolved `TenantContext` exposes only public tenant metadata and branding tokens. Service role keys, database connection strings, and OAuth refresh tokens are never included.
* **Performance & Deduplication:** Combines React `cache()` for per-request deduplication with `unstable_cache()` (60s revalidation with tenant cache tags `tenant_<slug>`) to prevent repetitive database roundtrips.

### 2.2 TenantContext Interface

```typescript
export interface TenantBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface TenantContext {
  collegeId: string;
  slug: string;
  name: string;
  shortName: string; // e.g. "BCE-BGP"
  websiteUrl: string | null;
  branding: TenantBranding;
  isActive: boolean;
  college: College;
}
```

---

## 3. Middleware Design

### 3.1 Principles
* **Non-Disruptive:** Middleware MUST NOT intercept or break:
  * `/admin/*` and `/auth/*` (session cookie refresh and auth redirects)
  * `/api/*` (API endpoints and webhooks)
  * `/_next/*` (Next.js internals, scripts, styles)
  * `/favicon.ico`, static images, PWA assets
* **Zero Edge Database Overhead:** Middleware does NOT query Supabase on every edge request. Authoritative database resolution takes place server-side inside Server Components and Route Handlers via `resolveTenantOrNotFound(slug)`.
* **Slug Recognition:** Middleware attaches a validated `x-tenant-slug` request header when an incoming request matches `/[slug]/*`, allowing downstream layouts to access the tenant hint with zero latency.

---

## 4. BCE Hardcoding Audit & Classification

A comprehensive audit of single-tenant assumptions across the application classified all references into 4 strict categories:
* **Class A:** Must change in Phase 2A (Immediate Foundation)
* **Class B:** Must change in later phase (Deferred Migration Targets)
* **Class C:** Safe/static reference (No database mutation needed)
* **Class D:** Test/documentation only (BCE seed fixtures, architecture notes)

### 4.1 Audit Matrix

| File / Component | Class | Issue / Single-Tenant Assumption | Phase 2A Treatment |
| :--- | :---: | :--- | :--- |
| `src/middleware.ts` | **A** | Static route assumptions without tenant slug recognition | **Updated:** Extracts first segment and sets `x-tenant-slug` header without edge DB queries. |
| `src/app/page.tsx` | **A** | Queries academic data without `college_id`; hardcoded BCE titles | **Updated:** Converted to platform gateway listing active colleges; links to `/bce-bgp`. |
| `src/lib/supabase/academic-cache.ts` | **A** | Queries masters globally without `college_id` filter; global cache tag | **Updated:** Added `collegeId` filter and tenant-isolated cache key/tags `academic_masters_<collegeId>`. |
| `src/app/feedback/actions.ts` | **A** | Public queries (`getPublicActiveFormsAction`, etc.) without `college_id` | **Updated:** Added optional `collegeId` scoping parameter to public actions. |
| `src/app/[tenant]/page.tsx` | **A** | Missing dynamic tenant root route | **Created:** Renders tenant-scoped homepage and cascading discovery flow. |
| `src/app/[tenant]/feedback/page.tsx` | **A** | Missing tenant forms catalog route | **Created:** Renders published forms filtered strictly by tenant `college_id`. |
| `src/app/[tenant]/feedback/[id]/page.tsx` | **A** | Missing tenant feedback questionnaire route | **Created:** Direct form response flow with tenant branding. |
| `src/lib/auth/admin-auth.ts` | **B** | Uses legacy single-tenant `admins` table instead of `college_memberships` | **Deferred to Phase 2B:** Admin auth preserved globally during 2A. |
| `src/app/admin/dashboard/...` | **B** | Forms and dashboard assume single admin tenant | **Deferred to Phase 2B:** Will consume tenant context/switcher in 2B. |
| `src/lib/google/auth.ts` | **B** | Loads token from legacy `google_oauth_tokens` instead of `college_google_connections` | **Deferred to Phase 3:** Google multi-tenant integration. |
| `src/lib/google/template.ts` | **B** | Hardcoded "Bhagalpur College of Engineering (BCE Bhagalpur)" in Form headers | **Deferred to Phase 3:** Google multi-tenant templates. |
| `src/lib/google/sync.ts` | **B** | Hardcoded canonical URL `https://bce-bgp-feedback-management-system.vercel.app` | **Deferred to Phase 3:** Sync with dynamic portal URL. |
| `src/lib/email/service.ts` | **B** | Sender `'BCE Feedback <noreply@bce-bgp.ac.in>'` | **Deferred to Phase 3:** Dynamic college email configurations. |
| `src/lib/analytics/pdf-generator.ts` | **B** | Hardcoded `'BHAGALPUR COLLEGE OF ENGINEERING'` headers and PDF metadata | **Deferred to Phase 4:** Multi-tenant PDF branding engine. |
| `src/app/admin/billing/actions.ts` | **B** | Single-tenant billing accounts and legacy `payment_requests` table | **Deferred to Phase 5:** Multi-tenant billing and subscriptions. |
| `src/lib/google/auth.ts` (`getGoogleRedirectUri`) | **C** | Dynamic redirect URI resolver supporting request origin and env vars | **Safe:** No changes required; functions correctly across environments. |
| `src/lib/supabase/client.ts` | **C** | Standard browser Supabase SSR client | **Safe:** No tenant leaks; uses anon key. |
| `src/lib/supabase/server.ts` | **C** | Server-side Supabase SSR client | **Safe:** Standard cookie handling preserved. |
| `docs/architecture/*` | **D** | Seed college UUID `bce00000-0000-0000-0000-000000000001` | **Documentation only:** Never used as authorization logic. |
| `scratch/test_tenant_resolver.mjs` | **D** | Verification script testing seed resolution | **Test only:** Validates canonical database resolution. |

---

## 5. Phase 2A Scope of Work

1. Define `College` and `TenantContext` TypeScript interfaces in `src/types/tenant.ts`.
2. Implement server-side tenant resolver in `src/lib/tenant/resolver.ts`.
3. Implement tenant-scoped academic cache in `src/lib/supabase/academic-cache.ts`.
4. Update `src/middleware.ts` to recognize tenant paths cleanly without breaking auth or admin routes.
5. Create tenant dynamic public pages:
   * `src/app/[tenant]/page.tsx` (Tenant Home / Discovery)
   * `src/app/[tenant]/feedback/page.tsx` (Tenant Active Forms)
   * `src/app/[tenant]/feedback/[id]/page.tsx` (Tenant Form Questionnaire)
6. Update root `src/app/page.tsx` to link to `/bce-bgp` while maintaining public discovery functionality.
7. Run automated and static tests verifying:
   * `/bce-bgp` resolves BCE tenant correctly.
   * Unknown slug returns 404.
   * Inactive college cannot be resolved.
   * Typescript, ESLint, and Next.js production build pass cleanly.

---

## 6. Implementation Inventory

### Files Created:
* `docs/architecture/phase-2a-tenant-resolver.md` — Phase 2A architecture, audit, and verification report.
* `src/types/tenant.ts` — Type definitions for `College`, `TenantBranding`, `TenantContext`, and resolver options.
* `src/lib/tenant/resolver.ts` — Server-side tenant resolver with React `cache()`, Next.js `unstable_cache()`, and `resolveTenantOrNotFound()`.
* `src/app/[tenant]/page.tsx` — Public dynamic tenant portal page with branded hero and discovery flow.
* `src/app/[tenant]/feedback/page.tsx` — Tenant feedback forms catalog page filtered by `college_id`.
* `src/app/[tenant]/feedback/[id]/page.tsx` — Tenant form questionnaire page.

### Files Modified:
* `src/middleware.ts` — Tenant-aware path recognition with `x-tenant-slug` header injection; edge DB queries eliminated.
* `src/lib/supabase/academic-cache.ts` — Multi-tenant caching with `college_id` filter and tenant cache tags.
* `src/app/feedback/actions.ts` — Public form queries updated to support optional `collegeId` scoping.
* `src/app/page.tsx` — Root platform landing page with active institution switcher.

---

## 7. Verification & Test Matrix

All 10 required test suites from the specification were executed and verified:

| # | Test Suite | Verification Method | Status | Details |
| :- | :--- | :--- | :---: | :--- |
| **TEST 1** | Valid BCE slug resolves | Anon Client DB Query (`test_tenant_resolver.mjs`) | **PASS** | `bce-bgp` resolves canonical record: `id = bce00000-0000-0000-0000-000000000001`, `code = BCE-BGP`, `is_active = true`, correct branding. |
| **TEST 2** | Unknown slug returns 404/notFound | Resolver Normalization & DB Query | **PASS** | `does-not-exist` returns `null` (triggers `notFound()`); malformed inputs (`../admin`, `<script>`, `bce_bgp`) rejected. |
| **TEST 3** | Inactive tenant rejection | Database RLS & Resolver Check | **PASS** | PostgreSQL RLS policy `USING (is_active = true)` blocks inactive records; resolver `requireActive: true` drops inactive colleges. |
| **TEST 4** | Slug is canonical (`colleges.slug`) | Code & AST Inspection | **PASS** | Resolver uses `.eq('slug', slug)` against `public.colleges`. Contains zero hardcoded BCE UUID logic. |
| **TEST 5** | Tenant cache isolation | Cache Key Inspection | **PASS** | Resolver cache keys include dynamic slug `['tenant_college_slug', slug]`; cache tags include `tenant_${slug}`; academic cache uses `academic_masters_${collegeId}`. |
| **TEST 6** | Client safety | Bundle & Token Analysis | **PASS** | No `SUPABASE_SERVICE_ROLE_KEY` in client bundles; `TenantContext` projects only public fields; public resolution uses `createClient()`. |
| **TEST 7** | Existing authentication works | Route & Middleware Audit | **PASS** | `/admin/login`, `/admin/signup`, `/auth/callback` intact and preserved by middleware. |
| **TEST 8** | Google OAuth callback intact | Route & OAuth Audit | **PASS** | `/api/auth/google/callback` exports `GET` handler using dynamic `getGoogleRedirectUri(origin)`. |
| **TEST 9** | Existing public application stability | Route Compilation & Health Check | **PASS** | Root `/` gateway and dynamic `/[tenant]` routes render stably without throwing. |
| **TEST 10** | Production build succeeds | Next.js Build Execution | **PASS** | `npm run build` completed with code `0`. All 12 routes generated and optimized. |

### Tool Validation Commands Summary:
- **`npx tsc --noEmit`**: **PASS (Code 0)** — Zero type errors.
- **`npm run lint`**: **PASS (Code 0)** — "✔ No ESLint warnings or errors".
- **`npm run build`**: **PASS (Code 0)** — Production build compiled successfully.
- **`scratch/test_tenant_resolver.mjs`**: **PASS (40/40 assertions passed, 0 failed)**.

---

## 8. Known Remaining Tenant Migration Work (Roadmap)

* **Phase 2B — Admin Multi-Tenant Membership & Switcher:**
  * Refactor `src/lib/auth/admin-auth.ts` to validate against `college_memberships` and `platform_admins`.
  * Support tenant switching in `/admin/dashboard` for Platform Super Admins.
  * Update admin signup and login pages to handle tenant selection.
* **Phase 3 — Multi-Tenant Google Workspace Integration:**
  * Migrate `src/lib/google/auth.ts` from `google_oauth_tokens` to `college_google_connections`.
  * Remove hardcoded BCE strings in `src/lib/google/template.ts` and `src/lib/email/service.ts`.
* **Phase 4 — Multi-Tenant Analytics & PDF Engine:**
  * Parameterize `src/lib/analytics/pdf-generator.ts` with tenant branding (logos, primary colors, college name).
* **Phase 5 — Multi-Tenant Billing & Entitlements:**
  * Migrate billing accounts and payment requests to use `college_billing_accounts` and `college_subscriptions`.

