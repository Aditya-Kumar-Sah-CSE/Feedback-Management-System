# BCE-BGP-Feedback-Management-System

# BCE Faculty Feedback & Evaluation Management System (Phase 1)

Official Faculty Feedback Portal for **Bhagalpur College of Engineering (BCE BGP)**, under the Department of Science, Technology & Technical Education, Government of Bihar.

---

## 🏛️ Project Architecture & Overview

```
                    BCE FACULTY FEEDBACK PORTAL
                              │
              ┌───────────────┴───────────────┐
              │                               │
          STUDENT                         ADMIN
              │                               │
       No Login Required                Admin Login
              │                               │
       Year → Branch → Faculty       ┌────────┴────────┐
              → Subject              │                 │
              │                 Super Admin        Approved Admin
              ↓
       Published Feedback
       (Phase 1: Discovery Foundation)
```

---

## 🚀 Phase 1 Features

### 🎓 Public Student Discovery (No Student Login Required)
- **Zero Login Friction**: Submissions and evaluations are 100% anonymous; students do not need accounts.
- **Cascading Discovery Path**: `Academic Year` → `Branch` → `Semester` → `Faculty & Subject Assignment` → `Feedback Form`.
- **Informative Empty States**: Clear notice when no published forms exist for a semester.

### 🛡️ Admin System & Security
- **Institutional Authentication**: Powered by Supabase Auth with cookie-based SSR.
- **Server-Side Super Admin Auto-Promotion**: Configured for `iambestadi@gmail.com` with server-side validation.
- **Approval Workflow**:
  - New admin signups automatically enter `PENDING` state.
  - Pending users are restricted to `/admin/pending`.
  - Only approved and active admins can access `/admin/dashboard`.
- **Route Protection**: Next.js middleware intercepts unauthorized visits to `/admin/dashboard`.

### 📚 Academic Management (CRUD)
- Full administrative management for:
  - **Academic Years** (e.g., 2024-2025, 2025-2026)
  - **Branches** (CSE, CE, ME, EE, ECE)
  - **Semesters** (Semester 1 through Semester 8)
  - **Faculties** (Name, Department, Designation, Employee ID)
  - **Subjects** (Name, Code, Branch, Semester)
  - **Faculty-Subject Assignments** (Mapping faculty to subjects in a session)

### 📋 Feedback Forms Foundation
- Data structure prepared for Phase 2 Google Forms & Sheets integration without schema redesigns.
- Draft creation and publishing status toggle (`DRAFT` / `PUBLISHED`).

### 📝 Audit Logging
- Complete administrative operation tracking (actor email, action type, entity ID, metadata, timestamps).

---

## 🗄️ Database Schema & Migration

Idempotent SQL migration file located at:
`supabase/migrations/20260913_phase1_foundation.sql`

Tables established with Row Level Security (RLS):
1. `admins`
2. `admin_requests`
3. `academic_years`
4. `branches`
5. `semesters`
6. `faculties`
7. `subjects`
8. `faculty_subject_assignments`
9. `feedback_forms`
10. `audit_logs`

---

## 💻 Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS with custom BCE Navy & Gold theme
- **Icons**: Lucide React
- **Database & Auth**: Supabase (PostgreSQL) + `@supabase/ssr`

---

## 🛠️ Local Setup Instructions

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create `.env.local` with:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://txerarcajxjzxifanzxw.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   SUPER_ADMIN_EMAIL=iambestadi@gmail.com
   ```

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Production Build & Verification**:
   ```bash
   npm run build
   npm run start
   ```

---

## 🔒 Phase Boundary Notice
Phase 1 implements only the Foundation + Admin System. Google Forms API, Google Sheets API, Google OAuth, PDF generation, and Analytics are reserved for subsequent phases.
