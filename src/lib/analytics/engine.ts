/**
 * Unified Analytics Engine for Faculty Feedback
 * Single Source of Truth for Dashboard, Charts, and PDF Reports.
 */

import { BCE_FEEDBACK_PARAMETERS } from '@/lib/google/template';
import {
  CanonicalResponseRow,
  FormAnalyticsReport,
  AggregatedAnalyticsReport,
  ParameterMetrics,
  OverallDistribution,
  FacultyComparisonItem,
  PerformanceGrade,
  PerformanceGradeInfo,
  RATING_WEIGHTS,
} from './types';

/**
 * Institutional Performance Grading Rubric:
 * Evaluated on a 5.00-point scale:
 * >= 4.50: EXCELLENT
 * >= 3.75: VERY GOOD
 * >= 3.00: GOOD
 * >= 2.00: SATISFACTORY
 * < 2.00: NEEDS ATTENTION
 * No valid data: NO DATA
 */
export function calculatePerformanceGrade(
  score: number | null | undefined,
  hasData: boolean
): PerformanceGrade {
  if (!hasData || score === null || score === undefined || isNaN(score) || score <= 0) {
    return 'NO DATA';
  }
  if (score >= 4.5) return 'EXCELLENT';
  if (score >= 3.75) return 'VERY GOOD';
  if (score >= 3.0) return 'GOOD';
  if (score >= 2.0) return 'SATISFACTORY';
  return 'NEEDS ATTENTION';
}

/**
 * Returns canonical badge styling and label for a performance grade
 */
export function getPerformanceGradeInfo(
  score: number | null | undefined,
  hasData: boolean
): PerformanceGradeInfo {
  const grade = calculatePerformanceGrade(score, hasData);
  switch (grade) {
    case 'EXCELLENT':
      return {
        grade,
        label: 'EXCELLENT',
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-300',
      };
    case 'VERY GOOD':
      return {
        grade,
        label: 'VERY GOOD',
        color: 'text-indigo-700',
        bgColor: 'bg-indigo-50',
        borderColor: 'border-indigo-300',
      };
    case 'GOOD':
      return {
        grade,
        label: 'GOOD',
        color: 'text-blue-700',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-300',
      };
    case 'SATISFACTORY':
      return {
        grade,
        label: 'SATISFACTORY',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-300',
      };
    case 'NEEDS ATTENTION':
      return {
        grade,
        label: 'NEEDS ATTENTION',
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-300',
      };
    case 'NO DATA':
    default:
      return {
        grade: 'NO DATA',
        label: 'NO DATA',
        color: 'text-slate-400',
        bgColor: 'bg-slate-100',
        borderColor: 'border-slate-300',
      };
  }
}

/**
 * Shared helper to count unique student submissions deduplicating by authoritative Google Forms response ID.
 * One Google Forms submission represents ONE student response, regardless of how many faculty grids exist.
 */
export function countUniqueStudentResponses(responses: CanonicalResponseRow[]): number {
  if (!responses || responses.length === 0) return 0;
  const uniqueIds = new Set<string>();

  for (const r of responses) {
    // 1. Authoritative responseId if present and not generic fallback
    if (r.responseId && !r.responseId.startsWith('row-')) {
      uniqueIds.add(r.responseId.trim());
      continue;
    }

    // 2. Stable identifier from registrationNumber or studentName + timestamp if available
    const regOrName = (r.registrationNumber || r.studentName || '').trim().toLowerCase();
    const ts = (r.timestamp || '').trim();
    if (regOrName && ts) {
      uniqueIds.add(`${ts}_${regOrName}`);
      continue;
    }

    // 3. Fallback to responseId (which for multi-grids contains row-${rowIdx + 1}, identical for all grids in the same row)
    const fallback = (r.responseId || r.timestamp || '').trim();
    if (fallback) {
      uniqueIds.add(fallback);
    }
  }

  return uniqueIds.size;
}

/**
 * Computes analytics for a single feedback form from normalized canonical responses.
 */
