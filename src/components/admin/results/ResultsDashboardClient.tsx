'use client';

import React, { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import {
  ParameterScoreBarChart,
  ParameterDistributionStackedChart,
  OverallDonutChart,
  FacultyComparisonBarChart,
} from './AnalyticsCharts';
import { AggregatedAnalyticsReport } from '@/lib/analytics/types';
import { getOverallAnalyticsAction } from '@/app/admin/results/actions';
import {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FeedbackForm,
} from '@/types/database';
import { downloadPdfFile } from '@/lib/utils/pdf-download';
import {
  FileDown,
  RefreshCw,
  ChevronRight,
  Filter,
  BarChart3,
  Star,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface Props {
  initialReport: AggregatedAnalyticsReport;
  academicYears: AcademicYear[];
  branches: Branch[];
  semesters: Semester[];
  faculties: Faculty[];
  subjects: Subject[];
  forms: FeedbackForm[];
}

export function ResultsDashboardClient({
  initialReport,
  academicYears,
  branches,
  semesters,
  faculties,
  subjects,
  forms,
}: Props) {
  const [report, setReport] = useState<AggregatedAnalyticsReport>(initialReport);
  const [isPending, startTransition] = useTransition();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [navigatingFormId, setNavigatingFormId] = useState<string | null>(null);
  const [downloadingPdfFormId, setDownloadingPdfFormId] = useState<string | null>(null);
  const [downloadingScopePdf, setDownloadingScopePdf] = useState(false);
  const [pdfNotification, setPdfNotification] = useState<string | null>(null);

  const handleDownloadFormPdf = async (formId: string, facultyName?: string) => {
    if (downloadingPdfFormId) return;
    setDownloadingPdfFormId(formId);
    setPdfNotification(null);
    try {
      await downloadPdfFile({
        url: `/api/admin/results/${formId}/pdf`,
        defaultFilename: facultyName ? `evaluation-${encodeURIComponent(facultyName)}.pdf` : `form-report-${formId}.pdf`,
        onError: (err) => {
          setPdfNotification(typeof err === 'string' ? err : err.message);
          setTimeout(() => setPdfNotification(null), 4500);
        },
      });
    } finally {
      setDownloadingPdfFormId(null);
    }
  };

  const handleDownloadScopePdf = async () => {
    if (downloadingScopePdf) return;
    setDownloadingScopePdf(true);
    setPdfNotification(null);
    try {
      await downloadPdfFile({
        url: pdfExportUrl,
        defaultFilename: 'institutional-feedback-report.pdf',
        onError: (err) => {
          setPdfNotification(typeof err === 'string' ? err : err.message);
          setTimeout(() => setPdfNotification(null), 5000);
        },
      });
    } finally {
      setDownloadingScopePdf(false);
    }
  };

  // Filter states
  const [academicYearId, setAcademicYearId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');
  const [semesterId, setSemesterId] = useState<string>('ALL');
  const [facultyId, setFacultyId] = useState<string>('ALL');
  const [subjectId, setSubjectId] = useState<string>('ALL');

  const activeBranches = useMemo(
    () => (branches || []).filter(b => b.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [branches]
  );

  const activeFiltersCount = [
    academicYearId !== 'ALL',
    branchId !== 'ALL',
    semesterId !== 'ALL',
    facultyId !== 'ALL',
    subjectId !== 'ALL',
  ].filter(Boolean).length;

  // Load analytics when filters change
  const handleFilterChange = (
    newYear = academicYearId,
    newBranch = branchId,
    newSem = semesterId,
    newFac = facultyId,
    newSub = subjectId
  ) => {
    startTransition(async () => {
      const res = await getOverallAnalyticsAction({
        academicYearId: newYear !== 'ALL' ? newYear : undefined,
        branchId: newBranch !== 'ALL' ? newBranch : undefined,
        semesterId: newSem !== 'ALL' ? newSem : undefined,
        facultyId: newFac !== 'ALL' ? newFac : undefined,
        subjectId: newSub !== 'ALL' ? newSub : undefined,
      });

      if (res.success && res.report) {
        setReport(res.report);
      }
    });
  };

  const handleResetFilters = () => {
    setAcademicYearId('ALL');
    setBranchId('ALL');
    setSemesterId('ALL');
    setFacultyId('ALL');
    setSubjectId('ALL');
    handleFilterChange('ALL', 'ALL', 'ALL', 'ALL', 'ALL');
  };

  // Build PDF export URL with query parameters
  const pdfExportUrl = (() => {
    const params = new URLSearchParams();
    if (academicYearId !== 'ALL') params.set('academicYearId', academicYearId);
    if (branchId !== 'ALL') params.set('branchId', branchId);
    if (semesterId !== 'ALL') params.set('semesterId', semesterId);
    if (facultyId !== 'ALL') params.set('facultyId', facultyId);
    if (subjectId !== 'ALL') params.set('subjectId', subjectId);
    const qs = params.toString();
    return `/api/admin/results/export-pdf${qs ? `?${qs}` : ''}`;
  })();

  // Filter matching forms for the table
  const matchingForms = forms.filter(f => {
    if (academicYearId !== 'ALL' && f.academic_year_id !== academicYearId) return false;
    if (branchId !== 'ALL' && f.branch_id !== branchId) return false;
    if (semesterId !== 'ALL' && f.semester_id !== semesterId) return false;
    if (facultyId !== 'ALL' && f.faculty_id !== facultyId) return false;
    if (subjectId !== 'ALL' && f.subject_id !== subjectId) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Title & Scope Card */}
      <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-bce-navy text-amber-400 rounded-xl">
                <BarChart3 className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Faculty Feedback Results & Analytics
                </h1>
                <p className="text-xs text-slate-500">
                  Institutional Quality Assurance & Objective Evaluation Metrics (Phase 4)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadScopePdf}
              disabled={downloadingScopePdf}
              aria-busy={downloadingScopePdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-bce-navy hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {downloadingScopePdf ? (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 text-amber-400" />
              )}
              <span>{downloadingScopePdf ? 'Downloading Scope PDF...' : 'Download Overall Scope PDF'}</span>
            </button>
          </div>
        </div>

        {pdfNotification && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{pdfNotification}</span>
          </div>
        )}

        {/* Scope Indicator Badge */}
        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              Active Scope:
            </span>
            <span className="font-semibold text-bce-cobalt bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200/60">
              {report.scopeTitle}
            </span>
            {isPending && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" /> Recalculating...
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-500">
            Evaluating {report.formsWithResponses} active forms ({report.totalResponses} total student responses)
          </span>
        </div>

        {/* Multi-tier Filter Bar */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Filter className="w-3.5 h-3.5 text-bce-cobalt" />
              <span>Filter Institutional Scope:</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-bce-cobalt text-white">
                  {activeFiltersCount}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="md:hidden text-xs font-semibold text-bce-cobalt hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{mobileFiltersOpen ? 'Collapse ▲' : 'Expand Filters ▼'}</span>
            </button>
          </div>

          <div className={`${mobileFiltersOpen ? 'grid' : 'hidden md:grid'} grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3`}>
            {/* Academic Year */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Academic Session
              </label>
              <select
                value={academicYearId}
                onChange={e => {
                  setAcademicYearId(e.target.value);
                  handleFilterChange(e.target.value, branchId, semesterId, facultyId, subjectId);
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-800 focus:ring-2 focus:ring-bce-cobalt focus:outline-hidden"
              >
                <option value="ALL">All Sessions</option>
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch / Discipline */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Branch / Discipline
              </label>
              <select
                value={branchId}
                onChange={e => {
                  setBranchId(e.target.value);
                  handleFilterChange(academicYearId, e.target.value, semesterId, facultyId, subjectId);
                }}
                aria-label="Filter Branch / Discipline"
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-800 focus:ring-2 focus:ring-bce-cobalt focus:outline-hidden"
              >
                <option value="ALL">All Branches</option>
                {activeBranches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Semester
              </label>
              <select
                value={semesterId}
                onChange={e => {
                  setSemesterId(e.target.value);
                  handleFilterChange(academicYearId, branchId, e.target.value, facultyId, subjectId);
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-800 focus:ring-2 focus:ring-bce-cobalt focus:outline-hidden"
              >
                <option value="ALL">All Semesters</option>
                {semesters.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Faculty */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Faculty
              </label>
              <select
                value={facultyId}
                onChange={e => {
                  setFacultyId(e.target.value);
                  handleFilterChange(academicYearId, branchId, semesterId, e.target.value, subjectId);
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-800 focus:ring-2 focus:ring-bce-cobalt focus:outline-hidden"
              >
                <option value="ALL">All Faculty</option>
                {faculties.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Subject
              </label>
              <select
                value={subjectId}
                onChange={e => {
                  setSubjectId(e.target.value);
                  handleFilterChange(academicYearId, branchId, semesterId, facultyId, e.target.value);
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-800 focus:ring-2 focus:ring-bce-cobalt focus:outline-hidden"
              >
                <option value="ALL">All Subjects</option>
                {subjects.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} ({sub.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            <div className="flex items-end">
              <button
                onClick={handleResetFilters}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Total Forms */}
        <div className="bg-white p-3 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Active Forms</span>
            <FileSpreadsheet className="w-4 h-4 text-bce-cobalt" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1.5 sm:mt-2">
            {report.formsWithResponses}{' '}
            <span className="text-[11px] sm:text-xs font-medium text-slate-400">/ {report.totalForms}</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">Synchronized responses</p>
        </div>

        {/* Total Responses */}
        <div className="bg-white p-3 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Total Responses</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1.5 sm:mt-2">
            {report.totalResponses}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            {report.validResponses} valid submissions
          </p>
        </div>

        {/* Overall Scope Score */}
        <div className="bg-white p-3 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Scope Rating</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-400/20" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1.5 sm:mt-2">
            {report.hasData ? (
              <>
                {report.averageOverallScore.toFixed(2)}{' '}
                <span className="text-[11px] sm:text-xs font-medium text-slate-400">/ 5.00</span>
              </>
            ) : (
              <span className="text-sm sm:text-lg text-slate-400 font-semibold">No Data</span>
            )}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            {report.hasData
              ? `Avg: ${report.compositeAverageScore.toFixed(2)}/5.00`
              : 'Pending responses'}
          </p>
        </div>

        {/* Satisfaction Index */}
        <div className="bg-white p-3 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Positive Rating</span>
            <CheckCircle2 className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1.5 sm:mt-2">
            {report.hasData ? (
              `${(report.distribution.excellentPct + report.distribution.veryGoodPct + report.distribution.goodPct).toFixed(1)}%`
            ) : (
              <span className="text-sm sm:text-lg text-slate-400 font-semibold">0%</span>
            )}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">Positive rating index</p>
        </div>
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Chart 1: Parameter-wise Average */}
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Parameter-wise Average Rating (1.00 — 5.00)
            </h3>
            <p className="text-xs text-slate-500">
              Objective weighted score across all 8 canonical BCE parameters.
            </p>
          </div>
          <ParameterScoreBarChart parameters={report.parameters} hasData={report.hasData} />
        </div>

        {/* Chart 2: Rating Distribution Stacked Bar */}
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Rating Distribution by Parameter (%)
            </h3>
            <p className="text-xs text-slate-500">
              Proportion of Excellent, Very Good, Good, Satisfactory, and Unsatisfactory.
            </p>
          </div>
          <ParameterDistributionStackedChart
            parameters={report.parameters}
            hasData={report.hasData}
          />
        </div>

        {/* Chart 3: Overall Distribution Donut */}
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Overall Rating Tier Breakdown</h3>
            <p className="text-xs text-slate-500">
              Institutional breakdown of all valid submitted evaluation items.
            </p>
          </div>
          <OverallDonutChart distribution={report.distribution} hasData={report.hasData} />
        </div>

        {/* Chart 4: Faculty Comparison (when data exists) */}
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Faculty Comparative Benchmark
            </h3>
            <p className="text-xs text-slate-500">
              Average overall score comparison for forms with real submissions.
            </p>
          </div>
          <FacultyComparisonBarChart comparisons={report.facultyComparisons} />
        </div>
      </div>

      {/* Forms Performance & Individual Reports Table */}
      <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Faculty Feedback Forms in Selected Scope ({matchingForms.length})
            </h3>
            <p className="text-xs text-slate-500">
              Access individual faculty analytics dashboards and export faculty PDF reports.
            </p>
          </div>
        </div>

        {matchingForms.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <p className="text-sm font-medium">No feedback forms match the selected filters.</p>
            <p className="text-xs text-slate-500">Adjust the filters above to view other sessions, branches, or faculty.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3">Faculty Member</th>
                    <th className="px-4 py-3">Subject & Code</th>
                    <th className="px-4 py-3">Branch & Sem</th>
                    <th className="px-4 py-3">Responses</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchingForms.map(form => {
                    const compItem = report.facultyComparisons.find(c => c.formId === form.id);
                    const respCount = compItem ? compItem.responseCount : form.response_count || 0;
                    const score = compItem ? compItem.averageScore : null;

                    return (
                      <tr key={form.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">{form.faculty?.name}</div>
                          <div className="text-[11px] text-slate-500">{form.faculty?.department}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-800">{form.subject?.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{form.subject?.code}</div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          <div>{form.branch?.code || form.branch?.name}</div>
                          <div className="text-[11px] text-slate-400">{form.semester?.name}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-bold text-slate-900">{respCount}</span>
                          {score !== null && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {score.toFixed(2)}/5.00
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              form.status === 'PUBLISHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : form.status === 'CLOSED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {form.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-2">
                          <Link
                            href={`/admin/dashboard/results/${form.id}`}
                            onClick={() => setNavigatingFormId(form.id)}
                            aria-busy={navigatingFormId === form.id ? 'true' : undefined}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-bce-navy text-amber-400 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors"
                          >
                            {navigatingFormId === form.id ? (
                              <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                            ) : null}
                            <span>{navigatingFormId === form.id ? 'Opening...' : 'Analytics'}</span>
                            {navigatingFormId !== form.id && <ChevronRight className="w-3 h-3" />}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownloadFormPdf(form.id, form.faculty?.name)}
                            disabled={Boolean(downloadingPdfFormId)}
                            aria-busy={downloadingPdfFormId === form.id ? 'true' : undefined}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {downloadingPdfFormId === form.id ? (
                              <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />
                            ) : (
                              <FileDown className="w-3 h-3 text-slate-500" />
                            )}
                            <span>{downloadingPdfFormId === form.id ? 'Downloading...' : 'PDF'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-2.5 sm:space-y-3">
              {matchingForms.map(form => {
                const compItem = report.facultyComparisons.find(c => c.formId === form.id);
                const respCount = compItem ? compItem.responseCount : form.response_count || 0;
                const score = compItem ? compItem.averageScore : null;

                return (
                  <div key={form.id} className="p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 sm:space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{form.faculty?.name}</h4>
                        <p className="text-[11px] text-slate-500">{form.faculty?.department}</p>
                      </div>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          form.status === 'PUBLISHED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : form.status === 'CLOSED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {form.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Subject</span>
                        <span className="font-semibold text-slate-800 text-[11px] line-clamp-1">{form.subject?.name}</span>
                        <span className="font-mono text-[9px] text-slate-400">{form.subject?.code}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Cohort</span>
                        <span className="font-semibold text-slate-700 text-[11px] block">{form.branch?.code || form.branch?.name}</span>
                        <span className="text-[10px] text-slate-400">{form.semester?.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500 font-medium">Responses:</span>
                        <span className="font-bold text-slate-900">{respCount}</span>
                        {score !== null && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {score.toFixed(2)}/5.00
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/dashboard/results/${form.id}`}
                          onClick={() => setNavigatingFormId(form.id)}
                          aria-busy={navigatingFormId === form.id ? 'true' : undefined}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-bce-navy text-amber-400 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors"
                        >
                          {navigatingFormId === form.id ? (
                            <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                          ) : null}
                          <span>{navigatingFormId === form.id ? 'Opening...' : 'Analytics'}</span>
                          {navigatingFormId !== form.id && <ChevronRight className="w-3 h-3" />}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDownloadFormPdf(form.id, form.faculty?.name)}
                          disabled={Boolean(downloadingPdfFormId)}
                          aria-busy={downloadingPdfFormId === form.id ? 'true' : undefined}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {downloadingPdfFormId === form.id ? (
                            <Loader2 className="w-3 h-3 text-slate-600 animate-spin" />
                          ) : (
                            <FileDown className="w-3 h-3 text-slate-600" />
                          )}
                          <span>{downloadingPdfFormId === form.id ? 'Downloading...' : 'PDF'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
