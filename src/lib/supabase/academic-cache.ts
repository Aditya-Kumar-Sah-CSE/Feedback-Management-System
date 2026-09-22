import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { AcademicYear, Branch, Semester } from '@/types/database';

export const ACADEMIC_CACHE_TAG = 'academic_masters';

/**
 * Lean select schemas for reference tables
 */
export const LEAN_YEAR_COLUMNS = 'id, name, is_active';
export const LEAN_BRANCH_COLUMNS = 'id, name, code, is_active';
export const LEAN_SEMESTER_COLUMNS = 'id, name, year_number, semester_number, is_active';
export const LEAN_FACULTY_COLUMNS = 'id, name, department, designation, employee_id, is_active';
export const LEAN_SUBJECT_COLUMNS = 'id, name, code, branch_id, semester_id, is_active';

/**
 * Fetch active academic master records, optionally filtered by college_id.
 * Cached for 60s, invalidated on mutation.
 */
export function getCachedAcademicMasters(collegeId?: string) {
  const cacheKey = collegeId ? `academic_masters_${collegeId}` : 'academic_masters_global';
  const cacheTag = collegeId ? `academic_masters_${collegeId}` : ACADEMIC_CACHE_TAG;

  return unstable_cache(
    async () => {
      const supabase = await createClient();

      let yearQuery = supabase
        .from('academic_years')
        .select(LEAN_YEAR_COLUMNS)
        .eq('is_active', true)
        .order('name', { ascending: false });

      let branchQuery = supabase
        .from('branches')
        .select(LEAN_BRANCH_COLUMNS)
        .eq('is_active', true)
        .order('name', { ascending: true });

      let semesterQuery = supabase
        .from('semesters')
        .select(LEAN_SEMESTER_COLUMNS)
        .eq('is_active', true)
        .order('semester_number', { ascending: true });

      if (collegeId) {
        yearQuery = yearQuery.eq('college_id', collegeId);
        branchQuery = branchQuery.eq('college_id', collegeId);
        semesterQuery = semesterQuery.eq('college_id', collegeId);
      }

      const [
        { data: years },
        { data: branches },
        { data: semesters },
      ] = await Promise.all([yearQuery, branchQuery, semesterQuery]);

      return {
        academicYears: (years || []) as AcademicYear[],
        branches: (branches || []) as Branch[],
        semesters: (semesters || []) as Semester[],
      };
    },
    [cacheKey],
    {
      revalidate: 60,
      tags: [cacheTag, ACADEMIC_CACHE_TAG],
    }
  )();
}

