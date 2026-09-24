'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
} from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  getPublicFacultiesForSelectionAction,
  getPublicSubjectsForFacultyAction,
  getPublicFeedbackFormAction,
  getPublicSemesterFeedbackFormAction,
  getActiveBranchesAction,
  PublicFormSummary,
} from '@/app/feedback/actions';
import { PublicFeedbackCard } from '@/components/public/PublicFeedbackCard';
import {
  Calendar,
  Layers,
  GraduationCap,
  BookOpen,
  User,
  AlertCircle,
  Loader2,
  Sparkles,
  RotateCcw,
  Info,
  ExternalLink,
  Users,
} from 'lucide-react';


interface Props {
  academicYears: AcademicYear[];
  branches: Branch[];
  semesters: Semester[];
  collegeId?: string;
}

export function StudentDiscoveryFlow({
  academicYears,
  branches,
  semesters,
  collegeId,
}: Props) {
  // Dynamic branches state initialized from server props, refreshed dynamically and live via Realtime
  const [branchList, setBranchList] = useState<Branch[]>(branches);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(false);

  // Active branches dynamically filtered & sorted alphabetically
  const activeBranches = useMemo(
    () => branchList.filter(b => b.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [branchList]
  );

  // Dynamic fetch of active branches on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingBranches(true);
    getActiveBranchesAction(collegeId)
      .then(res => {
        if (isMounted && res.success && res.branches) {
          setBranchList(res.branches);
        }
      })
      .catch(err => {
        console.error('[DYNAMIC_BRANCHES_FETCH]', err);
      })
      .finally(() => {
        if (isMounted) setLoadingBranches(false);
      });

    return () => {
      isMounted = false;
    };
  }, [collegeId]);

  // Supabase Realtime subscription for dynamic branch changes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('public:branches-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branches' },
        () => {
          getActiveBranchesAction(collegeId).then(res => {
            if (res.success && res.branches) {
              setBranchList(res.branches);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [collegeId]);

  // Cascading selections - Branch starts unselected (empty) so user sees "Select Branch / Discipline"
  const [selectedYearId, setSelectedYearId] = useState<string>(
    academicYears.find(y => y.is_active)?.id || academicYears[0]?.id || ''
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(
    semesters.find(s => s.is_active)?.id || semesters[0]?.id || ''
  );

  // If currently selected branch was deactivated, reset selection to empty
  useEffect(() => {
    if (selectedBranchId && !activeBranches.some(b => b.id === selectedBranchId)) {
      setSelectedBranchId('');
    }
  }, [activeBranches, selectedBranchId]);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Dynamically loaded cohorts
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [matchedForm, setMatchedForm] = useState<PublicFormSummary | null>(null);
  const [formStatus, setFormStatus] = useState<'PUBLISHED' | 'CLOSED' | 'NONE'>('NONE');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Loading states
  const [loadingFaculties, setLoadingFaculties] = useState<boolean>(false);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(false);
  const [loadingForm, setLoadingForm] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  // Semester form state
  const [semesterFormResult, setSemesterFormResult] = useState<{
    form: PublicFormSummary | null;
    status: 'PUBLISHED' | 'CLOSED' | 'NONE';
    itemsCount?: number;
    message: string;
  } | null>(null);

  // 1. Fetch faculties & semester form when Year + Branch + Semester change
  useEffect(() => {
    if (!selectedYearId || !selectedBranchId || !selectedSemesterId) {
      setFaculties([]);
      setSelectedFacultyId('');
      setSubjects([]);
      setSelectedSubjectId('');
      setMatchedForm(null);
      setSemesterFormResult(null);
      return;
    }

    let isMounted = true;
    setLoadingFaculties(true);
    setSelectedFacultyId('');
    setSubjects([]);
    setSelectedSubjectId('');
    setMatchedForm(null);
    setSemesterFormResult(null);

    // Fetch semester form if available
    getPublicSemesterFeedbackFormAction(selectedYearId, selectedBranchId, selectedSemesterId, collegeId).then(res => {
      if (isMounted) {
        if (res.success && res.form && res.status === 'PUBLISHED') {
          setSemesterFormResult(res);
        } else {
          setSemesterFormResult(null);
        }
      }
    });

    startTransition(async () => {
      try {
        const res = await getPublicFacultiesForSelectionAction(
          selectedYearId,
          selectedBranchId,
          selectedSemesterId,
          collegeId
        );

        if (isMounted) {
          setLoadingFaculties(false);
          if (res.success) {
            setFaculties(res.faculties);
          } else {
            setFaculties([]);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('Server Action')) {
          if (typeof window !== 'undefined') {
            window.location.reload();
            return;
          }
        }
        if (isMounted) {
          setLoadingFaculties(false);
          setFaculties([]);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedYearId, selectedBranchId, selectedSemesterId, collegeId]);

  // 2. Fetch subjects when Faculty changes
  useEffect(() => {
    if (!selectedYearId || !selectedBranchId || !selectedSemesterId || !selectedFacultyId) {
      setSubjects([]);
      setSelectedSubjectId('');
      setMatchedForm(null);
      return;
    }

    let isMounted = true;
    setLoadingSubjects(true);
    setSelectedSubjectId('');
    setMatchedForm(null);

    startTransition(async () => {
      try {
        const res = await getPublicSubjectsForFacultyAction(
          selectedYearId,
          selectedBranchId,
          selectedSemesterId,
          selectedFacultyId,
          collegeId
        );

        if (isMounted) {
          setLoadingSubjects(false);
          if (res.success) {
            setSubjects(res.subjects);
          } else {
            setSubjects([]);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('Server Action')) {
          if (typeof window !== 'undefined') {
            window.location.reload();
            return;
          }
        }
        if (isMounted) {
          setLoadingSubjects(false);
          setSubjects([]);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedYearId, selectedBranchId, selectedSemesterId, selectedFacultyId, collegeId]);

  // 3. Fetch Feedback Form when Subject is selected
  useEffect(() => {
    if (
      !selectedYearId ||
      !selectedBranchId ||
      !selectedSemesterId ||
      !selectedFacultyId ||
      !selectedSubjectId
    ) {
      setMatchedForm(null);
      setFormStatus('NONE');
      return;
    }

    let isMounted = true;
    setLoadingForm(true);

    startTransition(async () => {
      try {
        const res = await getPublicFeedbackFormAction(
          selectedYearId,
          selectedBranchId,
          selectedSemesterId,
          selectedFacultyId,
          selectedSubjectId,
          collegeId
        );

        if (isMounted) {
          setLoadingForm(false);
          if (res.success) {
            setMatchedForm(res.form);
            setFormStatus(res.status);
            setStatusMessage(res.message);
          } else {
            setMatchedForm(null);
            setFormStatus('NONE');
            setStatusMessage(res.message || 'Unable to check feedback form.');
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('Server Action')) {
          if (typeof window !== 'undefined') {
            window.location.reload();
            return;
          }
        }
        if (isMounted) {
          setLoadingForm(false);
          setMatchedForm(null);
          setFormStatus('NONE');
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    selectedYearId,
    selectedBranchId,
    selectedSemesterId,
    selectedFacultyId,
    selectedSubjectId,
    collegeId,
  ]);

  const handleReset = () => {
    setSelectedBranchId('');
    setSelectedFacultyId('');
    setSelectedSubjectId('');
    setMatchedForm(null);
    setFormStatus('NONE');
    setSemesterFormResult(null);
  };

  const selectedYear = academicYears.find(y => y.id === selectedYearId);
  const selectedBranch = branchList.find(b => b.id === selectedBranchId);
  const selectedSemester = semesters.find(s => s.id === selectedSemesterId);
  const selectedFaculty = faculties.find(f => f.id === selectedFacultyId);
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* 5-Step Cascading Selection Box */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-7 border border-slate-200 shadow-sm space-y-3.5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 sm:pb-4 border-b border-slate-100">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-bce-cobalt" />
              Cascading Feedback Selection
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Select your academic details in order: Session → Department → Semester → Faculty → Subject.
            </p>
          </div>

          {(selectedBranchId || selectedFacultyId || selectedSubjectId) && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors self-start sm:self-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Selection</span>
            </button>
          )}
        </div>

        {/* Tier 1: Academic Year + Branch + Semester */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
          {/* Step 1: Academic Year */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-bce-cobalt shrink-0" />
              1. Academic Session
            </label>
            <select
              value={selectedYearId}
              onChange={e => setSelectedYearId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-base sm:text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
            >
              {academicYears.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.is_active ? '(Active Session)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Branch */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-bce-cobalt shrink-0" />
                2. Branch / Discipline
              </span>
              {loadingBranches && <Loader2 className="w-3.5 h-3.5 animate-spin text-bce-cobalt" />}
            </label>
            <select
              value={selectedBranchId}
              onChange={e => setSelectedBranchId(e.target.value)}
              aria-label="Branch / Discipline"
              disabled={activeBranches.length === 0 && !loadingBranches}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-base sm:text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Select Branch / Discipline</option>
              {loadingBranches && activeBranches.length === 0 ? (
                <option value="" disabled>
                  Loading branches...
                </option>
              ) : activeBranches.length === 0 ? (
                <option value="" disabled>
                  No active branches available
                </option>
              ) : (
                activeBranches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Step 3: Semester */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-bce-cobalt shrink-0" />
              3. Semester Level
            </label>
            <select
              value={selectedSemesterId}
              onChange={e => setSelectedSemesterId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-base sm:text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
            >
              {semesters.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} (Sem {s.semester_number})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Prominent Banner for Official Semester Feedback Form */}
        {semesterFormResult && semesterFormResult.status === 'PUBLISHED' && semesterFormResult.form && (
          <div className="p-3.5 sm:p-5 rounded-2xl bg-gradient-to-r from-bce-navy via-slate-900 to-indigo-950 text-white shadow-md border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider">
                  Official All-in-One Form
                </span>
                {semesterFormResult.itemsCount ? (
                  <span className="text-blue-200 text-xs font-semibold flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {semesterFormResult.itemsCount} Teachers Evaluated
                  </span>
                ) : null}
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Official Semester Feedback Form Available — Includes All Subjects & Teachers
              </h3>
              <p className="text-xs text-slate-300 max-w-xl">
                Students of {selectedBranch?.name} ({selectedSemester?.name}) can rate all course faculty in a single Google Form with standard Multiple Choice Grids.
              </p>
            </div>

            {semesterFormResult.form.google_form_url && (
              <a
                href={semesterFormResult.form.google_form_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shrink-0 active:scale-95"
              >
                <span>Start Feedback</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Tier 2: Faculty & Subject Cascading Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 pt-2 border-t border-slate-100">
          <div className="sm:col-span-2 text-xs font-semibold text-slate-500">
            Or select an individual faculty member and subject below:
          </div>
          {/* Step 4: Faculty Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-bce-cobalt shrink-0" />
                4. Select Faculty Member
              </span>
              {loadingFaculties && <Loader2 className="w-3.5 h-3.5 animate-spin text-bce-cobalt" />}
            </label>

            {!selectedBranchId ? (
              <div className="min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl flex items-center px-3.5 text-xs text-slate-400 font-medium">
                Please select your Branch / Discipline above
              </div>
            ) : loadingFaculties ? (
              <div className="min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl flex items-center px-3 text-xs text-slate-400">
                Loading assigned faculties...
              </div>
            ) : faculties.length === 0 ? (
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>No faculty assignments found for {selectedBranch?.name}, {selectedSemester?.name}.</span>
              </div>
            ) : (
              <select
                value={selectedFacultyId}
                onChange={e => setSelectedFacultyId(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-base sm:text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
              >
                <option value="">-- Choose Faculty Member ({faculties.length} available) --</option>
                {faculties.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.designation || f.department || 'Faculty'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 5: Subject Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-bce-cobalt shrink-0" />
                5. Select Course Subject
              </span>
              {loadingSubjects && <Loader2 className="w-3.5 h-3.5 animate-spin text-bce-cobalt" />}
            </label>

            {!selectedFacultyId ? (
              <div className="min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl flex items-center px-3 text-xs text-slate-400">
                Please select a faculty member first
              </div>
            ) : loadingSubjects ? (
              <div className="min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl flex items-center px-3 text-xs text-slate-400">
                Loading subjects taught by {selectedFaculty?.name}...
              </div>
            ) : subjects.length === 0 ? (
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>No subjects mapped to {selectedFaculty?.name} in this semester.</span>
              </div>
            ) : (
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-base sm:text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
              >
                <option value="">-- Choose Subject ({subjects.length} available) --</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Available Feedback Results Area */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-bce-cobalt" />
            Evaluation Feedback Form
          </h4>
          <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
            {selectedBranch?.code} • {selectedSemester?.name} • {selectedYear?.name}
          </span>
        </div>

        {loadingForm ? (
          <div className="p-6 sm:p-12 bg-white rounded-2xl border border-slate-200 shadow-xs text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-bce-cobalt mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              Checking feedback form availability for {selectedFaculty?.name} — {selectedSubject?.name}...
            </p>
          </div>
        ) : matchedForm ? (
          /* Real Published or Closed Feedback Card */
          <PublicFeedbackCard form={matchedForm} isClosed={formStatus === 'CLOSED'} />
        ) : selectedSubjectId ? (
          /* Subject Selected but No Published Form Found */
          <div className="bg-white rounded-2xl p-5 sm:p-10 border border-slate-200 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h5 className="text-sm sm:text-base font-bold text-slate-900">
              No Published Feedback Form Available
            </h5>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              {statusMessage ||
                `There is no active feedback form published for ${selectedFaculty?.name} teaching ${selectedSubject?.name} (${selectedBranch?.name}, ${selectedSemester?.name}).`}
            </p>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 text-[11px] font-medium rounded-full">
                <Info className="w-3.5 h-3.5" />
                Forms are opened during designated academic feedback windows.
              </span>
            </div>
          </div>
        ) : (
          /* Prompt to complete selections */
          <div className="bg-white rounded-2xl p-5 sm:p-10 border border-dashed border-slate-300 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-bce-cobalt mx-auto flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h5 className="text-sm font-bold text-slate-800">
              Complete the Selection Above
            </h5>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {!selectedFacultyId
                ? 'Please select your Faculty Member from the dropdown to continue.'
                : 'Please select the Course Subject to access your evaluation form.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
