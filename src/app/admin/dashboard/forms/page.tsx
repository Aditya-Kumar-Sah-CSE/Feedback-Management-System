import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-auth';
import { redirect } from 'next/navigation';
import { getGoogleConfigStatus } from '@/lib/google/auth';
import {
  FileSpreadsheet,
  Plus,
  ExternalLink,
  CheckCircle2,
  Clock,
  Archive,
  Ban,
  Eye,
  AlertTriangle,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { FeedbackForm, FeedbackFormStatus, AcademicYear, Branch, Semester } from '@/types/database';
import { FormsFilterClient } from '@/components/admin/forms/FormsFilterClient';
import { DeleteFormButton } from '@/components/admin/forms/DeleteFormButton';

export const dynamic = 'force-dynamic';

export default async function FeedbackFormsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    branch?: string;
    semester?: string;
    status?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const session = await getAdminSession();
  if (!session.isAuthenticated) {
    redirect('/admin/login');
  }

  const resolvedParams = await searchParams;
  const supabase = await createClient();
  const googleStatus = await getGoogleConfigStatus(session.activeCollegeId || undefined);

  // Pagination calculations
  const currentPage = resolvedParams.page ? Math.max(1, parseInt(resolvedParams.page, 10)) : 1;
  const pageSize = resolvedParams.pageSize ? Math.max(5, Math.min(100, parseInt(resolvedParams.pageSize, 10))) : 20;
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  // Fetch academic masters for filters (lean selects)
  const [
    { data: years },
    { data: branches },
    { data: semesters },
  ] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active').order('name', { ascending: false }),
    supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('semesters').select('id, name, semester_number, is_active').order('semester_number'),
  ]);

  // Query forms with lean relational projections
  let query = supabase
    .from('feedback_forms')
    .select(`
      id,
      title,
      description,
      academic_year_id,
      branch_id,
      semester_id,
      faculty_id,
      subject_id,
      form_type,
      status,
      slug,
      google_form_url,
      google_sheet_url,
      google_form_id,
      google_sheet_id,
      response_destination_type,
      response_count,
      created_at,
      published_at,
      closed_at,
      faculty:faculties(id, name, department),
      subject:subjects(id, name, code),
      academic_year:academic_years(id, name),
      branch:branches(id, name, code),
      semester:semesters(id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (resolvedParams.year && resolvedParams.year !== 'ALL') {
    query = query.eq('academic_year_id', resolvedParams.year);
  }
  if (resolvedParams.branch && resolvedParams.branch !== 'ALL') {
    query = query.eq('branch_id', resolvedParams.branch);
  }
  if (resolvedParams.semester && resolvedParams.semester !== 'ALL') {
    query = query.eq('semester_id', resolvedParams.semester);
  }
  if (resolvedParams.status && resolvedParams.status !== 'ALL') {
    query = query.eq('status', resolvedParams.status);
  }
  if (resolvedParams.search && resolvedParams.search.trim()) {
    const q = resolvedParams.search.trim();
    query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  query = query.range(from, to);

  const { data: formsData, count, error: queryErr } = await query;
  let forms = (formsData || []) as unknown as FeedbackForm[];
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Fallback: If relational nested query returned error or empty due to schema cache join mismatch, fetch base and join in memory
  if (queryErr) {
    console.warn('Nested relational join failed in forms catalog:', queryErr.message, 'Falling back to base query...');
    const [{ data: faculties }, { data: subjects }] = await Promise.all([
      supabase.from('faculties').select('id, name, department'),
      supabase.from('subjects').select('id, name, code'),
    ]);

    let baseQuery = supabase
      .from('feedback_forms')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (resolvedParams.year && resolvedParams.year !== 'ALL') {
      baseQuery = baseQuery.eq('academic_year_id', resolvedParams.year);
    }
    if (resolvedParams.branch && resolvedParams.branch !== 'ALL') {
      baseQuery = baseQuery.eq('branch_id', resolvedParams.branch);
    }
    if (resolvedParams.semester && resolvedParams.semester !== 'ALL') {
      baseQuery = baseQuery.eq('semester_id', resolvedParams.semester);
    }
    if (resolvedParams.status && resolvedParams.status !== 'ALL') {
      baseQuery = baseQuery.eq('status', resolvedParams.status);
    }
    if (resolvedParams.search && resolvedParams.search.trim()) {
      const q = resolvedParams.search.trim();
      baseQuery = baseQuery.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
    }

    baseQuery = baseQuery.range(from, to);

    const { data: baseForms } = await baseQuery;
    if (baseForms && baseForms.length > 0) {
      forms = baseForms.map((f: any) => ({
        ...f,
        faculty: faculties?.find((fac: any) => fac.id === f.faculty_id),
        subject: subjects?.find((sub: any) => sub.id === f.subject_id),
        academic_year: years?.find((y: any) => y.id === f.academic_year_id),
        branch: branches?.find((b: any) => b.id === f.branch_id),
        semester: semesters?.find((s: any) => s.id === f.semester_id),
      })) as FeedbackForm[];
    }
  }

  // Helper to construct pagination query URLs
  const createPageUrl = (targetPage: number, targetPageSize?: number) => {
    const params = new URLSearchParams();
    if (resolvedParams.year && resolvedParams.year !== 'ALL') params.set('year', resolvedParams.year);
    if (resolvedParams.branch && resolvedParams.branch !== 'ALL') params.set('branch', resolvedParams.branch);
    if (resolvedParams.semester && resolvedParams.semester !== 'ALL') params.set('semester', resolvedParams.semester);
    if (resolvedParams.status && resolvedParams.status !== 'ALL') params.set('status', resolvedParams.status);
    if (resolvedParams.search && resolvedParams.search.trim()) params.set('search', resolvedParams.search.trim());
    params.set('page', String(targetPage));
    if (targetPageSize || pageSize !== 20) params.set('pageSize', String(targetPageSize || pageSize));
    return `/admin/dashboard/forms?${params.toString()}`;
  };

  const statusBadge = (status: FeedbackFormStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> PUBLISHED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5" /> DRAFT
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
            <Ban className="w-3.5 h-3.5" /> CLOSED
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
            <Archive className="w-3.5 h-3.5" /> ARCHIVED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-bce-cobalt" />
              Google Feedback Forms Management
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-bce-cobalt border border-blue-200">
              Phase 2 Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create standard 8-parameter BCE Google Feedback Forms, manage connected response Google Sheets, and oversee form lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/dashboard"
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 hover:border-slate-400 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 active:translate-y-0 shadow-2xs hover:shadow-xs cursor-pointer select-none"
          >
            ← Admin Console
          </Link>
          <Link
            href="/admin/dashboard/forms/create"
            className="group relative inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-bce-cobalt to-bce-navy hover:from-bce-navy hover:to-slate-900 text-white text-xs font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 active:translate-y-0 cursor-pointer select-none"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
            <span>Generate Google Form</span>
          </Link>
        </div>
      </div>

      {/* Google Setup Status Banner */}
      {!googleStatus.isConfigured ? (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-900">Google API Setup Notice</p>
              <p className="text-amber-800">
                Google API credentials are not yet configured on the server. Connect your Google account to enable live Google Forms and Sheets provisioning.
              </p>
            </div>
          </div>
          <Link
            href={`/api/auth/google?collegeId=${encodeURIComponent(session.activeCollegeId || '')}&returnTo=/admin/dashboard/forms`}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span>Connect Google Account</span>
          </Link>
        </div>
      ) : (
        <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Google API Connected:</strong> {googleStatus.message}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-100 rounded text-[11px] font-semibold text-emerald-800">
              {googleStatus.hasAppsScript ? 'Apps Script Web App Configured' : 'Application-Managed Sync Active'}
            </span>
            <Link
              href={`/api/auth/google?collegeId=${encodeURIComponent(session.activeCollegeId || '')}&returnTo=/admin/dashboard/forms`}
              className="px-3 py-1 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100/60 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <RefreshCw className="w-3 h-3 text-emerald-700" />
              <span>Reconnect Google Account</span>
            </Link>
          </div>
        </div>
      )}

      {/* Interactive Filters Bar */}
      <FormsFilterClient
        academicYears={(years as unknown as AcademicYear[]) || []}
        branches={(branches as unknown as Branch[]) || []}
        semesters={(semesters as unknown as Semester[]) || []}
        selectedYear={resolvedParams.year || 'ALL'}
        selectedBranch={resolvedParams.branch || 'ALL'}
        selectedSemester={resolvedParams.semester || 'ALL'}
        selectedStatus={resolvedParams.status || 'ALL'}
        initialSearch={resolvedParams.search || ''}
      />

      {/* Forms Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Feedback Forms Catalog ({forms.length})
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{forms.filter(f => f.status === 'PUBLISHED').length} Published</span>
            <span>•</span>
            <span>{forms.filter(f => f.status === 'DRAFT').length} Drafts</span>
            <span>•</span>
            <span>{forms.filter(f => f.status === 'CLOSED').length} Closed</span>
          </div>
        </div>

        {forms.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">No Feedback Forms Found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {resolvedParams.search || resolvedParams.status || resolvedParams.year
                ? 'Try adjusting your filters or search query.'
                : 'Get started by clicking "Generate Google Form" to create your first feedback form.'}
            </p>
            <Link
              href="/admin/dashboard/forms/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-bce-cobalt text-white text-xs font-bold rounded-xl hover:bg-bce-navy transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate First Form
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Form Details</th>
                  <th className="px-5 py-3">Faculty & Subject</th>
                  <th className="px-5 py-3">Branch & Sem</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Response Mode</th>
                  <th className="px-5 py-3">Google Links</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forms.map(form => {
                  const faculty = form.faculty;
                  const subject = form.subject;
                  const branch = form.branch;
                  const semester = form.semester;
                  const isNative = form.response_destination_type === 'NATIVE_SHEET';

                  return (
                    <tr key={form.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/dashboard/forms/${form.id}`}
                          className="font-bold text-slate-900 hover:text-bce-cobalt transition-colors block"
                        >
                          {form.title}
                        </Link>
                        <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                          Created: {new Date(form.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">
                          {faculty?.name || 'Faculty'}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          {subject?.name || 'Subject'} {subject?.code ? `(${subject.code})` : ''}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-slate-600">
                        <div>{branch?.name || 'Branch'} ({branch?.code})</div>
                        <div className="text-[11px] text-slate-400">
                          {semester?.name || 'Sem'} • {form.academic_year?.name || 'Session'}
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        {statusBadge(form.status)}
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isNative
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isNative ? '⚡ Native Destination' : '🔄 App Managed Sync'}
                        </span>
                        {typeof form.response_count === 'number' && (
                          <span className="block text-[10px] text-slate-500 mt-0.5">
                            {form.response_count} response(s)
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {form.google_form_url ? (
                            <a
                              href={form.google_form_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 hover:text-purple-900 hover:underline"
                              title="Open Google Form Responder View"
                            >
                              <FileCode2 className="w-3.5 h-3.5" />
                              <span>Form</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}

                          {form.google_sheet_url || form.google_sheet_id ? (
                            <a
                              href={
                                form.google_sheet_url ||
                                `https://docs.google.com/spreadsheets/d/${form.google_sheet_id}/edit`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 hover:underline ml-2"
                              title="Open Google Responses Sheet"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              <span>Sheet</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/admin/dashboard/forms/${form.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:text-bce-cobalt bg-slate-100 hover:bg-slate-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Manage</span>
                          </Link>
                          <DeleteFormButton formId={form.id} formTitle={form.title} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing <strong className="font-semibold text-slate-900">{Math.min(from + 1, totalCount)}</strong>–
                <strong className="font-semibold text-slate-900">{Math.min(to + 1, totalCount)}</strong> of{' '}
                <strong className="font-semibold text-slate-900">{totalCount}</strong> feedback forms
              </div>

              <div className="flex items-center gap-1.5">
                {/* Previous button */}
                <Link
                  href={createPageUrl(Math.max(1, currentPage - 1))}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 transition-colors ${
                    currentPage <= 1
                      ? 'opacity-40 pointer-events-none cursor-not-allowed'
                      : 'hover:bg-slate-50 hover:text-bce-cobalt'
                  }`}
                  aria-disabled={currentPage <= 1}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Previous</span>
                </Link>

                {/* Page numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((pageNum, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && pageNum - prev > 1;
                      const isActive = pageNum === currentPage;

                      return (
                        <React.Fragment key={pageNum}>
                          {showEllipsis && <span className="px-1.5 text-slate-400">…</span>}
                          <Link
                            href={createPageUrl(pageNum)}
                            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center transition-all ${
                              isActive
                                ? 'bg-bce-navy text-amber-400 shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {pageNum}
                          </Link>
                        </React.Fragment>
                      );
                    })}
                </div>

                {/* Next button */}
                <Link
                  href={createPageUrl(Math.min(totalPages, currentPage + 1))}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 transition-colors ${
                    currentPage >= totalPages
                      ? 'opacity-40 pointer-events-none cursor-not-allowed'
                      : 'hover:bg-slate-50 hover:text-bce-cobalt'
                  }`}
                  aria-disabled={currentPage >= totalPages}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  </div>
);
}
