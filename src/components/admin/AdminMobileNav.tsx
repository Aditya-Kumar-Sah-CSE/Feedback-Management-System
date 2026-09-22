'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  X,
  School,
  ShieldCheck,
  UserCheck,
  LayoutDashboard,
  GraduationCap,
  FileSpreadsheet,
  Activity,
  BarChart3,
  ArrowLeft,
  LogOut,
  CreditCard,
  Building2,
  Settings,
  Globe,
} from 'lucide-react';
import type { AdminTab } from './AdminDashboardTabs';

interface Props {
  adminName: string;
  adminEmail: string;
  isSuperAdmin: boolean;
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  pendingRequestsCount?: number;
  onSignOut: () => void;
  activeCollegeName?: string;
}

export function AdminMobileNav({
  adminName,
  adminEmail,
  isSuperAdmin,
  activeTab,
  onSelectTab,
  pendingRequestsCount = 0,
  onSignOut,
  activeCollegeName,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const sections: {
    title: string;
    items: {
      id: AdminTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: number | string;
    }[];
  }[] = [
    {
      title: 'Core Workflows',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'academic', label: 'Academic Structure', icon: GraduationCap },
        { id: 'forms', label: 'Feedback Forms', icon: FileSpreadsheet },
      ],
    },
    {
      title: 'Admin & Audit',
      items: [
        {
          id: 'admins',
          label: 'Admin Management',
          icon: ShieldCheck,
          badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
        },
        { id: 'audit', label: 'Audit Trail', icon: Activity },
      ],
    },
    {
      title: 'Billing & Institution',
      items: [
        {
          id: 'billing',
          label: isSuperAdmin ? 'Billing & Access' : 'Billing & Plan',
          icon: CreditCard,
        },
        ...(isSuperAdmin
          ? [{ id: 'institutions' as AdminTab, label: 'Campuses & Colleges', icon: Building2 }]
          : []),
        { id: 'google', label: 'Google Workspace', icon: Globe },
      ],
    },
    {
      title: 'System',
      items: [
        { id: 'settings', label: 'Settings & Profile', icon: Settings },
      ],
    },
  ];

  const handleTabClick = (tabId: AdminTab) => {
    onSelectTab(tabId);
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Hamburger Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none transition-colors"
        aria-label="Open mobile admin navigation"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Drawer Overlay Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 transition-opacity md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Slide-Over Drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-bce-navy text-white z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-bce-cobalt/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-bce-cobalt to-amber-500 flex items-center justify-center font-bold text-amber-300 shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm tracking-tight text-white">BCE Feedback Portal</h2>
              <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Admin Console</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card inside Mobile Drawer */}
        <div className="p-4 bg-slate-900/60 border-b border-bce-cobalt/40 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white truncate max-w-[170px]">{adminName}</span>
            {isSuperAdmin ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950">
                <ShieldCheck className="w-3 h-3" /> Super Admin
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-blue-500 text-white">
                <UserCheck className="w-3 h-3" /> Admin
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-slate-400 truncate">{adminEmail}</p>
          {activeCollegeName && (
            <p className="text-[10px] text-amber-300/90 font-medium truncate">
              {activeCollegeName}
            </p>
          )}
        </div>

        {/* Primary Navigation Sections */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {sections.map((section, sIdx) => (
            <div key={section.title || sIdx} className="space-y-1">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-bce-cobalt text-amber-300 shadow-sm border border-amber-400/30'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1.5">
            <Link
              href="/admin/dashboard/results"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span>Results &amp; Analytics Hub</span>
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                Phase 4
              </span>
            </Link>

            <Link
              href="/"
              target="_blank"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-400" />
              <span>View Public Portal</span>
            </Link>
          </div>
        </nav>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-bce-cobalt/60 bg-slate-950/60">
          <button
            onClick={() => {
              setIsOpen(false);
              onSignOut();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
