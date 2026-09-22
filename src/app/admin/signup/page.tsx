'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import { createClient } from '@/lib/supabase/client';
import {
  School,
  Building2,
  User,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';

function AdminSignupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [colleges, setColleges] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    async function loadColleges() {
      const { data } = await supabase
        .from('colleges')
        .select('id, name, code, slug')
        .eq('is_active', true)
        .order('name');
      if (data && data.length > 0) {
        setColleges(data);
        const collegeParam = searchParams.get('college')?.toLowerCase().trim();
        if (collegeParam) {
          const matched = data.find(
            (c: any) => c.slug?.toLowerCase() === collegeParam || c.id === collegeParam || c.code?.toLowerCase() === collegeParam
          );
          if (matched) {
            setSelectedCollegeId(matched.id);
            return;
          }
        }
        if (data.length === 1) {
          setSelectedCollegeId(data[0].id);
        }
      }
    }
    loadColleges();
  }, [supabase, searchParams]);

  const redirectParam = searchParams.get('redirect');
  const targetDestination =
    redirectParam && redirectParam.startsWith('/admin')
      ? redirectParam
      : '/admin/dashboard';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCollegeId) {
      setErrorMsg('Please select your institution.');
      return;
    }

    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Register with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            name,
          },
        },
      });

      const currentUserId = authData?.user?.id;
      if (authError && !authError.message.toLowerCase().includes('already registered')) {
        setErrorMsg(authError.message);
        setIsLoading(false);
        return;
      }

      // 2. Submit pending request via Server Action or API
      const reqRes = await fetch('/api/admin/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          name,
          email: cleanEmail,
          password,
          collegeId: selectedCollegeId,
        }),
      });

      const reqData = await reqRes.json();

      if (!reqRes.ok) {
        setErrorMsg(reqData.error || 'Failed to submit admin request.');
        setIsLoading(false);
        return;
      }

      // 3. If auto-promoted (Super Admin)
      if (reqData.isSuperAdmin) {
        router.push(targetDestination);
        router.refresh();
        return;
      }

      // 4. If request is already pending
      if (reqData.alreadyPending) {
        setSuccessMsg(
          reqData.message ||
            'Your administrator access request is already registered and pending approval.'
        );
        setTimeout(() => {
          router.push('/admin/pending');
        }, 1500);
        return;
      }

      // 5. Standard pending notification
      setSuccessMsg(
        'Your request for administrator access has been registered and is pending approval.'
      );
      setTimeout(() => {
        router.push('/admin/pending');
      }, 1500);
    } catch (err: unknown) {
      console.error('Signup error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred during request submission.';
      setErrorMsg(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/90 backdrop-blur-md py-8 px-4 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/60">
      <form className="space-y-4" onSubmit={handleSignup}>
        {errorMsg && (
          <div className="p-3.5 bg-red-950/60 border border-red-800/70 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/70 rounded-xl text-emerald-200 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Institution Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Target Institution / College
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Building2 className="w-4 h-4" />
            </div>
            <select
              required
              value={selectedCollegeId}
              onChange={(e) => setSelectedCollegeId(e.target.value)}
              className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all cursor-pointer"
            >
              <option value="" disabled>Select your institution...</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Full Name
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prof. / Dr. / First Last"
              className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Institutional Email
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="faculty@bce.ac.in"
              className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
          </div>
        </div>


        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative rounded-xl shadow-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-base sm:text-sm min-h-[44px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 focus:outline-none transition-colors cursor-pointer"
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/50 text-[11px] text-slate-400">
          ℹ️ New admin registrations require approval from the Super Admin before dashboard access is granted.
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
                <span>Submitting Request...</span>
              </>
            ) : (
              <>
                <span>Submit Admin Request</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <Link
          href={redirectParam ? `/admin/login?redirect=${encodeURIComponent(redirectParam)}` : '/admin/login'}
          className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
        >
          Already have an account? Sign In →
        </Link>

        <Link
          href="/"
          className="text-slate-400 hover:text-slate-300 transition-colors"
        >
          ← Back to Student Portal
        </Link>
      </div>
    </div>
  );
}

export default function AdminSignupPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-950 via-bce-navy to-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-bce-cobalt to-amber-500 p-0.5 shadow-xl flex items-center justify-center">
          <div className="w-full h-full bg-bce-navy rounded-2xl flex items-center justify-center">
            <School className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        <h2 className="mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Request Admin Access
        </h2>
        <p className="mt-1.5 text-xs text-slate-400 font-medium">
          Institutional Feedback Platform • Administrator Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Suspense
          fallback={
            <div className="bg-slate-800/90 py-12 px-6 rounded-2xl border border-slate-700/60 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
              <p className="text-xs text-slate-400">Loading registration form...</p>
            </div>
          }
        >
          <AdminSignupForm />
        </Suspense>
      </div>
    </div>
  );
}
