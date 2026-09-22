'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import { createClient } from '@/lib/supabase/client';
import { OverviewTab, type DashboardCounts } from './tabs/OverviewTab';
import { AdminMobileNav } from './AdminMobileNav';
import Link from 'next/link';
import {
  LayoutDashboard,
  ShieldCheck,
  GraduationCap,
  FileSpreadsheet,
  Activity,
  BarChart3,
  AlertCircle,
  CreditCard,
  Building2,
  Lock,
  Loader2,
} from 'lucide-react';
import type {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FacultySubjectAssignment,
  Admin,
  AdminRequest,
  FeedbackForm,
  AuditLog
} from '@/types/database';

function TabLoadingSkeleton({ title: _title }: { title?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 bg-slate-200 rounded-md" />
        <div className="h-8 w-28 bg-slate-200 rounded-xl" />
      </div>
      <div className="h-4 w-72 bg-slate-100 rounded-md" />
      <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-20 bg-slate-100 rounded-xl" />
        <div className="h-20 bg-slate-100 rounded-xl" />
        <div className="h-20 bg-slate-100 rounded-xl" />
      </div>
      <div className="h-64 bg-slate-50 rounded-xl border border-slate-100" />
    </div>
  );
}

const AcademicManagementTab = dynamic(
  () => import('./tabs/AcademicManagementTab').then((mod) => mod.AcademicManagementTab),
  {
    loading: () => <TabLoadingSkeleton title="Academic Management" />,
  }
);
const FeedbackFormsTab = dynamic(
  () => import('./tabs/FeedbackFormsTab').then((mod) => mod.FeedbackFormsTab),
  {
    loading: () => <TabLoadingSkeleton title="Feedback Forms" />,
  }
);
const AdminManagementTab = dynamic(
  () => import('./tabs/AdminManagementTab').then((mod) => mod.AdminManagementTab),
  {
    loading: () => <TabLoadingSkeleton title="Admin Management" />,
  }
);
const AuditLogsTab = dynamic(
  () => import('./tabs/AuditLogsTab').then((mod) => mod.AuditLogsTab),
  {
    loading: () => <TabLoadingSkeleton title="Audit Trail" />,
  }
);
const BillingManagementTab = dynamic(
  () => import('./tabs/BillingManagementTab').then((mod) => mod.BillingManagementTab),
  {
    loading: () => <TabLoadingSkeleton title="Billing & Access" />,
  }
);
const AdminMyBillingTab = dynamic(
  () => import('./tabs/AdminMyBillingTab').then((mod) => mod.AdminMyBillingTab),
  {
    loading: () => <TabLoadingSkeleton title="Billing & Subscription" />,
  }
);
const InstitutionsManagementTab = dynamic(
  () => import('./tabs/InstitutionsManagementTab').then((mod) => mod.InstitutionsManagementTab),
  {
    loading: () => <TabLoadingSkeleton title="Institutions" />,
  }
);

interface Props {
  academicYears: AcademicYear[];
  branches: Branch[];
  semesters: Semester[];
  faculties: Faculty[];
  subjects: Subject[];
  assignments: FacultySubjectAssignment[];
  adminRequests: AdminRequest[];
  adminsList: Admin[];
  feedbackForms: FeedbackForm[];
  auditLogs: AuditLog[];
  isSuperAdmin: boolean;
  hasFullAnalytics?: boolean;
  currentUserEmail: string;
  counts?: DashboardCounts;
  adminReqError?: string | null;
}

