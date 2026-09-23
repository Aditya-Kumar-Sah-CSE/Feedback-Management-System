'use client';

import { useState, useTransition, useEffect, useMemo, useCallback } from 'react';
import {
  createAcademicYearAction,
  updateAcademicYearAction,
  createBranchAction,
  updateBranchAction,
  deleteBranchAction,
  updateSemesterAction,
  createFacultyAction,
  updateFacultyAction,
  deleteFacultyAction,
  createSubjectAction,
  updateSubjectAction,
  deleteSubjectAction,
  createAssignmentAction,
  deleteAssignmentAction,
  getPaginatedFacultiesAction,
  getPaginatedSubjectsAction,
  getPaginatedAssignmentsAction,
} from '@/app/admin/actions';
import {
  Calendar,
  Layers,
  BookOpen,
  Users,
  GraduationCap,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Building2,
  Search,
  Edit2,
  X,
  Check,
} from 'lucide-react';
import type {
  AcademicYear,
  Branch,
  Semester,
  Faculty,
  Subject,
  FacultySubjectAssignment,
} from '@/types/database';
import { PaginationControl } from '@/components/ui/PaginationControl';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

interface Props {
  academicYears: AcademicYear[];
  branches: Branch[];
  semesters: Semester[];
  faculties: Faculty[];
  subjects: Subject[];
  assignments: FacultySubjectAssignment[];
  initialFacultyTotal?: number;
  initialSubjectTotal?: number;
  initialAssignmentTotal?: number;
  activeCollegeId?: string;
}

