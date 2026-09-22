/**
 * Server-Side Multi-Tenant PDF Report Generator
 * Uses PDFKit for pure server-side, vector-sharp PDF generation.
 * Dynamically branded per college tenant.
 */

import PDFDocument from 'pdfkit';
import { FormAnalyticsReport, AggregatedAnalyticsReport } from './types';
import { CollegeBranding, DEFAULT_BRANDING } from '@/lib/tenant/branding';

// Palette Tokens
const COLORS = {
  primary: '#1B365D', // Deep Navy default
  secondary: '#334155', // Slate 700
  accent: '#2563EB', // Blue 600
  success: '#059669', // Emerald 600
  warning: '#D97706', // Amber 600
  danger: '#DC2626', // Red 600
  border: '#CBD5E1', // Slate 300
  bgLight: '#F8FAFC', // Slate 50
  bgHeader: '#1E293B', // Slate 800
  textMuted: '#64748B', // Slate 500
  white: '#FFFFFF',
};

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/**
 * Draws standardized multi-tenant Header banner
 */
function drawHeader(doc: PDFKit.PDFDocument, subtitle: string, branding?: CollegeBranding) {
  const pageWidth = 595.28; // A4 width in pt
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  const brand = branding || DEFAULT_BRANDING;
  const primaryColor = brand.primaryColor || COLORS.primary;
  const accentColor = brand.accentColor || COLORS.accent;

  // Top decorative color bar
  doc.rect(margin, 30, contentWidth, 5).fill(accentColor);

  // Institution Header
  const institutionName = (brand.name || DEFAULT_BRANDING.name).toUpperCase();
  const fontSize = institutionName.length > 45 ? 12 : institutionName.length > 30 ? 14 : 16;
  doc
    .font('Helvetica-Bold')
    .fontSize(fontSize)
    .fillColor(primaryColor)
    .text(institutionName, margin, 42, {
      align: 'center',
      width: contentWidth,
    });

  const sublineParts: string[] = [];
  if (brand.affiliatedUniversity) {
    sublineParts.push(brand.affiliatedUniversity);
  }
  if (brand.establishedYear) {
    sublineParts.push(`Established ${brand.establishedYear}`);
  }
  if (sublineParts.length === 0 && brand.tagline) {
    sublineParts.push(brand.tagline);
  }
  const institutionSubline = sublineParts.length > 0
    ? sublineParts.join(' • ')
    : (brand.address || 'Confidential Institutional Assessment Report');

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(COLORS.textMuted)
    .text(institutionSubline, margin, 62, {
      align: 'center',
      width: contentWidth,
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(COLORS.secondary)
    .text(subtitle.toUpperCase(), margin, 75, {
      align: 'center',
      width: contentWidth,
    });

  // Divider line
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.75)
    .moveTo(margin, 93)
    .lineTo(pageWidth - margin, 93)
    .stroke();
}

/**
 * Draws Standardized Footer
 */
function drawFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number, branding?: CollegeBranding) {
  const margin = 36;
  const pageWidth = 595.28;
  const pageHeight = 841.89; // A4 height

  // Temporarily set bottom margin to 0 so PDFKit won't trigger autoPageBreak when drawing in footer area
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(margin, pageHeight - 42)
    .lineTo(pageWidth - margin, pageHeight - 42)
    .stroke();

  const brand = branding || DEFAULT_BRANDING;
  const footerText = `${brand.name} • Confidential Institutional Assessment Report • Student submissions are 100% anonymous`;

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.textMuted)
    .text(
      footerText,
      margin,
      pageHeight - 34,
      { width: pageWidth - margin * 2 - 60, align: 'left' }
    );

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin - 60, pageHeight - 34, {
      width: 60,
      align: 'right',
    });

  doc.page.margins.bottom = originalBottomMargin;
}

interface MetadataCell {
  label: string;
  value: string;
}

interface MetadataRow {
  left: MetadataCell;
  right: MetadataCell;
}

/**
 * Safely formats long identifiers, unbroken strings, or emails so they wrap
 * cleanly within table cells without overflowing into adjacent columns.
 */
export function formatSafeCellText(value: string | null | undefined, maxChunk = 26): string {
  if (!value) return '';
  return value
    .split(' ')
    .map(token => {
      if (token.length <= maxChunk) return token;
      return token
        .replace(/([@_\-–/])/g, '$1 ')
        .replace(new RegExp(`([^\\s]{${maxChunk}})`, 'g'), '$1 ');
    })
    .join(' ')
    .trim();
}

/**
 * Determines whether submission-level metadata (Submission Date and Submission ID)
 * should be rendered on the Student Feedback Submission Record PDF based strictly
 * on the feedback form's Academic Session / Academic Year.
 *
 * Rules:
 * - Extracts numeric starting academic year from "YYYY-YYYY" format (or any string containing a 4-digit start year).
 * - Metadata is visible for starting year >= 2026 (e.g., 2026-2027, 2027-2028, etc.).
 * - Metadata is hidden for starting year < 2026 (e.g., 2025-2026, 2024-2025, 2023-2024, etc.).
 * - Does NOT use the current system date.
 * - Does NOT hardcode individual session strings.
 * - If session is null, undefined, or unparseable, defaults to false (hide) to protect legacy/unverified sessions.
 */
export function shouldShowSubmissionMetadata(academicSession?: string | null): boolean {
  if (!academicSession) return false;
  const match = academicSession.match(/\b(\d{4})\s*[-/–—]\s*(\d{4}|\d{2})\b/) || academicSession.match(/\b(\d{4})\b/);
  if (!match) return false;
  const startYear = parseInt(match[1], 10);
  if (isNaN(startYear)) return false;
  return startYear >= 2026;
}

function measureMetadataCell(
  doc: PDFKit.PDFDocument,
  cell: MetadataCell,
  width: number,
  fontSize = 8.5,
  lineGap = 1.5
): number {
  if (!cell || (!cell.label && !cell.value)) return 0;
  doc.fontSize(fontSize);
  const text = (cell.label || '') + (cell.value || '');
  // Helvetica-Bold provides a safe upper bound on character advance widths
  const boldH = doc.font('Helvetica-Bold').heightOfString(text, { width, lineGap });
  const regH = doc.font('Helvetica').heightOfString(text, { width, lineGap });
  return Math.max(boldH, regH);
}

/**
 * Renders a structured 2-column metadata table/grid with dynamic row heights
 * and automatic text wrapping to prevent any field collision.
 */
