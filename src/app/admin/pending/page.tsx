'use client';

import { useState } from 'react';
import { useAppRouter as useRouter } from '@/lib/hooks/use-app-router';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Clock, ShieldAlert, LogOut, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function AdminPendingPage() {
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const checkStatus = async () => {
    setIsChecking(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/verify-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (data.isSuperAdmin || (data.isApproved && data.isActive)) {
        setStatusMessage('Congratulations! Your account has been approved.');
        setTimeout(() => {
          router.push('/admin/dashboard');
          router.refresh();
        }, 1000);
      } else if (data.isRejected) {
        setStatusMessage('Your request has been reviewed and rejected by the administration.');
      } else {
        setStatusMessage('Your request is still awaiting approval by an authorized administrator.');
      }
    } catch {
      setStatusMessage('Unable to verify status at this moment.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-950 via-bce-navy to-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-lg">
          <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
        </div>

        <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
          Admin Access Pending
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Institutional Feedback Platform • Administrator Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-4 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/60 text-center space-y-6">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 text-left space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <ShieldAlert className="w-4 h-4" />
              <span>Awaiting Authorization</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your registration has been received and is in the <strong>PENDING</strong> review queue.
              To maintain academic integrity and data security, only approved and active institutional administrators are permitted to enter the dashboard.
            </p>
          </div>

          {statusMessage && (
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 text-xs text-amber-300 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              onClick={checkStatus}
              disabled={isChecking}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking Status...' : 'Check Approval Status'}</span>
            </button>

            <button
              onClick={handleSignOut}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-semibold text-slate-300 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-700/60 text-xs text-slate-400">
            <Link href="/" className="hover:text-amber-400 transition-colors">
              ← Return to Student Public Discovery
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