export function calculateFormAnalytics(params: {
  formId: string;
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
  responses: CanonicalResponseRow[];
}): FormAnalyticsReport {
  const { responses } = params;

  const isValidRow = (r: CanonicalResponseRow) =>
    r.isValid ?? Object.values(r.ratings || {}).some(v => v !== null && v !== undefined);

  // Authoritative student count: COUNT(DISTINCT response_id)
  const totalStudents = countUniqueStudentResponses(responses);
  const validStudents = countUniqueStudentResponses(responses.filter(isValidRow));
  const evaluatedItems = responses.filter(isValidRow).length;
  
  // For semester forms: totalResponses = unique students, validResponses = evaluated items
  const totalResponses = totalStudents;
  const validResponses = evaluatedItems;
  const unansweredResponses = Math.max(0, totalStudents - validStudents);
  const hasData = evaluatedItems > 0;

  let totalAllScores = 0;
  let totalAllRatingsCount = 0;

  // Track global rating counts across all questions
  let globalExcellent = 0;
  let globalVeryGood = 0;
  let globalGood = 0;
  let globalSatisfactory = 0;
  let globalUnsatisfactory = 0;

  // Compute metrics for each of the 8 canonical parameters
  const parameters: ParameterMetrics[] = BCE_FEEDBACK_PARAMETERS.map(param => {
    const pId = param.id;
    let exCount = 0;
    let vgCount = 0;
    let gCount = 0;
    let sCount = 0;
    let uCount = 0;

    for (const resp of responses) {
      const rating = resp.ratings[pId];
      if (rating === 'Excellent') exCount++;
      else if (rating === 'Very Good') vgCount++;
      else if (rating === 'Good') gCount++;
      else if (rating === 'Satisfactory') sCount++;
      else if (rating === 'Unsatisfactory') uCount++;
    }

    const validCount = exCount + vgCount + gCount + sCount + uCount;
    const unansweredCount = responses.length - validCount;

    // Accumulate global counts
    globalExcellent += exCount;
    globalVeryGood += vgCount;
    globalGood += gCount;
    globalSatisfactory += sCount;
    globalUnsatisfactory += uCount;

    const excellentPct = validCount > 0 ? Number(((exCount / validCount) * 100).toFixed(1)) : 0;
    const veryGoodPct = validCount > 0 ? Number(((vgCount / validCount) * 100).toFixed(1)) : 0;
    const goodPct = validCount > 0 ? Number(((gCount / validCount) * 100).toFixed(1)) : 0;
    const satisfactoryPct = validCount > 0 ? Number(((sCount / validCount) * 100).toFixed(1)) : 0;
    const unsatisfactoryPct = validCount > 0 ? Number(((uCount / validCount) * 100).toFixed(1)) : 0;

    // Weighted average: (EX*5 + VG*4 + G*3 + S*2 + U*1) / validCount
    let averageScore = 0;
    if (validCount > 0) {
      const scoreSum =
        exCount * RATING_WEIGHTS['Excellent'] +
        vgCount * RATING_WEIGHTS['Very Good'] +
        gCount * RATING_WEIGHTS['Good'] +
        sCount * RATING_WEIGHTS['Satisfactory'] +
        uCount * RATING_WEIGHTS['Unsatisfactory'];

      averageScore = Number((scoreSum / validCount).toFixed(2));
      totalAllScores += scoreSum;
      totalAllRatingsCount += validCount;
    }

    // Factual interpretation strictly derived from data
    const interpretation =
      validCount > 0
        ? `${param.title} received an average score of ${averageScore.toFixed(2)}/5.00 based on ${validCount} valid response${
            validCount > 1 ? 's' : ''
          }.`
        : `No valid response data recorded for ${param.title}.`;

    return {
      parameterId: pId,
      title: param.title,
      description: param.description || '',
      excellentCount: exCount,
      veryGoodCount: vgCount,
      goodCount: gCount,
      satisfactoryCount: sCount,
      unsatisfactoryCount: uCount,
      validCount,
      unansweredCount,
      excellentPct,
      veryGoodPct,
      goodPct,
      satisfactoryPct,
      unsatisfactoryPct,
      averageScore,
      interpretation,
    };
  });

  // Overall distribution across all 8 parameters
  const totalValidRatings =
    globalExcellent + globalVeryGood + globalGood + globalSatisfactory + globalUnsatisfactory;

  const distribution: OverallDistribution = {
    excellentCount: globalExcellent,
    veryGoodCount: globalVeryGood,
    goodCount: globalGood,
    satisfactoryCount: globalSatisfactory,
    unsatisfactoryCount: globalUnsatisfactory,
    totalValidRatings,
    excellentPct: totalValidRatings > 0 ? Number(((globalExcellent / totalValidRatings) * 100).toFixed(1)) : 0,
    veryGoodPct: totalValidRatings > 0 ? Number(((globalVeryGood / totalValidRatings) * 100).toFixed(1)) : 0,
    goodPct: totalValidRatings > 0 ? Number(((globalGood / totalValidRatings) * 100).toFixed(1)) : 0,
    satisfactoryPct: totalValidRatings > 0 ? Number(((globalSatisfactory / totalValidRatings) * 100).toFixed(1)) : 0,
    unsatisfactoryPct: totalValidRatings > 0 ? Number(((globalUnsatisfactory / totalValidRatings) * 100).toFixed(1)) : 0,
  };

  // Evaluation Parameters (Q1 to Q7) metrics & distribution
  let paramScoresSum = 0;
  let paramRatingsCount = 0;
  let paramExcellent = 0;
  let paramVeryGood = 0;
  let paramGood = 0;
  let paramSatisfactory = 0;
  let paramUnsatisfactory = 0;

  for (const param of parameters) {
    if (param.parameterId >= 1 && param.parameterId <= 7) {
      paramExcellent += param.excellentCount;
      paramVeryGood += param.veryGoodCount;
      paramGood += param.goodCount;
      paramSatisfactory += param.satisfactoryCount;
      paramUnsatisfactory += param.unsatisfactoryCount;

      const scoreSum =
        param.excellentCount * RATING_WEIGHTS['Excellent'] +
        param.veryGoodCount * RATING_WEIGHTS['Very Good'] +
        param.goodCount * RATING_WEIGHTS['Good'] +
        param.satisfactoryCount * RATING_WEIGHTS['Satisfactory'] +
        param.unsatisfactoryCount * RATING_WEIGHTS['Unsatisfactory'];

      paramScoresSum += scoreSum;
      paramRatingsCount += param.validCount;
    }
  }

  const parameterAverageScore =
    paramRatingsCount > 0 ? Number((paramScoresSum / paramRatingsCount).toFixed(2)) : 0;

  const totalValidParamRatings =
    paramExcellent + paramVeryGood + paramGood + paramSatisfactory + paramUnsatisfactory;

  const parameterDistribution: OverallDistribution = {
    excellentCount: paramExcellent,
    veryGoodCount: paramVeryGood,
    goodCount: paramGood,
    satisfactoryCount: paramSatisfactory,
    unsatisfactoryCount: paramUnsatisfactory,
    totalValidRatings: totalValidParamRatings,
    excellentPct: totalValidParamRatings > 0 ? Number(((paramExcellent / totalValidParamRatings) * 100).toFixed(1)) : 0,
    veryGoodPct: totalValidParamRatings > 0 ? Number(((paramVeryGood / totalValidParamRatings) * 100).toFixed(1)) : 0,
    goodPct: totalValidParamRatings > 0 ? Number(((paramGood / totalValidParamRatings) * 100).toFixed(1)) : 0,
    satisfactoryPct: totalValidParamRatings > 0 ? Number(((paramSatisfactory / totalValidParamRatings) * 100).toFixed(1)) : 0,
    unsatisfactoryPct: totalValidParamRatings > 0 ? Number(((paramUnsatisfactory / totalValidParamRatings) * 100).toFixed(1)) : 0,
  };

  // Question 8 Standalone Overall Rating distribution
  const param8 = parameters.find(p => p.parameterId === 8);
  const overallRatingDistribution: OverallDistribution = {
    excellentCount: param8?.excellentCount || 0,
    veryGoodCount: param8?.veryGoodCount || 0,
    goodCount: param8?.goodCount || 0,
    satisfactoryCount: param8?.satisfactoryCount || 0,
    unsatisfactoryCount: param8?.unsatisfactoryCount || 0,
    totalValidRatings: param8?.validCount || 0,
    excellentPct: param8?.excellentPct || 0,
    veryGoodPct: param8?.veryGoodPct || 0,
    goodPct: param8?.goodPct || 0,
    satisfactoryPct: param8?.satisfactoryPct || 0,
    unsatisfactoryPct: param8?.unsatisfactoryPct || 0,
  };

  // Composite average across all parameters: strictly SUM(weights) / COUNT(ratings)
  const compositeAverageScore =
    totalAllRatingsCount > 0 ? Number((totalAllScores / totalAllRatingsCount).toFixed(2)) : 0;

  // Percentage on 5-point scale: (average / 5.0) * 100
  const percentage =
    totalAllRatingsCount > 0 ? Number(((compositeAverageScore / 5) * 100).toFixed(2)) : 0;

  // Canonical Overall Rating:
  // Uses Question 8 if present and valid; falls back to parameterAverageScore or compositeAverageScore
  const averageOverallScore =
    param8 && param8.validCount > 0
      ? param8.averageScore
      : parameterAverageScore > 0
      ? parameterAverageScore
      : compositeAverageScore;

  const performanceGrade = calculatePerformanceGrade(averageOverallScore, hasData);
  const performanceGradeInfo = getPerformanceGradeInfo(averageOverallScore, hasData);

  return {
    formId: params.formId,
    title: params.title,
    academicYear: params.academicYear,
    branch: params.branch,
    semester: params.semester,
    facultyName: params.facultyName,
    subjectName: params.subjectName,
    subjectCode: params.subjectCode,
    formType: params.formType,
    status: params.status,
    lastSyncedAt: params.lastSyncedAt,
    googleSheetUrl: params.googleSheetUrl,
    googleFormUrl: params.googleFormUrl,
    totalResponses,
    totalStudents,
    evaluatedItems,
    percentage,
    validResponses,
    unansweredResponses,
    parameterAverageScore,
    averageOverallScore,
    compositeAverageScore,
    performanceGrade,
    performanceGradeInfo,
    parameters,
    distribution,
    parameterDistribution,
    overallRatingDistribution,
    hasData,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Aggregates multiple form analytics reports into a unified scope analysis.
 * Uses the exact same formula to guarantee consistency.
 */
export function aggregateAnalytics(
  formReports: FormAnalyticsReport[],
  scopeTitle: string,
  filters: AggregatedAnalyticsReport['filters']
): AggregatedAnalyticsReport {
  const totalForms = formReports.length;
  const formsWithData = formReports.filter(f => f.hasData);
  const formsWithResponses = formsWithData.length;

  let totalResponses = 0;
  let validResponses = 0;

  // Sum up raw parameter metrics
  const paramAccumulators: Record<
    number,
    { ex: number; vg: number; g: number; s: number; u: number; unanswered: number }
  > = {};

  for (let i = 1; i <= 8; i++) {
    paramAccumulators[i] = { ex: 0, vg: 0, g: 0, s: 0, u: 0, unanswered: 0 };
  }

  for (const report of formReports) {
    totalResponses += report.totalResponses;
    validResponses += report.validResponses;

    for (const p of report.parameters) {
      if (paramAccumulators[p.parameterId]) {
        paramAccumulators[p.parameterId].ex += p.excellentCount || 0;
        paramAccumulators[p.parameterId].vg += p.veryGoodCount;
        paramAccumulators[p.parameterId].g += p.goodCount;
        paramAccumulators[p.parameterId].s += p.satisfactoryCount;
        paramAccumulators[p.parameterId].u += p.unsatisfactoryCount;
        paramAccumulators[p.parameterId].unanswered += p.unansweredCount;
      }
    }
  }

  let totalAllScores = 0;
  let totalAllRatings = 0;
  let globalExcellent = 0;
  let globalVeryGood = 0;
  let globalGood = 0;
  let globalSatisfactory = 0;
  let globalUnsatisfactory = 0;

  const parameters: ParameterMetrics[] = BCE_FEEDBACK_PARAMETERS.map(param => {
    const pId = param.id;
    const acc = paramAccumulators[pId] || { ex: 0, vg: 0, g: 0, s: 0, u: 0, unanswered: 0 };
    const validCount = acc.ex + acc.vg + acc.g + acc.s + acc.u;

    globalExcellent += acc.ex;
    globalVeryGood += acc.vg;
    globalGood += acc.g;
    globalSatisfactory += acc.s;
    globalUnsatisfactory += acc.u;

    const excellentPct = validCount > 0 ? Number(((acc.ex / validCount) * 100).toFixed(1)) : 0;
    const veryGoodPct = validCount > 0 ? Number(((acc.vg / validCount) * 100).toFixed(1)) : 0;
    const goodPct = validCount > 0 ? Number(((acc.g / validCount) * 100).toFixed(1)) : 0;
    const satisfactoryPct = validCount > 0 ? Number(((acc.s / validCount) * 100).toFixed(1)) : 0;
    const unsatisfactoryPct = validCount > 0 ? Number(((acc.u / validCount) * 100).toFixed(1)) : 0;

    let averageScore = 0;
    if (validCount > 0) {
      const scoreSum =
        acc.ex * RATING_WEIGHTS['Excellent'] +
        acc.vg * RATING_WEIGHTS['Very Good'] +
        acc.g * RATING_WEIGHTS['Good'] +
        acc.s * RATING_WEIGHTS['Satisfactory'] +
        acc.u * RATING_WEIGHTS['Unsatisfactory'];

      averageScore = Number((scoreSum / validCount).toFixed(2));
      totalAllScores += scoreSum;
      totalAllRatings += validCount;
    }

    const interpretation =
      validCount > 0
        ? `${param.title} achieved an institutional average of ${averageScore.toFixed(2)}/5.00 across ${validCount} valid responses.`
        : `No valid response data recorded for ${param.title}.`;

    return {
      parameterId: pId,
      title: param.title,
      description: param.description || '',
      excellentCount: acc.ex,
      veryGoodCount: acc.vg,
      goodCount: acc.g,
      satisfactoryCount: acc.s,
      unsatisfactoryCount: acc.u,
      validCount,
      unansweredCount: acc.unanswered,
      excellentPct,
      veryGoodPct,
      goodPct,
      satisfactoryPct,
      unsatisfactoryPct,
      averageScore,
      interpretation,
    };
  });

  const totalValidRatings =
    globalExcellent + globalVeryGood + globalGood + globalSatisfactory + globalUnsatisfactory;

  const distribution: OverallDistribution = {
    excellentCount: globalExcellent,
    veryGoodCount: globalVeryGood,
    goodCount: globalGood,
    satisfactoryCount: globalSatisfactory,
    unsatisfactoryCount: globalUnsatisfactory,
    totalValidRatings,
    excellentPct: totalValidRatings > 0 ? Number(((globalExcellent / totalValidRatings) * 100).toFixed(1)) : 0,
    veryGoodPct: totalValidRatings > 0 ? Number(((globalVeryGood / totalValidRatings) * 100).toFixed(1)) : 0,
    goodPct: totalValidRatings > 0 ? Number(((globalGood / totalValidRatings) * 100).toFixed(1)) : 0,
    satisfactoryPct: totalValidRatings > 0 ? Number(((globalSatisfactory / totalValidRatings) * 100).toFixed(1)) : 0,
    unsatisfactoryPct: totalValidRatings > 0 ? Number(((globalUnsatisfactory / totalValidRatings) * 100).toFixed(1)) : 0,
  };

  // Evaluation Parameters (Q1 to Q7) metrics & distribution
  let paramScoresSum = 0;
  let paramRatingsCount = 0;
  let paramExcellent = 0;
  let paramVeryGood = 0;
  let paramGood = 0;
  let paramSatisfactory = 0;
  let paramUnsatisfactory = 0;

  for (const param of parameters) {
    if (param.parameterId >= 1 && param.parameterId <= 7) {
      paramExcellent += param.excellentCount;
      paramVeryGood += param.veryGoodCount;
      paramGood += param.goodCount;
      paramSatisfactory += param.satisfactoryCount;
      paramUnsatisfactory += param.unsatisfactoryCount;

      const scoreSum =
        param.excellentCount * RATING_WEIGHTS['Excellent'] +
        param.veryGoodCount * RATING_WEIGHTS['Very Good'] +
        param.goodCount * RATING_WEIGHTS['Good'] +
        param.satisfactoryCount * RATING_WEIGHTS['Satisfactory'] +
        param.unsatisfactoryCount * RATING_WEIGHTS['Unsatisfactory'];

      paramScoresSum += scoreSum;
      paramRatingsCount += param.validCount;
    }
  }

  const parameterAverageScore =
    paramRatingsCount > 0 ? Number((paramScoresSum / paramRatingsCount).toFixed(2)) : 0;

  const totalValidParamRatings =
    paramExcellent + paramVeryGood + paramGood + paramSatisfactory + paramUnsatisfactory;

  const parameterDistribution: OverallDistribution = {
    excellentCount: paramExcellent,
    veryGoodCount: paramVeryGood,
    goodCount: paramGood,
    satisfactoryCount: paramSatisfactory,
    unsatisfactoryCount: paramUnsatisfactory,
    totalValidRatings: totalValidParamRatings,
    excellentPct: totalValidParamRatings > 0 ? Number(((paramExcellent / totalValidParamRatings) * 100).toFixed(1)) : 0,
    veryGoodPct: totalValidParamRatings > 0 ? Number(((paramVeryGood / totalValidParamRatings) * 100).toFixed(1)) : 0,
    goodPct: totalValidParamRatings > 0 ? Number(((paramGood / totalValidParamRatings) * 100).toFixed(1)) : 0,
    satisfactoryPct: totalValidParamRatings > 0 ? Number(((paramSatisfactory / totalValidParamRatings) * 100).toFixed(1)) : 0,
    unsatisfactoryPct: totalValidParamRatings > 0 ? Number(((paramUnsatisfactory / totalValidParamRatings) * 100).toFixed(1)) : 0,
  };

  // Question 8 Standalone Overall Rating distribution
  const param8 = parameters.find(p => p.parameterId === 8);
  const overallRatingDistribution: OverallDistribution = {
    excellentCount: param8?.excellentCount || 0,
    veryGoodCount: param8?.veryGoodCount || 0,
    goodCount: param8?.goodCount || 0,
    satisfactoryCount: param8?.satisfactoryCount || 0,
    unsatisfactoryCount: param8?.unsatisfactoryCount || 0,
    totalValidRatings: param8?.validCount || 0,
    excellentPct: param8?.excellentPct || 0,
    veryGoodPct: param8?.veryGoodPct || 0,
    goodPct: param8?.goodPct || 0,
    satisfactoryPct: param8?.satisfactoryPct || 0,
    unsatisfactoryPct: param8?.unsatisfactoryPct || 0,
  };

  const compositeAverageScore =
    totalAllRatings > 0 ? Number((totalAllScores / totalAllRatings).toFixed(2)) : 0;

  // Canonical Overall Rating:
  // Uses Question 8 if present and valid; falls back to parameterAverageScore or compositeAverageScore
  const averageOverallScore =
    param8 && param8.validCount > 0
      ? param8.averageScore
      : parameterAverageScore > 0
      ? parameterAverageScore
      : compositeAverageScore;

  let totalStudents = 0;
  let evaluatedItems = 0;
  for (const report of formReports) {
    totalStudents += report.totalStudents ?? report.totalResponses;
    evaluatedItems += report.evaluatedItems ?? report.validResponses;
  }

  const percentage =
    totalAllRatings > 0 ? Number(((compositeAverageScore / 5) * 100).toFixed(2)) : 0;

  const hasData = validResponses > 0;
  const performanceGrade = calculatePerformanceGrade(averageOverallScore, hasData);
  const performanceGradeInfo = getPerformanceGradeInfo(averageOverallScore, hasData);

  // Build faculty comparison array for forms with responses
  const facultyComparisons: FacultyComparisonItem[] = formsWithData
    .map(f => ({
      formId: f.formId,
      facultyName: f.facultyName,
      subjectName: f.subjectName,
      subjectCode: f.subjectCode,
      branch: f.branch,
      semester: f.semester,
      responseCount: f.totalStudents ?? f.totalResponses,
      averageScore: f.averageOverallScore || f.compositeAverageScore,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  return {
    scopeTitle,
    filters,
    totalForms,
    formsWithResponses,
    totalResponses,
    totalStudents,
    evaluatedItems,
    percentage,
    validResponses,
    parameterAverageScore,
    averageOverallScore,
    compositeAverageScore,
    performanceGrade,
    performanceGradeInfo,
    parameters,
    distribution,
    parameterDistribution,
    overallRatingDistribution,
    facultyComparisons,
    hasData,
    generatedAt: new Date().toISOString(),
  };
}
