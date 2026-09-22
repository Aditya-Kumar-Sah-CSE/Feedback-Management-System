# Phase 1C — Database Implementation & Migration Reference
## Multi-Tenant Feedback Management System (FMS) Platform

**Document Version:** 1.0.0 (Frozen Phase 1C Implementation)  
**Target Environment:** New Supabase Project (`txerarcajxjzxifanzxw`)  
**Scope:** PostgreSQL Migration Files, Schema Entities, Security Definer Functions, and RLS Audit  
**Deployment Status:** Ready for Review — Zero Remote Executions (`supabase db push` has NOT been run)

---

## 1. Migration Sequence & File Manifest

The multi-tenant schema is partitioned into 7 sequential, idempotent migration files located under `supabase/migrations/`. The legacy single-tenant migrations have been safely archived to `supabase/migrations_legacy_bce/` to preserve complete Git history without causing naming collisions or single-tenant regression.

| # | Migration File | Target Domain & Responsibility | Table Count | Function Count | Policy Count |
|---|---|---|---|---|---|
| **1** | `20260922000001_phase1_platform_and_tenants.sql` | Platform Foundation, Colleges (Tenants), Platform Admins, College Memberships, Onboarding Requests, Auth Helpers | 4 | 3 | 0 |
| **2** | `20260922000002_phase2_academic_structure.sql` | Tenant Curriculum: Academic Years, Branches, Semesters, Faculties, Subjects, Assignments | 6 | 0 | 0 |
| **3** | `20260922000003_phase3_feedback_structure.sql` | Tenant Forms: Feedback Forms, Multi-Teacher Form Items, Response Receipts, Safe Public View | 3 | 0 | 0 |
| **4** | `20260922000004_phase4_google_connections.sql` | Google Workspace Isolation: College-Scoped Google Connections & Safe Status Projection | 1 | 0 | 0 |
| **5** | `20260922000005_phase5_billing_and_entitlements.sql` | Tenant Billing: Billing Plans, Payment Settings, College Billing Accounts, Trials, Payment Requests, Storage | 5 | 0 | 2 |
| **6** | `20260922000006_phase6_audit_and_rls.sql` | Security & Compliance: Hybrid Audit Logs, RLS Activation on all 20 tables, 36 Non-recursive RLS Policies, Grants | 1 | 0 | 36 |
| **7** | `20260922000007_phase7_seed_initial_platform.sql` | Platform Bootstrap: Initial Billing Plans, Settings, Master Tenant BCE-BGP, Super Admin Auto-enrollment Trigger | 0 | 2 | 0 |
| **Total** | | | **20** | **5** | **38** |

---

## 2. Comprehensive Entity Catalog

### Platform Entities (Global / Shared)
1. **`public.colleges`**: The root tenant entity. Stores college name, code (`BCE-BGP`), slug (`bce-bgp`), AICTE approval, university affiliation, and branding colors (`primary_color`, `secondary_color`, `accent_color`).
2. **`public.platform_admins`**: Super-administrators with platform-wide oversight. Linked to `auth.users(id)`.
3. **`public.billing_plans`**: Master catalog of purchasable plans (`FREE`, `BASIC`, `FULL_ACCESS`, `YEARLY`).
4. **`public.payment_settings`**: Singleton containing platform UPI ID, bank account, and payment instructions.

### Tenant Entities (Partitioned by `college_id`)
5. **`public.college_memberships`**: Connects `auth.users(id)` to `colleges(id)` with role `COLLEGE_ADMIN`.
6. **`public.college_admin_requests`**: Onboarding requests submitted by educators for a specific college.
7. **`public.college_google_connections`**: Dedicated per-tenant Google OAuth refresh tokens. Strictly inaccessible to client browsers.
8. **`public.academic_years`**: College-specific academic calendar sessions.
9. **`public.branches`**: Academic branches/departments of a specific college.
10. **`public.semesters`**: Active curriculum semesters (1 to 8) for a college.
11. **`public.faculties`**: Teaching staff employed by a specific college.
12. **`public.subjects`**: Courses offered by a specific college.
13. **`public.faculty_subject_assignments`**: College teaching sessions connecting faculty, subject, session, and branch.
14. **`public.feedback_forms`**: Core feedback collection campaigns (`FACULTY_FEEDBACK` or `SEMESTER_FEEDBACK`).
15. **`public.feedback_form_items`**: Sub-evaluations for multi-faculty semester forms (derives tenant identity from `form_id`).
16. **`public.feedback_response_records`**: Student submission receipts synced from Google Sheets/Forms.
17. **`public.college_billing_accounts`**: College-scoped subscription and unlock state.
18. **`public.college_trial_entitlements`**: Temporary feature trials granted to a college.
19. **`public.college_payment_requests`**: Submissions by college admins for plan upgrades with payment proofs.
20. **`public.audit_logs`**: System audit trail supporting platform events (`college_id IS NULL`) and tenant events (`college_id NOT NULL`).

