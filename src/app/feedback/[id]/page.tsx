import Link from 'next/link';
import { getPublicFeedbackFormByIdAction } from '@/app/feedback/actions';
import { PublicFeedbackCard } from '@/components/public/PublicFeedbackCard';
import { School, ArrowLeft, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';


export const dynamic = 'force-dynamic';

export default async function DirectFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPublicFeedbackFormByIdAction(id);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Banner */}
      <div className="bg-bce-navy text-white text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4 border-b border-bce-cobalt/40">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-1 sm:gap-2 text-center sm:text-left">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">Government of Bihar | Department of Science, Technology & Technical Education</span>
          </div>
          <Link href="/feedback" className="text-slate-300 hover:text-white flex items-center gap-1 text-[10px] sm:text-xs shrink-0">
            <ArrowLeft className="w-3 h-3" /> All Feedback Forms
          </Link>
        </div>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-xs sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex justify-between items-center gap-2">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-bce-navy to-bce-cobalt text-amber-400 flex items-center justify-center font-bold text-base sm:text-lg shadow-md border border-bce-cobalt/50 shrink-0">
              <School className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-bce-navy truncate">
                Bhagalpur College of Engineering
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                Official Student Feedback Portal
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 sm:px-3 py-1.5 rounded-full border border-emerald-200 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>100% Anonymous</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        <div>
          <Link
            href="/feedback"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-bce-cobalt mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Feedback Discovery</span>
          </Link>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Direct Faculty Evaluation Link
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Official feedback form designated for your specific course curriculum.
          </p>
        </div>

        {!result.success || !result.form ? (
          <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Feedback Form Unavailable</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                {result.message || 'This feedback form is no longer available or the link is invalid.'}
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/feedback"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-bce-cobalt hover:bg-bce-navy text-white rounded-xl text-xs font-bold transition-colors"
              >
                <span>Browse Available Feedback Forms</span>
              </Link>
            </div>
          </div>
        ) : (
          <PublicFeedbackCard
            form={result.form}
            isClosed={result.status === 'CLOSED'}
          />
        )}

        {/* View More Feedback Forms Callout at end of form */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <School className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Need to submit feedback for another course?
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Explore all active feedback forms available for your institution.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
            <Link
              href="/feedback"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <span>View More Forms</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-bce-navy text-slate-400 text-xs py-6 px-4 border-t border-bce-cobalt/30 mt-auto">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-center sm:text-left">
          <div>
            <span>Bhagalpur College of Engineering (BCE Bhagalpur) • Sabour, Bhagalpur</span>
            <div className="text-[11px] text-slate-400 mt-1">
              Designed & Developed by{' '}
              <a
                href="https://portfolio-two-ashen-zseywond41.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline font-medium"
              >
                Aditya Kumar Sah
              </a>
              {' '}•{' '}
              <a
                href="https://portfolio-two-ashen-zseywond41.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-200 hover:underline transition-colors"
              >
                Developer Portfolio
              </a>
              {' '}under the guidance of{' '}
              <a
                href="https://www.bcebhagalpur.ac.in/faculty/abhinav-kumar/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline font-medium"
              >
                Dr. Abhinav Kumar
              </a>
              {' '}(Assistant Professor)
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/feedback" className="text-slate-300 hover:text-white transition-colors">
              All Forms
            </Link>
            <span className="text-slate-600">•</span>
            <Link href="/admin/login" className="text-amber-400 hover:underline">
              Admin Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
