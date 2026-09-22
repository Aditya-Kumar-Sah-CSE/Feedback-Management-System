/**
 * Normalization Layer for Faculty Feedback
 * Converts arbitrary Google Sheet rows into canonical 8-parameter feedback records.
 */

import { BCE_FEEDBACK_PARAMETERS } from '@/lib/google/template';
import { CanonicalResponseRow, RatingOption } from './types';

// Keyword rules for robust column header matching
const PARAMETER_KEYWORD_RULES: Record<number, string[]> = {
  1: ['syllabus', 'coverage', 'prescribed course'],
  2: ['communication', 'clarity of speech', 'presentation'],
  3: ['teaching-learning', 'effectiveness', 'pacing of lectures', 'conceptual depth'],
  4: ['accessibility', 'accessible', 'outside scheduled', 'guidance'],
  5: ['willingness', 'offer help', 'resolving student doubts', 'assistance'],
  6: ['teach/explain', 'explain', 'examples', 'illustrations', 'problem-solving'],
  7: ['fairness', 'evaluation', 'impartiality', 'grading', 'assessment'],
  8: ['overall rating', 'comprehensive overall', 'overall performance', 'overall'],
};

/**
 * Maps a raw cell value to a canonical RatingOption ('Excellent' | 'Very Good' | 'Good' | 'Satisfactory' | 'Unsatisfactory') or null.
 */
export function normalizeRatingValue(val: string | number | undefined | null): RatingOption | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim().toLowerCase();

  if (!str || str === 'n/a' || str === '-' || str === 'na' || str === 'none') {
    return null;
  }

  // Exact / substring matching
  if (str === 'excellent' || str.includes('excellent') || str === 'ex' || str === '5') {
    return 'Excellent';
  }
  if (str === 'very good' || str.includes('very good') || str === 'vg' || str === '4') {
    return 'Very Good';
  }
  if (str === 'unsatisfactory' || str.includes('unsatisfactory') || str === 'unsat' || str === 'poor' || str === '1') {
    return 'Unsatisfactory';
  }
  if (str === 'satisfactory' || str.includes('satisfactory') || str === 'average' || str === 'sat' || str === '2') {
    return 'Satisfactory';
  }
  if (str === 'good' || str.includes('good') || str === 'g' || str === '3') {
    return 'Good';
  }

  return null;
}

export interface ColumnMapping {
  timestampColIndex: number;
  responseIdColIndex: number;
  studentNameColIndex: number;
  regNoColIndex: number;
  commentsColIndex: number;
  paramColIndices: Record<number, number>; // paramId (1..8) -> colIndex
}

/**
 * Inspects sheet headers and determines column positions without relying on fixed index positions.
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    timestampColIndex: -1,
    responseIdColIndex: -1,
    studentNameColIndex: -1,
    regNoColIndex: -1,
    commentsColIndex: -1,
    paramColIndices: {},
  };

  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());

  // 1. Identify Timestamp, Response ID, Student Name, Reg No, Comments
  normalizedHeaders.forEach((header, index) => {
    if (header.includes('timestamp') || header === 'date' || header === 'time') {
      if (mapping.timestampColIndex === -1) mapping.timestampColIndex = index;
    } else if (header.includes('response id') || header === 'id' || header.includes('submission id')) {
      if (mapping.responseIdColIndex === -1) mapping.responseIdColIndex = index;
    } else if (header.includes('student name') || (header.includes('name') && !header.includes('faculty') && !header.includes('subject'))) {
      if (mapping.studentNameColIndex === -1) mapping.studentNameColIndex = index;
    } else if (header.includes('registration') || header.includes('reg') || header.includes('roll')) {
      if (mapping.regNoColIndex === -1) mapping.regNoColIndex = index;
    } else if (header.includes('comment') || header.includes('suggestion') || header.includes('general feedback') || (header.includes('feedback') && !header.includes('faculty'))) {
      if (mapping.commentsColIndex === -1) mapping.commentsColIndex = index;
    }
  });

  // 2. Identify 8 BCE Parameters
  BCE_FEEDBACK_PARAMETERS.forEach(param => {
    const pId = param.id;
    const pTitle = param.title.toLowerCase();
    const keywords = PARAMETER_KEYWORD_RULES[pId] || [];

    // First try: Header starting with "${pId}." or "${pId}:" or "${pId} -" or exact param title
    let matchIdx = normalizedHeaders.findIndex(
      h =>
        h.startsWith(`${pId}.`) ||
        h.startsWith(`${pId}:`) ||
        h.startsWith(`${pId} -`) ||
        h.startsWith(`${pId} `) ||
        h.includes(pTitle)
    );

    // Second try: Keyword search
    if (matchIdx === -1) {
      matchIdx = normalizedHeaders.findIndex(h =>
        keywords.some(kw => h.includes(kw))
      );
    }

    if (matchIdx !== -1) {
      mapping.paramColIndices[pId] = matchIdx;
    }
  });

  // Fallback: If headers were generic or empty, try standard layout
  // (Timestamp, Response ID, [Student Name, Reg No], 8 Parameters, [Comments])
  if (Object.keys(mapping.paramColIndices).length === 0 && headers.length >= 8) {
    const offset = headers.length >= 12 ? 4 : (mapping.timestampColIndex !== -1 && mapping.responseIdColIndex !== -1 ? 2 : 0);
    for (let i = 1; i <= 8; i++) {
      const fallbackCol = offset + (i - 1);
      if (fallbackCol < headers.length) {
        mapping.paramColIndices[i] = fallbackCol;
      }
    }
  }

  return mapping;
}

/**
 * Normalizes raw Google Sheet response rows into canonical response structures.
 * Resilient against missing columns, malformed values, and blank lines.
 */
