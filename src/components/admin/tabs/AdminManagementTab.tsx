'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveAdminRequestAction,
  rejectAdminRequestAction,
  revokeAdminAccessAction,
  reactivateAdminAccessAction,
  promoteAdminToSuperAdminAction,
  demoteSuperAdminToAdminAction,
} from '@/app/admin/actions';
import {
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  Building2,
  ShieldPlus,
  Sparkles,
} from 'lucide-react';
import type { Admin, AdminRequest } from '@/types/database';
import { useHydrated, formatDateShort, formatTime } from '@/lib/hooks/use-hydrated';
import { isPrimarySuperAdmin } from '@/lib/auth/admin-auth-shared';

interface Props {
  adminRequests: AdminRequest[];
  adminsList: Admin[];
  isSuperAdmin: boolean;
  currentUserEmail: string;
}

export function AdminManagementTab({
  adminRequests,
  adminsList,
  isSuperAdmin,
  currentUserEmail,
}: Props) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [admins, setAdmins] = useState<Admin[]>(adminsList);
  const [requests, setRequests] = useState<AdminRequest[]>(adminRequests);

  useEffect(() => {
    setAdmins(adminsList);
  }, [adminsList]);

  useEffect(() => {
    setRequests(adminRequests);
  }, [adminRequests]);

  const [activeAction, setActiveAction] = useState<{
    id: string;
    type: 'APPROVE' | 'REJECT' | 'REVOKE' | 'REACTIVATE' | 'PROMOTE' | 'DEMOTE';
  } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals for deliberate Super Admin confirmation
  const [revokingAdmin, setRevokingAdmin] = useState<Admin | null>(null);
  const [reactivatingAdmin, setReactivatingAdmin] = useState<Admin | null>(null);
  const [promotingAdmin, setPromotingAdmin] = useState<Admin | null>(null);
  const [demotingAdmin, setDemotingAdmin] = useState<Admin | null>(null);
  const [revokeReason, setRevokeReason] = useState<string>('');

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const pastRequests = requests.filter((r) => r.status !== 'PENDING');

  const confirmPromoteAdmin = () => {
    if (!promotingAdmin) return;
    const targetId = promotingAdmin.user_id || promotingAdmin.id;
    const email = promotingAdmin.email;
    const name = promotingAdmin.name;
    setActiveAction({ id: promotingAdmin.id, type: 'PROMOTE' });
    setMessage(null);

    startTransition(async () => {
      try {
        const res = await promoteAdminToSuperAdminAction(targetId);
        if (res.success) {
          // Immediately update local state without requiring manual refresh
          setAdmins((prev) =>
            prev.map((a) =>
              a.id === promotingAdmin.id || a.user_id === targetId
                ? { ...a, role: 'SUPER_ADMIN' }
                : a
            )
          );
          setMessage({
            type: 'success',
            text: `Successfully promoted ${name} (${email}) to Platform Super Admin.`,
          });
          router.refresh();
        } else {
          setMessage({
            type: 'error',
            text: res.error || 'Failed to promote administrator to Super Admin.',
          });
        }
      } catch (err: any) {
        setMessage({
          type: 'error',
          text: err.message || 'An unexpected error occurred during promotion.',
        });
      } finally {
        setActiveAction(null);
        setPromotingAdmin(null);
      }
    });
  };

  const confirmDemoteAdmin = () => {
    if (!demotingAdmin) return;
    const targetId = demotingAdmin.user_id || demotingAdmin.id;
    const email = demotingAdmin.email;
    const name = demotingAdmin.name;
    setActiveAction({ id: demotingAdmin.id, type: 'DEMOTE' });
    setMessage(null);

    startTransition(async () => {
      try {
        const res = await demoteSuperAdminToAdminAction(targetId);
        if (res.success) {
          // Immediately update local state without requiring manual refresh
          setAdmins((prev) =>
            prev.map((a) =>
              a.id === demotingAdmin.id || a.user_id === targetId
                ? { ...a, role: 'ADMIN' }
                : a
            )
          );
          setMessage({
            type: 'success',
            text: `Super Admin privileges removed for ${name} (${email}). Reverted to Admin.`,
          });
          router.refresh();
        } else {
          setMessage({
            type: 'error',
            text: res.error || 'Failed to demote administrator.',
          });
        }
      } catch (err: any) {
        setMessage({
          type: 'error',
          text: err.message || 'An unexpected error occurred during demotion.',
        });
      } finally {
        setActiveAction(null);
        setDemotingAdmin(null);
      }
    });
  };

  const handleApprove = (requestId: string) => {
    setActiveAction({ id: requestId, type: 'APPROVE' });
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await approveAdminRequestAction(requestId);
        if (res.success) {
          const approvedReq = requests.find((r) => r.id === requestId);
          setRequests((prev) =>
            prev.map((r) => (r.id === requestId ? { ...r, status: 'APPROVED' } : r))
          );
          if (approvedReq) {
            setAdmins((prev) => {
              const exists = prev.some((a) => a.email.toLowerCase() === approvedReq.email.toLowerCase());
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: approvedReq.id,
                  user_id: approvedReq.user_id || approvedReq.id,
                  email: approvedReq.email,
                  name: approvedReq.name,
                  role: 'ADMIN',
                  status: 'ACTIVE',
                  created_at: new Date().toISOString(),
                  college_id: approvedReq.college_id,
                  college: approvedReq.college,
                } as Admin,
              ];
            });
          }
          setMessage({ type: 'success', text: 'Admin request approved successfully.' });
          router.refresh();
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to approve request.' });
        }
      } catch (err: any) {
        setMessage({
          type: 'error',
          text: err.message || 'An unexpected error occurred during approval.',
        });
      } finally {
        setActiveAction(null);
      }
    });
  };

  const handleReject = (requestId: string) => {
    if (!confirm('Are you sure you want to reject this admin request?')) return;
    setActiveAction({ id: requestId, type: 'REJECT' });
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await rejectAdminRequestAction(requestId);
        if (res.success) {
          setRequests((prev) =>
            prev.map((r) => (r.id === requestId ? { ...r, status: 'REJECTED' } : r))
          );
          setMessage({ type: 'success', text: 'Admin request rejected.' });
          router.refresh();
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to reject request.' });
        }
      } catch (err: any) {
        setMessage({
          type: 'error',
          text: err.message || 'An unexpected error occurred during rejection.',
        });
      } finally {
        setActiveAction(null);
      }
    });
  };

  const confirmRevokeAccess = () => {
    if (!revokingAdmin) return;
    const targetId = revokingAdmin.id;
    const email = revokingAdmin.email;
    setActiveAction({ id: targetId, type: 'REVOKE' });
    setMessage(null);

    startTransition(async () => {
      try {
        const res = await revokeAdminAccessAction(targetId, revokeReason.trim() || undefined);
        if (res.success) {
          setMessage({
            type: 'success',
            text: `Administrator access for ${email} has been revoked. The account is now INACTIVE.`,
          });
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to revoke administrator access.' });
        }
      } finally {
        setActiveAction(null);
        setRevokingAdmin(null);
        setRevokeReason('');
      }
    });
  };

  const confirmReactivateAccess = () => {
    if (!reactivatingAdmin) return;
    const targetId = reactivatingAdmin.id;
    const email = reactivatingAdmin.email;
    setActiveAction({ id: targetId, type: 'REACTIVATE' });
    setMessage(null);

    startTransition(async () => {
      try {
        const res = await reactivateAdminAccessAction(targetId);
        if (res.success) {
          setMessage({
            type: 'success',
            text: `Administrator access for ${email} has been restored. The account is now ACTIVE.`,
          });
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to reactivate administrator access.' });
        }
      } finally {
        setActiveAction(null);
        setReactivatingAdmin(null);
      }
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-bce-cobalt" />
            Administrator Access & Authorization
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage admin registration requests, role privileges, and account activation states.
          </p>
        </div>

        {!isSuperAdmin && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Institution Administrator: You can review and approve pending admin requests for your institution. Super Admin privileges are required to promote or demote administrators.</span>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* 1. PENDING REQUESTS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full min-w-0">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <h4 className="text-sm font-bold text-slate-900 truncate">
              Pending Admin Requests ({pendingRequests.length})
            </h4>
          </div>
          <span className="text-xs text-slate-400 shrink-0">
            Awaiting Review
          </span>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No pending admin registration requests at this time.
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100 min-w-0">
              {pendingRequests.map((req) => {
                const isApproving = isPending && activeAction?.id === req.id && activeAction.type === 'APPROVE';
                const isRejecting = isPending && activeAction?.id === req.id && activeAction.type === 'REJECT';

                return (
                  <div key={req.id} className="p-4 space-y-2.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-800 truncate">{req.name}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                        PENDING
                      </span>
                    </div>
                    {req.college && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50/80 px-2.5 py-1 rounded-md border border-amber-200/60">
                        <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-medium truncate">{req.college.name}</span>
                        <span className="text-[10px] text-amber-700 font-mono">({req.college.code})</span>
                      </div>
                    )}
                    <div className="text-xs font-mono text-slate-600 break-all">
                      {req.email}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Requested: {formatDateShort(req.created_at, hydrated)} at {formatTime(req.created_at, hydrated)}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={isPending}
                        aria-busy={isApproving}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors disabled:opacity-50 min-h-[40px] cursor-pointer"
                      >
                        {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>{isApproving ? 'Approving...' : 'Approve'}</span>
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={isPending}
                        aria-busy={isRejecting}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors disabled:opacity-50 min-h-[40px] cursor-pointer"
                      >
                        {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        <span>{isRejecting ? 'Rejecting...' : 'Reject'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto min-w-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Applicant Name</th>
                    <th className="px-5 py-3">Institution</th>
                    <th className="px-5 py-3">Email Address</th>
                    <th className="px-5 py-3">Request Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((req) => {
                    const isApproving = isPending && activeAction?.id === req.id && activeAction.type === 'APPROVE';
                    const isRejecting = isPending && activeAction?.id === req.id && activeAction.type === 'REJECT';

                    return (
                      <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-800">
                          {req.name}
                        </td>
                        <td className="px-5 py-3.5">
                          {req.college ? (
                            <div className="flex items-center gap-1.5 max-w-[220px]">
                              <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-slate-800 truncate" title={req.college.name}>
                                  {req.college.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {req.college.code}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600">
                          {req.email}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {formatDateShort(req.created_at, hydrated)} at{' '}
                          {formatTime(req.created_at, hydrated)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                            PENDING
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={isPending}
                            aria-busy={isApproving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {isApproving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>{isApproving ? 'Approving...' : 'Approve'}</span>
                          </button>

                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={isPending}
                            aria-busy={isRejecting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {isRejecting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            <span>{isRejecting ? 'Rejecting...' : 'Reject'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 2. REGISTERED ADMINISTRATORS DIRECTORY */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full min-w-0">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck className="w-4 h-4 text-bce-cobalt shrink-0" />
            <h4 className="text-sm font-bold text-slate-900 truncate">
              Authorized Administrators ({admins.length})
            </h4>
          </div>
          <span className="text-xs text-slate-400 shrink-0">
            Active & Inactive Accounts
          </span>
        </div>

        {admins.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No administrator accounts configured yet.
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100 min-w-0">
              {admins.map((admin) => {
                const isOperating = isPending && activeAction?.id === admin.id;
                const isPrimary = isPrimarySuperAdmin({ email: admin.email, user_id: admin.user_id, id: admin.id });
                const isSelf = admin.email.toLowerCase() === currentUserEmail.toLowerCase();

                return (
                  <div key={admin.id} className="p-4 space-y-2.5 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-sm text-slate-800 truncate block">
                          {admin.name}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] text-bce-cobalt font-semibold bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                            (Your Current Session)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {admin.role === 'SUPER_ADMIN' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <ShieldCheck className="w-3 h-3" /> SUPER ADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                            ADMIN
                          </span>
                        )}
                        {admin.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                            REVOKED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs font-mono text-slate-600 break-all">
                      {admin.email}
                    </div>

                    {admin.role === 'SUPER_ADMIN' ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50/80 px-2 py-1 rounded-md border border-amber-200/50">
                        <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-semibold text-amber-900">All Institutions (Platform Super Admin)</span>
                      </div>
                    ) : admin.college ? (
                      <div className="flex items-center gap-1.5 text-xs text-blue-900 bg-blue-50/80 px-2 py-1 rounded-md border border-blue-200/50">
                        <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate">{admin.college.name}</span>
                        <span className="text-[10px] text-blue-700 font-mono">({admin.college.code})</span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <span className="text-[11px] text-slate-400">
                        Added: {formatDateShort(admin.created_at, hydrated)}
                      </span>

                      {isSuperAdmin && (
                        isPrimary ? (
                          <span className="text-[10px] text-amber-800 font-semibold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded italic">
                            Primary Super Admin
                          </span>
                        ) : isSelf ? (
                          <span className="text-[10px] text-slate-400 italic">Current Session</span>
                        ) : admin.role === 'ADMIN' ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {admin.status === 'ACTIVE' && (
                              <button
                                onClick={() => setPromotingAdmin(admin)}
                                disabled={isOperating}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs min-h-[36px] cursor-pointer"
                              >
                                {isOperating && activeAction?.type === 'PROMOTE' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldPlus className="w-3.5 h-3.5 text-amber-600" />
                                )}
                                <span>↑ Make Super Admin</span>
                              </button>
                            )}
                            {admin.status === 'ACTIVE' ? (
                              <button
                                onClick={() => {
                                  setRevokingAdmin(admin);
                                  setRevokeReason('');
                                }}
                                disabled={isOperating}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 min-h-[36px] cursor-pointer"
                              >
                                {isOperating && activeAction?.type === 'REVOKE' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UserX className="w-3.5 h-3.5 text-rose-600" />
                                )}
                                <span>Revoke Access</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => setReactivatingAdmin(admin)}
                                disabled={isOperating}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 min-h-[36px] cursor-pointer"
                              >
                                {isOperating && activeAction?.type === 'REACTIVATE' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                                <span>Reactivate</span>
                              </button>
                            )}
                          </div>
                        ) : admin.role === 'SUPER_ADMIN' ? (
                          <button
                            onClick={() => setDemotingAdmin(admin)}
                            disabled={isOperating}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50/80 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 min-h-[36px] cursor-pointer"
                          >
                            {isOperating && activeAction?.type === 'DEMOTE' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 hover:text-rose-600" />
                            )}
                            <span>↓ Demote to Admin</span>
                          </button>
                        ) : null
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto min-w-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Admin Name</th>
                    <th className="px-5 py-3">Institution</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Added Date</th>
                    <th className="px-5 py-3 text-right">Access Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admins.map((admin) => {
                    const isOperating = isPending && activeAction?.id === admin.id;
                    const isPrimary = isPrimarySuperAdmin({ email: admin.email, user_id: admin.user_id, id: admin.id });
                    const isSelf = admin.email.toLowerCase() === currentUserEmail.toLowerCase();

                    return (
                      <tr key={admin.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-800">
                          {admin.name}
                          {isSelf && (
                            <span className="ml-2 text-[10px] text-bce-cobalt font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                              (You)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {admin.role === 'SUPER_ADMIN' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                              <Building2 className="w-3 h-3 text-amber-500" /> All Institutions
                            </span>
                          ) : admin.college ? (
                            <div className="flex items-center gap-1.5 max-w-[220px]">
                              <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-slate-800 truncate" title={admin.college.name}>
                                  {admin.college.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {admin.college.code}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600">
                          {admin.email}
                        </td>
                        <td className="px-5 py-3.5">
                          {admin.role === 'SUPER_ADMIN' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                              <ShieldCheck className="w-3 h-3" /> SUPER ADMIN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
                              ADMIN
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {admin.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                              REVOKED / INACTIVE
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {formatDateShort(admin.created_at, hydrated)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {isSuperAdmin ? (
                            isPrimary ? (
                              <span className="inline-flex items-center text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md italic">
                                Primary Super Admin
                              </span>
                            ) : isSelf ? (
                              <span className="text-[11px] text-slate-400 italic">Current Session</span>
                            ) : admin.role === 'ADMIN' ? (
                              <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                                {admin.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => setPromotingAdmin(admin)}
                                    disabled={isOperating}
                                    title="Promote to Super Admin"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                                  >
                                    {isOperating && activeAction?.type === 'PROMOTE' ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ShieldPlus className="w-3.5 h-3.5 text-amber-600" />
                                    )}
                                    <span>↑ Make Super Admin</span>
                                  </button>
                                )}
                                {admin.status === 'ACTIVE' ? (
                                  <button
                                    onClick={() => {
                                      setRevokingAdmin(admin);
                                      setRevokeReason('');
                                    }}
                                    disabled={isOperating}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                                  >
                                    {isOperating && activeAction?.type === 'REVOKE' ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <UserX className="w-3.5 h-3.5 text-rose-600" />
                                    )}
                                    <span>Revoke Access</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setReactivatingAdmin(admin)}
                                    disabled={isOperating}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                                  >
                                    {isOperating && activeAction?.type === 'REACTIVATE' ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    )}
                                    <span>Reactivate</span>
                                  </button>
                                )}
                              </div>
                            ) : admin.role === 'SUPER_ADMIN' ? (
                              <button
                                onClick={() => setDemotingAdmin(admin)}
                                disabled={isOperating}
                                title="Demote Super Admin to standard Admin"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all bg-amber-50/80 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                              >
                                {isOperating && activeAction?.type === 'DEMOTE' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 hover:text-rose-600" />
                                )}
                                <span>↓ Demote to Admin</span>
                              </button>
                            ) : null
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Restricted</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog: Revoke Admin Access */}
      {revokingAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">
                  Revoke administrator access?
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This administrator will be set to INACTIVE and immediately lose access to all admin portal features.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Administrator:</span>
                <span className="font-semibold text-slate-800">{revokingAdmin.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-700">{revokingAdmin.email}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Reason for revocation (optional):
              </label>
              <input
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g., Role reassignment, suspension"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRevokingAdmin(null)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRevokeAccess}
                disabled={isPending}
                aria-busy={isPending && activeAction?.type === 'REVOKE'}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending && activeAction?.type === 'REVOKE' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Revoking Access...</span>
                  </>
                ) : (
                  <span>Revoke Access</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Reactivate Admin Access */}
      {reactivatingAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">
                  Reactivate admin access?
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Administrator access will be restored immediately for this account.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Administrator:</span>
                <span className="font-semibold text-slate-800">{reactivatingAdmin.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-700">{reactivatingAdmin.email}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReactivatingAdmin(null)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReactivateAccess}
                disabled={isPending}
                aria-busy={isPending && activeAction?.type === 'REACTIVATE'}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending && activeAction?.type === 'REACTIVATE' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reactivating Access...</span>
                  </>
                ) : (
                  <span>Reactivate Access</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PAST REVIEWED REQUESTS HISTORY */}
      {pastRequests.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full min-w-0">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider truncate">
              Reviewed Requests History ({pastRequests.length})
            </h4>
          </div>
          {/* Mobile Cards View */}
          <div className="md:hidden divide-y divide-slate-100 min-w-0">
            {pastRequests.map((req) => (
              <div key={req.id} className="p-3.5 space-y-1.5 text-xs min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800 truncate">{req.name}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      req.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
                {req.college && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Building2 className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate font-medium">{req.college.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({req.college.code})</span>
                  </div>
                )}
                <div className="font-mono text-slate-500 break-all text-[11px]">
                  {req.email}
                </div>
                <div className="text-[10px] text-slate-400">
                  Reviewed: {req.reviewed_at ? formatDateShort(req.reviewed_at, hydrated) : '—'}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto min-w-0">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Institution</th>
                  <th className="px-5 py-2.5">Email</th>
                  <th className="px-5 py-2.5">Decision</th>
                  <th className="px-5 py-2.5">Reviewed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {pastRequests.map((req) => (
                  <tr key={req.id}>
                    <td className="px-5 py-2.5">{req.name}</td>
                    <td className="px-5 py-2.5">
                      {req.college ? (
                        <div className="flex items-center gap-1.5 max-w-[200px]">
                          <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="font-medium text-slate-800 truncate" title={req.college.name}>
                            {req.college.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            ({req.college.code})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 font-mono">{req.email}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400">
                      {req.reviewed_at ? formatDateShort(req.reviewed_at, hydrated) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Promote to Super Admin */}
      {promotingAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">
                  Promote to Super Admin?
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This will grant full platform-wide administrative privileges across all institutions, Google Workspace integrations, billing, and administrator management.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Administrator:</span>
                <span className="font-semibold text-slate-800">{promotingAdmin.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-700">{promotingAdmin.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Canonical Auth ID:</span>
                <span className="font-mono text-[10px] text-slate-600 truncate max-w-[200px]" title={promotingAdmin.user_id || promotingAdmin.id}>
                  {promotingAdmin.user_id || promotingAdmin.id}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">New Role:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  <ShieldCheck className="w-3 h-3" /> SUPER ADMIN
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/60 text-[11px] text-amber-800 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Promotions are cryptographically validated against the administrator&apos;s authentication record and immutably recorded in the platform audit log.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPromotingAdmin(null)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPromoteAdmin}
                disabled={isPending}
                aria-busy={isPending && activeAction?.type === 'PROMOTE'}
                className="px-4 py-2 rounded-xl text-xs font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 border border-amber-500/30 transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending && activeAction?.type === 'PROMOTE' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Promoting...</span>
                  </>
                ) : (
                  <>
                    <ShieldPlus className="w-3.5 h-3.5 text-amber-800" />
                    <span>Confirm Promotion</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Demote Super Admin to Standard Admin */}
      {demotingAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">
                  Demote Super Admin to Admin?
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This will revoke Platform Super Administrator privileges from this account. They will revert to standard institution-level administrator permissions.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Administrator:</span>
                <span className="font-semibold text-slate-800">{demotingAdmin.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-700">{demotingAdmin.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Canonical Auth ID:</span>
                <span className="font-mono text-[10px] text-slate-600 truncate max-w-[200px]" title={demotingAdmin.user_id || demotingAdmin.id}>
                  {demotingAdmin.user_id || demotingAdmin.id}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">Resulting Role:</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                  ADMIN
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-200/60 text-[11px] text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                Safety safeguards strictly prevent demoting the Primary Super Admin, self-demoting your current session, or removing the last active Super Admin.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDemotingAdmin(null)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDemoteAdmin}
                disabled={isPending}
                aria-busy={isPending && activeAction?.type === 'DEMOTE'}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPending && activeAction?.type === 'DEMOTE' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Demoting...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Confirm Demotion</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
