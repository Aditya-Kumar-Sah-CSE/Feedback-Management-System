'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import {
  FeedbackForm,
  FeedbackFormStatus,
  AuditLog,
} from '@/types/database';
import {
  updateFormStatusAction,
  syncFormResponsesAction,
  deleteFeedbackFormAction,
} from '@/app/admin/forms/actions';
import { BCE_FEEDBACK_PARAMETERS } from '@/lib/google/template';
import { useHydrated, formatDateShort, formatTime, formatDateTimeFull } from '@/lib/hooks/use-hydrated';
import { ExternalActionLink } from '@/components/ui/ExternalActionLink';
import {
  ArrowLeft,
  FileSpreadsheet,
  FileCode2,
  ExternalLink,
  CheckCircle2,
  Clock,
  Ban,
  Archive,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Calendar,
  GraduationCap,
  Activity,
  BarChart3,
  Trash2,
  Lock,
  Loader2,
} from 'lucide-react';

interface Props {
  form: FeedbackForm;
  auditLogs: AuditLog[];
  currentUserEmail: string;
  hasAnalyticsAccess?: boolean;
}


export function FormDetailConsole({
  form: initialForm,
  auditLogs,
  currentUserEmail,
  hasAnalyticsAccess = false,
}: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [form, setForm] = useState<FeedbackForm>(initialForm);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    'PUBLISH' | 'CLOSE' | 'REOPEN' | 'ARCHIVE' | 'RESTORE' | 'DELETE' | 'SYNC' | null
  >(null);
  const [isNavigatingResults, setIsNavigatingResults] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isNative = form.response_destination_type === 'NATIVE_SHEET';

  const handleCopyLink = () => {
    if (form.google_form_url) {
      navigator.clipboard.writeText(form.google_form_url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleStatusChange = (
    newStatus: FeedbackFormStatus,
    actionKey?: 'PUBLISH' | 'CLOSE' | 'REOPEN' | 'ARCHIVE' | 'RESTORE'
  ) => {
    setMessage(null);
    setPendingAction(actionKey || (newStatus === 'PUBLISHED' ? 'PUBLISH' : newStatus === 'CLOSED' ? 'CLOSE' : 'ARCHIVE'));
    setForm((prev) => ({ ...prev, status: newStatus }));
    startTransition(async () => {
      try {
        const res = await updateFormStatusAction(form.id, newStatus);
        if (res.success) {
          setMessage({ type: 'success', text: res.message || `Form status changed to ${newStatus}.` });
        } else {
          setForm(initialForm); // rollback
          setMessage({ type: 'error', text: res.error || 'Failed to update status.' });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleSyncResponses = () => {
    setMessage(null);
    setPendingAction('SYNC');
    startTransition(async () => {
      try {
        const res = await syncFormResponsesAction(form.id);
        if (res.success) {
          if (res.totalResponses !== undefined) {
            setForm((prev) => ({ ...prev, response_count: res.totalResponses ?? prev.response_count }));
          }
          setMessage({
            type: 'success',
            text: res.message || `Synced ${res.syncedCount} response(s). Total: ${res.totalResponses}.`,
          });
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to sync responses.' });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleDeleteForm = () => {
    const isConfirmed = window.confirm(
      `Are you sure you want to delete this feedback form?\n\n"${form.title}"\n\nThis will permanently remove the form from the BCE portal. (Google Drive files remain intact).`
    );
    if (!isConfirmed) return;

    setMessage(null);
    setPendingAction('DELETE');
    startTransition(async () => {
      try {
        const res = await deleteFeedbackFormAction(form.id);
        if (res.success) {
          router.push('/admin/dashboard/forms');
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to delete feedback form.' });
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const statusBadge = (status: FeedbackFormStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
            <CheckCircle2 className="w-4 h-4" /> PUBLISHED (Accepting Feedback)
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
            <Clock className="w-4 h-4" /> DRAFT (Not Published)
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 shadow-xs">
            <Ban className="w-4 h-4" /> CLOSED (Feedback Concluded)
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300 shadow-xs">
            <Archive className="w-4 h-4" /> ARCHIVED (Historical Record)
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/admin/dashboard/forms"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h2 className="text-xl font-bold text-slate-900">{form.title}</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 ml-8">
              <span>Form ID: <code className="font-mono text-[11px] text-slate-700">{form.id}</code></span>
              <span>•</span>
              <span>Created {formatDateShort(form.created_at, hydrated)}</span>
              {currentUserEmail && (
                <>
                  <span>•</span>
                  <span>Console: <strong className="text-slate-700 font-mono text-[11px]">{currentUserEmail}</strong></span>
                </>
              )}
            </div>

          </div>

          <div className="flex items-center gap-2.5">
            {statusBadge(form.status)}
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          {/* External Google Links */}
          <div className="flex flex-wrap items-center gap-2">
            {form.google_form_url && (
              <>
                <ExternalActionLink
                  href={form.google_form_url}
                  openingText="Opening Student Form..."
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-colors shadow-2xs"
                  icon={<FileCode2 className="w-4 h-4 text-purple-700" />}
                >
                  <span>Open Student Form</span>
                  <ExternalLink className="w-3 h-3" />
                </ExternalActionLink>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy Form URL'}</span>
                </button>
              </>
            )}

            {form.google_form_edit_url ? (
              <ExternalActionLink
                href={form.google_form_edit_url}
                openingText="Opening Google Forms..."
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors"
              >
                <span>Edit in Google Forms</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </ExternalActionLink>
            ) : form.google_form_id ? (
              <ExternalActionLink
                href={`https://docs.google.com/forms/d/${form.google_form_id}/edit`}
                openingText="Opening Google Forms..."
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors"
              >
                <span>Edit in Google Forms</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </ExternalActionLink>
            ) : null}

            {form.google_sheet_url || form.google_sheet_id ? (
              <ExternalActionLink
                href={
                  form.google_sheet_url ||
                  `https://docs.google.com/spreadsheets/d/${form.google_sheet_id}/edit`
                }
                openingText="Opening Response Sheet..."
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors shadow-2xs"
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}
              >
                <span>Open Response Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </ExternalActionLink>
            ) : null}

            {hasAnalyticsAccess ? (
              <Link
                href={`/admin/dashboard/results/${form.id}`}
                onClick={() => setIsNavigatingResults(true)}
                aria-busy={isNavigatingResults ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bce-navy hover:bg-slate-800 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              >
                {isNavigatingResults ? (
                  <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                ) : (
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                )}
                <span>{isNavigatingResults ? 'Opening Hub...' : 'Results & Analytics'}</span>
              </Link>
            ) : (
              <Link
                href={`/admin/dashboard/results/${form.id}`}
                title="Full Analytics Access Required - Click to upgrade your plan"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/95 hover:bg-slate-800 text-slate-300 hover:text-white border border-amber-500/40 rounded-xl text-xs font-bold transition-all shadow-2xs group cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span>Results & Analytics</span>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded ml-0.5 uppercase tracking-wider">
                  Locked
                </span>
              </Link>
            )}
          </div>

          {/* Lifecycle State Changer */}
          <div className="flex items-center gap-2">
            {form.status === 'DRAFT' && (
              <button
                type="button"
                onClick={() => handleStatusChange('PUBLISHED', 'PUBLISH')}
                disabled={isPending}
                aria-busy={pendingAction === 'PUBLISH' ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {pendingAction === 'PUBLISH' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{pendingAction === 'PUBLISH' ? 'Publishing Form...' : 'Publish Form'}</span>
              </button>
            )}

            {form.status === 'PUBLISHED' && (
              <button
                type="button"
                onClick={() => handleStatusChange('CLOSED', 'CLOSE')}
                disabled={isPending}
                aria-busy={pendingAction === 'CLOSE' ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {pendingAction === 'CLOSE' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
                <span>{pendingAction === 'CLOSE' ? 'Closing Submissions...' : 'Close Submissions'}</span>
              </button>
            )}

            {form.status === 'CLOSED' && (
              <>
                <button
                  type="button"
                  onClick={() => handleStatusChange('PUBLISHED', 'REOPEN')}
                  disabled={isPending}
                  aria-busy={pendingAction === 'REOPEN' ? 'true' : undefined}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {pendingAction === 'REOPEN' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{pendingAction === 'REOPEN' ? 'Reopening Form...' : 'Reopen Form'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('ARCHIVED', 'ARCHIVE')}
                  disabled={isPending}
                  aria-busy={pendingAction === 'ARCHIVE' ? 'true' : undefined}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {pendingAction === 'ARCHIVE' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                  <span>{pendingAction === 'ARCHIVE' ? 'Archiving Form...' : 'Archive Form'}</span>
                </button>
              </>
            )}

            {form.status === 'ARCHIVED' && (
              <button
                type="button"
                onClick={() => handleStatusChange('DRAFT', 'RESTORE')}
                disabled={isPending}
                aria-busy={pendingAction === 'RESTORE' ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {pendingAction === 'RESTORE' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                <span>{pendingAction === 'RESTORE' ? 'Restoring to Draft...' : 'Restore to Draft'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDeleteForm}
              disabled={isPending}
              aria-busy={pendingAction === 'DELETE' ? 'true' : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-xs cursor-pointer"
              title="Delete this feedback form permanently"
            >
              {pendingAction === 'DELETE' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span>{pendingAction === 'DELETE' ? 'Deleting Form...' : 'Delete Form'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Response Synchronization + Academic Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left 2 Cols: Response Synchronization & Evaluation Parameters */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Response Destination & Sync Card */}
          <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 text-bce-cobalt ${isPending ? 'animate-spin' : ''}`} />
                  Google Form Response Destination & Sync
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real responses collected in the Google Form and synced to the connected Google Sheet.
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold self-start sm:self-auto ${
                  isNative
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                {isNative ? '⚡ Native Destination (Apps Script)' : '🔄 Application-Managed Sync'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 text-center">
              <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Responses Recorded
                </span>
                <span className="text-2xl font-bold text-slate-900 mt-1 block">
                  {form.response_count || 0}
                </span>
                <span className="text-[10px] text-slate-500">In Google Sheet</span>
              </div>

              <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Last Synced
                </span>
                <span className="text-xs font-semibold text-slate-800 mt-2 block">
                  {form.last_synced_at
                    ? formatTime(form.last_synced_at, hydrated) + ' (' + formatDateShort(form.last_synced_at, hydrated) + ')'
                    : 'Never synced'}
                </span>
                <span className="text-[10px] text-slate-500">Forms → Sheet</span>
              </div>

              <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-center items-center">
                <button
                  type="button"
                  onClick={handleSyncResponses}
                  disabled={isPending || !form.google_form_id || !form.google_sheet_id}
                  aria-busy={pendingAction === 'SYNC' ? 'true' : undefined}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pendingAction === 'SYNC' ? 'animate-spin' : ''}`} />
                  <span>{pendingAction === 'SYNC' ? 'Syncing Responses...' : 'Sync Responses Now'}</span>
                </button>
                <span className="text-[10px] text-slate-400 mt-1">Appends new responses</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-200/70 rounded-xl text-xs text-blue-900 space-y-1">
              <p className="font-semibold">
                {isNative
                  ? 'Native Response Flow Active:'
                  : 'Application Response Synchronization Flow:'}
              </p>
              <p className="text-[11px] text-blue-800/90 leading-relaxed">
                {isNative
                  ? 'When students submit the Google Form, responses automatically stream directly into the connected Google Sheet via native Google Forms destination.'
                  : 'Click "Sync Responses Now" to fetch submitted responses from the official Google Forms API and append them into the formatted Google Sheet. Duplicate submissions are automatically detected and skipped.'}
              </p>
            </div>
          </div>

          {/* Standard 8 BCE Evaluation Parameters */}
          {/* Form Questions & Structure */}
          <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Form Structure & Questionnaire (11 Fields)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Student identification, 8-parameter rating scale, and optional suggestion box.
                </p>
              </div>
              <span className="px-2 py-0.5 bg-blue-50 text-bce-cobalt text-[10px] font-bold rounded border border-blue-200">
                11 Fields Active
              </span>
            </div>

            {/* Identification Fields */}
            <div className="p-3 sm:p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950">Student Identification</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-800 font-semibold">Required *</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white rounded-lg border border-blue-100/80">
                  <span className="font-bold text-slate-800">Student Name</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">Short text (Official college records)</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-blue-100/80">
                  <span className="font-bold text-slate-800">University Registration Number</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">Short text (University / Roll number)</p>
                </div>
              </div>
            </div>

            {/* 8 Rating Parameters */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs font-bold text-slate-800">8 Faculty Evaluation Parameters</span>
                <span className="text-[10px] text-slate-500 font-medium">5-Point Rating Scale (Required)</span>
              </div>
              {BCE_FEEDBACK_PARAMETERS.map(param => (
                <div
                  key={param.id}
                  className="p-2.5 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-800">
                      {param.id}. {param.title}
                    </div>
                    {param.description && (
                      <div className="text-[11px] text-slate-500 mt-0.5">{param.description}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {param.options.map(opt => (
                      <span
                        key={opt}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Optional Suggestions */}
            <div className="p-2.5 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800">Comments / Suggestions</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-200 text-slate-600 font-medium">Optional</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Long-form paragraph for student suggestions, observations, and constructive remarks.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-600 shrink-0">
                Paragraph Text
              </span>
            </div>
          </div>
        </div>

        {/* Right Col: Academic Metadata & Audit Trail */}
        <div className="space-y-4 sm:space-y-6">
          {/* Academic Details Card */}
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 sm:space-y-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-bce-cobalt" />
              Academic Assignment Details
            </h4>

            <div className="space-y-2 text-xs text-slate-700">
              {form.form_type === 'SEMESTER_FEEDBACK' ? (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Scope:</span>
                    <span className="font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded">Multi-Faculty Semester</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Branch:</span>
                    <span className="font-semibold text-slate-900">{form.branch?.name || '—'} ({form.branch?.code})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Semester:</span>
                    <span className="font-semibold text-slate-900">{form.semester?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Academic Session:</span>
                    <span className="font-semibold text-slate-900">{form.academic_year?.name || '—'}</span>
                  </div>
                  <div className="py-1">
                    <span className="text-slate-400 block mb-1">Evaluated Courses ({form.items?.length || 0}):</span>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(form.items || []).map((it, idx) => (
                        <div key={idx} className="p-1.5 bg-slate-50 rounded text-[11px] flex justify-between">
                          <span className="font-medium text-slate-800">{it.grid_title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Faculty:</span>
                    <span className="font-bold text-slate-900">{form.faculty?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Designation:</span>
                    <span>{form.faculty?.designation || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Department:</span>
                    <span>{form.faculty?.department || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Subject:</span>
                    <span className="font-semibold text-slate-900">{form.subject?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Subject Code:</span>
                    <span className="font-mono text-slate-800">{form.subject?.code || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Branch:</span>
                    <span>{form.branch?.name || '—'} ({form.branch?.code})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Semester:</span>
                    <span>{form.semester?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Academic Session:</span>
                    <span className="font-semibold">{form.academic_year?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Form Type:</span>
                    <span className="font-mono text-[11px] font-semibold">{form.form_type}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Form Timestamps Card */}
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5 sm:space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-bce-cobalt" />
              Lifecycle Timestamps
            </h4>

            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Created:</span>
                <span>{formatDateTimeFull(form.created_at, hydrated)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Published:</span>
                <span>{form.published_at ? formatDateTimeFull(form.published_at, hydrated) : 'Not published'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Closed:</span>
                <span>{form.closed_at ? formatDateTimeFull(form.closed_at, hydrated) : 'Not closed'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Archived:</span>
                <span>{form.archived_at ? formatDateTimeFull(form.archived_at, hydrated) : 'Not archived'}</span>
              </div>
            </div>
          </div>

          {/* Form Audit Trail */}
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5 sm:space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-bce-cobalt" />
              Form Audit Trail ({auditLogs.length})
            </h4>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No audit logs recorded for this form.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {auditLogs.map(log => (
                  <div key={log.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 font-mono text-[10px]">{log.action}</span>
                      <span className="text-[9px] text-slate-400">
                        {formatTime(log.created_at, hydrated)}
                      </span>
                    </div>
                    {log.details && <p className="text-slate-600">{log.details}</p>}
                    <span className="text-[9px] text-slate-400 font-mono block">By: {log.actor_email || 'System'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