export function normalizeSheetRows(
  headers: string[],
  rawRows: string[][]
): CanonicalResponseRow[] {
  if (!rawRows || rawRows.length === 0) {
    return [];
  }

  const mapping = detectColumnMapping(headers);
  const results: CanonicalResponseRow[] = [];

  rawRows.forEach((row, rowIdx) => {
    // Check if row is completely empty
    if (!row || row.length === 0 || row.every(cell => !cell || !cell.trim())) {
      return;
    }

    const timestamp =
      mapping.timestampColIndex !== -1 && row[mapping.timestampColIndex]
        ? row[mapping.timestampColIndex].trim()
        : '';

    const responseId =
      mapping.responseIdColIndex !== -1 && row[mapping.responseIdColIndex]
        ? row[mapping.responseIdColIndex].trim()
        : `row-${rowIdx + 1}`;

    const studentName =
      mapping.studentNameColIndex !== -1 && row[mapping.studentNameColIndex]
        ? row[mapping.studentNameColIndex].trim()
        : undefined;

    const registrationNumber =
      mapping.regNoColIndex !== -1 && row[mapping.regNoColIndex]
        ? row[mapping.regNoColIndex].trim()
        : undefined;

    const comments =
      mapping.commentsColIndex !== -1 && row[mapping.commentsColIndex]
        ? row[mapping.commentsColIndex].trim()
        : undefined;

    const ratings: Record<number, RatingOption | null> = {};
    let validRatingsCount = 0;

    for (let pId = 1; pId <= 8; pId++) {
      const colIdx = mapping.paramColIndices[pId];
      if (colIdx !== undefined && colIdx < row.length) {
        const normalizedVal = normalizeRatingValue(row[colIdx]);
        ratings[pId] = normalizedVal;
        if (normalizedVal !== null) {
          validRatingsCount++;
        }
      } else {
        ratings[pId] = null;
      }
    }

    // A row is considered a valid response if at least one parameter was answered
    const isValid = validRatingsCount > 0;

    results.push({
      timestamp,
      responseId,
      studentName,
      registrationNumber,
      comments,
      ratings,
      isValid,
    });
  });

  return results;
}

export interface DetectedGridInfo {
  gridTitle: string;
  facultyName: string;
  subjectName: string;
  subjectCode: string;
  paramColIndices: Record<number, number>; // 1..8 -> colIndex
}

/**
 * Detects multiple choice grids in sheet headers.
 * Header format: `<Grid Title> [<Row Question Title>]`
 */
