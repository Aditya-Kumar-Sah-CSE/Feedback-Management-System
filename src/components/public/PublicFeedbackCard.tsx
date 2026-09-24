'use client';

import { useState } from 'react';
import { PublicFormSummary } from '@/app/feedback/actions';
import {
  ExternalLink,
  Ban,
  Copy,
  Check,
  GraduationCap,
  BookOpen,
  User,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ExternalActionLink } from '@/components/ui/ExternalActionLink';


interface Props {
  form: PublicFormSummary;
  isClosed?: boolean;
}

export function PublicFeedbackCard({ form, isClosed }: boolean extends never ? any : Props) {
  const [copied, setCopied] = useState(false);

  const directLink = typeof window !== 'undefined'
    ? `${window.location.origin}/feedback/${form.id}`
    : `/feedback/${form.id}`;

  const handleCopy = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(directLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closed = isClosed || form.status === 'CLOSED';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:border-bce-cobalt/40 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Top Banner Accent */}
      <div className={`h-2.5 w-full ${closed ? 'bg-amber-500' : 'bg-gradient-to-r from-bce-navy via-bce-cobalt to-indigo-600'}`} />

      <div className="p-3.5 sm:p-7 space-y-3.5 sm:space-y-6">
        {/* Status & Privacy Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 sm:pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {closed ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Ban className="w-3.5 h-3.5 text-amber-700" />
                Submissions Closed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Published & Active
              </span>
            )}
            <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-slate-100 text-slate-600">
              {form.form_type === 'FACULTY_SPECIFIC' ? 'Faculty Evaluation' : 'Department Course Feedback'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>100% Anonymous Evaluation</span>
          </div>
        </div>

        {/* Faculty & Subject Details */}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Faculty Member
            </span>
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 text-bce-cobalt flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                <User className="w-5 h-5 sm:w-6 sm:h-6 text-bce-cobalt" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-xl leading-tight">
                  {form.faculty?.name || 'Faculty Member'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {form.faculty?.designation || 'Faculty'} • Department of {form.faculty?.department || form.branch?.name || 'Engineering'}
                </p>
              </div>
            </div>
          </div>

          {/* Academic Scope Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1 sm:pt-2">
            <div className="p-2.5 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5 sm:gap-3">
              <BookOpen className="w-4 h-4 text-bce-cobalt shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block">Course Subject</span>
                <span className="font-bold text-xs text-slate-900 block">
                  {form.subject?.name || 'Subject'}
                </span>
                {form.subject?.code && (
                  <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200 inline-block mt-0.5">
                    {form.subject.code}
                  </span>
                )}
              </div>
            </div>

            <div className="p-2.5 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5 sm:gap-3">
              <GraduationCap className="w-4 h-4 text-bce-cobalt shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block">Department & Cohort</span>
                <span className="font-bold text-xs text-slate-900 block">
                  {form.branch?.name || 'Branch'} ({form.branch?.code || ''})
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-500 block">
                  {form.semester?.name || 'Semester'} • {form.academic_year?.name || 'Session'}
                </span>
              </div>
            </div>
          </div>

          {/* Academic 8-Parameter Info Pill */}
          <div className="p-2.5 sm:p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-950 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-bce-cobalt shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-[11px] sm:text-[12px]">Standard 8-Parameter Academic Evaluation</p>
              <p className="text-[10.5px] sm:text-[11px] text-blue-900/80 leading-relaxed">
                Includes syllabus covered, communication skills, teaching effectiveness, teacher accessibility, willingness to help, evaluation fairness, and overall rating.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Action Area */}
        <div className="pt-2 sm:pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors w-full sm:w-auto justify-center"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'Link Copied' : 'Share Direct Form Link'}</span>
          </button>

          {closed ? (
            <div className="w-full sm:w-auto text-center sm:text-right">
              <span className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-slate-200 text-slate-500 rounded-xl font-bold text-xs sm:text-sm cursor-not-allowed">
                <Ban className="w-4 h-4" />
                Submissions Closed
              </span>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">This feedback form has concluded.</p>
            </div>
          ) : form.google_form_url ? (
            <ExternalActionLink
              href={form.google_form_url}
              openingText="Opening Form..."
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 bg-gradient-to-r from-bce-cobalt to-indigo-600 hover:from-bce-navy hover:to-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md hover:shadow-lg active:scale-98"
            >
              <span>Open Feedback Form</span>
              <ExternalLink className="w-4 h-4" />
            </ExternalActionLink>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs">
              Google Form responder URL is not available. Please contact administration.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