export function AcademicManagementTab({
  academicYears,
  branches,
  semesters,
  faculties: initialFaculties,
  subjects: initialSubjects,
  assignments: initialAssignments,
  initialFacultyTotal,
  initialSubjectTotal,
  initialAssignmentTotal,
  activeCollegeId,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<
    'faculties' | 'subjects' | 'assignments' | 'years' | 'branches' | 'semesters'
  >('faculties');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Masters local state (for fast in-place mutation without full dashboard re-fetch)
  const [branchList, setBranchList] = useState<Branch[]>(branches);
  const [yearList, setYearList] = useState<AcademicYear[]>(academicYears);
  const [semesterList, setSemesterList] = useState<Semester[]>(semesters);

  // Only active branches for assignment/subject/faculty dropdowns, sorted alphabetically
  const activeBranches = useMemo(
    () => branchList.filter((b) => b.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [branchList]
  );

  // -------------------------------------------------------------
  // 1. FACULTIES STATE & PAGINATION
  // -------------------------------------------------------------
  const [facultyList, setFacultyList] = useState<Faculty[]>(initialFaculties);
  const [facultyTotal, setFacultyTotal] = useState<number>(initialFacultyTotal ?? initialFaculties.length);
  const [facultyPage, setFacultyPage] = useState<number>(1);
  const [facultyPageSize, setFacultyPageSize] = useState<number>(20);
  const [facultySearch, setFacultySearch] = useState<string>('');
  const [debouncedFacultySearch, setDebouncedFacultySearch] = useState<string>('');
  const [facultyDeptFilter, setFacultyDeptFilter] = useState<string>('ALL');
  const [facultyStatusFilter, setFacultyStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [facultyLoading, setFacultyLoading] = useState<boolean>(false);

  // Faculty form
  const [facName, setFacName] = useState('');
  const [facDept, setFacDept] = useState(
    branches.find((b) => b.is_active)?.name || branches[0]?.name || ''
  );
  const [facDesig, setFacDesig] = useState('Assistant Professor');
  const [facEmpId, setFacEmpId] = useState('');

  // 300ms debounce on faculty search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFacultySearch(facultySearch);
      setFacultyPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [facultySearch]);

  const loadFaculties = useCallback(async () => {
    setFacultyLoading(true);
    const res = await getPaginatedFacultiesAction({
      page: facultyPage,
      pageSize: facultyPageSize,
      search: debouncedFacultySearch,
      department: facultyDeptFilter,
      status: facultyStatusFilter,
      collegeId: activeCollegeId,
    });
    setFacultyLoading(false);
    if (res.success) {
      setFacultyList(res.data as Faculty[]);
      setFacultyTotal(res.total);
    }
  }, [facultyPage, facultyPageSize, debouncedFacultySearch, facultyDeptFilter, facultyStatusFilter, activeCollegeId]);

  useEffect(() => {
    // Only fetch if filters or page actually changed from initial state
    if (debouncedFacultySearch || facultyDeptFilter !== 'ALL' || facultyStatusFilter !== 'ALL' || facultyPage > 1 || facultyPageSize !== 20) {
      loadFaculties();
    }
  }, [loadFaculties, debouncedFacultySearch, facultyDeptFilter, facultyStatusFilter, facultyPage, facultyPageSize]);

  // -------------------------------------------------------------
  // 2. SUBJECTS STATE & PAGINATION
  // -------------------------------------------------------------
  const [subjectList, setSubjectList] = useState<Subject[]>(initialSubjects);
  const [subjectTotal, setSubjectTotal] = useState<number>(initialSubjectTotal ?? initialSubjects.length);
  const [subjectPage, setSubjectPage] = useState<number>(1);
  const [subjectPageSize, setSubjectPageSize] = useState<number>(20);
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [debouncedSubjectSearch, setDebouncedSubjectSearch] = useState<string>('');
  const [subjectBranchFilter, setSubjectBranchFilter] = useState<string>('ALL');
  const [subjectSemesterFilter, setSubjectSemesterFilter] = useState<string>('ALL');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [subjectLoading, setSubjectLoading] = useState<boolean>(false);

  // Subject form
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subBranchId, setSubBranchId] = useState(
    branches.find((b) => b.is_active)?.id || branches[0]?.id || ''
  );
  const [subSemesterId, setSubSemesterId] = useState(semesters[0]?.id || '');

  // 300ms debounce on subject search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSubjectSearch(subjectSearch);
      setSubjectPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [subjectSearch]);

  const loadSubjects = useCallback(async () => {
    setSubjectLoading(true);
    const res = await getPaginatedSubjectsAction({
      page: subjectPage,
      pageSize: subjectPageSize,
      search: debouncedSubjectSearch,
      branchId: subjectBranchFilter,
      semesterId: subjectSemesterFilter,
      status: subjectStatusFilter,
      collegeId: activeCollegeId,
    });
    setSubjectLoading(false);
    if (res.success) {
      setSubjectList(res.data as Subject[]);
      setSubjectTotal(res.total);
    }
  }, [subjectPage, subjectPageSize, debouncedSubjectSearch, subjectBranchFilter, subjectSemesterFilter, subjectStatusFilter, activeCollegeId]);

  useEffect(() => {
    if (debouncedSubjectSearch || subjectBranchFilter !== 'ALL' || subjectSemesterFilter !== 'ALL' || subjectStatusFilter !== 'ALL' || subjectPage > 1 || subjectPageSize !== 20) {
      loadSubjects();
    }
  }, [loadSubjects, debouncedSubjectSearch, subjectBranchFilter, subjectSemesterFilter, subjectStatusFilter, subjectPage, subjectPageSize]);

  // -------------------------------------------------------------
  // 3. ASSIGNMENTS STATE & PAGINATION
  // -------------------------------------------------------------
  const [assignmentList, setAssignmentList] = useState<FacultySubjectAssignment[]>(initialAssignments);
  const [assignTotal, setAssignTotal] = useState<number>(initialAssignmentTotal ?? initialAssignments.length);
  const [assignPage, setAssignPage] = useState<number>(1);
  const [assignPageSize, setAssignPageSize] = useState<number>(20);
  const [assignYearFilter, setAssignYearFilter] = useState<string>('ALL');
  const [assignBranchFilter, setAssignBranchFilter] = useState<string>('ALL');
  const [assignSemesterFilter, setAssignSemesterFilter] = useState<string>('ALL');
  const [assignLoading, setAssignLoading] = useState<boolean>(false);

  // Assignment form
  const [assignFacultyId, setAssignFacultyId] = useState(initialFaculties[0]?.id || '');
  const [assignSubjectId, setAssignSubjectId] = useState(initialSubjects[0]?.id || '');
  const [assignYearId, setAssignYearId] = useState(
    academicYears.find((y) => y.is_active)?.id || academicYears[0]?.id || ''
  );
  const [assignBranchId, setAssignBranchId] = useState(
    branches.find((b) => b.is_active)?.id || branches[0]?.id || ''
  );
  const [assignSemesterId, setAssignSemesterId] = useState(semesters[0]?.id || '');

  const loadAssignments = useCallback(async () => {
    setAssignLoading(true);
    const res = await getPaginatedAssignmentsAction({
      page: assignPage,
      pageSize: assignPageSize,
      academicYearId: assignYearFilter,
      branchId: assignBranchFilter,
      semesterId: assignSemesterFilter,
      collegeId: activeCollegeId,
    });
    setAssignLoading(false);
    if (res.success) {
      setAssignmentList(res.data as FacultySubjectAssignment[]);
      setAssignTotal(res.total);
    }
  }, [assignPage, assignPageSize, assignYearFilter, assignBranchFilter, assignSemesterFilter, activeCollegeId]);

  useEffect(() => {
    if (assignYearFilter !== 'ALL' || assignBranchFilter !== 'ALL' || assignSemesterFilter !== 'ALL' || assignPage > 1 || assignPageSize !== 20) {
      loadAssignments();
    }
  }, [loadAssignments, assignYearFilter, assignBranchFilter, assignSemesterFilter, assignPage, assignPageSize]);

  // Options for SearchableSelect
  const facultyOptions = useMemo(
    () =>
      facultyList.map((f) => ({
        id: f.id,
        label: f.name,
        sublabel: f.department || 'General',
      })),
    [facultyList]
  );

  const subjectOptions = useMemo(
    () =>
      subjectList.map((s) => ({
        id: s.id,
        label: s.name,
        sublabel: s.code,
      })),
    [subjectList]
  );

  // 4. Year & Branch forms
  const [yearName, setYearName] = useState('');
  const [yearActive, setYearActive] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchCode, setEditBranchCode] = useState('');
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);

  // -------------------------------------------------------------
  // HANDLERS (With immediate local state updates)
  // -------------------------------------------------------------

  const handleCreateFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await createFacultyAction({
        name: facName,
        department: facDept,
        designation: facDesig,
        employee_id: facEmpId || undefined,
        is_active: true,
        collegeId: activeCollegeId,
      });
      if (res.success && res.faculty) {
        setMessage({ type: 'success', text: `Faculty ${facName} added successfully.` });
        setFacultyList((prev) => [res.faculty as Faculty, ...prev]);
        setFacultyTotal((prev) => prev + 1);
        setFacName('');
        setFacEmpId('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to create faculty.' });
      }
    });
  };

  const handleToggleFacultyActive = (f: Faculty) => {
    const nextActive = !f.is_active;
    // Optimistic update
    setFacultyList((prev) =>
      prev.map((item) => (item.id === f.id ? { ...item, is_active: nextActive } : item))
    );

    startTransition(async () => {
      const res = await updateFacultyAction(f.id, {
        name: f.name,
        department: f.department,
        designation: f.designation,
        employee_id: f.employee_id || undefined,
        is_active: nextActive,
        collegeId: activeCollegeId,
      });
      if (!res.success) {
        // Rollback
        setFacultyList((prev) =>
          prev.map((item) => (item.id === f.id ? { ...item, is_active: f.is_active } : item))
        );
        setMessage({ type: 'error', text: res.error || 'Failed to update faculty status.' });
      }
    });
  };

  const handleDeleteFaculty = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete faculty member ${name}?`)) return;
    setMessage(null);

    const prevList = [...facultyList];
    setFacultyList((prev) => prev.filter((item) => item.id !== id));
    setFacultyTotal((prev) => Math.max(0, prev - 1));

    startTransition(async () => {
      const res = await deleteFacultyAction(id, activeCollegeId);
      if (res.success) {
        setMessage({ type: 'success', text: `Faculty ${name} deleted successfully.` });
      } else {
        setFacultyList(prevList);
        setFacultyTotal((prev) => prev + 1);
        setMessage({ type: 'error', text: res.error || 'Failed to delete faculty.' });
      }
    });
  };

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await createSubjectAction({
        name: subName,
        code: subCode,
        branch_id: subBranchId || undefined,
        semester_id: subSemesterId || undefined,
        is_active: true,
        collegeId: activeCollegeId,
      });
      if (res.success && res.subject) {
        setMessage({ type: 'success', text: `Subject ${subName} (${subCode}) added successfully.` });
        setSubjectList((prev) => [res.subject as Subject, ...prev]);
        setSubjectTotal((prev) => prev + 1);
        setSubName('');
        setSubCode('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to create subject.' });
      }
    });
  };

  const handleToggleSubjectActive = (s: Subject) => {
    const nextActive = !s.is_active;
    setSubjectList((prev) =>
      prev.map((item) => (item.id === s.id ? { ...item, is_active: nextActive } : item))
    );

    startTransition(async () => {
      const res = await updateSubjectAction(s.id, {
        name: s.name,
        code: s.code,
        branch_id: s.branch_id || undefined,
        semester_id: s.semester_id || undefined,
        is_active: nextActive,
        collegeId: activeCollegeId,
      });
      if (!res.success) {
        setSubjectList((prev) =>
          prev.map((item) => (item.id === s.id ? { ...item, is_active: s.is_active } : item))
        );
        setMessage({ type: 'error', text: res.error || 'Failed to update subject status.' });
      }
    });
  };

  const handleDeleteSubject = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete subject ${name}?`)) return;
    setMessage(null);

    const prevList = [...subjectList];
    setSubjectList((prev) => prev.filter((item) => item.id !== id));
    setSubjectTotal((prev) => Math.max(0, prev - 1));

    startTransition(async () => {
      const res = await deleteSubjectAction(id, activeCollegeId);
      if (res.success) {
        setMessage({ type: 'success', text: `Subject ${name} deleted successfully.` });
      } else {
        setSubjectList(prevList);
        setSubjectTotal((prev) => prev + 1);
        setMessage({ type: 'error', text: res.error || 'Failed to delete subject.' });
      }
    });
  };

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!assignFacultyId || !assignSubjectId || !assignYearId) {
      setMessage({ type: 'error', text: 'Please select faculty, subject, and session.' });
      return;
    }
    startTransition(async () => {
      const res = await createAssignmentAction({
        faculty_id: assignFacultyId,
        subject_id: assignSubjectId,
        academic_year_id: assignYearId,
        branch_id: assignBranchId || undefined,
        semester_id: assignSemesterId || undefined,
        is_active: true,
        collegeId: activeCollegeId,
      });
      if (res.success && res.assignment) {
        setMessage({ type: 'success', text: 'Faculty assignment created successfully.' });
        // Enhance with relations for instant display
        const faculty = facultyList.find((f) => f.id === assignFacultyId);
        const subject = subjectList.find((s) => s.id === assignSubjectId);
        const year = yearList.find((y) => y.id === assignYearId);
        const branch = branchList.find((b) => b.id === assignBranchId);
        const semester = semesterList.find((s) => s.id === assignSemesterId);

        const newObj = {
          ...res.assignment,
          faculty,
          subject,
          academic_year: year,
          branch,
          semester,
        } as FacultySubjectAssignment;

        setAssignmentList((prev) => [newObj, ...prev]);
        setAssignTotal((prev) => prev + 1);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to create assignment.' });
      }
    });
  };

  const handleDeleteAssignment = (id: string) => {
    if (!confirm('Are you sure you want to remove this faculty assignment?')) return;
    setMessage(null);

    const prevList = [...assignmentList];
    setAssignmentList((prev) => prev.filter((item) => item.id !== id));
    setAssignTotal((prev) => Math.max(0, prev - 1));

    startTransition(async () => {
      const res = await deleteAssignmentAction(id, activeCollegeId);
      if (res.success) {
        setMessage({ type: 'success', text: 'Assignment removed.' });
      } else {
        setAssignmentList(prevList);
        setAssignTotal((prev) => prev + 1);
        setMessage({ type: 'error', text: res.error || 'Failed to remove assignment.' });
      }
    });
  };

  const handleCreateYear = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await createAcademicYearAction({ name: yearName, is_active: yearActive, collegeId: activeCollegeId });
      if (res.success && res.year) {
        setMessage({ type: 'success', text: `Academic Year ${yearName} added.` });
        setYearList((prev) => [res.year as AcademicYear, ...prev]);
        setYearName('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to add year.' });
      }
    });
  };

  const handleToggleYear = (y: AcademicYear) => {
    const nextActive = !y.is_active;
    setYearList((prev) =>
      prev.map((item) => (item.id === y.id ? { ...item, is_active: nextActive } : item))
    );

    startTransition(async () => {
      const res = await updateAcademicYearAction(y.id, { name: y.name, is_active: nextActive, collegeId: activeCollegeId });
      if (!res.success) {
        setYearList((prev) =>
          prev.map((item) => (item.id === y.id ? { ...item, is_active: y.is_active } : item))
        );
        setMessage({ type: 'error', text: res.error || 'Failed to update year.' });
      }
    });
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await createBranchAction({ name: branchName, code: branchCode, is_active: true, collegeId: activeCollegeId });
      if (res.success && res.branch) {
        setMessage({ type: 'success', text: `Branch ${branchName} (${branchCode}) created.` });
        setBranchList((prev) => [...prev, res.branch as Branch]);
        setBranchName('');
        setBranchCode('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to add branch.' });
      }
    });
  };

  const handleToggleBranch = (b: Branch) => {
    const nextActive = !b.is_active;
    setBranchList((prev) =>
      prev.map((item) => (item.id === b.id ? { ...item, is_active: nextActive } : item))
    );

    startTransition(async () => {
      const res = await updateBranchAction(b.id, { name: b.name, code: b.code, is_active: nextActive, collegeId: activeCollegeId });
      if (!res.success) {
        setBranchList((prev) =>
          prev.map((item) => (item.id === b.id ? { ...item, is_active: b.is_active } : item))
        );
        setMessage({ type: 'error', text: res.error || 'Failed to update branch.' });
      }
    });
  };

  const handleOpenEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setEditBranchName(b.name);
    setEditBranchCode(b.code);
  };

  const handleUpdateBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    setMessage(null);
    startTransition(async () => {
      const res = await updateBranchAction(editingBranch.id, {
        name: editBranchName,
        code: editBranchCode,
        is_active: editingBranch.is_active,
        collegeId: activeCollegeId,
      });
      if (res.success) {
        setMessage({
          type: 'success',
          text: `Branch updated to "${editBranchName.trim()}" (${editBranchCode.trim().toUpperCase()}).`,
        });
        setBranchList((prev) =>
          prev.map((b) =>
            b.id === editingBranch.id
              ? { ...b, name: editBranchName.trim(), code: editBranchCode.trim().toUpperCase() }
              : b
          )
        );
        setEditingBranch(null);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update branch.' });
      }
    });
  };

  const handleDeleteBranchConfirm = () => {
    if (!deletingBranch) return;
    setMessage(null);
    startTransition(async () => {
      const res = await deleteBranchAction(deletingBranch.id, activeCollegeId);
      if (res.success) {
        setMessage({
          type: 'success',
          text: `Branch "${deletingBranch.name}" (${deletingBranch.code}) deleted successfully.`,
        });
        setBranchList((prev) => prev.filter((b) => b.id !== deletingBranch.id));
        setDeletingBranch(null);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to delete branch.' });
        setDeletingBranch(null);
      }
    });
  };

  const handleToggleSemester = (s: Semester) => {
    const nextActive = !s.is_active;
    setSemesterList((prev) =>
      prev.map((item) => (item.id === s.id ? { ...item, is_active: nextActive } : item))
    );

    startTransition(async () => {
      const res = await updateSemesterAction(s.id, {
        name: s.name,
        year_number: s.year_number,
        semester_number: s.semester_number,
        is_active: nextActive,
        collegeId: activeCollegeId,
      });
      if (!res.success) {
        setSemesterList((prev) =>
          prev.map((item) => (item.id === s.id ? { ...item, is_active: s.is_active } : item))
        );
        setMessage({ type: 'error', text: res.error || 'Failed to update semester.' });
      }
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
      {/* Sub-Navigation Tabs */}
      <div className="bg-white p-1.5 sm:p-2 rounded-2xl border border-slate-200 shadow-xs flex overflow-x-auto no-scrollbar gap-1.5 w-full max-w-full min-w-0 touch-pan-x sm:flex-wrap">
        {[
          { id: 'faculties', label: `Faculties (${facultyTotal})`, icon: Users },
          { id: 'subjects', label: `Subjects (${subjectTotal})`, icon: BookOpen },
          { id: 'assignments', label: `Assignments (${assignTotal})`, icon: GraduationCap },
          { id: 'years', label: `Academic Years (${yearList.length})`, icon: Calendar },
          { id: 'branches', label: `Branches (${branchList.length})`, icon: Layers },
          { id: 'semesters', label: `Semesters (${semesterList.length})`, icon: Building2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[40px] sm:min-h-[36px] ${
                isActive
                  ? 'bg-bce-navy text-amber-400 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
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

      {/* 1. FACULTIES SUBTAB */}
      {activeSubTab === 'faculties' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0">
          {/* Add Faculty Form */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 min-w-0 w-full">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-bce-cobalt" />
              Add New Faculty
            </h4>
            <form onSubmit={handleCreateFaculty} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Faculty Name</label>
                <input
                  type="text"
                  required
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  placeholder="e.g. Dr. Anil Kumar"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Department / Branch *</label>
                <select
                  value={facDept}
                  onChange={(e) => setFacDept(e.target.value)}
                  required
                  aria-label="Department / Branch"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                >
                  <option value="">Select Branch / Discipline</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Designation</label>
                <input
                  type="text"
                  required
                  value={facDesig}
                  onChange={(e) => setFacDesig(e.target.value)}
                  placeholder="e.g. Assistant Professor / HOD"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Employee ID (Optional)</label>
                <input
                  type="text"
                  value={facEmpId}
                  onChange={(e) => setFacEmpId(e.target.value)}
                  placeholder="e.g. EMP-101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isPending ? 'Adding Faculty...' : 'Add Faculty'}</span>
              </button>
            </form>
          </div>

          {/* Faculty List with Fast Search, Filter & Pagination */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-w-0 w-full">
            {/* Filter / Search Header */}
            <div className="p-3.5 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  placeholder="Search faculty..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                />
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={facultyDeptFilter}
                  onChange={(e) => {
                    setFacultyDeptFilter(e.target.value);
                    setFacultyPage(1);
                  }}
                  aria-label="Filter Department"
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Departments</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>

                <select
                  value={facultyStatusFilter}
                  onChange={(e) => {
                    setFacultyStatusFilter(e.target.value as any);
                    setFacultyPage(1);
                  }}
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto min-w-0">
              {facultyLoading ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-bce-cobalt" />
                  <span>Loading faculties...</span>
                </div>
              ) : facultyList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No faculty members found matching your search.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5">Designation</th>
                      <th className="px-4 py-2.5">Emp ID</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facultyList.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-slate-800">{f.name}</td>
                        <td className="px-4 py-2.5 text-slate-600">{f.department}</td>
                        <td className="px-4 py-2.5 text-slate-500">{f.designation}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{f.employee_id || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleToggleFacultyActive(f)}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                              f.is_active
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {f.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => handleDeleteFaculty(f.id, f.name)}
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete faculty member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={facultyPage}
              totalPages={Math.ceil(facultyTotal / facultyPageSize)}
              totalItems={facultyTotal}
              pageSize={facultyPageSize}
              onPageChange={setFacultyPage}
              onPageSizeChange={(sz) => {
                setFacultyPageSize(sz);
                setFacultyPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
              isLoading={facultyLoading}
            />
          </div>
        </div>
      )}

      {/* 2. SUBJECTS SUBTAB */}
      {activeSubTab === 'subjects' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0">
          {/* Add Subject Form */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 min-w-0 w-full">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-bce-cobalt" />
              Add New Subject
            </h4>
            <form onSubmit={handleCreateSubject} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="e.g. Data Structures & Algorithms"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Code</label>
                <input
                  type="text"
                  required
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  placeholder="e.g. CS-401"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Branch / Discipline</label>
                <select
                  value={subBranchId}
                  onChange={(e) => setSubBranchId(e.target.value)}
                  aria-label="Branch / Discipline"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                >
                  <option value="">Common / All Branches</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Semester</label>
                <select
                  value={subSemesterId}
                  onChange={(e) => setSubSemesterId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                >
                  <option value="">Any Semester</option>
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isPending ? 'Adding Subject...' : 'Add Subject'}</span>
              </button>
            </form>
          </div>

          {/* Subjects List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-w-0 w-full">
            {/* Filter Header */}
            <div className="p-3.5 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  placeholder="Code or name..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                />
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={subjectBranchFilter}
                  onChange={(e) => {
                    setSubjectBranchFilter(e.target.value);
                    setSubjectPage(1);
                  }}
                  aria-label="Filter Branch"
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Branches</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </select>

                <select
                  value={subjectSemesterFilter}
                  onChange={(e) => {
                    setSubjectSemesterFilter(e.target.value);
                    setSubjectPage(1);
                  }}
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Semesters</option>
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  value={subjectStatusFilter}
                  onChange={(e) => {
                    setSubjectStatusFilter(e.target.value as any);
                    setSubjectPage(1);
                  }}
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto">
              {subjectLoading ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-bce-cobalt" />
                  <span>Loading subjects...</span>
                </div>
              ) : subjectList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No subjects registered matching your criteria.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Code</th>
                      <th className="px-4 py-2.5">Subject Name</th>
                      <th className="px-4 py-2.5">Branch</th>
                      <th className="px-4 py-2.5">Semester</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjectList.map((s) => {
                      const branch = branchList.find((b) => b.id === s.branch_id);
                      const sem = semesterList.find((sm) => sm.id === s.semester_id);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{s.code}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{s.name}</td>
                          <td className="px-4 py-2.5 text-slate-600">{branch?.code || 'All'}</td>
                          <td className="px-4 py-2.5 text-slate-500">{sem?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleToggleSubjectActive(s)}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                                s.is_active
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => handleDeleteSubject(s.id, s.name)}
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete subject"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={subjectPage}
              totalPages={Math.ceil(subjectTotal / subjectPageSize)}
              totalItems={subjectTotal}
              pageSize={subjectPageSize}
              onPageChange={setSubjectPage}
              onPageSizeChange={(sz) => {
                setSubjectPageSize(sz);
                setSubjectPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
              isLoading={subjectLoading}
            />
          </div>
        </div>
      )}

      {/* 3. ASSIGNMENTS SUBTAB */}
      {activeSubTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0">
          {/* Add Assignment Form with SearchableSelect */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 min-w-0 w-full">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-bce-cobalt" />
              Assign Faculty to Subject
            </h4>
            <form onSubmit={handleCreateAssignment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Faculty Member</label>
                <SearchableSelect
                  options={facultyOptions}
                  value={assignFacultyId}
                  onChange={setAssignFacultyId}
                  placeholder="Choose faculty..."
                  searchPlaceholder="Search faculty by name..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                <SearchableSelect
                  options={subjectOptions}
                  value={assignSubjectId}
                  onChange={setAssignSubjectId}
                  placeholder="Choose subject..."
                  searchPlaceholder="Search subject by code or title..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Academic Session</label>
                <select
                  value={assignYearId}
                  onChange={(e) => setAssignYearId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                >
                  {yearList.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Branch / Discipline</label>
                <select
                  value={assignBranchId}
                  onChange={(e) => setAssignBranchId(e.target.value)}
                  aria-label="Branch / Discipline"
                  disabled={activeBranches.length === 0}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {!assignBranchId && (
                    <option value="" disabled>
                      Select Branch / Discipline
                    </option>
                  )}
                  {activeBranches.length === 0 ? (
                    <option value="" disabled>
                      No active branches available
                    </option>
                  ) : (
                    activeBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Semester</label>
                <select
                  value={assignSemesterId}
                  onChange={(e) => setAssignSemesterId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                >
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isPending ? 'Assigning Faculty...' : 'Assign Faculty'}</span>
              </button>
            </form>
          </div>

          {/* Assignments List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-w-0 w-full">
            {/* Filter Header */}
            <div className="p-3.5 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="text-xs font-bold text-slate-700">Filter Assignments:</div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={assignYearFilter}
                  onChange={(e) => {
                    setAssignYearFilter(e.target.value);
                    setAssignPage(1);
                  }}
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Sessions</option>
                  {yearList.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>

                <select
                  value={assignBranchFilter}
                  onChange={(e) => {
                    setAssignBranchFilter(e.target.value);
                    setAssignPage(1);
                  }}
                  aria-label="Filter Branch"
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Branches</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </select>

                <select
                  value={assignSemesterFilter}
                  onChange={(e) => {
                    setAssignSemesterFilter(e.target.value);
                    setAssignPage(1);
                  }}
                  className="flex-1 sm:flex-none px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-base sm:text-xs min-h-[38px] sm:min-h-[32px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-bce-cobalt"
                >
                  <option value="ALL">All Semesters</option>
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto">
              {assignLoading ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-bce-cobalt" />
                  <span>Loading assignments...</span>
                </div>
              ) : assignmentList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No faculty assignments configured for the selected filters.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Faculty</th>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5">Session</th>
                      <th className="px-4 py-2.5">Branch</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignmentList.map((a) => {
                      const faculty = a.faculty || facultyList.find((f) => f.id === a.faculty_id);
                      const subject = a.subject || subjectList.find((s) => s.id === a.subject_id);
                      const year = a.academic_year || yearList.find((y) => y.id === a.academic_year_id);
                      const branch = a.branch || branchList.find((b) => b.id === a.branch_id);
                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-slate-800">{faculty?.name || 'Faculty'}</td>
                          <td className="px-4 py-2.5 text-slate-700">{subject?.name || 'Subject'}</td>
                          <td className="px-4 py-2.5 text-slate-500 font-mono">{year?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-500">{branch?.code || 'All'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => handleDeleteAssignment(a.id)}
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete Assignment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            <PaginationControl
              currentPage={assignPage}
              totalPages={Math.ceil(assignTotal / assignPageSize)}
              totalItems={assignTotal}
              pageSize={assignPageSize}
              onPageChange={setAssignPage}
              onPageSizeChange={(sz) => {
                setAssignPageSize(sz);
                setAssignPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
              isLoading={assignLoading}
            />
          </div>
        </div>
      )}

      {/* 4. ACADEMIC YEARS SUBTAB */}
      {activeSubTab === 'years' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 min-w-0 w-full">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-bce-cobalt" />
              Add Academic Year
            </h4>
            <form onSubmit={handleCreateYear} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Session Name</label>
                <input
                  type="text"
                  required
                  value={yearName}
                  onChange={(e) => setYearName(e.target.value)}
                  placeholder="e.g. 2026-2027"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="yrActive"
                  checked={yearActive}
                  onChange={(e) => setYearActive(e.target.checked)}
                  className="rounded border-slate-300 text-bce-cobalt focus:ring-bce-cobalt"
                />
                <label htmlFor="yrActive" className="text-xs text-slate-700 font-medium">
                  Set as Active Session
                </label>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isPending ? 'Adding Year...' : 'Add Year'}</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden min-w-0 w-full">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Academic Sessions ({yearList.length})</h4>
            </div>
            <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Session Name</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Toggle Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearList.map((y) => (
                  <tr key={y.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-800">{y.name}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          y.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {y.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleToggleYear(y)}
                        className="text-bce-cobalt hover:underline text-xs font-semibold cursor-pointer"
                      >
                        {y.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. BRANCHES SUBTAB */}
      {activeSubTab === 'branches' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full min-w-0">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 min-w-0 w-full">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-bce-cobalt" />
              Add Engineering Branch
            </h4>
            <form onSubmit={handleCreateBranch} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Branch Name</label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. Artificial Intelligence & Data Science"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Branch Code</label>
                <input
                  type="text"
                  required
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  placeholder="e.g. AI-DS"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base sm:text-xs min-h-[42px] sm:min-h-[36px] text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isPending ? 'Adding Branch...' : 'Add Branch'}</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden min-w-0 w-full">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Engineering Branches ({branchList.length})</h4>
            </div>
            <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Branch Name</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchList.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono font-bold text-slate-800">{b.code}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{b.name}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          b.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {b.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditBranch(b)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                          title="Edit Branch"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleBranch(b)}
                          className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                            b.is_active
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {b.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingBranch(b)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete Branch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Edit Branch Modal */}
          {editingBranch && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Edit2 className="w-4 h-4 text-bce-cobalt" />
                    <span>Edit Engineering Branch</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditingBranch(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleUpdateBranchSubmit} className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editBranchName}
                      onChange={(e) => setEditBranchName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Branch Code
                    </label>
                    <input
                      type="text"
                      required
                      value={editBranchCode}
                      onChange={(e) => setEditBranchCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-bce-cobalt/20"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingBranch(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl bg-bce-cobalt hover:bg-bce-navy text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                    >
                      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Save Changes</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Branch Confirmation Modal */}
          {deletingBranch && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Confirm Branch Deletion</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setDeletingBranch(null)}
                    className="p-1 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-3 text-xs text-slate-600">
                  <p className="text-slate-800 font-medium">
                    Are you sure you want to permanently delete the branch:
                  </p>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 flex items-center justify-between">
                    <span>{deletingBranch.name}</span>
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                      {deletingBranch.code}
                    </span>
                  </div>
                  <p className="text-rose-600 text-[11px] leading-relaxed">
                    ⚠️ Deletion is permanently blocked if any feedback forms, subjects, faculty members, or teaching assignments are linked to this branch.
                  </p>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeletingBranch(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteBranchConfirm}
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                  >
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>Delete Branch</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. SEMESTERS SUBTAB */}
      {activeSubTab === 'semesters' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full min-w-0">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">Configured Semesters ({semesterList.length})</h4>
            <span className="text-xs text-slate-400">8 Semester Curriculum Structure</span>
          </div>
          <div className="overflow-x-auto min-w-0">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Semester</th>
                <th className="px-5 py-3">Year Level</th>
                <th className="px-5 py-3">Semester #</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {semesterList.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-800">{s.name}</td>
                  <td className="px-5 py-3 text-slate-600">Year {s.year_number}</td>
                  <td className="px-5 py-3 text-slate-600">Semester {s.semester_number}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        s.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleToggleSemester(s)}
                      className="text-bce-cobalt hover:underline text-xs font-semibold cursor-pointer"
                    >
                      {s.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