export function detectMultiGrids(headers: string[]): DetectedGridInfo[] {
  const gridsMap = new Map<string, Record<number, number>>();

  headers.forEach((header, colIdx) => {
    const trimmed = header.trim();
    // Matches: "Engineering Mechanics — Dr. Raj Anwit [1. Syllabus Coverage & Course Delivery]"
    const bracketMatch = trimmed.match(/^(.*?)\s*\[(.*?)\]$/);
    if (bracketMatch) {
      const gridTitle = bracketMatch[1].trim();
      const questionText = bracketMatch[2].trim().toLowerCase();

      // Find which parameter (1..8) matches questionText
      let pIdx = BCE_FEEDBACK_PARAMETERS.findIndex(
        p => questionText.includes(p.title.toLowerCase()) || p.title.toLowerCase().includes(questionText)
      );

      if (pIdx === -1) {
        // Fallback: check leading number e.g. "1." or "2:"
        const numMatch = questionText.match(/^([1-8])[\.\:\s\-]/);
        if (numMatch) {
          pIdx = parseInt(numMatch[1], 10) - 1;
        }
      }

      if (pIdx !== -1) {
        const paramId = pIdx + 1;
        if (!gridsMap.has(gridTitle)) {
          gridsMap.set(gridTitle, {});
        }
        gridsMap.get(gridTitle)![paramId] = colIdx;
      }
    }
  });

  const result: DetectedGridInfo[] = [];

  for (const [gridTitle, paramColIndices] of gridsMap.entries()) {
    let subjectName = gridTitle;
    let subjectCode = '';
    let facultyName = '';

    if (gridTitle.includes('—')) {
      const parts = gridTitle.split('—').map(s => s.trim());
      subjectName = parts[0] || '';
      facultyName = parts[1] || '';
    } else if (gridTitle.includes(' - ')) {
      const parts = gridTitle.split(' - ').map(s => s.trim());
      subjectName = parts[0] || '';
      facultyName = parts[1] || '';
    }

    const codeMatch = subjectName.match(/^(.*?)\s*\((.*?)\)$/);
    if (codeMatch) {
      subjectName = codeMatch[1].trim();
      subjectCode = codeMatch[2].trim();
    }

    result.push({
      gridTitle,
      facultyName,
      subjectName,
      subjectCode,
      paramColIndices,
    });
  }

  return result;
}

/**
 * Normalizes responses for one specific faculty-subject grid within a multi-grid sheet.
 */
export function normalizeSheetRowsForSpecificGrid(
  headers: string[],
  rawRows: string[][],
  paramColIndices: Record<number, number>
): CanonicalResponseRow[] {
  const mapping = detectColumnMapping(headers);
  const results: CanonicalResponseRow[] = [];

  rawRows.forEach((row, rowIdx) => {
    if (!row || row.length === 0 || row.every(cell => !cell || !cell.trim())) {
      return;
    }

    const timestamp =
      mapping.timestampColIndex !== -1 && row[mapping.timestampColIndex]
        ? row[mapping.timestampColIndex].trim()
        : '';

    const responseId =
      mapping.responseIdColIndex !== -1 && row[mapping.responseIdColIndex]
        ? row[mapping.responseIdColIndex].trim()
        : `row-${rowIdx + 1}`;

    const studentName =
      mapping.studentNameColIndex !== -1 && row[mapping.studentNameColIndex]
        ? row[mapping.studentNameColIndex].trim()
        : undefined;

    const registrationNumber =
      mapping.regNoColIndex !== -1 && row[mapping.regNoColIndex]
        ? row[mapping.regNoColIndex].trim()
        : undefined;

    const comments =
      mapping.commentsColIndex !== -1 && row[mapping.commentsColIndex]
        ? row[mapping.commentsColIndex].trim()
        : undefined;

    const ratings: Record<number, RatingOption | null> = {};
    let validRatingsCount = 0;

    for (let pId = 1; pId <= 8; pId++) {
      const colIdx = paramColIndices[pId];
      if (colIdx !== undefined && colIdx < row.length) {
        const normalizedVal = normalizeRatingValue(row[colIdx]);
        ratings[pId] = normalizedVal;
        if (normalizedVal !== null) {
          validRatingsCount++;
        }
      } else {
        ratings[pId] = null;
      }
    }

    const isValid = validRatingsCount > 0;

    results.push({
      timestamp,
      responseId,
      studentName,
      registrationNumber,
      comments,
      ratings,
      isValid,
    });
  });

  return results;
}

