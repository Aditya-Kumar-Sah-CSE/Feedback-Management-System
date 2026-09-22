'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Gift,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CreditCard,
  Phone,
  Save,
  Sparkles,
  TrendingUp,
  ShieldX,
  History,
} from 'lucide-react';
import {
  getAdminBillingOverviewAction,
  approvePaymentAction,
  rejectPaymentAction,
  assignFreePlanAction,
  lockAdminAccessAction,
  unlockAdminAccessAction,
  revokeFormAccessAction,
  getPaymentProofUrlAction,
  updatePaymentSettingsAction,
  getPaymentSettingsAction,
} from '@/app/admin/billing/actions';
import { PlanManagementSection } from '@/components/admin/billing/PlanManagementSection';
import { GrantTrialModal } from '@/components/admin/billing/GrantTrialModal';
import { ExtendTrialModal } from '@/components/admin/billing/ExtendTrialModal';
import { RevokeTrialModal } from '@/components/admin/billing/RevokeTrialModal';
import { TrialHistoryModal } from '@/components/admin/billing/TrialHistoryModal';
import { ReplaceTrialModal } from '@/components/admin/billing/ReplaceTrialModal';
import type { PaymentSettings, Admin, AdminTrialEntitlement, BillingOverviewItem } from '@/types/database';

