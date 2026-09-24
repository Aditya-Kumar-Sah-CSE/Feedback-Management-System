'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import { createClient } from '@/lib/supabase/client';
import { OverviewTab, type DashboardCounts } from './tabs/OverviewTab';
import { AdminMobileNav } from './AdminMobileNav';
import { GoogleConnectionCard } from './GoogleConnectionCard';
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
  ChevronDown,
  Settings,
  Globe,
  Sliders,
  CheckCircle2,
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

export type AdminTab =
  | 'overview'
  | 'admins'
  | 'academic'
  | 'forms'
  | 'audit'
  | 'billing'
  | 'institutions'
  | 'google'
  | 'settings';

interface DropdownItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  isActive?: boolean;
  onClick: () => void;
}

interface NavDropdownProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: DropdownItem[];
}

function NavDropdown({
  label,
  icon: Icon,
  badge,
  isActive,
  isOpen,
  onToggle,
  onClose,
  items,
}: NavDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`relative inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer select-none active:scale-95 ${
          isActive
            ? 'bg-bce-navy text-amber-400 shadow-sm hover:bg-slate-900'
            : isOpen
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:-translate-y-0.5'
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
        <span>{label}</span>
        {badge !== undefined && (
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 shadow-2xs">
            {badge}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 ml-0.5 opacity-70 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-2 min-w-[240px] sm:min-w-[260px] bg-white rounded-2xl border border-slate-200/90 shadow-2xl shadow-slate-950/20 p-2 space-y-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer ${
                  item.isActive
                    ? 'bg-amber-50 text-amber-950 font-bold border border-amber-200/60'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ItemIcon
                    className={`w-4 h-4 shrink-0 ${
                      item.isActive ? 'text-amber-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 shadow-2xs shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  currentUserName?: string;
  counts?: DashboardCounts;
  adminReqError?: string | null;
  activeCollegeId?: string;
  activeCollegeName?: string;
  activeCollegeCode?: string;
  activeCollegeSlug?: string;
  activeCollegeLogoUrl?: string | null;
  googleStatus?: {
    connected: boolean;
    status: string;
    accountEmail?: string | null;
    accountName?: string | null;
    connectedAt?: string | null;
  } | null;
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
  currentUserName,
  counts,
  adminReqError,
  activeCollegeId,
  activeCollegeName = 'Your Institution',
  activeCollegeCode,
  activeCollegeSlug,
  activeCollegeLogoUrl,
  googleStatus,
}: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
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

  const directTabs = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'academic' as const, label: 'Academic Structure', icon: GraduationCap },
    { id: 'forms' as const, label: 'Feedback Forms', icon: FileSpreadsheet },
  ];

  const isSettingsActive = [
    'admins',
    'audit',
    'billing',
    'institutions',
    'google',
    'settings',
  ].includes(activeTab);

  const settingsSubTabs: {
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    description: string;
  }[] = [
    {
      id: 'admins',
      label: 'Admin Management',
      icon: ShieldCheck,
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
      description: 'Admins & access requests',
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: Activity,
      description: 'Security & activity logs',
    },
    {
      id: 'billing',
      label: isSuperAdmin ? 'Billing & Access' : 'Billing & Plan',
      icon: CreditCard,
      description: isSuperAdmin ? 'Invoices, usage & plan control' : 'Current plan & quota limits',
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'institutions' as AdminTab,
            label: 'Institutions',
            icon: Building2,
            description: 'Campuses & tenant registry',
          },
          {
            id: 'google' as AdminTab,
            label: 'Google Workspace',
            icon: Globe,
            badge: googleStatus?.connected ? 'Connected' : undefined,
            description: 'Forms & Drive integration',
          },
        ]
      : []),
    {
      id: 'settings',
      label: 'Profile & Preferences',
      icon: Settings,
      description: 'Administrator details & system info',
    },
  ];

  const settingsDropdownItems: DropdownItem[] = settingsSubTabs.map((sub) => ({
    id: `settings-${sub.id}`,
    label: sub.label,
    icon: sub.icon,
    badge: sub.badge,
    isActive: activeTab === sub.id,
    onClick: () => setActiveTab(sub.id),
  }));

  const getActiveTabTitle = (tab: AdminTab): string => {
    switch (tab) {
      case 'overview':
        return 'Overview';
      case 'academic':
        return 'Academic Structure';
      case 'forms':
        return 'Feedback Forms';
      case 'admins':
        return 'Settings: Admins';
      case 'audit':
        return 'Settings: Audit';
      case 'billing':
        return isSuperAdmin ? 'Settings: Billing' : 'Settings: Plan';
      case 'institutions':
        return 'Settings: Institutions';
      case 'google':
        return 'Settings: Google';
      case 'settings':
        return 'Settings: Profile';
      default:
        return 'Overview';
    }
  };

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
      <div className="md:hidden flex items-center justify-between bg-white px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl border border-slate-200 shadow-xs min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Tab:</span>
          <span className="text-xs font-bold text-bce-navy bg-amber-100 text-amber-900 border border-amber-300/60 px-2 py-0.5 rounded-lg truncate">
            {getActiveTabTitle(activeTab)}
          </span>
        </div>
        <AdminMobileNav
          adminName={currentUserName || currentUserEmail.split('@')[0]}
          adminEmail={currentUserEmail}
          isSuperAdmin={isSuperAdmin}
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          pendingRequestsCount={pendingRequestsCount}
          onSignOut={handleSignOut}
          activeCollegeName={activeCollegeName}
          publicSlug={activeCollegeSlug}
          logoUrl={activeCollegeLogoUrl}
        />
      </div>

      {/* Primary Navigation Tabs */}
      <div className="relative z-30 bg-white p-1 sm:p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-1 sm:gap-1.5 w-full max-w-full min-w-0 overflow-visible">
        {/* Direct Tabs: Overview, Academic Structure, Feedback Forms */}
        {directTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setOpenDropdown(null);
              }}
              className={`relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer select-none active:scale-95 ${
                isActive
                  ? 'bg-bce-navy text-amber-400 shadow-sm hover:bg-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:-translate-y-0.5'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        {/* Settings Dropdown: Wraps Admin Management, Audit, Billing, Institution, Google, Preferences */}
        <NavDropdown
          label="Settings"
          icon={Settings}
          badge={pendingRequestsCount > 0 ? pendingRequestsCount : undefined}
          isActive={isSettingsActive}
          isOpen={openDropdown === 'settings'}
          onToggle={() => setOpenDropdown(openDropdown === 'settings' ? null : 'settings')}
          onClose={() => setOpenDropdown(null)}
          items={settingsDropdownItems}
        />

        {/* Results & Analytics Button: Full Access vs Locked Gate */}
        {hasFullAnalytics || isSuperAdmin ? (
          <Link
            href="/admin/dashboard/results"
            onClick={() => setIsNavigatingToResults(true)}
            className="group relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-800 hover:text-slate-950 bg-gradient-to-r from-amber-50 to-amber-100/80 hover:from-amber-100 hover:to-amber-200/90 border border-amber-300/80 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:translate-y-0 transition-all duration-200 shrink-0 whitespace-nowrap md:ml-auto cursor-pointer select-none"
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
            className="group relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-amber-400/50 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:translate-y-0 transition-all duration-200 shrink-0 whitespace-nowrap md:ml-auto cursor-pointer select-none"
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

      {/* Sub-Navigation Pill Bar when inside Settings */}
      {isSettingsActive && (
        <div className="relative z-20 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 w-full max-w-full">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
            {settingsSubTabs.map((sub) => {
              const SubIcon = sub.icon;
              const isCurrent = activeTab === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setActiveTab(sub.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer select-none ${
                    isCurrent
                      ? 'bg-white text-bce-navy shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <SubIcon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isCurrent ? 'text-bce-cobalt font-extrabold' : 'text-slate-400'
                    }`}
                  />
                  <span>{sub.label}</span>
                  {sub.badge !== undefined && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-500 text-slate-950 shadow-2xs">
                      {sub.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0 pr-2 text-[11px] text-slate-400 font-medium">
            <span>Settings Section</span>
          </div>
        </div>
      )}

      {/* Tab Panels */}
      <div className="relative w-full max-w-full min-w-0">
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
            onNavigateTab={(tab) => setActiveTab(tab as AdminTab)}
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
            key={activeCollegeId || 'no-tenant'}
            academicYears={academicYears}
            branches={branches}
            semesters={semesters}
            faculties={faculties}
            subjects={subjects}
            assignments={assignments}
            initialFacultyTotal={counts?.totalFaculties}
            initialSubjectTotal={counts?.totalSubjects}
            initialAssignmentTotal={counts?.totalAssignments}
            activeCollegeId={activeCollegeId}
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

        {activeTab === 'google' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-bce-cobalt" />
                  Google Workspace Integration
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect your institutional Google account for automatic Google Form generation, Drive folder synchronization, and real-time response ingestion.
                </p>
              </div>
              <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 self-start sm:self-auto">
                Institution: <span className="font-bold text-slate-900">{activeCollegeName || 'All Institutions'}</span>
              </div>
            </div>

            {activeCollegeId ? (
              <GoogleConnectionCard
                collegeId={activeCollegeId}
                collegeName={activeCollegeName || 'Your Institution'}
                status={{
                  connected: Boolean(googleStatus?.connected),
                  status: googleStatus?.status || 'NOT_CONNECTED',
                  accountEmail: googleStatus?.accountEmail,
                  accountName: googleStatus?.accountName,
                  connectedAt: googleStatus?.connectedAt,
                }}
              />
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl text-amber-900 text-xs space-y-2">
                <p className="font-bold text-sm">No Active Institution Selected</p>
                <p>
                  Google Workspace integrations are scoped to individual institutions. Please switch to a specific college using the tenant switcher in the top navigation bar to configure or review its Google Workspace connection.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 w-full max-w-4xl">
            {/* Settings Header */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold shadow-xs">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">System & Account Settings</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    View configuration details, administrator profile, and active tenant context.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Admin Profile */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-bce-cobalt" />
                  Administrator Profile
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Name</span>
                    <span className="font-semibold text-slate-900">{currentUserName || currentUserEmail.split('@')[0] || 'System Administrator'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Email</span>
                    <span className="font-mono text-slate-900">{currentUserEmail}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">System Role</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        isSuperAdmin ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {isSuperAdmin ? 'Platform Super Admin' : 'College Admin'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Account Status</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active & Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* Tenant Context */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-bce-cobalt" />
                  Active Tenant Context
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Current College</span>
                    <span className="font-semibold text-slate-900 text-right">{activeCollegeName || 'None Selected'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">College Code</span>
                    <span className="font-mono font-bold text-slate-900">{activeCollegeCode || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Tenant Isolation</span>
                    <span className="font-semibold text-slate-900">PostgreSQL RLS Scoped</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Google Sync</span>
                    <span className="font-semibold text-slate-900">
                      {googleStatus?.connected ? (
                        <span className="text-emerald-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected
                        </span>
                      ) : (
                        <span className="text-slate-500">Not Configured</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Information */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-bce-cobalt" />
                System Architecture & Preferences
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Multi-Tenant Engine</p>
                  <p className="font-bold text-slate-800 mt-1">Tenant Scoped RLS</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Strict schema-level security</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Analytics Engine</p>
                  <p className="font-bold text-slate-800 mt-1">{hasFullAnalytics ? 'Unlocked (Full)' : 'Tier Restricted'}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Statistical processing</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Platform Version</p>
                  <p className="font-bold text-slate-800 mt-1">FMS Core v2.4</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Next.js 15 + Supabase</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