function renderMetadataGrid(
  doc: PDFKit.PDFDocument,
  startY: number,
  contentWidth: number,
  margin: number,
  rows: MetadataRow[]
): number {
  const col1Width = contentWidth / 2;
  const padX = 12;
  const padY = 4.5;
  const innerWidth = col1Width - padX * 2;
  const fontSize = 8.5;
  const lineGap = 1.5;

  const rowHeights = rows.map(row => {
    const leftH = measureMetadataCell(doc, row.left, innerWidth, fontSize, lineGap);
    const rightH = measureMetadataCell(doc, row.right, innerWidth, fontSize, lineGap);
    const contentH = Math.max(leftH, rightH);
    return Math.max(contentH + padY * 2, 18);
  });

  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0);

  // Background and outer border
  doc.rect(margin, startY, contentWidth, totalHeight).fillAndStroke(COLORS.bgLight, COLORS.border);

  // Subtle vertical column divider
  doc
    .strokeColor('#E2E8F0')
    .lineWidth(0.5)
    .moveTo(margin + col1Width, startY + 3)
    .lineTo(margin + col1Width, startY + totalHeight - 3)
    .stroke();

  let curY = startY;

  rows.forEach((row, idx) => {
    const rHeight = rowHeights[idx];

    // Subtle horizontal row divider
    if (idx > 0) {
      doc
        .strokeColor('#E2E8F0')
        .lineWidth(0.5)
        .moveTo(margin + 6, curY)
        .lineTo(margin + contentWidth - 6, curY)
        .stroke();
    }

    const textY = curY + padY;

    // Render Left Cell (confined to innerWidth of Left Column)
    if (row.left && (row.left.label || row.left.value)) {
      if (row.left.label) {
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(COLORS.secondary);
        doc.text(row.left.label, margin + padX, textY, {
          continued: Boolean(row.left.value),
          width: innerWidth,
          lineGap,
        });
      }
      if (row.left.value) {
        doc.font('Helvetica').fontSize(fontSize).fillColor('#000000');
        if (!row.left.label) {
          doc.text(row.left.value, margin + padX, textY, {
            width: innerWidth,
            lineGap,
          });
        } else {
          doc.text(row.left.value, {
            width: innerWidth,
            lineGap,
          });
        }
      }
    }

    // Render Right Cell (confined to innerWidth of Right Column)
    if (row.right && (row.right.label || row.right.value)) {
      if (row.right.label) {
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(COLORS.secondary);
        doc.text(row.right.label, margin + col1Width + padX, textY, {
          continued: Boolean(row.right.value),
          width: innerWidth,
          lineGap,
        });
      }
      if (row.right.value) {
        doc.font('Helvetica').fontSize(fontSize).fillColor('#000000');
        if (!row.right.label) {
          doc.text(row.right.value, margin + col1Width + padX, textY, {
            width: innerWidth,
            lineGap,
          });
        } else {
          doc.text(row.right.value, {
            width: innerWidth,
            lineGap,
          });
        }
      }
    }

    curY += rHeight;
  });

  return totalHeight;
}

/**
 * Generates an Individual Faculty Feedback Report PDF
 */
