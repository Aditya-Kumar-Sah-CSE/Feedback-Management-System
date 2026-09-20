'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FacultySubjectAssignment,
  FeedbackForm,
} from '@/types/database';
import { GoogleConfigStatus } from '@/lib/google/auth';
import { createGoogleFeedbackFormAction } from '@/app/admin/forms/actions';
import { BCE_FEEDBACK_PARAMETERS, BCE_RATING_OPTIONS, MultiFacultyGridItem } from '@/lib/google/template';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileCode2,
  ExternalLink,
  Sparkles,
  Loader2,
  ShieldAlert,
  Users,
  User,
  CheckSquare,
  Square,
  Info,
} from 'lucide-react';

interface Props {
  academicYears: AcademicYear[];
  branches: Branch[];
  semesters: Semester[];
  faculties: Faculty[];
  subjects: Subject[];
  assignments: FacultySubjectAssignment[];
  googleStatus: GoogleConfigStatus;
}

export function CreateGoogleFormWizard({
  academicYears,
  branches,
  semesters,
  faculties,
  subjects,
  assignments,
  googleStatus,
}: Props) {
  const [isPending, startTransition] = useTransition();

  // Step state (1 to 6)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form selections
  const [academicYearId, setAcademicYearId] = useState<string>(
    academicYears.find(y => y.is_active)?.id || academicYears[0]?.id || ''
  );
  const [semesterId, setSemesterId] = useState<string>(semesters[0]?.id || '');
  // Filter active branches only, sorted alphabetically by name
  const activeBranches = useMemo(
    () => branches.filter(b => b.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [branches]
  );
  const [branchId, setBranchId] = useState<string>(
    activeBranches[0]?.id || branches.find(b => b.is_active)?.id || branches[0]?.id || ''
  );

  // Scope: SEMESTER_FEEDBACK (Default multi-faculty grid) or FACULTY_FEEDBACK (legacy single-faculty)
  const [scope, setScope] = useState<'SEMESTER_FEEDBACK' | 'FACULTY_FEEDBACK'>('SEMESTER_FEEDBACK');

  // Selected assignment IDs for multi-faculty semester form
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);

  // Single-faculty mode selections
  const [facultyId, setFacultyId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');

  // Creation progress & result state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeStepNumber, setActiveStepNumber] = useState<number>(1);
  const [creationStepMsg, setCreationStepMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresReconnect, setRequiresReconnect] = useState<boolean>(false);
  const [reconnectUrl, setReconnectUrl] = useState<string>('/api/auth/google?returnTo=/admin/dashboard/forms/create');
  const [createdForm, setCreatedForm] = useState<FeedbackForm | null>(null);
  const [destinationType, setDestinationType] = useState<string | null>(null);

  // Selected Entities
  const selectedYear = useMemo(
    () => academicYears.find(y => y.id === academicYearId),
    [academicYears, academicYearId]
  );
  const selectedSem = useMemo(
    () => semesters.find(s => s.id === semesterId),
    [semesters, semesterId]
  );
  const selectedBranch = useMemo(
    () => branches.find(b => b.id === branchId),
    [branches, branchId]
  );
  const selectedFaculty = useMemo(
    () => faculties.find(f => f.id === facultyId),
    [faculties, facultyId]
  );
  const selectedSubject = useMemo(
    () => subjects.find(s => s.id === subjectId),
    [subjects, subjectId]
  );

  // Filter real faculty-subject assignments for selected Academic Year, Branch & Semester
  const relevantAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (!a.is_active) return false;
      if (a.academic_year_id !== academicYearId) return false;

      const sub = subjects.find(s => s.id === a.subject_id);

      // Match branch
      const matchBranch =
        (a.branch_id && a.branch_id === branchId) ||
        (sub?.branch_id && sub.branch_id === branchId) ||
        (!a.branch_id && !sub?.branch_id);

      // Match semester
      const matchSem =
        (a.semester_id && a.semester_id === semesterId) ||
        (sub?.semester_id && sub.semester_id === semesterId) ||
        (!a.semester_id && !sub?.semester_id);

      return matchBranch && matchSem;
    });
  }, [assignments, academicYearId, branchId, semesterId, subjects]);

  // Sync selected assignments default to all relevant assignments when selection changes
  useEffect(() => {
    if (relevantAssignments.length > 0) {
      setSelectedAssignmentIds(relevantAssignments.map(a => a.id));
    } else {
      setSelectedAssignmentIds([]);
    }
  }, [relevantAssignments]);

  // Multi-faculty normalized items list for preview and submission
  const normalizedItems: MultiFacultyGridItem[] = useMemo(() => {
    if (scope === 'SEMESTER_FEEDBACK') {
      const items: MultiFacultyGridItem[] = [];
      for (const id of selectedAssignmentIds) {
        const asg = relevantAssignments.find(a => a.id === id);
        if (!asg) continue;
        const fac = faculties.find(f => f.id === asg.faculty_id);
        const sub = subjects.find(s => s.id === asg.subject_id);
        if (!fac || !sub) continue;
        items.push({
          facultyId: fac.id,
          subjectId: sub.id,
          assignmentId: asg.id,
          facultyName: fac.name,
          subjectName: sub.name,
          subjectCode: sub.code,
          gridTitle: `${sub.name}${sub.code ? ` (${sub.code})` : ''} — ${fac.name}`,
        });
      }
      return items;
    } else {
      if (!selectedFaculty || !selectedSubject) return [];
      return [
        {
          facultyId: selectedFaculty.id,
          subjectId: selectedSubject.id,
          facultyName: selectedFaculty.name,
          subjectName: selectedSubject.name,
          subjectCode: selectedSubject.code,
          gridTitle: `${selectedSubject.name}${selectedSubject.code ? ` (${selectedSubject.code})` : ''} — ${selectedFaculty.name}`,
        },
      ];
    }
  }, [scope, selectedAssignmentIds, relevantAssignments, faculties, subjects, selectedFaculty, selectedSubject]);

  // Faculties available for single-faculty mode
  const availableFaculties = useMemo(() => {
    if (relevantAssignments.length === 0) {
      return faculties.filter(f => f.is_active);
    }
    const facultyIds = new Set(relevantAssignments.map(a => a.faculty_id));
    return faculties.filter(f => f.is_active && facultyIds.has(f.id));
  }, [faculties, relevantAssignments]);

  // Subjects available for the selected single faculty
  const availableSubjects = useMemo(() => {
    if (!facultyId) return [];
    const facultyAssignments = relevantAssignments.filter(a => a.faculty_id === facultyId);
    if (facultyAssignments.length > 0) {
      const subjectIds = new Set(facultyAssignments.map(a => a.subject_id));
      return subjects.filter(s => s.is_active && subjectIds.has(s.id));
    }
    return subjects.filter(s => {
      const matchSem = !s.semester_id || s.semester_id === semesterId;
      const matchBranch = !s.branch_id || s.branch_id === branchId;
      return s.is_active && matchSem && matchBranch;
    });
  }, [facultyId, relevantAssignments, subjects, semesterId, branchId]);

  // Computed Form Title Preview
  const computedTitle = useMemo(() => {
    const sem = selectedSem?.name || '[Semester]';
    const br = selectedBranch?.name || '[Branch]';
    const yr = selectedYear?.name || '[Academic Session]';

    if (scope === 'SEMESTER_FEEDBACK') {
      return `Semester Feedback — ${br} — ${sem} — ${yr}`;
    } else {
      const fac = selectedFaculty?.name || '[Faculty Name]';
      const sub = selectedSubject?.name
        ? `${selectedSubject.name}${selectedSubject.code ? ` (${selectedSubject.code})` : ''}`
        : '[Subject Name]';
      return `Faculty Feedback — ${fac} — ${sub} — ${sem} — ${yr}`;
    }
  }, [scope, selectedBranch, selectedSem, selectedYear, selectedFaculty, selectedSubject]);

  // Validation before progressing
  const canGoToNext = () => {
    if (currentStep === 1) return Boolean(academicYearId);
    if (currentStep === 2) return Boolean(semesterId);
    if (currentStep === 3) return Boolean(branchId);
    if (currentStep === 4) {
      if (scope === 'SEMESTER_FEEDBACK') {
        return normalizedItems.length > 0;
      } else {
        return Boolean(facultyId && subjectId);
      }
    }
    if (currentStep === 5) return true;
    if (currentStep === 6) return true;
    return false;
  };

  const handleNext = () => {
    if (canGoToNext() && currentStep < 6) {
      setErrorMsg(null);
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setErrorMsg(null);
      setCurrentStep(prev => prev - 1);
    }
  };

  const toggleAssignmentSelection = (assignmentId: string) => {
    setSelectedAssignmentIds(prev =>
      prev.includes(assignmentId)
        ? prev.filter(id => id !== assignmentId)
        : [...prev, assignmentId]
    );
  };

  const handleSelectAll = () => {
    setSelectedAssignmentIds(relevantAssignments.map(a => a.id));
  };

  const handleDeselectAll = () => {
    setSelectedAssignmentIds([]);
  };

  // Trigger form generation with real-time staged progress
  const handleGenerateForm = async () => {
    if (!googleStatus.isConfigured) {
      setErrorMsg(
        'Google API credentials are not configured in .env.local. Please configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN before creating live forms.'
      );
      return;
    }

    if (scope === 'SEMESTER_FEEDBACK' && normalizedItems.length === 0) {
      setErrorMsg('Please select at least one faculty-subject assignment for this semester.');
      return;
    }

    if (scope === 'FACULTY_FEEDBACK' && (!facultyId || !subjectId)) {
      setErrorMsg('Please select both faculty and subject.');
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setRequiresReconnect(false);
    setActiveStepNumber(1);
    setCreationStepMsg('Validating academic assignment & session configuration...');

    const payload = {
      academicYearId,
      branchId,
      semesterId,
      formType: scope,
      facultyId: scope === 'FACULTY_FEEDBACK' ? facultyId : undefined,
      subjectId: scope === 'FACULTY_FEEDBACK' ? subjectId : undefined,
      items: normalizedItems.map(it => ({
        facultyId: it.facultyId!,
        subjectId: it.subjectId!,
        assignmentId: it.assignmentId,
      })),
    };

    try {
      const response = await fetch('/api/admin/forms/stream-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error ${response.status}: Failed to connect to form generator`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.stepNumber) {
              setActiveStepNumber(event.stepNumber);
            }
            if (event.message) {
              setCreationStepMsg(event.message);
            }

            if (event.status === 'COMPLETED' && event.form) {
              setCreatedForm(event.form as FeedbackForm);
              setDestinationType(event.form.response_destination_type || 'APPLICATION_MANAGED');
              setIsGenerating(false);
              return;
            }

            if (event.status === 'ERROR') {
              const isOAuth =
                Boolean(event.requiresReconnect) ||
                Boolean(event.error && (
                  event.error.toLowerCase().includes('invalid_grant') ||
                  event.error.toLowerCase().includes('reconnect') ||
                  event.error.toLowerCase().includes('token has been expired') ||
                  event.error.toLowerCase().includes('unauthorized')
                ));

              if (isOAuth) {
                setRequiresReconnect(true);
                setErrorMsg('Google authorization has expired or been revoked. Reconnect your Google account to continue.');
                if (event.reconnectUrl) {
                  setReconnectUrl(event.reconnectUrl);
                }
              } else {
                setErrorMsg(event.error || 'Failed to generate Google Form.');
              }
              setIsGenerating(false);
              return;
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', e);
          }
        }
      }

      setIsGenerating(false);
    } catch (err: unknown) {
      console.warn('Streaming generation fallback to direct action:', err);
      setCreationStepMsg('Creating Google Form & Sheet concurrently (fallback mode)...');

      startTransition(async () => {
        const result: any = await createGoogleFeedbackFormAction(payload as any);
        setIsGenerating(false);
        if (!result.success) {
          const isOAuth =
            Boolean(result.requiresReconnect) ||
            Boolean(result.error && (
              result.error.toLowerCase().includes('invalid_grant') ||
              result.error.toLowerCase().includes('reconnect') ||
              result.error.toLowerCase().includes('token has been expired') ||
              result.error.toLowerCase().includes('unauthorized')
            ));

          if (isOAuth) {
            setRequiresReconnect(true);
            setErrorMsg('Google authorization has expired or been revoked. Reconnect your Google account to continue.');
            if (result.reconnectUrl) {
              setReconnectUrl(result.reconnectUrl);
            }
          } else {
            setErrorMsg(result.error || 'Failed to generate Google Form.');
          }
        } else {
          setCreatedForm(result.form as FeedbackForm);
          setDestinationType(result.destinationType || 'APPLICATION_MANAGED');
        }
      });
    }
  };

  const steps = [
    { num: 1, label: 'Academic Year' },
    { num: 2, label: 'Semester' },
    { num: 3, label: 'Branch' },
    { num: 4, label: 'Scope' },
    { num: 5, label: 'Destination' },
    { num: 6, label: 'Preview' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/dashboard/forms"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-bce-cobalt" />
              Generate Google Feedback Form
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-9">
            Generate Multi-Faculty Semester Grids or Individual Faculty Forms linked to Google Sheets.
          </p>
        </div>

        <Link
          href="/admin/dashboard/forms"
          className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
        >
          Cancel & Return
        </Link>
      </div>

      {/* Google Setup Warning if unconfigured */}
      {!googleStatus.isConfigured && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-xs text-amber-950">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-900">Google API Credentials Required</p>
            <p className="text-amber-800">
              Form generation connects to live Google APIs (Google Forms API, Sheets API, and Drive API).
              Please ensure your <code className="px-1.5 py-0.5 bg-amber-100 rounded text-amber-900 font-mono">.env.local</code> has:
            </p>
            <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] text-amber-900 pt-1">
              <li>GOOGLE_CLIENT_ID</li>
              <li>GOOGLE_CLIENT_SECRET</li>
              <li>GOOGLE_REFRESH_TOKEN</li>
            </ul>
          </div>
        </div>
      )}

      {/* Success View after Creation */}
      {createdForm ? (
        <div className="bg-white p-8 rounded-2xl border border-emerald-200 shadow-sm space-y-6">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Google Form Generated Successfully!</h3>
            <p className="text-xs text-slate-600">
              The Google Form and connected Google Sheet were created and saved in Supabase in{' '}
              <strong className="text-amber-600">DRAFT</strong> state.
            </p>
          </div>

          {/* Form Summary Card */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Form Title</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                DRAFT
              </span>
            </div>
            <p className="font-bold text-sm text-slate-900">{createdForm.title}</p>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400 block text-[11px]">Response Destination:</span>
                <span className="font-semibold text-slate-800">
                  {destinationType === 'NATIVE_SHEET'
                    ? '⚡ Native Google Form Destination'
                    : '🔄 Application-Managed Response Sync'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Evaluation Grids:</span>
                <span className="font-semibold text-slate-800">
                  {normalizedItems.length} Faculty-Subject Grid{normalizedItems.length > 1 ? 's' : ''} (8 BCE Parameters)
                </span>
              </div>
            </div>
          </div>

          {/* Direct Action Links */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {createdForm.google_form_url && (
              <a
                href={createdForm.google_form_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <FileCode2 className="w-4 h-4" />
                <span>Open Google Form (Student View)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {createdForm.google_sheet_url && (
              <a
                href={createdForm.google_sheet_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Open Google Responses Sheet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <Link
              href={`/admin/dashboard/forms/${createdForm.id}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-bce-cobalt hover:bg-bce-navy text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <span>Manage Form Details</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="text-center pt-4 border-t border-slate-100">
            <button
              onClick={() => {
                setCreatedForm(null);
                setCurrentStep(1);
                setFacultyId('');
                setSubjectId('');
              }}
              className="text-xs text-slate-500 hover:text-bce-cobalt font-semibold"
            >
              + Generate Another Feedback Form
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Real-Time Staged Progress Stepper */}
          {isGenerating && (
            <div className="bg-white p-6 rounded-2xl border-2 border-bce-cobalt/40 shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Provisioning Google Feedback Form</h4>
                    <p className="text-[11px] text-slate-500">Live multi-stage Google Forms & Sheets automated generator</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-bce-cobalt bg-blue-50 px-3 py-1 rounded-full border border-blue-200 shadow-2xs">
                  Stage {activeStepNumber} of 5
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                {[
                  { num: 1, title: 'Validation', desc: 'Verify assignments & session' },
                  { num: 2, title: 'Draft Record', desc: 'Initialize draft in Supabase' },
                  { num: 3, title: 'Google Form', desc: 'Populate BCE Multiple Choice Grids' },
                  { num: 4, title: 'Google Sheet', desc: 'Configure formatted headers' },
                  { num: 5, title: 'Finalizing', desc: 'Link response destination' },
                ].map((s) => {
                  const isDone = activeStepNumber > s.num;
                  const isCurrent = activeStepNumber === s.num;

                  return (
                    <div
                      key={s.num}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        isDone
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : isCurrent
                          ? 'bg-blue-50 border-bce-cobalt text-bce-cobalt ring-2 ring-bce-cobalt/20'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider">
                        {isDone ? '✓ Completed' : `Stage ${s.num}`}
                      </div>
                      <div className="text-xs font-bold mt-0.5 truncate">{s.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{s.desc}</div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-bce-cobalt animate-spin shrink-0" />
                <span className="font-semibold">{creationStepMsg}</span>
              </div>
            </div>
          )}

          {/* 6-Step Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2 Columns: Step Process */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stepper Navigation Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {steps.map(s => {
                    const isCurrent = currentStep === s.num;
                    const isCompleted = currentStep > s.num;

                    return (
                      <div
                        key={s.num}
                        className={`text-center p-2 rounded-xl border transition-all ${
                          isCurrent
                            ? 'bg-bce-navy text-white border-bce-cobalt shadow-xs'
                            : isCompleted
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider">
                          Step {s.num}
                        </div>
                        <div className="text-xs font-semibold truncate mt-0.5">
                          {s.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step Body */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                {/* Step 1: Academic Year */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-bold text-slate-900">Step 1: Select Academic Session</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Choose the active academic year for this feedback evaluation.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {academicYears.map(y => (
                        <button
                          key={y.id}
                          type="button"
                          onClick={() => setAcademicYearId(y.id)}
                          className={`p-4 rounded-2xl border text-left transition-all ${
                            academicYearId === y.id
                              ? 'bg-blue-50/80 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-900">{y.name}</span>
                            {y.is_active && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Academic Calendar Session
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: Semester */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-bold text-slate-900">Step 2: Select Semester</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Select the semester level for the student cohort submitting feedback.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {semesters.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSemesterId(s.id)}
                          className={`p-4 rounded-2xl border text-center transition-all ${
                            semesterId === s.id
                              ? 'bg-blue-50/80 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-base text-slate-900">{s.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Year {s.year_number} • Sem {s.semester_number}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 3: Branch */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-bold text-slate-900">Step 3: Select Branch / Discipline</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Choose the engineering department for this evaluation.
                      </p>
                    </div>

                    {activeBranches.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                        <p className="text-sm font-semibold text-slate-700">No active branches available</p>
                        <p className="text-xs text-slate-400 mt-1">Please activate or add branches in Academic Management.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeBranches.map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setBranchId(b.id)}
                            className={`p-4 rounded-2xl border text-left transition-all ${
                              branchId === b.id
                                ? 'bg-blue-50/80 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm text-slate-900">{b.name}</span>
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-md">
                                {b.code}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 mt-1 block">
                              Department of {b.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Scope */}
                {currentStep === 4 && (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-bold text-slate-900">Step 4: Form Scope & Subjects</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Choose whether to generate an all-in-one semester form or a single-faculty evaluation.
                      </p>
                    </div>

                    {/* Scope Selector Tabs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setScope('SEMESTER_FEEDBACK')}
                        className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                          scope === 'SEMESTER_FEEDBACK'
                            ? 'bg-blue-50/90 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Users className={`w-5 h-5 shrink-0 mt-0.5 ${scope === 'SEMESTER_FEEDBACK' ? 'text-bce-cobalt' : 'text-slate-400'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">Multi-Faculty Semester Form</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded-full">
                              Recommended
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            A single Google Form with Multiple Choice Grids for all subjects & teachers of {selectedBranch?.code}, {selectedSem?.name}.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setScope('FACULTY_FEEDBACK')}
                        className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                          scope === 'FACULTY_FEEDBACK'
                            ? 'bg-blue-50/90 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <User className={`w-5 h-5 shrink-0 mt-0.5 ${scope === 'FACULTY_FEEDBACK' ? 'text-bce-cobalt' : 'text-slate-400'}`} />
                        <div>
                          <div className="font-bold text-xs text-slate-900">Single Faculty Form</div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Individual evaluation form for a specific teacher and assigned subject.
                          </p>
                        </div>
                      </button>
                    </div>

                    {/* Mode A: SEMESTER_FEEDBACK Checkbox Selection */}
                    {scope === 'SEMESTER_FEEDBACK' && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">
                              Assigned Subjects & Faculty for {selectedBranch?.name} ({selectedSem?.name})
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {relevantAssignments.length} course assignment{relevantAssignments.length !== 1 ? 's' : ''} found in database.
                            </p>
                          </div>

                          {relevantAssignments.length > 0 && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSelectAll}
                                className="text-[11px] text-bce-cobalt hover:underline font-semibold"
                              >
                                Select All
                              </button>
                              <span className="text-slate-300">•</span>
                              <button
                                type="button"
                                onClick={handleDeselectAll}
                                className="text-[11px] text-slate-500 hover:underline font-semibold"
                              >
                                Deselect All
                              </button>
                            </div>
                          )}
                        </div>

                        {relevantAssignments.length === 0 ? (
                          <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                            <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                            <p className="text-xs font-bold text-slate-800">No Academic Assignments Found</p>
                            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                              There are currently no active faculty-subject assignments for {selectedBranch?.name} in {selectedSem?.name} ({selectedYear?.name}).
                              Please assign teachers to subjects in Academic Structure before generating a semester feedback form.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {relevantAssignments.map(asg => {
                              const fac = faculties.find(f => f.id === asg.faculty_id);
                              const sub = subjects.find(s => s.id === asg.subject_id);
                              const isChecked = selectedAssignmentIds.includes(asg.id);

                              return (
                                <div
                                  key={asg.id}
                                  onClick={() => toggleAssignmentSelection(asg.id)}
                                  className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                                    isChecked
                                      ? 'bg-blue-50/70 border-bce-cobalt/80 shadow-2xs'
                                      : 'bg-white border-slate-200 hover:border-slate-300 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      aria-label={isChecked ? 'Deselect subject' : 'Select subject'}
                                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                        isChecked ? 'text-bce-cobalt' : 'text-slate-400'
                                      }`}
                                    >
                                      {isChecked ? (
                                        <CheckSquare className="w-5 h-5 fill-bce-cobalt text-white" />
                                      ) : (
                                        <Square className="w-5 h-5" />
                                      )}
                                    </button>

                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs text-slate-900">
                                          {sub?.name || 'Unknown Subject'}
                                        </span>
                                        {sub?.code && (
                                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded">
                                            {sub.code}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1.5">
                                        <span className="font-semibold text-slate-800">{fac?.name || 'Unknown Faculty'}</span>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-slate-500">{fac?.designation || fac?.department}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                      MC Grid
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode B: FACULTY_FEEDBACK Single Faculty Selection */}
                    {scope === 'FACULTY_FEEDBACK' && (
                      <div className="space-y-4 pt-2">
                        {/* Select Faculty */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Select Faculty Member
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                            {availableFaculties.map(f => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => {
                                  setFacultyId(f.id);
                                  setSubjectId('');
                                }}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                  facultyId === f.id
                                    ? 'bg-blue-50/80 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="font-bold text-xs text-slate-900">{f.name}</div>
                                <div className="text-[11px] text-slate-500">{f.designation} • {f.department}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Select Subject */}
                        {facultyId && (
                          <div className="pt-2 border-t border-slate-100">
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Select Assigned Subject for {selectedFaculty?.name}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                              {availableSubjects.map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => setSubjectId(s.id)}
                                  className={`p-3 rounded-xl border text-left transition-all ${
                                    subjectId === s.id
                                      ? 'bg-blue-50/80 border-bce-cobalt ring-2 ring-bce-cobalt/20 shadow-xs'
                                      : 'bg-white border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-slate-900">{s.name}</span>
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded">
                                      {s.code}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 5: Destination */}
                {currentStep === 5 && (
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-bold text-slate-900">Step 5: Response Destination & Google Sheet</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Configure where student evaluations will be collected and synced.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Connected Google Spreadsheet</h4>
                          <p className="text-[11px] text-slate-500">
                            A dedicated Google Spreadsheet will be generated with dynamic header columns for each faculty evaluation.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                        <div className="text-[11px] text-slate-400 uppercase font-sans font-bold">Target Sheet Title</div>
                        <div className="text-slate-900 font-bold break-all">
                          [Responses] {computedTitle}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs text-slate-600">
                        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                          <span className="text-slate-400 block text-[10px] font-bold uppercase">Sync Method</span>
                          <span className="font-semibold text-slate-800">
                            {googleStatus.hasAppsScript ? '⚡ Native Google Forms Linking' : '🔄 Automated Multi-Grid Response Engine'}
                          </span>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                          <span className="text-slate-400 block text-[10px] font-bold uppercase">Evaluated Grids</span>
                          <span className="font-semibold text-slate-800">
                            {normalizedItems.length} Grid{normalizedItems.length > 1 ? 's' : ''} ({normalizedItems.length * 8} rating parameters)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                      <Info className="w-4 h-4 text-bce-cobalt shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Automated Synchronization:</span> Submissions on this Google Form will record timestamps, verified email, student registration number, and ratings for each teacher into Supabase analytics.
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 6: Preview */}
                {currentStep === 6 && (
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-base font-bold text-slate-900">Step 6: Review & Finalize Generation</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Confirm details before creating the live Google Form and connected Google Sheet.
                      </p>
                    </div>

                    {/* Summary of what will be generated */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                      <div className="font-bold text-slate-800">Generation Pipeline Checklist:</div>
                      <ul className="space-y-1.5 text-slate-600">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Google Form created via Google Forms API v1 ({computedTitle})</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Verified email collection enabled</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Student Identification fields (Student Name & Registration Number) added once</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            {normalizedItems.length} Multiple Choice Grid{normalizedItems.length > 1 ? 's' : ''} populated (8 BCE parameters × 5 rating choices)
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>General Comments / Suggestions feedback section added</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Connected Google Sheet initialized with dynamic header columns</span>
                        </li>
                      </ul>
                    </div>

                    {/* Items to be generated */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 block">
                        Included Teacher Evaluations ({normalizedItems.length}):
                      </span>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {normalizedItems.map((it, idx) => (
                          <div key={idx} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">{it.gridTitle}</span>
                            <span className="text-[10px] text-slate-500 font-semibold">8 Parameters</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Reconnect Required Alert */}
                {requiresReconnect ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-xs text-amber-900">
                          Google authorization has expired or been revoked. Reconnect your Google account to continue.
                        </p>
                        <p className="text-[11px] text-amber-800">
                          Your server-side OAuth session must be renewed before Google Forms and Sheets can be provisioned.
                        </p>
                      </div>
                    </div>
                    <div>
                      <a
                        href={reconnectUrl}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-[1.02]"
                      >
                        <Sparkles className="w-4 h-4 text-amber-200" />
                        <span>Reconnect Google Account</span>
                      </a>
                    </div>
                  </div>
                ) : errorMsg ? (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                ) : null}

                {/* Pending Progress indicator */}
                {isPending && (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-xs flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-bce-cobalt animate-spin shrink-0" />
                    <span className="font-semibold">{creationStepMsg || 'Generating Google Form...'}</span>
                  </div>
                )}

                {/* Navigation Controls */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={currentStep === 1 || isPending || isGenerating}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    ← Back
                  </button>

                  {currentStep < 6 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!canGoToNext() || isPending || isGenerating}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-bce-cobalt hover:bg-bce-navy disabled:opacity-40 transition-colors shadow-xs"
                    >
                      <span>Next Step</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGenerateForm}
                      disabled={!canGoToNext() || isPending || isGenerating || !googleStatus.isConfigured || requiresReconnect}
                      className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-bce-cobalt to-indigo-600 hover:from-bce-navy hover:to-indigo-700 disabled:opacity-40 transition-all shadow-md ${
                        isPending || isGenerating ? 'btn-request-active opacity-80 cursor-wait' : ''
                      }`}
                    >
                      {isPending || isGenerating ? (
                        <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      )}
                      <span>
                        {requiresReconnect
                          ? 'Authorization Required'
                          : isGenerating || isPending
                          ? 'Generating Form on Google...'
                          : 'Generate Google Feedback Form'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Live Form Preview Card */}
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-bce-cobalt" />
                    Live Form Preview
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                    Preview Only
                  </span>
                </div>

                {/* Title & Metadata Card */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Generated Title</span>
                  <p className="font-bold text-xs text-slate-900 leading-snug bg-slate-50 p-2.5 rounded-xl border border-slate-200 font-mono break-words">
                    {computedTitle}
                  </p>
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Session:</span>
                    <span className="font-semibold text-slate-800">{selectedYear?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Semester:</span>
                    <span className="font-semibold text-slate-800">{selectedSem?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Branch:</span>
                    <span className="font-semibold text-slate-800">{selectedBranch?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Scope:</span>
                    <span className="font-semibold text-slate-800">
                      {scope === 'SEMESTER_FEEDBACK' ? 'Multi-Faculty Semester' : 'Single Faculty'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Teachers Evaluated:</span>
                    <span className="font-semibold text-slate-800">{normalizedItems.length} Teacher{normalizedItems.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Live Preview of Questions & Grids */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Form Question Structure
                  </span>

                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {/* Student Identification */}
                    <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-950">Student Identification</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-800 font-semibold">Required *</span>
                      </div>
                      <div className="text-[10px] text-blue-800 space-y-0.5">
                        <div>• <span className="font-semibold">Student Name</span> (Short Answer)</div>
                        <div>• <span className="font-semibold">University Registration Number</span> (Short Answer)</div>
                        <div>• <span className="font-semibold">Email</span> (Verified Collection)</div>
                      </div>
                    </div>

                    {/* Grids */}
                    {normalizedItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-200 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-950 truncate max-w-[200px]" title={item.gridTitle}>
                            {item.gridTitle}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-800 font-semibold shrink-0">
                            Grid (8 Rows × 5 Cols)
                          </span>
                        </div>
                        <div className="text-[10px] text-purple-900/80">
                          {BCE_FEEDBACK_PARAMETERS.map(p => (
                            <div key={p.id} className="truncate">• {p.id}. {p.title}</div>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-purple-700 pt-0.5">
                          <span className="font-semibold">Columns:</span> {BCE_RATING_OPTIONS.join(' | ')}
                        </div>
                      </div>
                    ))}

                    {/* General Remarks */}
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">General Feedback</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-200 text-slate-600 font-medium">Optional</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Constructive feedback / suggestions for improvement</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
