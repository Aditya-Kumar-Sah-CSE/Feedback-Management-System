'use client';

import React, { useState, useTransition } from 'react';
import {
  Sparkles,
  Search,
  Building2,
  Calendar,
  GraduationCap,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Layers,
  User,
  Clock,
} from 'lucide-react';
import {
  PublicActiveFormsResult,
  getPublicActiveFormsAction,
} from '@/app/feedback/actions';
import { useHydrated, formatDateShort } from '@/lib/hooks/use-hydrated';

interface Props {
  initialData: PublicActiveFormsResult;
  collegeId?: string;
}

/**
 * Generate an array of page numbers and '...' ellipsis markers for pagination.
 * Shows first, last, current and 1 neighbour on each side.
 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];
  const showSet = new Set<number>();

  // Always show first and last
  showSet.add(1);
  showSet.add(total);

  // Current and neighbours
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    showSet.add(i);
  }

  const sorted = Array.from(showSet).sort((a, b) => a - b);

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      pages.push('...');
    }
    pages.push(sorted[i]);
  }

  return pages;
}

export function AllFeedbackFormsSection({ initialData, collegeId }: Props) {
  const [data, setData] = useState<PublicActiveFormsResult>(initialData);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(initialData.page || 1);
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const handleSearchChange = (val: string) => {
    setSearch(val);
    startTransition(async () => {
      const res = await getPublicActiveFormsAction({
        page: 1,
        pageSize: 12,
        search: val,
        collegeId,
      });
      if (res.success) {
        setData(res);
        setCurrentPage(1);
      }
    });
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > data.totalPages) return;
    startTransition(async () => {
      const res = await getPublicActiveFormsAction({
        page: newPage,
        pageSize: 12,
        search,
        collegeId,
      });
      if (res.success) {
        setData(res);
        setCurrentPage(newPage);
      }
    });
  };

  return (
    <section className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 border-t border-slate-200">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Open Submissions</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            All Feedback Forms
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Browse all currently active semester and faculty evaluations. Sorted recently published first.
          </p>
        </div>

        {/* Quick Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search active forms..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 sm:py-2 min-h-[42px] sm:min-h-[44px] rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base sm:text-xs text-slate-800 placeholder-slate-400 shadow-xs outline-none transition-all"
          />
        </div>
      </div>

      {/* Forms Cards Grid */}
      {isPending ? (
        <div className="py-12 sm:py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Updating forms list...</p>
        </div>
      ) : data.forms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Published Forms Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {search
              ? 'No feedback forms match your search query.'
              : 'There are currently no active feedback forms published for open submission.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {data.forms.map(form => {
            const isSemester = form.formType === 'SEMESTER_FEEDBACK';

            return (
              <div
                key={form.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-3.5 sm:p-5 flex flex-col justify-between group shadow-xs relative overflow-hidden"
              >
                {/* Accent Top Border */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isSemester
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600'
                      : 'bg-gradient-to-r from-bce-cobalt to-indigo-500'
                  }`}
                />

                <div className="space-y-2.5 sm:space-y-3.5">
                  {/* Card Badges */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span
                      className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isSemester
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {isSemester ? 'Semester Feedback' : 'Faculty Feedback'}
                    </span>

                    <span className="inline-flex items-center gap-1 text-[10.5px] sm:text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>

                  {/* Form Title */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {form.title}
                    </h3>
                  </div>

                  {/* Academic Metadata Pills */}
                  <div className="space-y-1.5 sm:space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-2.5 sm:pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10.5px] sm:text-[11px] flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        Branch / Dept
                      </span>
                      <span className="font-semibold text-slate-800">{form.branch}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10.5px] sm:text-[11px] flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                        Semester Level
                      </span>
                      <span className="font-semibold text-slate-800">{form.semester}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10.5px] sm:text-[11px] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Session
                      </span>
                      <span className="font-semibold text-slate-800">{form.academicYear}</span>
                    </div>

                    <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-50">
                      <span className="text-slate-400 text-[10.5px] sm:text-[11px] flex items-center gap-1.5 shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Evaluation Target
                      </span>
                      <span className="font-semibold text-slate-900 text-right text-[10.5px] sm:text-[11px] line-clamp-2">
                        {form.facultySubjectDisplay}
                      </span>
                    </div>

                    {form.publishedAt && (
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Published
                        </span>
                        <span>
                          {formatDateShort(form.publishedAt, hydrated)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action */}
                <div className="pt-3 sm:pt-4 mt-2.5 sm:mt-3 border-t border-slate-100">
                  {form.googleFormUrl ? (
                    <a
                      href={form.googleFormUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 rounded-xl bg-bce-navy hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs group-hover:shadow-md"
                    >
                      <span>Start Feedback</span>
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full px-4 py-2 sm:py-2.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-medium cursor-not-allowed text-center"
                    >
                      Form URL Unavailable
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {data.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 sm:p-4 bg-white rounded-2xl border border-slate-200 shadow-xs text-xs text-slate-600 text-center sm:text-left">
          <div>
            Showing Page <span className="font-bold text-slate-900">{currentPage}</span> of{' '}
            <span className="font-bold text-slate-900">{data.totalPages}</span> ({data.totalCount} active forms)
          </div>

          <div className="flex items-center gap-1.5">
            {/* Previous Button */}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isPending}
              className="inline-flex items-center gap-1 px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-30 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Prev</span>
            </button>

            {/* Page Number Buttons */}
            {getPageNumbers(currentPage, data.totalPages).map((item, idx) =>
              item === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 select-none">
                  …
                </span>
              ) : (
                <button
                  key={`page-${item}`}
                  type="button"
                  onClick={() => handlePageChange(item as number)}
                  disabled={isPending}
                  className={`min-w-[32px] h-8 sm:h-7 px-2 rounded-lg text-xs font-bold transition-all ${
                    currentPage === item
                      ? 'bg-bce-navy text-white shadow-sm border border-bce-cobalt'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                  } disabled:opacity-40`}
                  aria-label={`Go to page ${item}`}
                  aria-current={currentPage === item ? 'page' : undefined}
                >
                  {item}
                </button>
              )
            )}

            {/* Next Button */}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= data.totalPages || isPending}
              className="inline-flex items-center gap-1 px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-30 transition-colors"
              aria-label="Next page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
