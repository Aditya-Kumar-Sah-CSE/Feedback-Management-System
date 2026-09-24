'use client';

import Link from 'next/link';
import { AlertCircle, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-2.5 sm:p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-5 sm:p-8 text-center space-y-4 sm:space-y-6">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl mx-auto flex items-center justify-center border border-amber-200">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">404 - Page Not Found</h1>
          <p className="text-sm text-slate-600">
            The page you are looking for does not exist, or the server has recently reloaded with new updates.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-bce-navy text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Home className="w-4 h-4" />
            <span>Go to Home</span>
          </Link>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Reload Page</span>
          </button>
        </div>
      </div>
    </div>
  );
}
