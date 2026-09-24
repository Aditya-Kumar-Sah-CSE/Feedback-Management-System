'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Share2, School, Building2, Check, CheckCircle2, MapPin, Download } from 'lucide-react';
import type { TenantContext } from '@/types/tenant';

interface CollegeGridProps {
  colleges: TenantContext[];
}

export function CollegeGrid({ colleges }: CollegeGridProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);

  const handleShare = async (college: TenantContext) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const tenantUrl = `${origin}/${college.slug}`;

    // 1. Try Web Share API where available
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: college.name,
          text: `Open ${college.name} Feedback Portal`,
          url: tenantUrl,
        });
        return;
      } catch (err: unknown) {
        // If user cancelled / dismissed the native share dialog, don't show copy fallback
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    // 2. Fallback: Copy to clipboard and trigger notification toast
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(tenantUrl);
        setJustCopiedId(college.collegeId);
        setToastMessage(`Link copied for ${college.shortName || college.name}`);

        setTimeout(() => setJustCopiedId(null), 2000);
        setTimeout(() => setToastMessage(null), 2500);
      } catch {
        setToastMessage('Could not copy link to clipboard');
        setTimeout(() => setToastMessage(null), 2500);
      }
    }
  };

  // Empty state when no active colleges exist
  if (!colleges || colleges.length === 0) {
    return (
      <div className="text-center py-16 px-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400 border border-slate-200">
          <Building2 className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">No college portals available</h3>
        <p className="text-sm text-slate-500 mt-1">Please check back later.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
        {colleges.map((college) => {
          const isCopied = justCopiedId === college.collegeId;

          return (
            <div
              key={college.collegeId}
              className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow transition-all duration-200 flex flex-col p-3.5 sm:p-6 text-center group"
            >
              {/* College Logo or Fallback Monogram */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2.5 sm:mb-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center p-2 text-slate-700 overflow-hidden shrink-0">
                {college.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={college.logo}
                    alt={`${college.name} Logo`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-600">
                    <School className="w-6 h-6 text-slate-500 mb-0.5" />
                    <span className="text-[10px] font-bold tracking-tight text-slate-700 uppercase">
                      {(college.shortName || college.code || 'COL').slice(0, 4)}
                    </span>
                  </div>
                )}
              </div>

              {/* College Name */}
              <h2 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors line-clamp-2 min-h-[2.5rem] flex items-center justify-center">
                {college.name}
              </h2>

              {/* Short Code / Name */}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1 mb-1.5 sm:mb-2">
                {college.shortName || college.code}
              </p>

              {/* Optional Location / City */}
              {college.address && (
                <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1 mb-2.5 sm:mb-4 truncate">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{college.address}</span>
                </p>
              )}

              {/* Card Actions */}
              <div className="mt-auto pt-2.5 sm:pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link
                  href={`/${college.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors py-1 group/btn"
                >
                  <span>Open Portal</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                </Link>

                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/${college.slug}?install=true`}
                    className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 group/pwa relative"
                    aria-label={`Install ${college.name} App (PWA)`}
                    title={`Install ${college.shortName || college.name} App (PWA)`}
                  >
                    <Download className="w-4 h-4 group-hover/pwa:scale-110 transition-transform" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleShare(college)}
                    className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    aria-label={`Share ${college.name} portal link`}
                    title={`Share ${college.name} Portal`}
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Clipboard Copy Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs sm:text-sm font-medium shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