---

## 3. Relationship & Deletion Lifecycle Summary

```
colleges (Root Tenant)
 ├── ON DELETE CASCADE:
 │    ├── college_memberships
 │    ├── college_admin_requests
 │    ├── college_google_connections
 │    ├── academic_years
 │    │    └── ON DELETE RESTRICT from feedback_forms
 │    ├── branches
 │    │    └── ON DELETE RESTRICT from feedback_forms
 │    ├── semesters
 │    │    └── ON DELETE RESTRICT from feedback_forms
 │    ├── faculties
 │    │    └── ON DELETE RESTRICT from feedback_forms & feedback_form_items
 │    ├── subjects
 │    │    └── ON DELETE RESTRICT from feedback_forms & feedback_form_items
 │    ├── faculty_subject_assignments
 │    ├── feedback_forms
 │    │    ├── ON DELETE CASCADE: feedback_form_items
 │    │    └── ON DELETE CASCADE: feedback_response_records
 │    ├── college_billing_accounts
 │    ├── college_trial_entitlements
 │    └── college_payment_requests
 └── ON DELETE SET NULL:
      └── audit_logs (college_id set to NULL to preserve historical audit trail)
```

> [!IMPORTANT]
> **Historical Integrity via `ON DELETE RESTRICT`**: Feedback forms reference `academic_years`, `branches`, `semesters`, `faculties`, and `subjects` using `ON DELETE RESTRICT`. A college administrator cannot accidentally delete a subject or faculty member that is actively linked to historical feedback records, preventing corrupted analytics.

---

## 4. Authorization & Security Definer Functions

All authorization functions are defined as `STABLE SECURITY DEFINER` with `SET search_path = public`. This prevents PostgreSQL Error 25006 and mathematical RLS recursion.

### 1. `public.is_platform_super_admin(auth_user_id UUID) -> BOOLEAN`
- **Purpose**: Evaluates whether `auth_user_id` has an active record in `public.platform_admins`.
- **Properties**: Read-only, `STABLE`, non-recursive.

### 2. `public.is_college_admin(auth_user_id UUID, target_college_id UUID) -> BOOLEAN`
- **Purpose**: Evaluates whether `auth_user_id` is a Platform Super Admin OR possesses an active `COLLEGE_ADMIN` membership in `public.college_memberships` for `target_college_id`.
- **Properties**: Read-only, `STABLE`, non-recursive.

### 3. `public.get_user_college_ids(auth_user_id UUID) -> TABLE (college_id UUID)`
- **Purpose**: Returns all college UUIDs accessible by the user. If Platform Super Admin, returns all active college UUIDs; otherwise returns active memberships.

### 4. `public.sync_platform_super_admin(p_user_id UUID, p_email TEXT, p_name TEXT) -> VOID`
- **Purpose**: Idempotently registers `p_user_id` into `public.platform_admins` and establishes an active membership in the master tenant `BCE-BGP`.

### 5. `public.handle_super_admin_auth_registration() -> TRIGGER`
- **Purpose**: Trigger on `auth.users` that executes `sync_platform_super_admin` when `SUPER_ADMIN_EMAIL` (`iambestadi@gmail.com`) registers or signs in.

---

## 5. Composite Constraints & Data Integrity