export function AdminDashboardTabs({
  academicYears,
  branches,
  semesters,
  faculties,
  subjects,
  assignments,
  adminRequests,
  adminsList,
  feedbackForms,
  auditLogs,
  isSuperAdmin,
  hasFullAnalytics = false,
  currentUserEmail,
  counts,
  adminReqError,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'admins' | 'academic' | 'forms' | 'audit' | 'billing' | 'institutions'>('overview');
  const [isNavigatingToResults, setIsNavigatingToResults] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/admin/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const pendingRequestsCount = adminRequests.filter((r) => r.status === 'PENDING').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'admins',
      label: 'Admin Management',
      icon: ShieldCheck,
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
    },
    { id: 'academic', label: 'Academic Structure', icon: GraduationCap },
    { id: 'forms', label: 'Feedback Forms', icon: FileSpreadsheet },
    { id: 'audit', label: 'Audit Trail', icon: Activity },
    {
      id: 'billing',
      label: isSuperAdmin ? 'Billing & Access' : 'Billing & Plan',
      icon: CreditCard,
    },
    ...(isSuperAdmin
      ? [{ id: 'institutions', label: 'Institutions', icon: Building2 }]
      : []),
  ];

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
      {adminReqError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to fetch administrator access requests</p>
            <p className="text-red-600 mt-0.5">{adminReqError}</p>
          </div>
        </div>
      )}
      {/* Mobile Navigation Bar with Drawer Trigger */}
      <div className="md:hidden flex items-center justify-between bg-white px-3 sm:px-3.5 py-2.5 rounded-2xl border border-slate-200 shadow-xs min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Tab:</span>
          <span className="text-xs font-bold text-bce-navy bg-amber-100 text-amber-900 border border-amber-300/60 px-2.5 py-0.5 rounded-lg truncate">
            {tabs.find((t) => t.id === activeTab)?.label}
          </span>
        </div>
        <AdminMobileNav
          adminName={currentUserEmail.split('@')[0]}
          adminEmail={currentUserEmail}
          isSuperAdmin={isSuperAdmin}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          pendingRequestsCount={pendingRequestsCount}
          onSignOut={handleSignOut}
        />
      </div>

      {/* Primary Navigation Tabs */}
      <div className="bg-white p-1.5 sm:p-2 rounded-2xl border border-slate-200 shadow-xs overflow-x-auto no-scrollbar flex flex-nowrap md:flex-wrap items-center gap-1.5 w-full max-w-full min-w-0 touch-pan-x">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer select-none active:scale-95 ${
                isActive
                  ? 'bg-bce-navy text-amber-400 shadow-sm hover:bg-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:-translate-y-0.5'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 shadow-2xs">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Results & Analytics Button: Full Access vs Locked Gate */}
        {hasFullAnalytics || isSuperAdmin ? (
          <Link
            href="/admin/dashboard/results"
            onClick={() => setIsNavigatingToResults(true)}
            className="group relative inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-800 hover:text-slate-950 bg-gradient-to-r from-amber-50 to-amber-100/80 hover:from-amber-100 hover:to-amber-200/90 border border-amber-300/80 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:translate-y-0 transition-all duration-200 shrink-0 whitespace-nowrap md:ml-auto cursor-pointer select-none"
          >
            {isNavigatingToResults ? (
              <Loader2 className="w-4 h-4 text-bce-cobalt animate-spin shrink-0" />
            ) : (
              <BarChart3 className="w-4 h-4 text-bce-cobalt group-hover:scale-110 transition-transform duration-200 shrink-0" />
            )}
            <span>{isNavigatingToResults ? 'Opening Hub...' : 'Results & Analytics Hub'}</span>
            <span className="text-[10px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full shadow-2xs group-hover:bg-amber-500 transition-colors">
              Phase 4
            </span>
          </Link>
        ) : (
          <Link
            href="/admin/dashboard/results"
            onClick={() => setIsNavigatingToResults(true)}
            title="Full Analytics Access Required - Click to upgrade your plan"
            className="group relative inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-amber-400/50 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:translate-y-0 transition-all duration-200 shrink-0 whitespace-nowrap md:ml-auto cursor-pointer select-none"
          >
            <Lock className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
            {isNavigatingToResults ? (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
            ) : (
              <BarChart3 className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span>{isNavigatingToResults ? 'Opening Hub...' : 'Results & Analytics'}</span>
            <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded ml-0.5 uppercase tracking-wider">
              Locked
            </span>
          </Link>
        )}
      </div>

      {/* Tab Panels */}
      <div className="w-full max-w-full min-w-0">
        {activeTab === 'overview' && (
          <OverviewTab
            academicYears={academicYears}
            branches={branches}
            semesters={semesters}
            faculties={faculties}
            subjects={subjects}
            assignments={assignments}
            adminRequests={adminRequests}
            feedbackForms={feedbackForms}
            auditLogs={auditLogs}
            isSuperAdmin={isSuperAdmin}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
            counts={counts}
          />
        )}

        {activeTab === 'admins' && (
          <AdminManagementTab
            adminRequests={adminRequests}
            adminsList={adminsList}
            isSuperAdmin={isSuperAdmin}
            currentUserEmail={currentUserEmail}
          />
        )}

        {activeTab === 'academic' && (
          <AcademicManagementTab
            academicYears={academicYears}
            branches={branches}
            semesters={semesters}
            faculties={faculties}
            subjects={subjects}
            assignments={assignments}
            initialFacultyTotal={counts?.totalFaculties}
            initialSubjectTotal={counts?.totalSubjects}
            initialAssignmentTotal={counts?.totalAssignments}
          />
        )}

        {activeTab === 'forms' && (
          <FeedbackFormsTab
            feedbackForms={feedbackForms}
            academicYears={academicYears}
            branches={branches}
            semesters={semesters}
            faculties={faculties}
            subjects={subjects}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogsTab auditLogs={auditLogs} />
        )}

        {activeTab === 'billing' && (
          isSuperAdmin ? (
            <BillingManagementTab currentUserEmail={currentUserEmail} />
          ) : (
            <AdminMyBillingTab />
          )
        )}

        {activeTab === 'institutions' && isSuperAdmin && (
          <InstitutionsManagementTab />
        )}
      </div>
    </div>
  );
}
