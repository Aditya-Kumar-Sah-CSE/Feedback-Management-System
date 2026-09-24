'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
  ArrowLeft,
  X,
  AlertCircle,
  Loader2,
  User,
  GraduationCap,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  AdminResponsesResult,
  StudentResponseDetail,
  getFormResponsesAction,
  getResponseDetailAction,
} from '@/app/admin/results/responses/actions';
import { syncSingleFormResponsesAction } from '@/app/admin/results/actions';
import { downloadPdfFile } from '@/lib/utils/pdf-download';

interface Props {
  formId: string;
  initialData: AdminResponsesResult;
}

export function FormResponsesConsole({ formId, initialData }: Props) {
  const [data, setData] = useState<AdminResponsesResult>(initialData);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pageSize, setPageSize] = useState<number>(initialData.pageSize || 20);
  const [currentPage, setCurrentPage] = useState<number>(initialData.page || 1);

  const [isPending, startTransition] = useTransition();
  const [selectedDetail, setSelectedDetail] = useState<StudentResponseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [downloadNotification, setDownloadNotification] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setDownloadNotification(null);
    try {
      const res = await syncSingleFormResponsesAction(formId);
      if (res.success) {
        setDownloadNotification({
          type: 'success',
          message: res.message || `Responses synchronized successfully. Total: ${res.totalResponses}.`,
        });
        loadResponses(1);
      } else {
        setDownloadNotification({
          type: 'error',
          message: res.error || 'Failed to synchronize responses.',
        });
      }
    } catch (err: any) {
      setDownloadNotification({
        type: 'error',
        message: err?.message || 'Error triggering response sync.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadResponsePdf = async (responseId: string) => {
    if (!responseId) {
      setDownloadNotification({
        type: 'error',
        message: 'Invalid response identifier.',
      });
      return;
    }

    setDownloadingPdfId(responseId);
    setDownloadNotification(null);

    try {
      await downloadPdfFile({
        url: `/api/admin/results/${formId}/responses/${encodeURIComponent(responseId)}/pdf`,
        defaultFilename: `student-response-${responseId.slice(0, 8)}.pdf`,
        onError: (err) => {
          const msg = typeof err === 'string' ? err : err.message;
          setDownloadNotification({
            type: 'error',
            message: `PDF Download Error: ${msg}`,
          });
        },
        onSuccess: () => {
          setDownloadNotification({
            type: 'success',
            message: 'Student Response PDF downloaded successfully.',
          });
          setTimeout(() => setDownloadNotification(null), 4000);
        },
      });
    } catch (err: any) {
      console.error('PDF download error:', err);
      setDownloadNotification({
        type: 'error',
        message: `Failed to download PDF: ${err?.message || 'Network error'}`,
      });
    } finally {
      setDownloadingPdfId(null);
    }
  };

  // Fetch responses on search or pagination changes
  const loadResponses = (
    page: number,
    currentSearch = search,
    currentStart = startDate,
    currentEnd = endDate,
    currentSize = pageSize
  ) => {
    startTransition(async () => {
      const res = await getFormResponsesAction({
        formId,
        page,
        pageSize: currentSize,
        search: currentSearch,
        startDate: currentStart,
        endDate: currentEnd,
      });
      if (res.success) {
        setData(res);
        setCurrentPage(page);
      }
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadResponses(1, search, startDate, endDate, pageSize);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > data.totalPages) return;
    loadResponses(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    loadResponses(1, search, startDate, endDate, newSize);
  };

  const handleViewDetail = async (responseId: string) => {
    setLoadingDetail(responseId);
    try {
      const res = await getResponseDetailAction({ formId, responseId });
      if (res.success && res.detail) {
        setSelectedDetail(res.detail);
      } else {
        setDownloadNotification({
          type: 'error',
          message: res.error || 'Failed to load response detail.',
        });
      }
    } catch (err) {
      console.error(err);
      setDownloadNotification({
        type: 'error',
        message: 'Error fetching response detail.',
      });
    } finally {
      setLoadingDetail(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/dashboard/results/${formId}`}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Back to Form Results Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Student Responses</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {data.formType === 'SEMESTER_FEEDBACK' ? 'Multi-Faculty Semester' : 'Faculty Feedback'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {data.formTitle} • {data.totalCount} Total Submissions Recorded
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              aria-busy={isSyncing ? 'true' : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-bce-cobalt hover:bg-bce-navy text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Responses'}</span>
            </button>
            <Link
              href={`/admin/dashboard/results/${formId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-300"
            >
              <span>Back to Analytics</span>
            </Link>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student name, reg no, or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all"
            />
          </div>

          <div className="sm:col-span-3 flex items-center gap-2">
            <div className="relative w-full">
              <input
                type="date"
                title="Start Date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 text-xs text-slate-700 outline-none"
              />
            </div>
            <span className="text-slate-400 text-xs">to</span>
            <div className="relative w-full">
              <input
                type="date"
                title="End Date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 text-xs text-slate-700 outline-none"
              />
            </div>
          </div>

          <div className="sm:col-span-4 flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Filter</span>
            </button>

            {(search || startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStartDate('');
                  setEndDate('');
                  loadResponses(1, '', '', '', pageSize);
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Reset
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
              <span>Show:</span>
              <select
                value={pageSize}
                onChange={e => handlePageSizeChange(Number(e.target.value))}
                className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Notification Toast/Banner */}
      {downloadNotification && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2.5 transition-all ${
            downloadNotification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {downloadNotification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{downloadNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadNotification(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Responses Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">University Reg No</th>
                <th className="py-3 px-4">Verified Email</th>
                <th className="py-3 px-4">Submission Date</th>
                <th className="py-3 px-4">Response ID</th>
                <th className="py-3 px-4 text-center">Receipt Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isPending ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>Loading responses...</span>
                  </td>
                </tr>
              ) : data.responses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <User className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-700 text-sm">No Student Responses Found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {search || startDate || endDate
                        ? 'No responses match your search or date filter criteria.'
                        : 'No students have submitted feedback responses for this form yet, or responses need to be synced.'}
                    </p>
                    {!search && !startDate && !endDate && (
                      <button
                        type="button"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-bce-cobalt hover:bg-bce-navy text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? 'Syncing...' : 'Sync Responses Now'}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                data.responses.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {row.studentName || 'Confidential Student'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {row.registrationNumber || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {row.studentEmail}
                    </td>
                    <td className="py-3 px-4 text-slate-500" suppressHydrationWarning>
                      {row.submittedAt
                        ? isMounted
                          ? new Date(row.submittedAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : row.submittedAt.slice(0, 10)
                        : 'Google Form Recorded'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-slate-400" title={row.googleResponseId}>
                      {row.googleResponseId.length > 14
                        ? `${row.googleResponseId.slice(0, 12)}…`
                        : row.googleResponseId}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.emailStatus === 'SENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.emailStatus === 'EMAIL_NOT_CONFIGURED'
                            ? 'bg-slate-100 text-slate-600'
                            : row.emailStatus === 'FAILED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {row.emailStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewDetail(row.googleResponseId || row.id)}
                          disabled={loadingDetail === (row.googleResponseId || row.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {loadingDetail === (row.googleResponseId || row.id) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>View</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadResponsePdf(row.googleResponseId || row.id)}
                          disabled={downloadingPdfId === (row.googleResponseId || row.id)}
                          aria-busy={downloadingPdfId === (row.googleResponseId || row.id) ? 'true' : undefined}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                          title="Download Student Response PDF"
                        >
                          {downloadingPdfId === (row.googleResponseId || row.id) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                          ) : (
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>{downloadingPdfId === (row.googleResponseId || row.id) ? 'Downloading...' : 'PDF'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
            <div>
              Showing <span className="font-bold text-slate-900">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-slate-900">
                {Math.min(currentPage * pageSize, data.totalCount)}
              </span>{' '}
              of <span className="font-bold text-slate-900">{data.totalCount}</span> responses
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 font-semibold text-slate-800">
                {currentPage} / {data.totalPages}
              </span>

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= data.totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Student Submission Details</h3>
                  <p className="text-[11px] text-slate-500">
                    Response ID: {selectedDetail.responseId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-5 text-xs text-slate-600">
              {/* Identity Details Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">Student Name</span>
                  <span className="font-bold text-slate-900">
                    {selectedDetail.studentName || 'Confidential Student'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">University Reg No</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedDetail.registrationNumber || 'N/A'}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <span className="text-slate-400 block text-[11px]">Verified Email</span>
                  <span className="font-semibold text-indigo-600 truncate block">
                    {selectedDetail.studentEmail}
                  </span>
                </div>
              </div>

              {/* Faculty Evaluation Grids */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-indigo-600" />
                  <span>Evaluation Parameter Breakdown</span>
                </h4>

                {selectedDetail.facultyEvaluations.map((evalItem, eIdx) => (
                  <div key={eIdx} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-800 text-white px-4 py-2.5 font-bold text-xs flex items-center justify-between">
                      <span>{evalItem.facultyName}</span>
                      <span className="text-slate-300 font-normal">{evalItem.subjectName}</span>
                    </div>

                    <div className="divide-y divide-slate-100 bg-white">
                      {evalItem.ratings.map(r => {
                        const rLower = (r.rating || '').toLowerCase();
                        const badgeColor = rLower.includes('excellent')
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : rLower.includes('very good')
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : rLower.includes('good')
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : rLower.includes('satisfactory')
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : rLower.includes('unsatisfactory')
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200';

                        return (
                          <div key={r.parameterId} className="flex items-center justify-between p-3 text-xs">
                            <span className="text-slate-700 max-w-[70%] font-medium">
                              {r.parameterId}. {r.parameterTitle}
                            </span>
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeColor}`}>
                              {r.rating || 'Not Rated'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* General Feedback Comments */}
              {selectedDetail.generalFeedback && (
                <div>
                  <h4 className="font-bold text-slate-900 text-sm mb-1.5">General Feedback</h4>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 italic">
                    &ldquo;{selectedDetail.generalFeedback}&rdquo;
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDownloadResponsePdf(selectedDetail.responseId)}
                disabled={downloadingPdfId === selectedDetail.responseId}
                aria-busy={downloadingPdfId === selectedDetail.responseId ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {downloadingPdfId === selectedDetail.responseId ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{downloadingPdfId === selectedDetail.responseId ? 'Downloading...' : 'Download Response PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
