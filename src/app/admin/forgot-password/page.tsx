'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { School, Mail, ArrowRight, ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const supabase = createClient();

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMsg('');
    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      // Support dynamic origin (localhost:3000 in dev or production domain)
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectTo = `${origin}/auth/callback?next=/admin/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      // Security: Prevent account enumeration. If Supabase rate limit is active (HTTP 429),
      // inform the user about the cooldown window.
      if (error) {
        if (
          error.status === 429 ||
          error.code === 'over_email_send_rate_limit' ||
          error.message.toLowerCase().includes('rate limit')
        ) {
          setErrorMsg('Email rate limit reached for this address. Supabase enforces a cooldown period between reset emails. Please wait a few minutes before requesting another link.');
          setIsLoading(false);
          return;
        }
      }

      // Mark as submitted and show enumeration-safe success message
      setIsSubmitted(true);
    } catch {
      // Always maintain safe response on unexpected errors
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-950 via-bce-navy to-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-bce-cobalt to-amber-500 p-0.5 shadow-xl flex items-center justify-center">
          <div className="w-full h-full bg-bce-navy rounded-2xl flex items-center justify-center">
            <School className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        <h2 className="mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Reset Admin Password
        </h2>
        <p className="mt-1.5 text-xs text-slate-400 font-medium">
          Institutional Feedback Platform • Password Recovery
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-4 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/60">
          {isSubmitted ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Check Your Email</h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  If an account exists for this email, a password reset link has been sent.
                  Please check your inbox and spam folders, then follow the instructions to set your new password.
                </p>
              </div>
              <div className="pt-3">
                <Link
                  href="/admin/login"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-900 text-xs font-semibold text-slate-200 hover:text-white transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to Admin Login</span>
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleResetRequest}>
              <p className="text-xs text-slate-300 leading-relaxed">
                Enter your registered administrator email address. We will send a secure password reset link to your inbox.
              </p>

              {errorMsg && (
                <div className="p-3.5 bg-red-950/60 border border-red-800/70 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              <div>
                <label htmlFor="admin-reset-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Administrator Email
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="admin-reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@bce.ac.in or authorized email"
                    className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 min-h-[44px] border border-transparent rounded-xl shadow-md text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Reset Link...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Password Reset Link</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="pt-4 border-t border-slate-700/60 text-center">
                <Link
                  href="/admin/login"
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Admin Login</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
