import { getCollegeGoogleServices } from '@/lib/google/auth';

export interface RawSheetData {
  headers: string[];
  rows: string[][];
  totalRowCount: number;
}

/**
 * Fetches raw response rows from a connected Google Sheet
 * Reads from 'Form Responses' sheet (or the first sheet in the spreadsheet)
 * using the institutional credentials of the college owning the form.
 */
export async function fetchRawSheetResponses(
  spreadsheetId: string,
  collegeId?: string
): Promise<RawSheetData> {
  if (!spreadsheetId || !collegeId) {
    return { headers: [], rows: [], totalRowCount: 0 };
  }

  try {
    const { sheets } = await getCollegeGoogleServices(collegeId);

    // 1. First get spreadsheet metadata to know the exact sheet name
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTitle =
      meta.data.sheets?.[0]?.properties?.title || 'Form Responses';

    // 2. Fetch all rows
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const allValues = (res.data.values || []) as (string | number)[][];

    if (allValues.length === 0) {
      return { headers: [], rows: [], totalRowCount: 0 };
    }

    const headers = allValues[0].map(h => String(h || '').trim());
    const rawRows = allValues.slice(1);

    // Convert all row cells to clean strings
    const rows = rawRows.map(row => row.map(cell => String(cell || '').trim()));

    // Filter out rows that are completely empty
    const cleanRows = rows.filter(r => r.some(cell => cell.length > 0));

    return {
      headers,
      rows: cleanRows,
      totalRowCount: cleanRows.length,
    };
  } catch (err: unknown) {
    console.error('Error fetching Google Sheet responses:', err);
    return { headers: [], rows: [], totalRowCount: 0 };
  }
}