export async function generateIndividualFacultyPDF(
  report: FormAnalyticsReport,
  branding?: CollegeBranding
): Promise<Buffer> {
  const brand = branding || DEFAULT_BRANDING;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    autoFirstPage: true,
    info: {
      Title: `Faculty Feedback Report — ${report.facultyName} — ${report.subjectCode}`,
      Author: brand.name,
      Subject: 'Faculty Evaluation Report',
      Keywords: `${brand.code}, Feedback, Faculty Evaluation`,
    },
  });

  const bufferPromise = streamToBuffer(doc);
  const margin = 36;
  const pageWidth = 595.28;
  const contentWidth = pageWidth - margin * 2;

  // Page 1 Header
  drawHeader(doc, 'Faculty Feedback Evaluation Report', brand);

  let currentY = 104;

  // Metadata Table Grid (2 Columns)
  const metadataRows: MetadataRow[] = [
    {
      left: { label: 'Faculty Member: ', value: report.facultyName || 'N/A' },
      right: { label: 'Semester: ', value: report.semester || 'N/A' },
    },
    {
      left: {
        label: 'Subject / Course: ',
        value: `${report.subjectName || 'N/A'}${report.subjectCode ? ` (${report.subjectCode})` : ''}`,
      },
      right: { label: 'Evaluation Type: ', value: report.formType || 'Faculty-Specific' },
    },
    {
      left: { label: 'Branch / Discipline: ', value: report.branch || 'N/A' },
      right: { label: 'Lifecycle Status: ', value: report.status || 'PUBLISHED' },
    },
    {
      left: { label: 'Academic Session: ', value: report.academicYear || 'N/A' },
      right: {
        label: 'Report Generated: ',
        value: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    },
  ];

  const metaHeight = renderMetadataGrid(doc, currentY, contentWidth, margin, metadataRows);
  currentY += metaHeight + 12;

  // KPI Summary Metric Blocks (4 Boxes)
  const boxGap = 8;
  const boxWidth = (contentWidth - boxGap * 3) / 4;
  const boxHeight = 48;

  // Box 1: Total Responses
  doc.rect(margin, currentY, boxWidth, boxHeight).fillAndStroke('#EFF6FF', '#BFDBFE');
  doc.font('Helvetica').fontSize(7.5).fillColor('#1E40AF').text('TOTAL RESPONSES', margin, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1E3A8A').text(String(report.totalResponses), margin, currentY + 22, { width: boxWidth, align: 'center' });

  // Box 2: Valid Responses
  const box2X = margin + boxWidth + boxGap;
  doc.rect(box2X, currentY, boxWidth, boxHeight).fillAndStroke('#ECFDF5', '#A7F3D0');
  doc.font('Helvetica').fontSize(7.5).fillColor('#065F46').text('VALID SUBMISSIONS', box2X, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#064E3B').text(String(report.validResponses), box2X, currentY + 22, { width: boxWidth, align: 'center' });

  // Box 3: Overall Rating Score
  const box3X = margin + (boxWidth + boxGap) * 2;
  const scoreColor = report.averageOverallScore >= 3.0 ? '#065F46' : report.averageOverallScore >= 2.0 ? '#92400E' : '#991B1B';
  const scoreBg = report.averageOverallScore >= 3.0 ? '#ECFDF5' : report.averageOverallScore >= 2.0 ? '#FEF3C7' : '#FEE2E2';
  const scoreBorder = report.averageOverallScore >= 4.0 ? '#A7F3D0' : report.averageOverallScore >= 3.0 ? '#BFDBFE' : report.averageOverallScore >= 2.0 ? '#FDE68A' : '#FECACA';

  doc.rect(box3X, currentY, boxWidth, boxHeight).fillAndStroke(scoreBg, scoreBorder);
  doc.font('Helvetica').fontSize(7.5).fillColor(scoreColor).text('OVERALL RATING', box3X, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(scoreColor).text(
    report.hasData ? `${report.averageOverallScore.toFixed(2)} / 5.00` : 'N/A',
    box3X,
    currentY + 22,
    { width: boxWidth, align: 'center' }
  );

  // Box 4: Performance Grade
  const box4X = margin + (boxWidth + boxGap) * 3;
  let gradeText = 'No Data';
  if (report.hasData) {
    if (report.averageOverallScore >= 4.5) gradeText = 'EXCELLENT';
    else if (report.averageOverallScore >= 3.75) gradeText = 'VERY GOOD';
    else if (report.averageOverallScore >= 3.0) gradeText = 'GOOD';
    else if (report.averageOverallScore >= 2.0) gradeText = 'SATISFACTORY';
    else gradeText = 'NEEDS ATTN';
  }
  doc.rect(box4X, currentY, boxWidth, boxHeight).fillAndStroke(COLORS.bgLight, COLORS.border);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.secondary).text('PERFORMANCE GRADE', box4X, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary).text(gradeText, box4X, currentY + 24, { width: boxWidth, align: 'center' });

  currentY += boxHeight + 16;

  // Empty State Check
  if (!report.hasData) {
    doc.rect(margin, currentY, contentWidth, 70).fillAndStroke('#FFFBEB', '#FDE68A');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#92400E').text('No Feedback Responses Available', margin, currentY + 18, {
      width: contentWidth,
      align: 'center',
    });
    doc.font('Helvetica').fontSize(9).fillColor('#B45309').text(
      'No student responses have been synchronized yet for this feedback form. Check back once students submit responses on the official Google Form.',
      margin + 20,
      currentY + 34,
      { width: contentWidth - 40, align: 'center' }
    );
    drawFooter(doc, 1, 1, brand);
    doc.end();
    return bufferPromise;
  }

  // Parameter Evaluation Table Header
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text('EVALUATION PARAMETERS ANALYSIS (WEIGHTED SCALE: 1.00 — 5.00)', margin, currentY);
  currentY += 14;

  const tableTop = currentY;
  const colWidths = [165, 48, 48, 48, 48, 52, 58, 56]; // Total 523pt
  const headers = ['Parameter (1 to 8)', 'Avg (5.0)', 'Excell %', 'V. Good %', 'Good %', 'Sat %', 'Unsat %', 'Visual Bar'];

  // Table header background
  doc.rect(margin, tableTop, contentWidth, 18).fill(COLORS.bgHeader);

  let curX = margin;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
  headers.forEach((h, i) => {
    const align = i === 0 ? 'left' : 'center';
    doc.text(h, curX + 4, tableTop + 5, { width: colWidths[i] - 8, align });
    curX += colWidths[i];
  });

  currentY += 18;

  // Table Rows
  report.parameters.forEach((p, idx) => {
    const rowHeight = 22;
    const isAlt = idx % 2 === 1;

    // Zebra striping
    if (isAlt) {
      doc.rect(margin, currentY, contentWidth, rowHeight).fill('#F8FAFC');
    }
    // Bottom border
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke();

    let cellX = margin;

    // Col 0: Parameter Title
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.secondary);
    doc.text(`${p.parameterId}. ${p.title}`, cellX + 4, currentY + 7, { width: colWidths[0] - 8, align: 'left' });
    cellX += colWidths[0];

    // Col 1: Avg Score
    doc.font('Helvetica-Bold').fontSize(8).fillColor(p.averageScore >= 4.0 ? '#4F46E5' : p.averageScore >= 3.0 ? '#059669' : p.averageScore >= 2.0 ? '#D97706' : '#DC2626');
    doc.text(p.validCount > 0 ? p.averageScore.toFixed(2) : '-', cellX + 2, currentY + 7, { width: colWidths[1] - 4, align: 'center' });
    cellX += colWidths[1];

    // Col 2: Excellent %
    doc.font('Helvetica').fontSize(7.5).fillColor('#4338CA');
    doc.text(p.validCount > 0 ? `${p.excellentPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[2] - 4, align: 'center' });
    cellX += colWidths[2];

    // Col 3: Very Good %
    doc.font('Helvetica').fontSize(7.5).fillColor('#059669');
    doc.text(p.validCount > 0 ? `${p.veryGoodPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[3] - 4, align: 'center' });
    cellX += colWidths[3];

    // Col 4: Good %
    doc.font('Helvetica').fontSize(7.5).fillColor('#2563EB');
    doc.text(p.validCount > 0 ? `${p.goodPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[4] - 4, align: 'center' });
    cellX += colWidths[4];

    // Col 5: Satisfactory %
    doc.font('Helvetica').fontSize(7.5).fillColor('#D97706');
    doc.text(p.validCount > 0 ? `${p.satisfactoryPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[5] - 4, align: 'center' });
    cellX += colWidths[5];

    // Col 6: Unsatisfactory %
    doc.font('Helvetica').fontSize(7.5).fillColor('#DC2626');
    doc.text(p.validCount > 0 ? `${p.unsatisfactoryPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[6] - 4, align: 'center' });
    cellX += colWidths[6];

    // Col 7: Vector Bar Visual (Score out of 5.0 mapped to bar)
    const barWidth = 46;
    const barHeight = 8;
    const barX = cellX + 5;
    const barY = currentY + 7;

    // Background track
    doc.rect(barX, barY, barWidth, barHeight).fill('#E2E8F0');

    // Filled portion
    if (p.validCount > 0) {
      const fillW = Math.max(2, Math.min(barWidth, (p.averageScore / 5.0) * barWidth));
      const barColor = p.averageScore >= 4.0 ? '#6366F1' : p.averageScore >= 3.0 ? '#10B981' : p.averageScore >= 2.0 ? '#F59E0B' : '#EF4444';
      doc.rect(barX, barY, fillW, barHeight).fill(barColor);
    }

    currentY += rowHeight;
  });

  currentY += 14;

  // Distribution Breakdown Summary
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text('AGGREGATE RATING DISTRIBUTION (ALL PARAMETERS)', margin, currentY);
  currentY += 14;

  const distCardHeight = 44;
  doc.rect(margin, currentY, contentWidth, distCardHeight).fillAndStroke(COLORS.bgLight, COLORS.border);

  const distColW = contentWidth / 5;
  const distY = currentY + 8;

  // Excellent
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#4F46E5').text('EXCELLENT', margin, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#3730A3').text(`${report.distribution.excellentCount} (${report.distribution.excellentPct}%)`, margin, distY + 12, { width: distColW, align: 'center' });

  // Very Good
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#059669').text('VERY GOOD', margin + distColW, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#065F46').text(`${report.distribution.veryGoodCount} (${report.distribution.veryGoodPct}%)`, margin + distColW, distY + 12, { width: distColW, align: 'center' });

  // Good
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#2563EB').text('GOOD', margin + distColW * 2, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1E40AF').text(`${report.distribution.goodCount} (${report.distribution.goodPct}%)`, margin + distColW * 2, distY + 12, { width: distColW, align: 'center' });

  // Satisfactory
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#D97706').text('SATISFACTORY', margin + distColW * 3, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#92400E').text(`${report.distribution.satisfactoryCount} (${report.distribution.satisfactoryPct}%)`, margin + distColW * 3, distY + 12, { width: distColW, align: 'center' });

  // Unsatisfactory
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#DC2626').text('UNSATISFACTORY', margin + distColW * 4, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#991B1B').text(`${report.distribution.unsatisfactoryCount} (${report.distribution.unsatisfactoryPct}%)`, margin + distColW * 4, distY + 12, { width: distColW, align: 'center' });

  currentY += distCardHeight + 14;

  // Data-Driven Factual Observations Section
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text('OBJECTIVE DATA-DRIVEN INTERPRETATION', margin, currentY);
  currentY += 14;

  doc.rect(margin, currentY, contentWidth, 100).fillAndStroke('#FAF5FF', '#E9D5FF');

  let obsY = currentY + 8;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#6B21A8').text('Key Observations (Strictly Derived from Computed Submissions):', margin + 12, obsY);
  obsY += 12;

  // Sort parameters to highlight top and bottom areas
  const sortedParams = [...report.parameters].filter(p => p.validCount > 0).sort((a, b) => b.averageScore - a.averageScore);

  doc.font('Helvetica').fontSize(7.5).fillColor('#4C1D95');

  if (sortedParams.length > 0) {
    const highest = sortedParams[0];
    const lowest = sortedParams[sortedParams.length - 1];

    doc.text(`• Highest Rated Parameter: "${highest.title}" with a weighted score of ${highest.averageScore.toFixed(2)}/5.00 (${highest.excellentPct}% Excellent, ${highest.veryGoodPct}% Very Good).`, margin + 14, obsY);
    obsY += 11;

    doc.text(`• Area for Academic Attention: "${lowest.title}" scored ${lowest.averageScore.toFixed(2)}/5.00 (${lowest.unsatisfactoryPct}% Unsatisfactory).`, margin + 14, obsY);
    obsY += 11;

    doc.text(`• Overall Feedback Satisfaction: ${(report.distribution.excellentPct + report.distribution.veryGoodPct + report.distribution.goodPct).toFixed(1)}% of all individual ratings were Excellent, Very Good or Good.`, margin + 14, obsY);
    obsY += 11;

    doc.text(`• Sample Reliability: Total valid student submissions evaluated: ${report.validResponses} (${report.unansweredResponses} incomplete/unanswered).`, margin + 14, obsY);
    obsY += 11;

  }

  // Bottom-Right Signature Block
  const pageHeight = 841.89;
  const sigY = Math.min(pageHeight - 60, Math.max(obsY + 14, pageHeight - 75));
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary).text('Signature: ____________________', margin, sigY, {
    width: contentWidth,
    align: 'right',
  });

  // Draw Footer
  drawFooter(doc, 1, 1, brand);

  doc.end();
  return bufferPromise;
}

/**
 * Generates an Institutional / Scope Aggregated Feedback Report PDF
 */
export async function generateOverallFeedbackPDF(
  report: AggregatedAnalyticsReport,
  branding?: CollegeBranding
): Promise<Buffer> {
  const brand = branding || DEFAULT_BRANDING;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    autoFirstPage: true,
    info: {
      Title: `Overall Feedback Analysis Report — ${report.scopeTitle}`,
      Author: brand.name,
      Subject: 'Institutional Feedback Report',
      Keywords: `${brand.code}, Feedback, Institutional Evaluation`,
    },
  });

  const bufferPromise = streamToBuffer(doc);
  const margin = 36;
  const pageWidth = 595.28;
  const contentWidth = pageWidth - margin * 2;

  // Header
  drawHeader(doc, 'Institutional Feedback Analytics Report', brand);

  let currentY = 104;

  // Scope Metadata Grid (2 Columns, dynamic wrapped row heights)
  const metadataRows: MetadataRow[] = [
    {
      left: { label: 'Analysis Scope: ', value: report.scopeTitle || 'College-Wide Academic Evaluation' },
      right: { label: 'Academic Session: ', value: report.filters.academicYearName || 'All Sessions' },
    },
    {
      left: { label: 'Branch / Discipline: ', value: report.filters.branchName || 'All Branches' },
      right: { label: 'Target Semester: ', value: report.filters.semesterName || 'All Semesters' },
    },
    {
      left: { label: 'Target Faculty: ', value: report.filters.facultyName || 'All Faculty Members' },
      right: {
        label: 'Evaluation Date: ',
        value: `${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • ${brand.code} QA`,
      },
    },
  ];

  const metaHeight = renderMetadataGrid(doc, currentY, contentWidth, margin, metadataRows);
  currentY += metaHeight + 12;

  // Executive KPI Summary Blocks
  const boxGap = 8;
  const boxWidth = (contentWidth - boxGap * 3) / 4;
  const boxHeight = 48;

  // Forms Count
  doc.rect(margin, currentY, boxWidth, boxHeight).fillAndStroke('#F1F5F9', '#CBD5E1');
  doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text('ACTIVE FORMS', margin, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.primary).text(
    `${report.formsWithResponses} / ${report.totalForms}`,
    margin,
    currentY + 22,
    { width: boxWidth, align: 'center' }
  );

  // Total Responses
  const box2X = margin + boxWidth + boxGap;
  doc.rect(box2X, currentY, boxWidth, boxHeight).fillAndStroke('#EFF6FF', '#BFDBFE');
  doc.font('Helvetica').fontSize(7.5).fillColor('#1E40AF').text('TOTAL RESPONSES', box2X, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1E3A8A').text(String(report.totalResponses), box2X, currentY + 22, { width: boxWidth, align: 'center' });

  // Valid Submissions
  const box3X = margin + (boxWidth + boxGap) * 2;
  doc.rect(box3X, currentY, boxWidth, boxHeight).fillAndStroke('#ECFDF5', '#A7F3D0');
  doc.font('Helvetica').fontSize(7.5).fillColor('#065F46').text('VALID SUBMISSIONS', box3X, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#064E3B').text(String(report.validResponses), box3X, currentY + 22, { width: boxWidth, align: 'center' });

  // Scope Average
  const box4X = margin + (boxWidth + boxGap) * 3;
  const scoreColor = report.averageOverallScore >= 4.0 ? '#4F46E5' : report.averageOverallScore >= 3.0 ? '#065F46' : report.averageOverallScore >= 2.0 ? '#92400E' : '#991B1B';
  const scoreBg = report.averageOverallScore >= 4.0 ? '#EEF2FF' : report.averageOverallScore >= 3.0 ? '#ECFDF5' : report.averageOverallScore >= 2.0 ? '#FEF3C7' : '#FEE2E2';
  const scoreBorder = report.averageOverallScore >= 4.0 ? '#C7D2FE' : report.averageOverallScore >= 3.0 ? '#A7F3D0' : report.averageOverallScore >= 2.0 ? '#FDE68A' : '#FECACA';

  doc.rect(box4X, currentY, boxWidth, boxHeight).fillAndStroke(scoreBg, scoreBorder);
  doc.font('Helvetica').fontSize(7.5).fillColor(scoreColor).text('SCOPE OVERALL RATING', box4X, currentY + 8, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(scoreColor).text(
    report.hasData ? `${report.averageOverallScore.toFixed(2)} / 5.00` : 'N/A',
    box4X,
    currentY + 22,
    { width: boxWidth, align: 'center' }
  );

  currentY += boxHeight + 16;

  // Empty State Check
  if (!report.hasData) {
    doc.rect(margin, currentY, contentWidth, 70).fillAndStroke('#FFFBEB', '#FDE68A');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#92400E').text('No Response Data in Selected Scope', margin, currentY + 18, {
      width: contentWidth,
      align: 'center',
    });
    doc.font('Helvetica').fontSize(9).fillColor('#B45309').text(
      'No student feedback responses match the selected filters yet. Responses will appear automatically once Google Form submissions are synchronized.',
      margin + 20,
      currentY + 34,
      { width: contentWidth - 40, align: 'center' }
    );
    drawFooter(doc, 1, 1, brand);
    doc.end();
    return bufferPromise;
  }

  // Parameter Evaluation Table Header
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text('INSTITUTIONAL PARAMETER BENCHMARK (ALL FORMS IN SCOPE)', margin, currentY);
  currentY += 14;

  const tableTop = currentY;
  const colWidths = [165, 48, 48, 48, 48, 52, 58, 56];
  const headers = ['Parameter (1 to 8)', 'Avg (5.0)', 'Excell %', 'V. Good %', 'Good %', 'Sat %', 'Unsat %', 'Visual Bar'];

  doc.rect(margin, tableTop, contentWidth, 18).fill(COLORS.bgHeader);

  let curX = margin;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
  headers.forEach((h, i) => {
    const align = i === 0 ? 'left' : 'center';
    doc.text(h, curX + 4, tableTop + 5, { width: colWidths[i] - 8, align });
    curX += colWidths[i];
  });

  currentY += 18;

  report.parameters.forEach((p, idx) => {
    const rowHeight = 22;
    const isAlt = idx % 2 === 1;

    if (isAlt) doc.rect(margin, currentY, contentWidth, rowHeight).fill('#F8FAFC');
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke();

    let cellX = margin;

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.secondary);
    doc.text(`${p.parameterId}. ${p.title}`, cellX + 4, currentY + 7, { width: colWidths[0] - 8, align: 'left' });
    cellX += colWidths[0];

    doc.font('Helvetica-Bold').fontSize(8).fillColor(p.averageScore >= 4.0 ? '#4F46E5' : p.averageScore >= 3.0 ? '#059669' : p.averageScore >= 2.0 ? '#D97706' : '#DC2626');
    doc.text(p.validCount > 0 ? p.averageScore.toFixed(2) : '-', cellX + 2, currentY + 7, { width: colWidths[1] - 4, align: 'center' });
    cellX += colWidths[1];

    doc.font('Helvetica').fontSize(7.5).fillColor('#4338CA');
    doc.text(p.validCount > 0 ? `${p.excellentPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[2] - 4, align: 'center' });
    cellX += colWidths[2];

    doc.font('Helvetica').fontSize(7.5).fillColor('#059669');
    doc.text(p.validCount > 0 ? `${p.veryGoodPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[3] - 4, align: 'center' });
    cellX += colWidths[3];

    doc.text(p.validCount > 0 ? `${p.goodPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[4] - 4, align: 'center' });
    cellX += colWidths[4];

    doc.text(p.validCount > 0 ? `${p.satisfactoryPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[5] - 4, align: 'center' });
    cellX += colWidths[5];

    doc.text(p.validCount > 0 ? `${p.unsatisfactoryPct.toFixed(0)}%` : '-', cellX + 2, currentY + 7, { width: colWidths[6] - 4, align: 'center' });
    cellX += colWidths[6];

    // Bar
    const barWidth = 46;
    const barHeight = 8;
    const barX = cellX + 5;
    const barY = currentY + 7;
    doc.rect(barX, barY, barWidth, barHeight).fill('#E2E8F0');
    if (p.validCount > 0) {
      const fillW = Math.max(2, Math.min(barWidth, (p.averageScore / 5.0) * barWidth));
      const barColor = p.averageScore >= 4.0 ? '#6366F1' : p.averageScore >= 3.0 ? '#10B981' : p.averageScore >= 2.0 ? '#F59E0B' : '#EF4444';
      doc.rect(barX, barY, fillW, barHeight).fill(barColor);
    }

    currentY += rowHeight;
  });

  currentY += 14;

  // Faculty Comparison Section (Where data exists)
  if (report.facultyComparisons.length > 0) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text('FACULTY FEEDBACK PERFORMANCE MATRIX (ACTUAL DATA ONLY)', margin, currentY);
    currentY += 14;

    const compColWidths = [150, 150, 80, 70, 73];
    const compHeaders = ['Faculty Member', 'Subject', 'Branch', 'Responses', 'Avg Rating'];

    doc.rect(margin, currentY, contentWidth, 16).fill('#334155');
    let fX = margin;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
    compHeaders.forEach((ch, ci) => {
      const align = ci < 3 ? 'left' : 'center';
      doc.text(ch, fX + 4, currentY + 4, { width: compColWidths[ci] - 8, align });
      fX += compColWidths[ci];
    });

    currentY += 16;

    // Show up to top 7 faculties on page 1
    const displayList = report.facultyComparisons.slice(0, 7);
    displayList.forEach((fc, fIdx) => {
      const rowHeight = 18;
      if (fIdx % 2 === 1) doc.rect(margin, currentY, contentWidth, rowHeight).fill('#F8FAFC');
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke();

      let cellX = margin;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.secondary).text(fc.facultyName, cellX + 4, currentY + 5, { width: compColWidths[0] - 8 });
      cellX += compColWidths[0];

      doc.font('Helvetica').fontSize(7).fillColor('#475569').text(fc.subjectName, cellX + 4, currentY + 5, { width: compColWidths[1] - 8 });
      cellX += compColWidths[1];

      doc.font('Helvetica').fontSize(7).fillColor('#475569').text(fc.branch, cellX + 4, currentY + 5, { width: compColWidths[2] - 8 });
      cellX += compColWidths[2];

      doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(String(fc.responseCount), cellX + 2, currentY + 5, { width: compColWidths[3] - 4, align: 'center' });
      cellX += compColWidths[3];

      const fScoreColor = fc.averageScore >= 4.0 ? '#4F46E5' : fc.averageScore >= 3.0 ? '#059669' : fc.averageScore >= 2.0 ? '#D97706' : '#DC2626';
      doc.font('Helvetica-Bold').fontSize(8).fillColor(fScoreColor).text(`${fc.averageScore.toFixed(2)}/5.00`, cellX + 2, currentY + 5, { width: compColWidths[4] - 4, align: 'center' });

      currentY += rowHeight;
    });

    currentY += 12;
  }

  // Bottom-Right Signature Block
  const pageHeight = 841.89;
  const sigY = Math.min(pageHeight - 60, Math.max(currentY, pageHeight - 75));
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary).text('Signature: ____________________', margin, sigY, {
    width: contentWidth,
    align: 'right',
  });

  // Footer on Page 1
  drawFooter(doc, 1, 1, brand);

  doc.end();
  return bufferPromise;
}

/**
 * Generates an Overall Semester Comparative Feedback Report PDF
 * Compares all evaluated teachers/subjects for the semester cohort without exposing PII.
 */
/**
 * Generates an Overall Semester Comparative Feedback Report PDF
 * Compares all evaluated teachers/subjects for the semester cohort without exposing PII.
 */
export async function generateSemesterComparativePDF(
  report: FormAnalyticsReport,
  branding?: CollegeBranding
): Promise<Buffer> {
  const brand = branding || DEFAULT_BRANDING;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    autoFirstPage: true,
    info: {
      Title: `Semester Feedback Comparative Report — ${report.branch} — ${report.semester}`,
      Author: brand.name,
      Subject: 'Semester Multi-Faculty Comparative Evaluation Report',
      Keywords: `${brand.code}, Semester Feedback, Multi-Faculty, Comparative`,
    },
  });

  const bufferPromise = streamToBuffer(doc);
  const margin = 36;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;
  let currentPage = 1;

  // Header
  drawHeader(doc, 'Semester Feedback Comparative Evaluation Report', brand);

  let currentY = 104;

  // Metadata Table Grid (2 Columns, dynamic wrapped row heights)
  const metadataRows: MetadataRow[] = [
    {
      left: { label: 'Branch / Department: ', value: report.branch || 'N/A' },
      right: { label: 'Academic Session: ', value: report.academicYear || 'N/A' },
    },
    {
      left: { label: 'Semester Level: ', value: report.semester || 'N/A' },
      right: {
        label: 'Feedback Type: ',
        value: report.formType === 'SEMESTER_FEEDBACK'
          ? 'Multi-Faculty Semester Evaluation'
          : (report.formType || 'SEMESTER_FEEDBACK'),
      },
    },
    {
      left: { label: 'Form Title: ', value: report.title || 'Semester Feedback Form' },
      right: {
        label: 'Faculty Evaluated: ',
        value: `${report.facultyGrids?.length || 0} Faculty-Subject Evaluations`,
      },
    },
    {
      left: { label: 'System: ', value: `${brand.name} Feedback System` },
      right: {
        label: 'Report Generated: ',
        value: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      },
    },
  ];

  const metaHeight = renderMetadataGrid(doc, currentY, contentWidth, margin, metadataRows);
  currentY += metaHeight + 12;

  // 5 KPI Stat Boxes
  const boxGap = 8;
  const boxWidth = (contentWidth - boxGap * 4) / 5;
  const boxHeight = 44;

  const totalStudents = report.totalStudents ?? report.totalResponses;
  const evaluatedItems = report.evaluatedItems ?? report.validResponses;
  const benchmarkScore = report.compositeAverageScore;
  const percentage = report.percentage ?? (report.hasData ? Number(((benchmarkScore / 5) * 100).toFixed(1)) : 0);

  // Box 1: Total Students (COUNT DISTINCT google_response_id)
  doc.rect(margin, currentY, boxWidth, boxHeight).fillAndStroke('#EFF6FF', '#BFDBFE');
  doc.font('Helvetica').fontSize(7).fillColor('#1E40AF').text('TOTAL STUDENTS', margin, currentY + 7, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1E3A8A').text(String(totalStudents), margin, currentY + 20, { width: boxWidth, align: 'center' });

  // Box 2: Evaluated Items (Total faculty-subject evaluations)
  const box2X = margin + (boxWidth + boxGap);
  doc.rect(box2X, currentY, boxWidth, boxHeight).fillAndStroke('#F0FDF4', '#BBF7D0');
  doc.font('Helvetica').fontSize(7).fillColor('#166534').text('EVALUATED ITEMS', box2X, currentY + 7, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#14532D').text(String(evaluatedItems), box2X, currentY + 20, { width: boxWidth, align: 'center' });

  // Box 3: Semester Benchmark Score
  const box3X = margin + (boxWidth + boxGap) * 2;
  const bColor = benchmarkScore >= 4.0 ? '#4F46E5' : benchmarkScore >= 3.0 ? '#065F46' : benchmarkScore >= 2.0 ? '#92400E' : '#991B1B';
  const bBg = benchmarkScore >= 4.0 ? '#EEF2FF' : benchmarkScore >= 3.0 ? '#ECFDF5' : benchmarkScore >= 2.0 ? '#FEF3C7' : '#FEE2E2';
  const bBorder = benchmarkScore >= 4.0 ? '#C7D2FE' : benchmarkScore >= 3.0 ? '#A7F3D0' : benchmarkScore >= 2.0 ? '#FDE68A' : '#FECACA';
  doc.rect(box3X, currentY, boxWidth, boxHeight).fillAndStroke(bBg, bBorder);
  doc.font('Helvetica').fontSize(7).fillColor(bColor).text('SEMESTER BENCHMARK', box3X, currentY + 7, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(bColor).text(
    report.hasData ? `${benchmarkScore.toFixed(2)}/5.00` : 'N/A',
    box3X,
    currentY + 20,
    { width: boxWidth, align: 'center' }
  );

  // Box 4: Percentage Score
  const box4X = margin + (boxWidth + boxGap) * 3;
  doc.rect(box4X, currentY, boxWidth, boxHeight).fillAndStroke('#FAF5FF', '#E9D5FF');
  doc.font('Helvetica').fontSize(7).fillColor('#6B21A8').text('PERCENTAGE', box4X, currentY + 7, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#581C87').text(
    report.hasData ? `${percentage.toFixed(1)}%` : 'N/A',
    box4X,
    currentY + 20,
    { width: boxWidth, align: 'center' }
  );

  // Box 5: Performance Grade
  const box5X = margin + (boxWidth + boxGap) * 4;
  const gradeLabel = !report.hasData
    ? 'NO DATA'
    : benchmarkScore >= 4.5
    ? 'EXCELLENT'
    : benchmarkScore >= 3.75
    ? 'VERY GOOD'
    : benchmarkScore >= 3.0
    ? 'GOOD'
    : benchmarkScore >= 2.0
    ? 'SATISFACTORY'
    : 'NEEDS ATTN';
  doc.rect(box5X, currentY, boxWidth, boxHeight).fillAndStroke('#F8FAFC', COLORS.border);
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.secondary).text('PERFORMANCE GRADE', box5X, currentY + 7, { width: boxWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(bColor).text(gradeLabel, box5X, currentY + 22, { width: boxWidth, align: 'center' });

  currentY += boxHeight + 14;

  // Faculty Comparison Table
  if (report.facultyGrids && report.facultyGrids.length > 0) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary).text('SEMESTER FACULTY COMPARATIVE EVALUATION MATRIX', margin, currentY);
    currentY += 13;

    const compColWidths = [150, 150, 60, 65, 98];
    const compHeaders = ['Faculty Member', 'Subject / Course', 'Submissions', 'Avg Rating', 'Visual Benchmark'];

    doc.rect(margin, currentY, contentWidth, 16).fill('#1E293B');
    let fX = margin;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
    compHeaders.forEach((ch, ci) => {
      const align = ci < 2 ? 'left' : 'center';
      doc.text(ch, fX + 4, currentY + 4, { width: compColWidths[ci] - 8, align });
      fX += compColWidths[ci];
    });

    currentY += 16;

    report.facultyGrids.forEach((fg, fIdx) => {
      const rowHeight = 19;
      if (fIdx % 2 === 1) doc.rect(margin, currentY, contentWidth, rowHeight).fill('#F8FAFC');
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke();

      let cellX = margin;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.secondary).text(fg.facultyName, cellX + 4, currentY + 5, { width: compColWidths[0] - 8 });
      cellX += compColWidths[0];

      doc.font('Helvetica').fontSize(7).fillColor('#475569').text(
        `${fg.subjectName}${fg.subjectCode ? ` (${fg.subjectCode})` : ''}`,
        cellX + 4,
        currentY + 5,
        { width: compColWidths[1] - 8 }
      );
      cellX += compColWidths[1];

      doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(String(fg.report.totalResponses), cellX + 2, currentY + 5, { width: compColWidths[2] - 4, align: 'center' });
      cellX += compColWidths[2];

      const score = fg.report.compositeAverageScore;
      const fScoreColor = score >= 4.0 ? '#4F46E5' : score >= 3.0 ? '#059669' : score >= 2.0 ? '#D97706' : '#DC2626';
      doc.font('Helvetica-Bold').fontSize(8).fillColor(fScoreColor).text(
        fg.report.hasData ? `${score.toFixed(2)}/5.00` : 'N/A',
        cellX + 2,
        currentY + 5,
        { width: compColWidths[3] - 4, align: 'center' }
      );
      cellX += compColWidths[3];

      // Visual Bar
      const barWidth = 70;
      const barHeight = 7;
      const barX = cellX + 14;
      const barY = currentY + 6;
      doc.rect(barX, barY, barWidth, barHeight).fill('#E2E8F0');
      if (fg.report.hasData) {
        const fillW = Math.max(2, Math.min(barWidth, (score / 5.0) * barWidth));
        const barColor = score >= 4.0 ? '#6366F1' : score >= 3.0 ? '#10B981' : score >= 2.0 ? '#F59E0B' : '#EF4444';
        doc.rect(barX, barY, fillW, barHeight).fill(barColor);
      }

      currentY += rowHeight;
    });

    currentY += 14;
  }

  // Check if remaining tables need a second page
  if (currentY + 280 > pageHeight - 60) {
    drawFooter(doc, currentPage, 2, brand);
    doc.addPage();
    currentPage = 2;
    drawHeader(doc, 'Semester Feedback Comparative Evaluation Report', brand);
    currentY = 104;
  }

  // Parameter Evaluation Table Header
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary).text('ALL-SUBJECTS COMBINED 8-PARAMETER EVALUATION BENCHMARK', margin, currentY);
  currentY += 13;

  const tableColWidths = [165, 48, 48, 48, 48, 52, 58, 56];
  const tableHeaders = ['Parameter (1 to 8)', 'Avg (5.0)', 'Excell %', 'V. Good %', 'Good %', 'Sat %', 'Unsat %', 'Visual Bar'];

  doc.rect(margin, currentY, contentWidth, 16).fill(COLORS.bgHeader);

  let curX = margin;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
  tableHeaders.forEach((h, i) => {
    const align = i === 0 ? 'left' : 'center';
    doc.text(h, curX + 4, currentY + 4, { width: tableColWidths[i] - 8, align });
    curX += tableColWidths[i];
  });

  currentY += 16;

  report.parameters.forEach((p, idx) => {
    const rowHeight = 18;
    const isAlt = idx % 2 === 1;

    if (isAlt) doc.rect(margin, currentY, contentWidth, rowHeight).fill('#F8FAFC');
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke();

    let cellX = margin;

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.secondary);
    doc.text(`${p.parameterId}. ${p.title}`, cellX + 4, currentY + 5, { width: tableColWidths[0] - 8, align: 'left' });
    cellX += tableColWidths[0];

    doc.font('Helvetica-Bold').fontSize(8).fillColor(p.averageScore >= 4.0 ? '#4F46E5' : p.averageScore >= 3.0 ? '#059669' : p.averageScore >= 2.0 ? '#D97706' : '#DC2626');
    doc.text(p.validCount > 0 ? p.averageScore.toFixed(2) : '-', cellX + 2, currentY + 5, { width: tableColWidths[1] - 4, align: 'center' });
    cellX += tableColWidths[1];

    doc.font('Helvetica').fontSize(7.5).fillColor('#4338CA');
    doc.text(p.validCount > 0 ? `${p.excellentPct.toFixed(0)}%` : '-', cellX + 2, currentY + 5, { width: tableColWidths[2] - 4, align: 'center' });
    cellX += tableColWidths[2];

    doc.font('Helvetica').fontSize(7.5).fillColor('#059669');
    doc.text(p.validCount > 0 ? `${p.veryGoodPct.toFixed(0)}%` : '-', cellX + 2, currentY + 5, { width: tableColWidths[3] - 4, align: 'center' });
    cellX += tableColWidths[3];

    doc.text(p.validCount > 0 ? `${p.goodPct.toFixed(0)}%` : '-', cellX + 2, currentY + 5, { width: tableColWidths[4] - 4, align: 'center' });
    cellX += tableColWidths[4];

    doc.text(p.validCount > 0 ? `${p.satisfactoryPct.toFixed(0)}%` : '-', cellX + 2, currentY + 5, { width: tableColWidths[5] - 4, align: 'center' });
    cellX += tableColWidths[5];

    doc.text(p.validCount > 0 ? `${p.unsatisfactoryPct.toFixed(0)}%` : '-', cellX + 2, currentY + 5, { width: tableColWidths[6] - 4, align: 'center' });
    cellX += tableColWidths[6];

    // Bar
    const barWidth = 46;
    const barHeight = 7;
    const barX = cellX + 5;
    const barY = currentY + 5;
    doc.rect(barX, barY, barWidth, barHeight).fill('#E2E8F0');
    if (p.validCount > 0) {
      const fillW = Math.max(2, Math.min(barWidth, (p.averageScore / 5.0) * barWidth));
      const barColor = p.averageScore >= 4.0 ? '#6366F1' : p.averageScore >= 3.0 ? '#10B981' : p.averageScore >= 2.0 ? '#F59E0B' : '#EF4444';
      doc.rect(barX, barY, fillW, barHeight).fill(barColor);
    }

    currentY += rowHeight;
  });

  currentY += 12;

  // Rating Distribution Section (The 5 Canonical Categories)
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary).text('AGGREGATE RATING DISTRIBUTION (ALL 5 CATEGORIES)', margin, currentY);
  currentY += 12;

  const distCardHeight = 38;
  doc.rect(margin, currentY, contentWidth, distCardHeight).fillAndStroke(COLORS.bgLight, COLORS.border);

  const distColW = contentWidth / 5;
  const distY = currentY + 6;

  // Excellent
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#4F46E5').text('EXCELLENT', margin, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#3730A3').text(`${report.distribution.excellentCount} (${report.distribution.excellentPct}%)`, margin, distY + 11, { width: distColW, align: 'center' });

  // Very Good
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#059669').text('VERY GOOD', margin + distColW, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#065F46').text(`${report.distribution.veryGoodCount} (${report.distribution.veryGoodPct}%)`, margin + distColW, distY + 11, { width: distColW, align: 'center' });

  // Good
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2563EB').text('GOOD', margin + distColW * 2, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1E40AF').text(`${report.distribution.goodCount} (${report.distribution.goodPct}%)`, margin + distColW * 2, distY + 11, { width: distColW, align: 'center' });

  // Satisfactory
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#D97706').text('SATISFACTORY', margin + distColW * 3, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#92400E').text(`${report.distribution.satisfactoryCount} (${report.distribution.satisfactoryPct}%)`, margin + distColW * 3, distY + 11, { width: distColW, align: 'center' });

  // Unsatisfactory
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#DC2626').text('UNSATISFACTORY', margin + distColW * 4, distY, { width: distColW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#991B1B').text(`${report.distribution.unsatisfactoryCount} (${report.distribution.unsatisfactoryPct}%)`, margin + distColW * 4, distY + 11, { width: distColW, align: 'center' });

  currentY += distCardHeight + 12;

  // Observations & Institutional Summary
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary).text('OBJECTIVE DATA-DRIVEN OBSERVATIONS & SUMMARY', margin, currentY);
  currentY += 12;

  const obsHeight = 62;
  doc.rect(margin, currentY, contentWidth, obsHeight).fillAndStroke('#FAF5FF', '#E9D5FF');

  let obsY = currentY + 6;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#6B21A8').text('Key Observations (Strictly Derived from Computed Submissions):', margin + 10, obsY);
  obsY += 10;

  const sortedParams = [...report.parameters].filter(p => p.validCount > 0).sort((a, b) => b.averageScore - a.averageScore);
  doc.font('Helvetica').fontSize(7).fillColor('#4C1D95');

  if (sortedParams.length > 0) {
    const highest = sortedParams[0];
    const lowest = sortedParams[sortedParams.length - 1];

    doc.text(`• Highest Rated Parameter: "${highest.title}" scored ${highest.averageScore.toFixed(2)}/5.00 (${highest.excellentPct}% Excellent, ${highest.veryGoodPct}% Very Good).`, margin + 12, obsY);
    obsY += 9.5;

    doc.text(`• Area for Academic Attention: "${lowest.title}" scored ${lowest.averageScore.toFixed(2)}/5.00 (${lowest.unsatisfactoryPct}% Unsatisfactory).`, margin + 12, obsY);
    obsY += 9.5;

    doc.text(`• Overall Feedback Satisfaction: ${(report.distribution.excellentPct + report.distribution.veryGoodPct + report.distribution.goodPct).toFixed(1)}% of all individual ratings were Excellent, Very Good or Good.`, margin + 12, obsY);
    obsY += 9.5;

    doc.text(`• Sample Reliability: ${totalStudents} student submission(s) across ${evaluatedItems} evaluated faculty-subject item(s).`, margin + 12, obsY);
    obsY += 9.5;

    doc.text(`• Benchmark Formula Applied: Semester Score = SUM(all valid rating weights across all grids) / COUNT(all valid ratings) = ${benchmarkScore.toFixed(2)}/5.00 (${percentage.toFixed(1)}%).`, margin + 12, obsY);
  }

  currentY += obsHeight + 14;

  // Bottom-Right Signature Block (Strict requirement: Signature: ____________________)
  const sigY = Math.min(pageHeight - 60, Math.max(currentY, pageHeight - 75));
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary).text('Signature: ____________________', margin, sigY, {
    width: contentWidth,
    align: 'right',
  });

  drawFooter(doc, currentPage, currentPage, brand);

  doc.end();
  return bufferPromise;
}

/**
 * Data contract for single student response PDF export
 */
export interface StudentResponsePDFData {
  studentName?: string | null;
  registrationNumber?: string | null;
  studentEmail: string;
  academicYear: string;
  branch: string;
  semester: string;
  formTitle: string;
  submittedAt?: string | null;
  submissionId?: string | null;
  facultyEvaluations: Array<{
    facultyName: string;
    subjectName: string;
    ratings: Array<{
      parameterId: number;
      parameterTitle: string;
      rating: string;
    }>;
  }>;
  generalFeedback?: string | null;
}

/**
 * Generates an Individual Student Response PDF
 * Contains strictly the requesting student's own verified submission.
 * Zero PII leakage of other students, zero institutional analytics, zero raw sheets.
 */
export async function generateStudentResponsePDF(
  data: StudentResponsePDFData,
  branding?: CollegeBranding
): Promise<Buffer> {
  const brand = branding || DEFAULT_BRANDING;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    autoFirstPage: true,
    info: {
      Title: `Feedback Submission Record — ${data.studentEmail}`,
      Author: brand.name,
      Subject: 'Student Feedback Submission Receipt',
      Keywords: `${brand.code}, Student Response, Feedback Receipt`,
    },
  });

  const bufferPromise = streamToBuffer(doc);
  const margin = 36;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  let currentPage = 1;

  // Header
  drawHeader(doc, 'Student Feedback Submission Record', brand);

  let currentY = 104;

  const formattedDate = data.submittedAt
    ? new Date(data.submittedAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Recorded in Google Sheet';

  // Metadata Table Grid (2 Columns, dynamic wrapped row heights)
  const showSubmissionMeta = shouldShowSubmissionMetadata(data.academicYear);

  const metadataRows: MetadataRow[] = [
    {
      left: {
        label: 'Student Name: ',
        value: data.studentName || 'Confidential / Registered Student',
      },
      right: {
        label: 'Branch / Discipline: ',
        value: data.branch || 'N/A',
      },
    },
    {
      left: {
        label: 'Registration Number: ',
        value: data.registrationNumber || 'N/A',
      },
      right: {
        label: 'Semester: ',
        value: data.semester || 'N/A',
      },
    },
    {
      left: {
        label: 'Verified Email: ',
        value: formatSafeCellText(data.studentEmail, 28),
      },
      right: {
        label: 'Academic Session: ',
        value: data.academicYear || 'N/A',
      },
    },
    {
      left: {
        label: 'Feedback Form: ',
        value: data.formTitle || 'N/A',
      },
      right: showSubmissionMeta
        ? {
            label: 'Submission Date: ',
            value: formattedDate,
          }
        : {
            label: '',
            value: '',
          },
    },
  ];

  if (showSubmissionMeta) {
    metadataRows.push({
      left: {
        label: '',
        value: '',
      },
      right: {
        label: 'Submission ID: ',
        value: formatSafeCellText(data.submissionId, 28) || 'Recorded',
      },
    });
  }

  const metaHeight = renderMetadataGrid(doc, currentY, contentWidth, margin, metadataRows);
  currentY += metaHeight + 12;

  // Render Faculty Evaluations
  for (const evaluation of data.facultyEvaluations) {
    // Check if we need a page break (each faculty grid table takes ~190pt)
    if (currentY + 190 > pageHeight - margin - 50) {
      drawFooter(doc, currentPage, currentPage, brand); // Note: estimated total
      doc.addPage();
      currentPage++;
      drawHeader(doc, 'Student Feedback Submission Record', brand);
      currentY = 104;
    }

    // Faculty section banner
    doc.rect(margin, currentY, contentWidth, 20).fill('#1E293B');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.white).text(
      `FACULTY: ${evaluation.facultyName.toUpperCase()} — ${evaluation.subjectName.toUpperCase()}`,
      margin + 8,
      currentY + 5,
      { width: contentWidth - 16 }
    );
    currentY += 20;

    // Table Header
    const colParamWidth = 390;
    const colRatingWidth = contentWidth - colParamWidth; // 133pt

    doc.rect(margin, currentY, contentWidth, 16).fill('#334155');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
    doc.text('Evaluation Parameter', margin + 6, currentY + 4, { width: colParamWidth - 12 });
    doc.text('Rating Assigned', margin + colParamWidth + 4, currentY + 4, { width: colRatingWidth - 8, align: 'center' });
    currentY += 16;

    // Rating rows
    evaluation.ratings.forEach((r, rIdx) => {
      const rowHeight = 18;
      const isAlt = rIdx % 2 === 1;

      if (isAlt) {
        doc.rect(margin, currentY, contentWidth, rowHeight).fill('#F8FAFC');
      }
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke();

      // Parameter text
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.secondary);
      doc.text(`${r.parameterId}. ${r.parameterTitle}`, margin + 6, currentY + 5, { width: colParamWidth - 12, ellipsis: true });

      // Rating badge text & color
      let ratingColor = '#64748B';
      const ratingLower = (r.rating || '').toLowerCase();
      if (ratingLower.includes('excellent')) ratingColor = '#4F46E5';
      else if (ratingLower.includes('very good')) ratingColor = '#059669';
      else if (ratingLower.includes('good')) ratingColor = '#2563EB';
      else if (ratingLower.includes('satisfactory')) ratingColor = '#D97706';
      else if (ratingLower.includes('unsatisfactory')) ratingColor = '#DC2626';

      doc.font('Helvetica-Bold').fontSize(8).fillColor(ratingColor);
      doc.text(r.rating || 'Not Rated', margin + colParamWidth + 4, currentY + 5, { width: colRatingWidth - 8, align: 'center' });

      currentY += rowHeight;
    });

    currentY += 12;
  }

  // General Feedback (if present)
  if (data.generalFeedback && data.generalFeedback.trim()) {
    if (currentY + 80 > pageHeight - margin - 50) {
      drawFooter(doc, currentPage, currentPage, brand);
      doc.addPage();
      currentPage++;
      drawHeader(doc, 'Student Feedback Submission Record', brand);
      currentY = 104;
    }

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary).text('GENERAL FEEDBACK & OBSERVATIONS', margin, currentY);
    currentY += 14;

    doc.rect(margin, currentY, contentWidth, 50).fillAndStroke('#F0FDF4', '#BBF7D0');
    doc.font('Helvetica').fontSize(8).fillColor('#166534').text(data.generalFeedback.trim(), margin + 10, currentY + 8, {
      width: contentWidth - 20,
      height: 36,
      ellipsis: true,
    });
    currentY += 60;
  }

  // Institutional Verification Notice
  if (currentY + 45 <= pageHeight - margin - 50) {
    doc.rect(margin, currentY, contentWidth, 34).fillAndStroke('#F8FAFC', COLORS.border);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.primary).text(
      'OFFICIAL INSTITUTIONAL RECORD VERIFICATION',
      margin + 10,
      currentY + 6
    );
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.textMuted).text(
      `This document confirms official submission of your semester feedback in the ${brand.name}. Submitted responses are aggregated impartially for academic quality enhancement.`,
      margin + 10,
      currentY + 16,
      { width: contentWidth - 20 }
    );
  }

  drawFooter(doc, currentPage, currentPage, brand);
  doc.end();
  return bufferPromise;
}

