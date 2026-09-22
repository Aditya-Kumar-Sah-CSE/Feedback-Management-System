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
  RATING_WEIGHTS,
} from './types';

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
  const isSemester = params.formType === 'SEMESTER_FEEDBACK';

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

  // Overall distribution
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

  // Composite average across all parameters: strictly SUM(weights) / COUNT(ratings)
  const compositeAverageScore =
    totalAllRatingsCount > 0 ? Number((totalAllScores / totalAllRatingsCount).toFixed(2)) : 0;

  // Percentage on 5-point scale: (average / 5.0) * 100
  const percentage =
    totalAllRatingsCount > 0 ? Number(((compositeAverageScore / 5) * 100).toFixed(2)) : 0;

  // Parameter 8 is "Overall Rating" in BCE single-faculty form; for semester form, use composite benchmark
  const param8 = parameters.find(p => p.parameterId === 8);
  const averageOverallScore = isSemester
    ? compositeAverageScore
    : (param8 && param8.validCount > 0 ? param8.averageScore : compositeAverageScore);

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
    averageOverallScore,
    compositeAverageScore,
    parameters,
    distribution,
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

  const compositeAverageScore =
    totalAllRatings > 0 ? Number((totalAllScores / totalAllRatings).toFixed(2)) : 0;

  const param8 = parameters.find(p => p.parameterId === 8);
  const averageOverallScore =
    param8 && param8.validCount > 0 ? param8.averageScore : compositeAverageScore;

  let totalStudents = 0;
  let evaluatedItems = 0;
  for (const report of formReports) {
    totalStudents += report.totalStudents ?? report.totalResponses;
    evaluatedItems += report.evaluatedItems ?? report.validResponses;
  }

  const percentage =
    totalAllRatings > 0 ? Number(((compositeAverageScore / 5) * 100).toFixed(2)) : 0;

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
      averageScore: f.compositeAverageScore || f.averageOverallScore,
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
    averageOverallScore,
    compositeAverageScore,
    parameters,
    distribution,
    facultyComparisons,
    hasData: validResponses > 0,
    generatedAt: new Date().toISOString(),
  };
}
