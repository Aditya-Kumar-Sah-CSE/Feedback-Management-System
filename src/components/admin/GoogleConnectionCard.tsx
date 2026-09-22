'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { disconnectCollegeGoogleAction } from '@/lib/google/actions';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  LogOut,
  ExternalLink,
  Loader2,
  Mail,
  Calendar,
  ShieldCheck,
} from 'lucide-react';

export interface GoogleConnectionCardProps {
  collegeId: string;
  collegeName: string;
  status: {
    connected: boolean;
    accountEmail?: string | null;
    accountName?: string | null;
    connectedAt?: string | null;
    status?: string;
    scopes?: string[];
  };
}

export function GoogleConnectionCard({
  collegeId,
  collegeName,
  status,
}: GoogleConnectionCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const isConnected = status.connected && status.status === 'CONNECTED';
  const isInvalid = status.status === 'INVALID' || status.status === 'EXPIRED';

  const handleConnect = () => {
    setActionError(null);
    const returnTo = encodeURIComponent(pathname || '/admin/dashboard');
    window.location.href = `/api/auth/google?collegeId=${encodeURIComponent(collegeId)}&returnTo=${returnTo}`;
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        `Are you sure you want to disconnect Google Workspace for ${collegeName}?\n\nExisting forms and spreadsheets will remain in Drive, but automated form generation and response sync will be paused until reconnected.`
      )
    ) {
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await disconnectCollegeGoogleAction(collegeId);
      if (res.success) {
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to disconnect Google connection.');
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 shadow-xs backdrop-blur-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Google Workspace Connection
              {isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </span>
              )}
              {isInvalid && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="h-3 w-3" />
                  Reconnection Required
                </span>
              )}
              {!isConnected && !isInvalid && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-600/30">
                  <XCircle className="h-3 w-3" />
                  Not Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Institutional Google account for Forms, Sheets, and Drive integrations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Re-authorize Google Workspace credentials"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reconnect
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                title="Disconnect Google account for this college"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Connect Google Workspace
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-300 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="mt-4 text-xs">
        {isConnected ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 p-3">
              <span className="text-slate-400 flex items-center gap-1.5 mb-1 text-[11px]">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                Connected Account
              </span>
              <p className="font-semibold text-slate-100 truncate text-xs">
                {status.accountEmail || 'Account Email Unavailable'}
              </p>
              {status.accountName && (
                <p className="text-[11px] text-slate-400 truncate">{status.accountName}</p>
              )}
            </div>

            <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 p-3">
              <span className="text-slate-400 flex items-center gap-1.5 mb-1 text-[11px]">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Connected Date
              </span>
              <p className="font-semibold text-slate-100 text-xs">
                {status.connectedAt
                  ? new Date(status.connectedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </p>
              <p className="text-[11px] text-emerald-400">Authorized for {collegeName}</p>
            </div>

            <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 p-3">
              <span className="text-slate-400 flex items-center gap-1.5 mb-1 text-[11px]">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                Tenant Isolation
              </span>
              <p className="font-semibold text-emerald-400 text-xs">College-Owned Credential</p>
              <p className="text-[11px] text-slate-400">Forms & Sheets belong to {collegeName}</p>
            </div>
          </div>
        ) : isInvalid ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-amber-200">
            <p className="font-medium text-xs mb-1">
              Google account connection for {collegeName} needs reconnection.
            </p>
            <p className="text-[11px] text-amber-300/80">
              The Google OAuth grant has expired or was revoked. Click &quot;Connect Google Workspace&quot; above to re-authorize this college.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-800/30 border border-slate-700/30 p-3.5 text-slate-300">
            <p className="font-medium text-xs mb-1 text-slate-200">
              Google account not connected for {collegeName}.
            </p>
            <p className="text-[11px] text-slate-400">
              Connect an institutional Google Workspace account to generate Google Forms, stream responses into institutional Google Spreadsheets, and manage response synchronization for this college.
            </p>
          </div>
        )}

        {/* OAuth Test User Guidance Banner for Super Admin */}
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200">
          <div className="flex items-center gap-2 font-bold text-amber-300 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Google OAuth Test User Guidance (Testing Mode)</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
            The Google OAuth app is currently in <strong>TESTING</strong> mode. Google only permits authorizations from accounts explicitly registered in your Google Cloud Console test users list.
          </p>
          <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono text-amber-300">
            Google Cloud Console &rarr; Google Auth Platform &rarr; Audience &rarr; Test users
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Before clicking <strong className="text-white">Connect Google Workspace</strong>, ensure the intended institutional Google account for {collegeName} is manually added to the Test Users list above.
          </p>
        </div>
      </div>
    </div>
  );
}
