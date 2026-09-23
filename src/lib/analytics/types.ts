/**
 * Types and Interfaces for Multi-Tenant Faculty Feedback Analytics & Reporting
 */

export type RatingOption = 'Excellent' | 'Very Good' | 'Good' | 'Satisfactory' | 'Unsatisfactory';

export const RATING_WEIGHTS: Record<RatingOption, number> = {
  'Excellent': 5,
  'Very Good': 4,
  'Good': 3,
  'Satisfactory': 2,
  'Unsatisfactory': 1,
};

export interface CanonicalResponseRow {
  timestamp: string;
  responseId: string;
  studentName?: string;
  registrationNumber?: string;
  comments?: string;
  ratings: Record<number, RatingOption | null>; // 1..8
  isValid: boolean;
}

export interface ParameterMetrics {
  parameterId: number;
  title: string;
  description: string;
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  satisfactoryCount: number;
  unsatisfactoryCount: number;
  validCount: number;
  unansweredCount: number;
  excellentPct: number;
  veryGoodPct: number;
  goodPct: number;
  satisfactoryPct: number;
  unsatisfactoryPct: number;
  averageScore: number; // 1.00 to 5.00 (or 0 if 0 valid responses)
  interpretation: string;
}

export interface OverallDistribution {
  excellentCount: number;
  veryGoodCount: number;
  goodCount: number;
  satisfactoryCount: number;
  unsatisfactoryCount: number;
  totalValidRatings: number;
  excellentPct: number;
  veryGoodPct: number;
  goodPct: number;
  satisfactoryPct: number;
  unsatisfactoryPct: number;
}

export interface FacultyGridAnalyticsItem {
  gridTitle: string;
  facultyId?: string;
  subjectId?: string;
  facultyName: string;
  subjectName: string;
  subjectCode: string;
  report: FormAnalyticsReport;
}

export type PerformanceGrade =
  | 'EXCELLENT'
  | 'VERY GOOD'
  | 'GOOD'
  | 'SATISFACTORY'
  | 'NEEDS ATTENTION'
  | 'NO DATA';

export interface PerformanceGradeInfo {
  grade: PerformanceGrade;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export interface FormAnalyticsReport {
  formId: string;
  collegeId?: string;
  title: string;
  academicYear: string;
  branch: string;
  semester: string;
  facultyName: string;
  subjectName: string;
  subjectCode: string;
  formType: string;
  status: string;
  lastSyncedAt: string | null;
  googleSheetUrl?: string;
  googleFormUrl?: string;
  totalResponses: number;
  totalStudents?: number;
  evaluatedItems?: number;
  percentage?: number;
  validResponses: number;
  unansweredResponses: number;
  parameterAverageScore: number; // 1.00 to 5.00: Mean across evaluation parameters Q1-Q7 (e.g. 2.71)
  averageOverallScore: number; // 1.00 to 5.00: Canonical Overall Rating Q8 (e.g. 3.00)
  compositeAverageScore: number; // Mean across all parameters (backward compatibility)
  performanceGrade: PerformanceGrade;
  performanceGradeInfo?: PerformanceGradeInfo;
  parameters: ParameterMetrics[];
  distribution: OverallDistribution; // All parameters distribution
  parameterDistribution?: OverallDistribution; // Q1–Q7 evaluation parameters distribution
  overallRatingDistribution?: OverallDistribution; // Q8 standalone overall rating distribution
  hasData: boolean;
  generatedAt: string;
  isSemesterForm?: boolean;
  facultyGrids?: FacultyGridAnalyticsItem[];
}

export interface FacultyComparisonItem {
  formId: string;
  facultyName: string;
  subjectName: string;
  subjectCode: string;
  branch: string;
  semester: string;
  responseCount: number;
  averageScore: number;
}

export interface AggregatedAnalyticsReport {
  scopeTitle: string;
  collegeId?: string;
  filters: {
    academicYearId?: string;
    academicYearName?: string;
    branchId?: string;
    branchName?: string;
    semesterId?: string;
    semesterName?: string;
    facultyId?: string;
    facultyName?: string;
    subjectId?: string;
    subjectName?: string;
  };
  totalForms: number;
  formsWithResponses: number;
  totalResponses: number;
  totalStudents?: number;
  evaluatedItems?: number;
  percentage?: number;
  validResponses: number;
  parameterAverageScore: number;
  averageOverallScore: number;
  compositeAverageScore: number;
  performanceGrade: PerformanceGrade;
  performanceGradeInfo?: PerformanceGradeInfo;
  parameters: ParameterMetrics[];
  distribution: OverallDistribution;
  parameterDistribution?: OverallDistribution;
  overallRatingDistribution?: OverallDistribution;
  facultyComparisons: FacultyComparisonItem[];
  hasData: boolean;
  generatedAt: string;
}
