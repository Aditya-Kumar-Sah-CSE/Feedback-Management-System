'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import {
  ParameterScoreBarChart,
  ParameterDistributionStackedChart,
  OverallDonutChart,
} from './AnalyticsCharts';
import { FormAnalyticsReport } from '@/lib/analytics/types';
import { getPerformanceGradeInfo } from '@/lib/analytics/engine';
import { syncSingleFormResponsesAction, getFormAnalyticsAction } from '@/app/admin/results/actions';
import { useHydrated, formatDateTimeFull } from '@/lib/hooks/use-hydrated';
import { downloadPdfFile } from '@/lib/utils/pdf-download';
import { ExternalActionLink } from '@/components/ui/ExternalActionLink';
import {
  ArrowLeft,
  FileDown,
  RefreshCw,
  ExternalLink,
  Users,
  Award,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  FileCode2,
  Info,
  Layers,
  User,
  GraduationCap,
  Loader2,
} from 'lucide-react';

interface Props {
  initialReport: FormAnalyticsReport;
}

export function FormResultsConsole({ initialReport }: Props) {
  const router = useRouter();
  const [report, setReport] = useState<FormAnalyticsReport>(initialReport);
  const [selectedGridIndex, setSelectedGridIndex] = useState<number>(-1); // -1 = All Subjects Combined
  const [isSyncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isNavigatingResponses, setIsNavigatingResponses] = useState(false);
  const [downloadingPdfType, setDownloadingPdfType] = useState<string | null>(null);
  const hydrated = useHydrated();

  const handleDownloadPdf = async (url: string, defaultFilename: string, typeKey: string) => {
    if (downloadingPdfType) return;
    setDownloadingPdfType(typeKey);
    setSyncMessage(null);
    try {
      const res = await downloadPdfFile({
        url,
        defaultFilename,
        onError: (err) => {
          setSyncMessage({
            type: 'error',
            text: typeof err === 'string' ? err : err.message,
          });
        },
      });

      if (res.success) {
        setSyncMessage({
          type: 'success',
          text: `Report PDF downloaded successfully (${res.filename}).`,
        });
        setTimeout(() => setSyncMessage(null), 4500);
      }
    } finally {
      setDownloadingPdfType(null);
    }
  };

  const handleSync = () => {
    setSyncMessage(null);
    startSync(async () => {
      const res = await syncSingleFormResponsesAction(report.formId);
      if (res.success) {
        setSyncMessage({
          type: 'success',
          text: res.message || `Synced ${res.syncedCount} new response(s). Total: ${res.totalResponses}.`,
        });
        const updated = await getFormAnalyticsAction(report.formId);
        if (updated.success && updated.report) {
          setReport(updated.report);
        }
        router.refresh();
      } else {
        setSyncMessage({
          type: 'error',
          text: res.error || 'Failed to synchronize responses.',
        });
      }
    });
  };

  // Determine active displayed report
  const isSemester = Boolean(report.isSemesterForm && report.facultyGrids && report.facultyGrids.length > 0);
  const currentReport: FormAnalyticsReport =
    selectedGridIndex >= 0 && report.facultyGrids?.[selectedGridIndex]
      ? report.facultyGrids[selectedGridIndex].report
      : report;

  const activeFacultyGrid =
    selectedGridIndex >= 0 && report.facultyGrids?.[selectedGridIndex]
      ? report.facultyGrids[selectedGridIndex]
      : null;

  const gradeInfo =
    currentReport.performanceGradeInfo ||
    getPerformanceGradeInfo(currentReport.averageOverallScore, currentReport.hasData);

  // PDF download links
  const semesterOverviewPdfUrl = `/api/admin/results/${report.formId}/pdf?scope=SEMESTER`;
  const facultyPdfUrl = activeFacultyGrid
    ? `/api/admin/results/${report.formId}/pdf?faculty=${encodeURIComponent(activeFacultyGrid.facultyName)}`
    : `/api/admin/results/${report.formId}/pdf`;

  return (
    <div className="space-y-6">
      {/* Top Header & Action Console */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/admin/dashboard/results"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Back to All Results"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">
                    {isSemester
                      ? selectedGridIndex === -1
                        ? `Semester Feedback — ${report.branch} (${report.semester})`
                        : `${activeFacultyGrid?.facultyName} — ${activeFacultyGrid?.subjectName}`
                      : report.facultyName}
                  </h1>
                  {isSemester && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      Multi-Faculty Semester Form
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {report.branch} • {report.semester} • {report.academicYear}
                  {isSemester && report.facultyGrids ? ` • ${report.facultyGrids.length} Teachers Evaluated` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              aria-busy={isSyncing ? 'true' : undefined}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 bg-bce-cobalt hover:bg-bce-navy text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-xs ${
                isSyncing ? 'btn-request-active' : ''
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Responses'}</span>
            </button>

            <Link
              href={`/admin/dashboard/results/${report.formId}/responses`}
              onClick={() => setIsNavigatingResponses(true)}
              aria-busy={isNavigatingResponses ? 'true' : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-200 shadow-xs"
            >
              {isNavigatingResponses ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5 text-indigo-600" />
              )}
              <span>{isNavigatingResponses ? 'Opening Responses...' : 'Student Responses'}</span>
            </Link>

            {isSemester ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(semesterOverviewPdfUrl, `semester-report-${report.formId}.pdf`, 'SEMESTER')}
                  disabled={Boolean(downloadingPdfType)}
                  aria-busy={downloadingPdfType === 'SEMESTER' ? 'true' : undefined}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-bce-navy hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {downloadingPdfType === 'SEMESTER' ? (
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>{downloadingPdfType === 'SEMESTER' ? 'Downloading Semester PDF...' : 'Download Semester PDF'}</span>
                </button>
                {activeFacultyGrid && (
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(facultyPdfUrl, `faculty-${encodeURIComponent(activeFacultyGrid.facultyName)}.pdf`, 'FACULTY_GRID')}
                    disabled={Boolean(downloadingPdfType)}
                    aria-busy={downloadingPdfType === 'FACULTY_GRID' ? 'true' : undefined}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-300 disabled:opacity-50 cursor-pointer"
                  >
                    {downloadingPdfType === 'FACULTY_GRID' ? (
                      <Loader2 className="w-3.5 h-3.5 text-bce-cobalt animate-spin" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5 text-bce-cobalt" />
                    )}
                    <span>{downloadingPdfType === 'FACULTY_GRID' ? 'Generating PDF...' : 'Faculty PDF'}</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleDownloadPdf(facultyPdfUrl, `faculty-report-${report.formId}.pdf`, 'FACULTY')}
                disabled={Boolean(downloadingPdfType)}
                aria-busy={downloadingPdfType === 'FACULTY' ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-bce-navy hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {downloadingPdfType === 'FACULTY' ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{downloadingPdfType === 'FACULTY' ? 'Generating PDF...' : 'Download Faculty Report (PDF)'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Sync / Notification Alert */}
        {syncMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              syncMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{syncMessage.text}</span>
          </div>
        )}

        {/* Form Metadata & Quick Google Links */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Status: {report.status}
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500 text-[11px]">
              Last synced: {report.lastSyncedAt ? formatDateTimeFull(report.lastSyncedAt, hydrated) : 'Not yet synced'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {report.googleSheetUrl && (
              <ExternalActionLink
                href={report.googleSheetUrl}
                openingText="Opening Sheet..."
                className="text-emerald-700 hover:text-emerald-800 font-semibold"
                icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
              >
                <span>Google Sheet Responses</span>
                <ExternalLink className="w-3 h-3" />
              </ExternalActionLink>
            )}
            {report.googleFormUrl && (
              <ExternalActionLink
                href={report.googleFormUrl}
                openingText="Opening Form..."
                className="text-purple-700 hover:text-purple-800 font-semibold"
                icon={<FileCode2 className="w-3.5 h-3.5" />}
              >
                <span>Public Form</span>
                <ExternalLink className="w-3 h-3" />
              </ExternalActionLink>
            )}
          </div>
        </div>
      </div>

      {/* Scope Selector Tabs for Semester Forms */}
      {isSemester && report.facultyGrids && (
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-bce-cobalt" />
              Analytics View Scope
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {report.facultyGrids.length} Evaluated Faculty-Subject Grids
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedGridIndex(-1)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedGridIndex === -1
                  ? 'bg-bce-navy text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>All Subjects Combined (Semester Benchmark)</span>
            </button>

            {report.facultyGrids.map((fg, idx) => {
              const isSelected = selectedGridIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedGridIndex(idx)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-bce-cobalt text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{fg.facultyName}</span>
                  <span className="text-[10px] opacity-75 font-normal">({fg.subjectCode || fg.subjectName})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Metric Summary Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Responses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isSemester && selectedGridIndex === -1 ? 'Total Students' : 'Total Submissions'}
            </span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {isSemester && selectedGridIndex === -1
              ? (currentReport.totalStudents ?? currentReport.totalResponses)
              : currentReport.totalResponses}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isSemester && selectedGridIndex === -1
              ? 'Unique student submission(s)'
              : 'Recorded in Google Sheet'}
          </p>
        </div>

        {/* Valid Responses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isSemester && selectedGridIndex === -1 ? 'Evaluated Items' : 'Valid Evaluations'}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {isSemester && selectedGridIndex === -1
              ? (currentReport.evaluatedItems ?? currentReport.validResponses)
              : currentReport.validResponses}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isSemester && selectedGridIndex === -1
              ? `${report.facultyGrids?.length || 0} faculty-subject grid(s) evaluated`
              : `${currentReport.unansweredResponses} incomplete/unanswered`}
          </p>
        </div>

        {/* Overall Average Score */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isSemester && selectedGridIndex === -1 ? 'Semester Benchmark' : 'Overall Rating'}
            </span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {currentReport.hasData ? (
              <>
                {currentReport.averageOverallScore.toFixed(2)}{' '}
                <span className="text-xs font-medium text-slate-400">/ 5.00</span>
              </>
            ) : (
              <span className="text-lg text-slate-400 font-semibold">No Data</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {currentReport.hasData
              ? `Parameter Average: ${(currentReport.parameterAverageScore ?? currentReport.compositeAverageScore).toFixed(2)} (Q1–Q7)`
              : 'Requires student responses'}
          </p>
        </div>

        {/* Performance Grade */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Performance Grade</span>
            <Info className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2">
            <span
              className={`inline-block px-2.5 py-1 rounded-lg text-xs font-extrabold border ${gradeInfo.bgColor} ${gradeInfo.color} ${gradeInfo.borderColor}`}
            >
              {gradeInfo.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Institutional 5-point rating scale</p>
        </div>
      </div>

      {/* Comparative Matrix Section for Semester Forms (When All Subjects Combined is Selected) */}
      {isSemester && selectedGridIndex === -1 && report.facultyGrids && report.facultyGrids.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Semester Faculty Comparative Performance Matrix
              </h3>
              <p className="text-xs text-slate-500">
                Comparative ranking and parameter evaluation scores for all course faculty.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {report.facultyGrids.length} Faculty Members
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Faculty Member</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3 text-center">Submissions</th>
                  <th className="py-2.5 px-3 text-center">Average Rating</th>
                  <th className="py-2.5 px-3">Performance Benchmark</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.facultyGrids.map((fg, idx) => {
                  const score = fg.report.compositeAverageScore;
                  const scoreColor =
                    score >= 4.0
                      ? 'text-indigo-700 font-bold'
                      : score >= 3.0
                      ? 'text-emerald-700 font-bold'
                      : score >= 2.0
                      ? 'text-amber-700 font-bold'
                      : 'text-red-700 font-bold';

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-900">{fg.facultyName}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {fg.subjectName} {fg.subjectCode && `(${fg.subjectCode})`}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-700">
                        {fg.report.validResponses}
                      </td>
                      <td className={`py-3 px-3 text-center ${scoreColor}`}>
                        {fg.report.hasData ? `${score.toFixed(2)} / 5.00` : 'No Data'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="w-36 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              score >= 4.0
                                ? 'bg-indigo-500'
                                : score >= 3.0
                                ? 'bg-emerald-500'
                                : score >= 2.0
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${fg.report.hasData ? (score / 5) * 100 : 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedGridIndex(idx)}
                          className="px-2.5 py-1 text-[11px] font-bold text-bce-cobalt bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parameter-wise Average */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Evaluation Parameter Scores (1.00 — 5.00)
            </h3>
            <p className="text-xs text-slate-500">
              Weighted average rating calculated across valid student submissions.
            </p>
          </div>
          <ParameterScoreBarChart parameters={currentReport.parameters} hasData={currentReport.hasData} />
        </div>

        {/* Parameter Distribution Stacked Bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Parameter Rating Distribution (%)
            </h3>
            <p className="text-xs text-slate-500">
              Detailed percentage breakdown of Excellent, Very Good, Good, Satisfactory, and Unsatisfactory.
            </p>
          </div>
          <ParameterDistributionStackedChart
            parameters={currentReport.parameters}
            hasData={currentReport.hasData}
          />
        </div>

        {/* Overall Distribution Donut */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 lg:col-span-2">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Overall Rating Tier Breakdown</h3>
            <p className="text-xs text-slate-500">
              Institutional breakdown of all valid submitted evaluation items.
            </p>
          </div>
          <OverallDonutChart distribution={currentReport.distribution} hasData={currentReport.hasData} />
        </div>
      </div>

      {/* Parameter-by-Parameter Breakdown (8 Cards) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Standard BCE 8-Parameter Detailed Performance Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Itemized metrics, score calculations, and data-driven interpretations.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">8 Parameters Configured</span>
        </div>

        {!currentReport.hasData ? (
          <div className="py-10 text-center text-slate-400 space-y-2">
            <p className="text-sm font-semibold">No feedback responses are available yet.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Once responses are recorded in the Google Sheet, this section will automatically display itemized scores, response percentages, and objective observations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentReport.parameters.map(p => {
              const scoreColor =
                p.averageScore >= 4.0
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                  : p.averageScore >= 3.0
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : p.averageScore >= 2.0
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-red-700 bg-red-50 border-red-200';

              return (
                <div
                  key={p.parameterId}
                  className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-xs text-slate-900">
                          {p.parameterId}. {p.title}
                        </h4>
                        {p.parameterId === 8 ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded">
                            Overall Rating (Q8)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-50 text-blue-700 rounded">
                            Evaluation Parameter
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{p.description}</p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${scoreColor}`}
                    >
                      {p.validCount > 0 ? `${p.averageScore.toFixed(2)} / 5.00` : 'N/A'}
                    </span>
                  </div>

                  {/* Progress Bar Visual */}
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-bce-cobalt h-2 rounded-full transition-all"
                      style={{
                        width: `${p.validCount > 0 ? (p.averageScore / 5) * 100 : 0}%`,
                      }}
                    />
                  </div>

                  {/* 5 Tiers Breakdown Grid */}
                  <div className="grid grid-cols-5 gap-1 text-center pt-1 border-t border-slate-200/60 text-[10px]">
                    <div className="p-1 bg-white rounded-lg border border-slate-100">
                      <span className="text-indigo-700 font-bold block">Excellent</span>
                      <span className="text-slate-800 font-semibold">{p.excellentCount}</span>
                      <span className="text-slate-400 block text-[9px]">({p.excellentPct}%)</span>
                    </div>
                    <div className="p-1 bg-white rounded-lg border border-slate-100">
                      <span className="text-emerald-700 font-bold block">V. Good</span>
                      <span className="text-slate-800 font-semibold">{p.veryGoodCount}</span>
                      <span className="text-slate-400 block text-[9px]">({p.veryGoodPct}%)</span>
                    </div>
                    <div className="p-1 bg-white rounded-lg border border-slate-100">
                      <span className="text-blue-700 font-bold block">Good</span>
                      <span className="text-slate-800 font-semibold">{p.goodCount}</span>
                      <span className="text-slate-400 block text-[9px]">({p.goodPct}%)</span>
                    </div>
                    <div className="p-1 bg-white rounded-lg border border-slate-100">
                      <span className="text-amber-700 font-bold block">Satisfactory</span>
                      <span className="text-slate-800 font-semibold">{p.satisfactoryCount}</span>
                      <span className="text-slate-400 block text-[9px]">({p.satisfactoryPct}%)</span>
                    </div>
                    <div className="p-1 bg-white rounded-lg border border-slate-100">
                      <span className="text-red-700 font-bold block">Unsat.</span>
                      <span className="text-slate-800 font-semibold">{p.unsatisfactoryCount}</span>
                      <span className="text-slate-400 block text-[9px]">({p.unsatisfactoryPct}%)</span>
                    </div>
                  </div>

                  {/* Factual Interpretation */}
                  <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">
                    &ldquo;{p.interpretation}&rdquo;
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