| Table | Constraint Name | Specification | Rationale |
| :--- | :--- | :--- | :--- |
| `colleges` | `colleges_code_key` | `UNIQUE (code)` | Enforces unique institutional codes (e.g. `BCE-BGP`). |
| `colleges` | `colleges_slug_key` | `UNIQUE (slug)` | Enforces unique URL slugs for tenant routing. |
| `platform_admins` | `platform_admins_user_id_key` | `UNIQUE (user_id)` | One platform admin record per auth user. |
| `college_memberships` | `uq_college_memberships_college_user` | `UNIQUE (college_id, user_id)` | Prevents duplicate memberships in the same college. |
| `college_admin_requests` | `idx_admin_requests_pending_unique` | `UNIQUE (college_id, LOWER(email)) WHERE status = 'PENDING'` | Prevents duplicate pending applications. |
| `college_google_connections` | `college_google_connections_college_id_key` | `UNIQUE (college_id)` | One Google Workspace connection per college. |
| `academic_years` | `uq_academic_years_college_name` | `UNIQUE (college_id, name)` | Prevents duplicate sessions within a college. |
| `branches` | `uq_branches_college_code` | `UNIQUE (college_id, code)` | Prevents duplicate branch codes within a college. |
| `semesters` | `uq_semesters_college_sem_no` | `UNIQUE (college_id, semester_number)` | Prevents duplicate semester numbers (1..8) within a college. |
| `faculties` | `idx_faculties_employee_unique` | `UNIQUE (college_id, employee_id) WHERE employee_id IS NOT NULL` | Prevents duplicate employee IDs within a college. |
| `subjects` | `uq_subjects_college_code` | `UNIQUE (college_id, code)` | Prevents duplicate subject codes within a college. |
| `faculty_subject_assignments` | `uq_faculty_assignments_f_s_y` | `UNIQUE (college_id, faculty_id, subject_id, academic_year_id)` | Prevents duplicate teaching assignments per session. |
| `feedback_forms` | `uq_feedback_forms_college_slug` | `UNIQUE (college_id, slug)` | Allows identical slugs across colleges (e.g., both BCE and GEC can have `semester-5-feedback`), but unique within a college. |
| `feedback_forms` | `chk_feedback_forms_scope` | `CHECK ((form_type = 'SEMESTER_FEEDBACK') OR (faculty_id IS NOT NULL AND subject_id IS NOT NULL))` | Validates form scope integrity. |
| `feedback_form_items` | `uq_feedback_form_items_form_f_s` | `UNIQUE (form_id, faculty_id, subject_id)` | Prevents evaluating the same faculty twice in one semester form. |
| `feedback_response_records` | `uq_feedback_response_records_c_f_g` | `UNIQUE (college_id, form_id, google_response_id)` | Prevents duplicate submission receipts. |
| `college_billing_accounts` | `college_billing_accounts_college_id_key` | `UNIQUE (college_id)` | One billing account per college. |
| `college_trial_entitlements` | `idx_uq_active_trial_per_college` | `UNIQUE (college_id) WHERE status = 'ACTIVE'` | At most ONE active trial per college. |
| `college_trial_entitlements` | `chk_college_trial_dates` | `CHECK (expires_at > starts_at)` | Enforces date validity. |

---

## 6. Indexing & Query Optimization Matrix

The migration suite creates **47 targeted indexes**:

1. **Tenant Resolution**:
   - `idx_colleges_slug` ON `colleges(slug)`
   - `idx_colleges_code` ON `colleges(code)`
   - `idx_colleges_active` ON `colleges(is_active)`
2. **Membership & Authorization**:
   - `idx_memberships_user_college` ON `college_memberships(user_id, college_id, status)`
   - `idx_platform_admins_user` ON `platform_admins(user_id)`
3. **Public Academic Discovery**:
   - `idx_academic_years_college` ON `academic_years(college_id, is_active)`
   - `idx_branches_college` ON `branches(college_id, is_active)`
   - `idx_semesters_college` ON `semesters(college_id, semester_number, is_active)`
   - `idx_subjects_college_curriculum` ON `subjects(college_id, branch_id, semester_id, is_active)`
   - `idx_assignments_lookup` ON `faculty_subject_assignments(college_id, academic_year_id, branch_id, semester_id, is_active)`
4. **Public Feedback Discovery & Ordering**:
   - `idx_feedback_forms_discovery` ON `feedback_forms(college_id, status, published_at DESC)`
   - `idx_feedback_forms_cascading` ON `feedback_forms(college_id, academic_year_id, branch_id, semester_id, status)`
5. **Form Items & Grid Ordering**:
   - `idx_feedback_form_items_form_order` ON `feedback_form_items(form_id, order_index)`
6. **Response Metadata & Receipt Lookup**:
   - `idx_response_records_college_form` ON `feedback_response_records(college_id, form_id, synced_at DESC)`
   - `idx_response_records_email` ON `feedback_response_records(college_id, student_email)`
7. **Billing & Auditing**:
   - `idx_billing_accounts_college` ON `college_billing_accounts(college_id)`
   - `idx_payment_requests_college` ON `college_payment_requests(college_id, status, created_at DESC)`
   - `idx_audit_logs_college_created` ON `audit_logs(college_id, created_at DESC)`

---

## 7. Row Level Security (RLS) Strategy & Policy Definitions

All 20 application tables have RLS enabled. The 38 policies adhere strictly to principle-of-least-privilege:

```
[ANONYMOUS / PUBLIC]
  ├── colleges (SELECT if is_active = true)
  ├── academic_years, branches, semesters, faculties, subjects, assignments (SELECT if is_active = true and college is active)
  ├── feedback_forms (SELECT if status IN ('PUBLISHED', 'CLOSED') and college is active)
  ├── feedback_form_items (SELECT if parent form is published/closed and college is active)
  ├── billing_plans (SELECT if is_active = true)
  └── ALL OTHER TABLES: REVOKED

[COLLEGE ADMIN (auth.uid() active member of college_id)]
  ├── college_memberships (SELECT for own college)
  ├── college_admin_requests (ALL for own college)
  ├── academic_years, branches, semesters, faculties, subjects, assignments (ALL for own college)
  ├── feedback_forms, feedback_form_items (ALL for own college)
  ├── feedback_response_records (SELECT for own college)
  ├── college_billing_accounts, college_trial_entitlements (SELECT for own college)
  ├── college_payment_requests (SELECT & INSERT for own college)
  ├── audit_logs (SELECT for own college)
  └── Google Connections: REVOKED from client Data API; managed via backend Server Actions

[PLATFORM SUPER ADMIN (auth.uid() in platform_admins)]
  ├── colleges (ALL)
  ├── platform_admins (ALL)
  ├── billing_plans (ALL)
  ├── payment_settings (ALL)
  ├── college_payment_requests (ALL: approve / reject)
  ├── college_billing_accounts, college_trial_entitlements (ALL: grant / revoke)
  └── Cross-Tenant Full Access to all academic and feedback data

[SERVICE ROLE (Backend Server Actions & Background Sync)]
  └── ALL TABLES: FULL BYPASS & UNRESTRICTED ACCESS
```

---

## 8. Seed Data & Bootstrap Specifications

Migration `20260922000007_phase7_seed_initial_platform.sql` provides deterministic, minimal bootstrap data:

1. **Master Tenant BCE-BGP**:
   - **ID**: `'bce00000-0000-0000-0000-000000000001'` (deterministic UUID)
   - **Code**: `BCE-BGP`
   - **Slug**: `bce-bgp`
   - **Name**: `Bhagalpur College of Engineering`
   - **Branding**: Primary `#0B192C`, Secondary `#1E3E62`, Accent `#F6995C`
2. **Initial Billing Plans**:
   - `FREE` (₹0, Basic Analytics)
   - `BASIC` (₹999/mo, Forms + Sheets + Basic Analytics)
   - `FULL_ACCESS` (₹2,999/mo, Forms + Sheets + Full Analytics + PDF Reports)
   - `YEARLY` (₹29,999/yr, Full Access + Priority Support)
3. **Initial Payment Settings Singleton**:
   - Platform support phone `9470870830`
4. **BCE-BGP Initial Billing State**:
   - Plan: `FREE`, Access: `UNLOCKED`, Subscription: `ACTIVE`
5. **Super Admin Automated Onboarding**:
   - Trigger on `auth.users` guarantees that whenever `iambestadi@gmail.com` logs in or signs up, their identity is automatically provisioned into `platform_admins` and granted `COLLEGE_ADMIN` membership in BCE-BGP.

---

## 9. Security Test Plan & Anti-IDOR Verification

Before client-side code is switched over, the following verification test matrix must be validated against the applied schema:

| Scenario | Input / Attack Vector | Expected Result | Verified By |
| :--- | :--- | :--- | :--- |
| **URL Slug Tampering** | Attacker at `/bce-bgp/admin` changes URL to `/gec-gaya/admin` | RLS helper `is_college_admin(auth.uid(), 'gec-gaya-uuid')` returns `false`. All data queries return empty arrays. | `is_college_admin()` |
| **Direct UUID Injection** | Attacker sends POST to update form with `college_id = 'gec-gaya-uuid'` | Database RLS policy `WITH CHECK (is_college_admin(auth.uid(), college_id))` rejects the transaction. | RLS Policy |
| **Google Token Exposure** | Authenticated user queries `/rest/v1/college_google_connections` | Supabase returns `401 / 403 Forbidden`. Direct table access is completely revoked from `anon` and `authenticated`. | `REVOKE ALL` |
| **Cross-Tenant Response Read** | College A admin queries `feedback_response_records` with `college_id = 'college-b-uuid'` | RLS filters row out. Zero records returned. | `Admins view college response records` |
| **Payment Proof Injection** | User attempts to upload proof to another tenant's bucket path | Storage RLS policy enforces authenticated status; payment request is checked against `is_college_admin()`. | Storage RLS |
| **Pending Admin Request Collision** | Applicant submits duplicate request for same college | Partial unique index `idx_admin_requests_pending_unique` raises `23505 unique_violation`. | Unique Constraint |

---

## 10. Known Limitations & Phase 2 Considerations

1. **Application Code Synchronization**: The existing application code (`src/types/database.ts`, Server Actions) currently reflects the legacy single-tenant structure. It must be refactored in Phase 2 to supply `college_id` or `collegeSlug` context before the new schema is consumed.
2. **Custom Domain Routing**: Apex domain mapping (e.g. `feedback.bcebhagalpur.ac.in`) will be implemented via Next.js middleware host header resolution in Phase 2.
3. **Student Identity Pool**: Student response verification currently relies on institutional email and university registration numbers. If dedicated student authentication accounts are introduced, student credentials will be linked to `auth.users`.
