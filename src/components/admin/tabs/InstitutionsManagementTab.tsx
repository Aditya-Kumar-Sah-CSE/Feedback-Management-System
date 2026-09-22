'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Power,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  School,
  MapPin,
} from 'lucide-react';
import {
  getInstitutionsAction,
  createInstitutionAction,
  updateInstitutionAction,
  toggleInstitutionStatusAction,
} from '@/app/admin/institutions/actions';
import type { College } from '@/types/tenant';
import type { CreateCollegeInput, UpdateCollegeInput } from '@/lib/validation';

export function InstitutionsManagementTab() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [deactivatingCollege, setDeactivatingCollege] = useState<College | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateCollegeInput>({
    name: '',
    code: '',
    slug: '',
    logoUrl: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    websiteUrl: '',
    tagline: '',
    affiliatedUniversity: '',
    establishedYear: null,
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await getInstitutionsAction();
    if (res.success && res.colleges) {
      setColleges(res.colleges);
    } else {
      setMessage({ text: res.error || 'Failed to load institutions.', type: 'error' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // Helper to auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormData((prev) => {
      const updated = { ...prev, name };
      if (!isSlugManuallyEdited && !editingCollege) {
        // Auto-generate clean slug: lowercase, replace spaces/symbols with hyphens
        const generatedSlug = name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        updated.slug = generatedSlug;
      }
      return updated;
    });
  };

  // Open Add modal
  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      code: '',
      slug: '',
      logoUrl: '',
      address: '',
      contactEmail: '',
      contactPhone: '',
      websiteUrl: '',
      tagline: '',
      affiliatedUniversity: '',
      establishedYear: null,
      isActive: true,
    });
    setFormError(null);
    setIsSlugManuallyEdited(false);
    setIsAddModalOpen(true);
  };

  // Open Edit modal
  const handleOpenEditModal = (college: College) => {
    setEditingCollege(college);
    setFormData({
      name: college.name,
      code: college.code,
      slug: college.slug,
      logoUrl: college.logo_url || '',
      address: college.address || '',
      contactEmail: college.contact_email || '',
      contactPhone: college.contact_phone || '',
      websiteUrl: college.website_url || '',
      tagline: college.tagline || '',
      affiliatedUniversity: college.affiliated_university || '',
      establishedYear: college.established_year || null,
      isActive: college.is_active,
    });
    setFormError(null);
    setIsSlugManuallyEdited(true);
  };

  // Submit Create form
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const res = await createInstitutionAction(formData);
    setSubmitting(false);

    if (res.success && res.college) {
      showToast(`Institution "${res.college.name}" created successfully!`, 'success');
      setIsAddModalOpen(false);
      loadData();
    } else {
      setFormError(res.error || 'Failed to create institution.');
    }
  };

  // Submit Edit form
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollege) return;
    setFormError(null);
    setSubmitting(true);

    const updatePayload: UpdateCollegeInput = {
      ...formData,
      id: editingCollege.id,
    };

    const res = await updateInstitutionAction(updatePayload);
    setSubmitting(false);

    if (res.success && res.college) {
      showToast(`Institution "${res.college.name}" updated successfully!`, 'success');
      setEditingCollege(null);
      loadData();
    } else {
      setFormError(res.error || 'Failed to update institution.');
    }
  };

  // Handle Activate / Deactivate
  const handleToggleStatus = async (college: College) => {
    const newStatus = !college.is_active;
    if (!newStatus) {
      // Prompt confirmation before deactivating
      setDeactivatingCollege(college);
      return;
    }

    // Direct activation
    setSubmitting(true);
    const res = await toggleInstitutionStatusAction(college.id, true);
    setSubmitting(false);

    if (res.success) {
      showToast(`Institution "${college.name}" activated!`, 'success');
      loadData();
    } else {
      showToast(res.error || 'Failed to activate institution.', 'error');
    }
  };

  // Confirm Deactivation
  const handleConfirmDeactivate = async () => {
    if (!deactivatingCollege) return;
    setSubmitting(true);
    const res = await toggleInstitutionStatusAction(deactivatingCollege.id, false);
    setSubmitting(false);

    if (res.success) {
      showToast(`Institution "${deactivatingCollege.name}" deactivated.`, 'success');
      setDeactivatingCollege(null);
      loadData();
    } else {
      showToast(res.error || 'Failed to deactivate institution.', 'error');
    }
  };

  // Filtered colleges list
  const filteredColleges = colleges.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });

  const activeCount = colleges.filter((c) => c.is_active).length;
  const inactiveCount = colleges.length - activeCount;

  return (
    <div className="space-y-6 w-full">
      {/* Toast Notification Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-medium animate-in fade-in duration-200 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Action */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-6 h-6 text-blue-600 shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Institutions</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage colleges and their public feedback portals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Add College</span>
          </button>
        </div>
      </div>

      {/* Metrics & Search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Chips */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-slate-700 shadow-2xs">
            Total: <span className="text-slate-900 font-bold">{colleges.length}</span>
          </span>
          <span className="px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-700 shadow-2xs">
            Active: <span className="text-emerald-900 font-bold">{activeCount}</span>
          </span>
          {inactiveCount > 0 && (
            <span className="px-3 py-1 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 shadow-2xs">
              Inactive: <span className="text-amber-900 font-bold">{inactiveCount}</span>
            </span>
          )}
        </div>

        {/* Search Input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search colleges, codes, slugs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Colleges List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading institutions...</span>
          </div>
        ) : filteredColleges.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs sm:text-sm">
            <School className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No institutions found.</p>
            <p className="text-slate-400 mt-0.5">
              {searchQuery ? 'Try adjusting your search criteria.' : 'Click "+ Add College" to register your first college.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Public Slug / Portal</th>
                  <th className="py-3 px-4">Location / Info</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredColleges.map((col) => {
                  return (
                    <tr
                      key={col.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Logo & Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center p-1 shrink-0 overflow-hidden text-slate-700 font-bold">
                            {col.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={col.logo_url}
                                alt={col.name}
                                className="max-w-full max-h-full object-contain"
                              />
                            ) : (
                              <span className="text-[10px] text-slate-600 font-mono font-bold">
                                {col.code.slice(0, 3)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate text-xs sm:text-sm">
                              {col.name}
                            </span>
                            {col.tagline && (
                              <span className="text-[10px] text-slate-400 block truncate">
                                {col.tagline}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px]">
                          {col.code}
                        </span>
                      </td>

                      {/* Slug / Public URL */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/${col.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 font-mono text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                        >
                          <span>/{col.slug}</span>
                          <ExternalLink className="w-3 h-3 text-blue-500" />
                        </Link>
                      </td>

                      {/* Location / Meta */}
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {col.address ? (
                          <div className="flex items-center gap-1 truncate max-w-[180px]">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{col.address}</span>
                          </div>
                        ) : col.affiliated_university ? (
                          <span className="truncate max-w-[180px] block text-slate-400">
                            {col.affiliated_university}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not set</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            col.is_active
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border border-slate-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              col.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                            }`}
                          />
                          {col.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(col)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors font-medium text-xs"
                            title="Edit College Details"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                            <span>Edit</span>
                          </button>

                          {/* Toggle Active Status */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(col)}
                            disabled={submitting}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors font-medium text-xs ${
                              col.is_active
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                            }`}
                            title={col.is_active ? 'Deactivate Institution' : 'Activate Institution'}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{col.is_active ? 'Deactivate' : 'Activate'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: ADD COLLEGE                                                  */}
      {/* ==================================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 my-8 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add New Institution</h3>
                <p className="text-xs text-slate-500">
                  Register a new college tenant and generate its public feedback portal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* College Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    College Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Munger College of Engineering"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                  />
                </div>

                {/* College Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    College Code / Short Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MCE-MUNGER"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-bold"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Public Slug <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center">
                    <span className="px-2.5 py-2 text-xs bg-slate-100 border border-r-0 border-slate-200 text-slate-500 rounded-l-lg font-mono">
                      /
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="mce-munger"
                      value={formData.slug}
                      onChange={(e) => {
                        setIsSlugManuallyEdited(true);
                        setFormData({ ...formData, slug: e.target.value.toLowerCase() });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-r-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-medium"
                    />
                  </div>
                </div>

                {/* Logo URL */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Logo Image URL <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={formData.logoUrl || ''}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Address / City */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Campus Address / City <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Munger, Bihar - 811201"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Email <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="principal@mce.ac.in"
                    value={formData.contactEmail || ''}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Phone <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="+91 94708 70830"
                    value={formData.contactPhone || ''}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Official Website <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://mcemunger.ac.in"
                    value={formData.websiteUrl || ''}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Affiliated University */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Affiliated University <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bihar Engineering University"
                    value={formData.affiliatedUniversity || ''}
                    onChange={(e) => setFormData({ ...formData, affiliatedUniversity: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Established Year */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Established Year <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1800"
                    max="2100"
                    placeholder="2019"
                    value={formData.establishedYear || ''}
                    onChange={(e) => setFormData({ ...formData, establishedYear: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Tagline */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Institutional Tagline <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Excellence in Engineering"
                    value={formData.tagline || ''}
                    onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Status Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                  />
                  <span>Active (Available on public portal & institution switcher)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Institution</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: EDIT COLLEGE                                                 */}
      {/* ==================================================================== */}
      {editingCollege && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 my-8 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Institution</h3>
                <p className="text-xs text-slate-500">
                  Modify institution metadata, code, or portal slug.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCollege(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* College Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    College Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                  />
                </div>

                {/* College Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    College Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-bold"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Public Slug <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center">
                    <span className="px-2.5 py-2 text-xs bg-slate-100 border border-r-0 border-slate-200 text-slate-500 rounded-l-lg font-mono">
                      /
                    </span>
                    <input
                      type="text"
                      required
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-r-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-medium"
                    />
                  </div>
                </div>

                {/* Logo URL */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Logo Image URL <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    value={formData.logoUrl || ''}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Address / City */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Campus Address / City <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Email <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Phone <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.contactPhone || ''}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Official Website <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    value={formData.websiteUrl || ''}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Affiliated University */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Affiliated University <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.affiliatedUniversity || ''}
                    onChange={(e) => setFormData({ ...formData, affiliatedUniversity: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Established Year */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Established Year <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1800"
                    max="2100"
                    value={formData.establishedYear || ''}
                    onChange={(e) => setFormData({ ...formData, establishedYear: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Tagline */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Institutional Tagline <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tagline || ''}
                    onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Status Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                  />
                  <span>Active (Available on public portal & institution switcher)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCollege(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: DEACTIVATION CONFIRMATION                                    */}
      {/* ==================================================================== */}
      {deactivatingCollege && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Deactivate this institution?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  This will hide the public feedback portal for <strong>{deactivatingCollege.name}</strong> (/{deactivatingCollege.slug}) and prevent new tenant access. Existing data will remain intact.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeactivatingCollege(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Deactivate Institution</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
