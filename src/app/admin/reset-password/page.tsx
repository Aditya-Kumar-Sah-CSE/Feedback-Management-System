'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import { createClient } from '@/lib/supabase/client';
import { School, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Loader2, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function AdminResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let isMounted = true;

    async function verifyRecoverySession() {
      try {
        // 1. Check existing session established by callback route or cookies
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isMounted) {
          setHasValidSession(true);
          setIsCheckingSession(false);
          return;
        }

        // 2. Listen for PASSWORD_RECOVERY event in case of client hash flow
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          if (!isMounted) return;
          if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
            setHasValidSession(true);
            setIsCheckingSession(false);
          }
        });

        // Give client listener a short grace period
        setTimeout(() => {
          if (isMounted) {
            setIsCheckingSession(false);
          }
        }, 1200);

        return () => {
          authListener?.subscription?.unsubscribe();
        };
      } catch {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    verifyRecoverySession();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters in length.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify and re-enter.');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMsg(error.message || 'Failed to update password. Please try again.');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('Your password has been successfully reset! Redirecting to login...');
      
      // Sign out to enforce clean login with new credentials
      await supabase.auth.signOut();

      setTimeout(() => {
        router.push('/admin/login?reset=success');
      }, 2000);
    } catch {
      setErrorMsg('An unexpected error occurred while resetting your password.');
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
          Create New Password
        </h2>
        <p className="mt-1.5 text-xs text-slate-400 font-medium">
          Institutional Feedback Platform • Password Recovery
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-4 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/60">
          {isCheckingSession ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
              <p className="text-xs text-slate-400">Verifying secure recovery token...</p>
            </div>
          ) : !hasValidSession ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Invalid or Expired Link</h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  This password reset link is invalid, has expired, or has already been used. Please request a new link to proceed.
                </p>
              </div>
              <div className="pt-3">
                <Link
                  href="/admin/forgot-password"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 min-h-[44px] rounded-xl shadow-md text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Request New Reset Link</span>
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSetNewPassword}>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Choose a strong password for your administrator account.</span>
              </div>

              {errorMsg && (
                <div className="p-3.5 bg-red-950/60 border border-red-800/70 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/70 rounded-xl text-emerald-200 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{successMsg}</span>
                </div>
              )}

              <div>
                <label htmlFor="admin-new-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  New Password
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="admin-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="admin-confirm-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Confirm Password
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="admin-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !!successMsg}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 min-h-[44px] border border-transparent rounded-xl shadow-md text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <span>Set New Password & Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="pt-3 text-center">
                <Link
                  href="/admin/login"
                  className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                >
                  ← Back to Admin Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
