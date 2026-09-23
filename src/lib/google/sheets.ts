import { executeWithCollegeGoogleOAuthRetry } from './auth';
import { BCE_FEEDBACK_PARAMETERS, MultiFacultyGridItem } from './template';

export interface CreateSheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

/**
 * Converts 1-based column number to spreadsheet letter (e.g., 1 -> A, 13 -> M)
 */
export function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter || 'A';
}

export const FEEDBACK_SHEET_HEADERS = [
  'Timestamp',
  'Response ID',
  'Email',
  'Student Name',
  'University Registration Number',
  ...BCE_FEEDBACK_PARAMETERS.map(p => `${p.id}. ${p.title}`),
  'General Feedback',
];

export function buildMultiFacultySheetHeaders(items: MultiFacultyGridItem[]): string[] {
  const headers = [
    'Timestamp',
    'Response ID',
    'Email',
    'Student Name',
    'University Registration Number',
  ];

  items.forEach(item => {
    const gridTitle =
      item.gridTitle ||
      `${item.subjectName}${item.subjectCode ? ` (${item.subjectCode})` : ''} — ${item.facultyName}`;

    BCE_FEEDBACK_PARAMETERS.forEach(p => {
      headers.push(`${gridTitle} [${p.title}]`);
    });
  });

  headers.push('General Feedback');
  return headers;
}

/**
 * Creates a new Google Spreadsheet for feedback responses and styles the header row.
 * Authenticates using the institutional Google connection of collegeId.
 */
export async function createFeedbackSpreadsheet(params: {
  collegeId: string;
  title: string;
  items?: MultiFacultyGridItem[];
}): Promise<CreateSheetResult> {
  return executeWithCollegeGoogleOAuthRetry(params.collegeId, async ({ sheets }) => {
    const sheetTitle = `Responses — ${params.title}`;

    // 1. Create Spreadsheet
    const res = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: sheetTitle,
        },
        sheets: [
          {
            properties: {
              title: 'Form Responses',
              gridProperties: {
                frozenRowCount: 1,
              },
            },
          },
        ],
      },
    });

    const spreadsheetId = res.data.spreadsheetId;
    const spreadsheetUrl = res.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    const gridSheetId = res.data.sheets?.[0]?.properties?.sheetId ?? 0;

    if (!spreadsheetId) {
      throw new Error('Google Sheets API failed to create spreadsheet');
    }

    const targetHeaders =
      params.items && params.items.length > 0
        ? buildMultiFacultySheetHeaders(params.items)
        : FEEDBACK_SHEET_HEADERS;

    const lastColLetter = getColumnLetter(targetHeaders.length);

    // 2. Populate Headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'Form Responses'!A1:${lastColLetter}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [targetHeaders],
      },
    });

    // 3. Apply Premium Header Styling (Dark Navy #0B192C with White Bold Text)
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: gridSheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: targetHeaders.length,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 11 / 255,
                      green: 25 / 255,
                      blue: 44 / 255,
                    },
                    textFormat: {
                      bold: true,
                      foregroundColor: {
                        red: 1.0,
                        green: 1.0,
                        blue: 1.0,
                      },
                      fontSize: 10,
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                    wrapStrategy: 'WRAP',
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
              },
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId: gridSheetId,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: gridSheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: targetHeaders.length,
                },
              },
            },
          ],
        },
      });
    } catch (styleErr) {
      console.warn('Non-fatal: Header styling failed on spreadsheet:', styleErr);
    }

    return {
      spreadsheetId,
      spreadsheetUrl,
    };
  });
}

/**
 * Appends feedback response rows to the sheet
 */
export async function appendResponsesToSheet(
  spreadsheetId: string,
  rows: (string | number)[][],
  collegeId: string
) {
  if (rows.length === 0) return { updatedRows: 0 };

  return executeWithCollegeGoogleOAuthRetry(collegeId, async ({ sheets }) => {
    let sheetTitle = 'Form Responses';
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      sheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Form Responses';
    } catch {
      sheetTitle = 'Form Responses';
    }

    const lastColLetter = getColumnLetter(FEEDBACK_SHEET_HEADERS.length);

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetTitle}'!A:${lastColLetter}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });

    return {
      updatedRows: res.data.updates?.updatedRows || rows.length,
    };
  });
}

/**
 * Reads existing response IDs from the sheet to avoid duplicate sync writes
 */
export async function getExistingSheetResponseIds(
  spreadsheetId: string,
  collegeId: string
): Promise<Set<string>> {
  try {
    return await executeWithCollegeGoogleOAuthRetry(collegeId, async ({ sheets }) => {
      let sheetTitle = 'Form Responses';
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Form Responses';
      } catch {
        sheetTitle = 'Form Responses';
      }

      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetTitle}'!1:1`,
      });

      const headers = (headerRes.data.values?.[0] || []).map(h => String(h || '').trim().toLowerCase());
      const respIdIdx = headers.findIndex(h => h.includes('response id') || (h === 'id' && !h.includes('student')));

      if (respIdIdx === -1) {
        return new Set<string>();
      }

      const colLetter = getColumnLetter(respIdIdx + 1);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetTitle}'!${colLetter}2:${colLetter}`,
      });

      const rows = res.data.values || [];
      return new Set(rows.map(r => String(r[0])));
    });
  } catch {
    return new Set<string>();
  }
}

/**
 * Fetches a single response row by responseId from the authoritative Google Sheet
 */
export async function fetchSingleResponseFromSheet(
  spreadsheetId: string,
  responseId: string,
  collegeId: string
): Promise<{ headers: string[]; row: string[] } | null> {
  try {
    return await executeWithCollegeGoogleOAuthRetry(collegeId, async ({ sheets }) => {
      let rows: any[][] = [];
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Form Responses';
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${sheetTitle}'!A1:ZZ`,
        });
        rows = res.data.values || [];
      } catch {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "'Form Responses'!A1:ZZ",
        });
        rows = res.data.values || [];
      }

      if (rows.length < 2) return null;

      const headers = (rows[0] || []).map(h => String(h || '').trim());
      const respIdIdx = headers.findIndex(
        h => h.toLowerCase().includes('response id') || (h.toLowerCase() === 'id' && !h.toLowerCase().includes('student'))
      );

      if (respIdIdx === -1) {
        // Fallback for native sheets without a "Response ID" column
        if (responseId.startsWith('row-')) {
          const rowNum = parseInt(responseId.replace('row-', ''), 10);
          if (!isNaN(rowNum) && rowNum >= 2 && rows[rowNum - 1]) {
            return {
              headers,
              row: rows[rowNum - 1].map(cell => String(cell || '').trim()),
            };
          }
        }
        return null;
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (String(row[respIdIdx] || '').trim() === responseId.trim()) {
          return {
            headers,
            row: row.map(cell => String(cell || '').trim()),
          };
        }
      }

      // If not matched by Response ID column, check if it's a row- based ID
      if (responseId.startsWith('row-')) {
        const rowNum = parseInt(responseId.replace('row-', ''), 10);
        if (!isNaN(rowNum) && rowNum >= 2 && rows[rowNum - 1]) {
          return {
            headers,
            row: rows[rowNum - 1].map(cell => String(cell || '').trim()),
          };
        }
      }

      return null;
    });
  } catch (err) {
    console.error(`[Sheets] Failed to fetch single response ${responseId}:`, err);
    return null;
  }
}
