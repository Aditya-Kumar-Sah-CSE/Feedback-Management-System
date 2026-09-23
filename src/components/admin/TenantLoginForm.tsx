'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import { createClient } from '@/lib/supabase/client';
import { Lock, Mail, ArrowRight, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';

interface TenantLoginFormProps {
  collegeId?: string;
  collegeSlug?: string;
  collegeName?: string;
  collegeCode?: string;
  isTenantSpecific?: boolean;
}

export function TenantLoginForm({
  collegeId,
  collegeSlug,
  collegeName,
  collegeCode,
  isTenantSpecific = false,
}: TenantLoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const redirectParam = searchParams.get('redirect') || searchParams.get('returnTo');
  const queryError = searchParams.get('error');
  const queryReset = searchParams.get('reset');

  // Validate and sanitize destination route
  const targetDestination =
    redirectParam && redirectParam.startsWith('/admin') && !redirectParam.startsWith('//')
      ? redirectParam
      : '/admin/dashboard';

  const initialNotice = queryReset === 'success'
    ? 'Password reset successfully! Please sign in with your new password.'
    : '';
  const initialError = queryError || '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError || !authData.user) {
        const rawMsg = (authError?.message || '').toLowerCase();
        if (rawMsg.includes('invalid login credentials') || rawMsg.includes('invalid grant')) {
          setErrorMsg('Invalid email or password. Please verify your credentials or reset your password.');
        } else if (rawMsg.includes('email not confirmed')) {
          setErrorMsg('Email address not confirmed. Please check your inbox for the confirmation link or contact your platform administrator.');
        } else if (rawMsg.includes('user disabled') || rawMsg.includes('account disabled')) {
          setErrorMsg('Your administrator account has been disabled. Please contact the Super Admin.');
        } else {
          setErrorMsg(authError?.message || 'Authentication failed. Please verify your credentials.');
        }
        setIsLoading(false);
        return;
      }

      // 2. Validate session and tenant authorization server-side
      const verifyRes = await fetch('/api/admin/verify-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCollegeId: collegeId || undefined,
          targetCollegeSlug: collegeSlug || undefined,
        }),
      });

      const verifyData = await verifyRes.json();

      // If user does not have permission for this specific college
      if (verifyRes.status === 403 || verifyData.authorizedForCollege === false) {
        setErrorMsg(
          verifyData.error ||
          (isTenantSpecific
            ? `You do not have administrator access to ${collegeName || 'this institution'}.`
            : 'You do not have administrator access to this institution.')
        );
        // Revoke client session so cross-tenant access is completely prevented
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      if (!verifyRes.ok || !verifyData.isAuthenticated) {
        setErrorMsg(verifyData.error || 'Authentication verification failed on server.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // Handle pending request status
      if (verifyData.isPending) {
        router.push('/admin/pending');
        router.refresh();
        return;
      }

      // Handle rejected request status
      if (verifyData.isRejected) {
        setErrorMsg('Your administrator access request has been rejected by the administrator.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // Handle inactive account status
      if (!verifyData.isActive) {
        setErrorMsg('Your administrator account is inactive. Please contact the Super Admin.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // User is verified and authorized - use window.location.href to guarantee fresh session cookies
      window.location.href = targetDestination;
      return;
    } catch (err: unknown) {
      console.error('Login error:', err);
      setErrorMsg('An unexpected error occurred during login. Please try again.');
      setIsLoading(false);
    }
  };

  const signupUrl = collegeSlug
    ? `/admin/signup?college=${encodeURIComponent(collegeSlug)}`
    : collegeId
    ? `/admin/signup?college=${encodeURIComponent(collegeId)}`
    : '/admin/signup';

  const backPortalUrl = collegeSlug ? `/${collegeSlug}` : '/';

  return (
    <div className="bg-slate-800/90 backdrop-blur-md py-8 px-4 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/60">
      <form className="space-y-5" onSubmit={handleLogin}>
        {(errorMsg || initialError) && (
          <div className="p-3.5 bg-red-950/60 border border-red-800/70 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg || initialError}</span>
          </div>
        )}

        {(successMsg || initialNotice) && (
          <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/70 rounded-xl text-emerald-200 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successMsg || initialNotice}</span>
          </div>
        )}

        <div>
          <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Administrator Email
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isTenantSpecific && collegeCode ? `admin@${collegeCode.toLowerCase()}.edu or authorized email` : 'admin@institution.edu or authorized email'}
              className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        <div>
          <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Password
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="admin-password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
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
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <div className="text-center pt-1">
          <Link
            href="/admin/forgot-password"
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
          >
            Forgot password?
          </Link>
        </div>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <Link
          href={signupUrl}
          className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
        >
          Request Admin Access →
        </Link>

        <Link
          href={backPortalUrl}
          className="text-slate-400 hover:text-slate-300 transition-colors"
        >
          {isTenantSpecific ? `← Back to ${collegeCode || 'College'} Portal` : '← Back to Home'}
        </Link>
      </div>
    </div>
  );
}