export function BillingManagementTab({ currentUserEmail: _currentUserEmail }: { currentUserEmail?: string }) {
  const [data, setData] = useState<BillingOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [expandedAdmin, setExpandedAdmin] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: string; adminId: string; adminEmail: string; requestId?: string } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [, setSettings] = useState<PaymentSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    upiId: '', accountName: '', bankName: '', accountNumber: '', ifscCode: '', supportPhone: '9470870830', paymentInstructions: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Free Trial Modal states
  const [trialModalAdmin, setTrialModalAdmin] = useState<Admin | null>(null);
  const [extendModalData, setExtendModalData] = useState<{ admin: Admin; trial: AdminTrialEntitlement } | null>(null);
  const [revokeModalData, setRevokeModalData] = useState<{ admin: Admin; trial: AdminTrialEntitlement } | null>(null);
  const [replaceModalData, setReplaceModalData] = useState<{ admin: Admin; currentTrial?: AdminTrialEntitlement | null } | null>(null);
  const [historyModalAdmin, setHistoryModalAdmin] = useState<Admin | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await getAdminBillingOverviewAction();
    if (res.success) setData(res.data as BillingOverviewItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    getPaymentSettingsAction().then(res => {
      if (res.success && res.settings) {
        setSettings(res.settings);
        setSettingsForm({
          upiId: res.settings.upi_id || '',
          accountName: res.settings.account_name || '',
          bankName: res.settings.bank_name || '',
          accountNumber: res.settings.account_number || '',
          ifscCode: res.settings.ifsc_code || '',
          supportPhone: res.settings.support_phone || '9470870830',
          paymentInstructions: res.settings.payment_instructions || '',
        });
      }
    });
  }, []);

  function openConfirmModal(action: { type: string; adminId: string; adminEmail: string; requestId?: string }) {
    setConfirmError(null);
    setRejectionReason('');
    setConfirmAction(action);
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      let res: { success: boolean; message?: string; error?: string } | undefined;
      if (confirmAction.type === 'APPROVE' && confirmAction.requestId) {
        res = await approvePaymentAction(confirmAction.requestId);
      } else if (confirmAction.type === 'REJECT' && confirmAction.requestId) {
        res = await rejectPaymentAction(confirmAction.requestId, rejectionReason);
      } else if (confirmAction.type === 'ASSIGN_FREE') {
        res = await assignFreePlanAction(confirmAction.adminId);
      } else if (confirmAction.type === 'LOCK') {
        res = await lockAdminAccessAction(confirmAction.adminId);
      } else if (confirmAction.type === 'UNLOCK') {
        res = await unlockAdminAccessAction(confirmAction.adminId);
      } else if (confirmAction.type === 'REVOKE') {
        res = await revokeFormAccessAction(confirmAction.adminId);
      }

      if (res?.success) {
        setMessage({
          text: res.message || `${confirmAction.type.replace(/_/g, ' ')} action completed successfully.`,
          type: 'success',
        });
        setConfirmAction(null);
        setRejectionReason('');
        setConfirmError(null);
        await loadData();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setConfirmError(res?.error || 'Action failed. Please try again.');
      }
    } catch (err: any) {
      console.error('[CONFIRM_ACTION_EXCEPTION]', err);
      setConfirmError(err?.message || 'An unexpected error occurred. Please refresh and try again.');
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleViewProof(proofPath: string) {
    const res = await getPaymentProofUrlAction(proofPath);
    if (res.success && res.url) {
      setProofUrl(res.url);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const res = await updatePaymentSettingsAction(settingsForm);
      setMessage({ text: res.success ? 'Payment settings saved.' : (res.error || 'Save failed.'), type: res.success ? 'success' : 'error' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ text: err?.message || 'Failed to save settings.', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      UNLOCKED: { label: 'Unlocked', cls: 'bg-emerald-100 text-emerald-700' },
      LOCKED: { label: 'Locked', cls: 'bg-red-100 text-red-700' },
    };
    const cfg = map[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${cfg.cls}`}>{cfg.label}</span>;
  };

  const getPlanBadge = (plan: string) => {
    const map: Record<string, string> = {
      FREE: 'bg-slate-100 text-slate-600',
      MONTHLY: 'bg-blue-100 text-blue-700',
      HALF_YEARLY: 'bg-indigo-100 text-indigo-700',
      YEARLY: 'bg-amber-100 text-amber-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${map[plan] || 'bg-slate-100 text-slate-600'}`}>{plan}</span>;
  };

  const getPaymentStatusBadge = (status: string) => {
    const map: Record<string, { cls: string }> = {
      PENDING: { cls: 'bg-amber-100 text-amber-700' },
      APPROVED: { cls: 'bg-emerald-100 text-emerald-700' },
      REJECTED: { cls: 'bg-red-100 text-red-700' },
    };
    const cfg = map[status] || { cls: 'bg-slate-100 text-slate-600' };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${cfg.cls}`}>{status}</span>;
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded-md" />
        <div className="h-64 bg-slate-50 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-bce-cobalt shrink-0" />
            <span>Billing & Access Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{data.length} colleges total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowSettings(!showSettings)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer">
            Payment Settings
          </button>
          <button onClick={loadData} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`rounded-lg p-3 text-xs flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Database-Driven Plan Management */}
      <PlanManagementSection />

      {/* Payment Settings Panel */}
      {showSettings && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">Payment Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1 font-medium">UPI ID</label>
              <input type="text" value={settingsForm.upiId} onChange={e => setSettingsForm(s => ({ ...s, upiId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1 font-medium">Account Holder Name</label>
              <input type="text" value={settingsForm.accountName} onChange={e => setSettingsForm(s => ({ ...s, accountName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1 font-medium">Bank Name</label>
              <input type="text" value={settingsForm.bankName} onChange={e => setSettingsForm(s => ({ ...s, bankName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1 font-medium">Account Number</label>
              <input type="text" value={settingsForm.accountNumber} onChange={e => setSettingsForm(s => ({ ...s, accountNumber: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1 font-medium">IFSC Code</label>
              <input type="text" value={settingsForm.ifscCode} onChange={e => setSettingsForm(s => ({ ...s, ifscCode: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1 font-medium flex items-center gap-1"><Phone className="w-3 h-3" /> Support Phone</label>
              <input type="text" value={settingsForm.supportPhone} onChange={e => setSettingsForm(s => ({ ...s, supportPhone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1 font-medium">Payment Instructions</label>
            <textarea value={settingsForm.paymentInstructions} onChange={e => setSettingsForm(s => ({ ...s, paymentInstructions: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20 h-20 resize-none" />
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bce-cobalt text-white text-sm font-medium hover:bg-bce-navy transition disabled:opacity-50 cursor-pointer">
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">Confirm Action</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to <strong>{confirmAction.type.replace(/_/g, ' ').toLowerCase()}</strong> for <strong>{confirmAction.adminEmail}</strong>?
            </p>
            {confirmAction.type === 'REJECT' && (
              <div>
                <label className="block text-xs text-slate-600 mb-1 font-medium">Rejection Reason (optional)</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g., Invalid UTR, wrong amount..."
                  disabled={confirmLoading}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-bce-cobalt/20 disabled:bg-slate-50"
                />
              </div>
            )}
            {confirmError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="break-words">{confirmError}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                disabled={confirmLoading}
                onClick={() => {
                  setConfirmAction(null);
                  setRejectionReason('');
                  setConfirmError(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={confirmLoading}
                onClick={handleConfirmAction}
                aria-busy={confirmLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-bce-cobalt text-white hover:bg-bce-navy disabled:opacity-50 cursor-pointer"
              >
                {confirmLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Viewer */}
      {proofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onClick={() => setProofUrl(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Payment Proof</h3>
              <button onClick={() => setProofUrl(null)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">Close</button>
            </div>
            <Image src={proofUrl} alt="Payment proof" className="w-full rounded-lg border border-slate-200 max-h-96 object-contain" width={500} height={400} unoptimized />
          </div>
        </div>
      )}

      {/* Table Alert Message Banner */}
      {message && (
        <div className={`rounded-xl p-3.5 text-xs flex items-center justify-between gap-3 shadow-xs border transition-all ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <XCircle className="w-4 h-4 shrink-0 text-red-600" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5 rounded cursor-pointer">✕</button>
        </div>
      )}

      {/* Admin Billing Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs w-full min-w-0">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">College Tenant</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Access</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Billing Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Trial</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Payment</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Valid Until</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(item => {
                const isExpanded = expandedAdmin === item.college.id;
                const accessStatus = item.billing?.access_status || 'LOCKED';
                const planType = item.billing?.plan_type || 'FREE';
                const latestReq = item.latestPaymentRequest;
                const activeTrial = item.activeTrial;
                const isOwnRow = false;
                const isSuperAdminRow = false;

                return (
                  <tr key={item.college.id} className={`${isExpanded ? 'bg-slate-50/50' : 'hover:bg-slate-50/50'} transition-colors`}>
                    {/* 1. College Info */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span>{item.college.name}</span>
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                              {item.college.code}
                            </span>
                          </p>
                          <p className="text-slate-400 font-mono text-[10px]">
                            {item.membersCount || 0} admins · /c/{item.college.slug}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* 2. Access Status */}
                    <td className="px-4 py-3">
                      {isSuperAdminRow ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-100 text-amber-700">Always Unlocked</span>
                      ) : (
                        getStatusBadge(accessStatus)
                      )}
                    </td>

                    {/* 3. Billing Plan */}
                    <td className="px-4 py-3">
                      {getPlanBadge(planType)}
                    </td>

                    {/* 4. Trial Entitlement Status */}
                    <td className="px-4 py-3">
                      {isSuperAdminRow ? (
                        <span className="text-slate-300 font-mono">—</span>
                      ) : activeTrial ? (() => {
                        const diffMs = new Date(activeTrial.expires_at).getTime() - new Date().getTime();
                        const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                        return (
                          <div className="space-y-0.5">
                            <span
                              title={`Valid until ${new Date(activeTrial.expires_at).toLocaleDateString('en-IN')}. Features: ${activeTrial.features?.join(', ')}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs"
                            >
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              TRIAL — {daysLeft}d left
                            </span>
                            <p className="text-[10px] text-slate-400">
                              Until {new Date(activeTrial.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </p>
                          </div>
                        );
                      })() : (() => {
                        const latestTrial = item.trialHistory && item.trialHistory[0];
                        if (latestTrial?.status === 'EXPIRED') {
                          return (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                              EXPIRED
                            </span>
                          );
                        }
                        if (latestTrial?.status === 'REVOKED') {
                          return (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-red-50 text-red-700 border border-red-200">
                              REVOKED
                            </span>
                          );
                        }
                        return <span className="text-slate-300">—</span>;
                      })()}
                    </td>

                    {/* 5. Payment Status */}
                    <td className="px-4 py-3">
                      {latestReq ? (
                        <div className="space-y-0.5">
                          {getPaymentStatusBadge(latestReq.status)}
                          <p className="text-[10px] text-slate-400">₹{latestReq.amount?.toLocaleString('en-IN')} • {latestReq.plan_type}</p>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* 6. Valid Until */}
                    <td className="px-4 py-3">
                      {item.billing?.expires_at ? (
                        <span className={`text-[11px] ${new Date(item.billing.expires_at) < new Date() ? 'text-red-500 font-semibold' : 'text-slate-600'}`}>
                          {new Date(item.billing.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      ) : planType === 'FREE' && accessStatus === 'UNLOCKED' ? (
                        <span className="text-[11px] text-emerald-600 font-medium">No Expiry</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* 7. Actions */}
                    <td className="px-4 py-3 text-right">
                      {isSuperAdminRow ? (
                        <span className="text-[10px] text-slate-400 font-medium">Protected</span>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          {/* Free Trial Actions */}
                          {!activeTrial ? (
                            <button
                              onClick={() => setTrialModalAdmin(item.admin)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition cursor-pointer shadow-2xs"
                            >
                              <Sparkles className="w-3 h-3 text-teal-600" /> Grant Trial
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => setExtendModalData({ admin: item.admin, trial: activeTrial })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                              >
                                <TrendingUp className="w-3 h-3 text-blue-600" /> Extend
                              </button>
                              <button
                                onClick={() => setRevokeModalData({ admin: item.admin, trial: activeTrial })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                              >
                                <ShieldX className="w-3 h-3 text-red-600" /> Revoke
                              </button>
                            </>
                          )}

                          {/* View Trial History */}
                          <button
                            onClick={() => setHistoryModalAdmin(item.admin)}
                            title="View Free Trial History"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                          >
                            <History className="w-3 h-3 text-slate-500" /> Trials
                          </button>

                          {/* Approve/Reject pending requests */}
                          {latestReq?.status === 'PENDING' && (
                            <>
                              <button
                                disabled={confirmLoading}
                                onClick={() => openConfirmModal({ type: 'APPROVE', adminId: item.college.id, adminEmail: item.college.name, requestId: latestReq.id })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button
                                disabled={confirmLoading}
                                onClick={() => openConfirmModal({ type: 'REJECT', adminId: item.college.id, adminEmail: item.college.name, requestId: latestReq.id })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-50 cursor-pointer"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}

                          {/* View proof */}
                          {latestReq?.payment_proof_url && (
                            <button
                               onClick={() => handleViewProof(latestReq.payment_proof_url!)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> Proof
                            </button>
                          )}

                          {/* Quick access status toggle */}
                          {accessStatus === 'LOCKED' && !isOwnRow && (
                            <>
                              <button
                                disabled={confirmLoading}
                                onClick={() => openConfirmModal({ type: 'UNLOCK', adminId: item.college.id, adminEmail: item.college.name })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition disabled:opacity-50 cursor-pointer"
                              >
                                <Unlock className="w-3 h-3" /> Unlock
                              </button>
                              <button
                                disabled={confirmLoading}
                                onClick={() => openConfirmModal({ type: 'ASSIGN_FREE', adminId: item.college.id, adminEmail: item.college.name })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition disabled:opacity-50 cursor-pointer"
                              >
                                <Gift className="w-3 h-3" /> Free
                              </button>
                            </>
                          )}

                          {accessStatus === 'UNLOCKED' && !isOwnRow && (
                            <>
                              <button
                                disabled={confirmLoading}
                                onClick={() => openConfirmModal({ type: 'LOCK', adminId: item.college.id, adminEmail: item.college.name })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition disabled:opacity-50 cursor-pointer"
                              >
                                <Lock className="w-3 h-3" /> Lock
                              </button>
                              <button
                                disabled={confirmLoading}
                                onClick={() => openConfirmModal({ type: 'REVOKE', adminId: item.college.id, adminEmail: item.college.name })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-50 cursor-pointer"
                              >
                                <XCircle className="w-3 h-3" /> Revoke
                              </button>
                            </>
                          )}

                          {/* Expand history */}
                          <button
                            onClick={() => setExpandedAdmin(isExpanded ? null : item.college.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            Payments
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Expanded Payment History */}
        {expandedAdmin && (() => {
          const item = data.find(d => d.admin.id === expandedAdmin);
          if (!item || !item.paymentRequests.length) return (
            <div className="border-t border-slate-200 p-4 text-xs text-slate-400">No payment history recorded.</div>
          );
          return (
            <div className="border-t border-slate-200 bg-slate-50/50 p-4">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Payment Submissions — {item.admin.email}</h4>
              <div className="space-y-2">
                {item.paymentRequests.map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-3">
                      {getPaymentStatusBadge(req.status)}
                      <span className="text-slate-600">{req.plan_type} • ₹{req.amount?.toLocaleString('en-IN')}</span>
                      <span className="text-slate-400 font-mono">{req.payment_reference}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{new Date(req.created_at).toLocaleDateString('en-IN')}</span>
                      {req.rejection_reason && <span className="text-red-500 italic">{req.rejection_reason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Trial Modals */}
      {trialModalAdmin && (
        <GrantTrialModal
          admin={trialModalAdmin}
          isOpen={!!trialModalAdmin}
          onClose={() => setTrialModalAdmin(null)}
          onSuccess={() => {
            setMessage({ text: `Free Trial granted to ${trialModalAdmin.email}.`, type: 'success' });
            loadData();
          }}
          onOpenReplaceModal={() => {
            const admin = trialModalAdmin;
            const overviewItem = data.find(d => d.admin.id === admin.id);
            setReplaceModalData({ admin, currentTrial: overviewItem?.activeTrial });
          }}
        />
      )}

      {extendModalData && (
        <ExtendTrialModal
          admin={extendModalData.admin}
          trial={extendModalData.trial}
          isOpen={!!extendModalData}
          onClose={() => setExtendModalData(null)}
          onSuccess={() => {
            setMessage({ text: `Trial extended for ${extendModalData.admin.email}.`, type: 'success' });
            loadData();
          }}
        />
      )}

      {revokeModalData && (
        <RevokeTrialModal
          admin={revokeModalData.admin}
          trial={revokeModalData.trial}
          isOpen={!!revokeModalData}
          onClose={() => setRevokeModalData(null)}
          onSuccess={() => {
            setMessage({ text: `Trial revoked for ${revokeModalData.admin.email}.`, type: 'success' });
            loadData();
          }}
        />
      )}

      {replaceModalData && (
        <ReplaceTrialModal
          admin={replaceModalData.admin}
          currentTrial={replaceModalData.currentTrial}
          isOpen={!!replaceModalData}
          onClose={() => setReplaceModalData(null)}
          onSuccess={() => {
            setMessage({ text: `Trial replaced for ${replaceModalData.admin.email}.`, type: 'success' });
            loadData();
          }}
        />
      )}

      {historyModalAdmin && (
        <TrialHistoryModal
          admin={historyModalAdmin}
          isOpen={!!historyModalAdmin}
          onClose={() => setHistoryModalAdmin(null)}
        />
      )}
    </div>
  );
}
