'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setActiveCollegeAction } from '@/lib/auth/tenant-actions';
import type { AdminCollegeMembership } from '@/types/auth';
import { Building2, ChevronDown, Check, Loader2 } from 'lucide-react';

interface TenantSwitcherProps {
  colleges: AdminCollegeMembership[];
  activeCollegeId: string | null;
  isPlatformSuperAdmin: boolean;
}

export function TenantSwitcher({
  colleges,
  activeCollegeId,
  isPlatformSuperAdmin,
}: TenantSwitcherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Show only if Platform Super Admin OR user has multiple active memberships
  if (!isPlatformSuperAdmin && colleges.length <= 1) {
    const singleCollege = colleges[0];
    if (!singleCollege) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-200 text-xs">
        <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="font-semibold text-white truncate">{singleCollege.name}</span>
        <span className="text-[10px] text-slate-400 font-mono">({singleCollege.code})</span>
      </div>
    );
  }

  const activeCollege = colleges.find((c) => c.collegeId === activeCollegeId) || colleges[0];

  const handleSelectCollege = (collegeId: string) => {
    if (collegeId === activeCollegeId) {
      setIsOpen(false);
      return;
    }

    startTransition(async () => {
      const res = await setActiveCollegeAction(collegeId);
      if (res.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        alert(res.error || 'Failed to switch institution.');
      }
    });
  };

  return (
    <div className="relative inline-block text-left z-50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white text-xs border border-amber-500/40 shadow-xs transition-colors focus:outline-hidden focus:ring-2 focus:ring-amber-400"
        title="Switch Active Institution"
      >
        <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <div className="flex flex-col text-left max-w-[160px] sm:max-w-[220px]">
          <span className="font-semibold text-white truncate text-xs">
            {activeCollege ? activeCollege.name : 'Select Institution'}
          </span>
          {activeCollege && (
            <span className="text-[10px] text-amber-300 font-mono">
              {activeCollege.code}
            </span>
          )}
        </div>
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="origin-top-right absolute right-0 mt-2 w-72 rounded-xl shadow-2xl bg-slate-800 border border-slate-700 focus:outline-hidden z-50 py-1.5 divide-y divide-slate-700/50">
            <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Authorized Institutions</span>
              {isPlatformSuperAdmin && (
                <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-normal">
                  Super Admin
                </span>
              )}
            </div>

            <div className="py-1 max-h-60 overflow-y-auto">
              {colleges.map((col) => {
                const isActive = col.collegeId === activeCollegeId;
                return (
                  <button
                    key={col.collegeId}
                    type="button"
                    onClick={() => handleSelectCollege(col.collegeId)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-700/80 transition-colors ${
                      isActive ? 'bg-slate-700/50 text-amber-300 font-medium' : 'text-slate-200'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="truncate">{col.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {col.code} • {col.slug}
                      </span>
                    </div>
                    {isActive && (
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {isPlatformSuperAdmin && (
              <div className="pt-1 border-t border-slate-700/60 bg-slate-900/40 rounded-b-xl">
                <Link
                  href="/admin/institutions"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-3 py-2 text-xs flex items-center justify-between text-amber-300 hover:bg-slate-700/80 hover:text-amber-200 transition-colors font-medium rounded-b-xl"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Manage Institutions</span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-amber-400/80 shrink-0" />
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
