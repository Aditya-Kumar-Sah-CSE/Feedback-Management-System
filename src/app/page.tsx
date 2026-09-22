import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllActiveColleges } from '@/lib/tenant/resolver';
import { CollegeGrid } from '@/components/public/CollegeGrid';
import { School, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Select Your College | Feedback Management System',
  description: 'Choose your institution to access its institutional feedback portal.',
};

export default async function HomePage() {
  // Query only active colleges from public.colleges
  const colleges = await getAllActiveColleges();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* 1. Top Header (64-72px height, minimal) */}
      <header className="h-16 sm:h-[72px] bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center shrink-0">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left: Platform Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold shadow-sm border border-slate-800 shrink-0">
              <School className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate">
                Feedback Management System
              </span>
              <span className="block text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                Institutional Feedback Platform
              </span>
            </div>
          </div>

          {/* Right: Super Admin Login Only */}
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg shadow-sm transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            <span>Super Admin Login</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        </div>
      </header>

      {/* 2. Main Content (Centered, generous whitespace, college selector) */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200/60 rounded-full px-3 py-1 mb-3">
            Institution Portal
          </span>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
            Select Your College
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-slate-600">
            Choose your institution to access its feedback portal.
          </p>
        </div>

        {/* 3. College Grid */}
        <CollegeGrid colleges={colleges} />
      </main>

      {/* 4. Minimal Platform Footer */}
      <footer className="bg-white border-t border-slate-200 text-xs text-slate-500 py-6 px-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div>
            <p className="font-semibold text-slate-700">Feedback Management System</p>
            <p className="text-[11px] text-slate-500">Multi-tenant Institutional Feedback Platform</p>
          </div>
          <p className="text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} Feedback Management System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
