import type { forms_v1 } from 'googleapis';
import { executeWithGoogleOAuthRetry } from './auth';
import { appendResponsesToSheet, getExistingSheetResponseIds } from './sheets';
import { BCE_FEEDBACK_PARAMETERS } from './template';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateResponseToken } from '@/lib/feedback/response-token';
import { sendStudentSubmissionConfirmationEmail } from '@/lib/email/service';

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  totalResponses: number;
  message: string;
  error?: string;
}

/**
 * Synchronizes submitted Google Form responses into the connected Google Sheet
 * using official Google Forms API v1 and Google Sheets API v4.
 *
 * Idempotent: Skips response IDs that are already present in the sheet.
 */
export async function syncFormResponsesToSheet(params: {
  googleFormId: string;
  googleSheetId: string;
  formId?: string;
}): Promise<SyncResult> {
  const { googleFormId, googleSheetId, formId } = params;

  try {
    // Fetch form structure, submitted responses, and sheet state via OAuth retry wrapper
    const { items, allResponses, sheetHeaders, sheetDataRows } = await executeWithGoogleOAuthRetry(
      async ({ forms, sheets }) => {
        const formMetadata = await forms.forms.get({ formId: googleFormId });
        const items = formMetadata.data.items || [];

        let allResponses: forms_v1.Schema$FormResponse[] = [];
        try {
          const responsesRes = await forms.forms.responses.list({ formId: googleFormId });
          allResponses = (responsesRes.data.responses || []) as forms_v1.Schema$FormResponse[];
        } catch (formsErr: unknown) {
          console.warn('[Sync] Google Forms API responses list notice:', formsErr instanceof Error ? formsErr.message : formsErr);
        }

        let sheetHeaders: string[] = [];
        let sheetDataRows: any[][] = [];
        try {
          const sheetDataRes = await sheets.spreadsheets.values.get({
            spreadsheetId: googleSheetId,
            range: "'Form Responses'!A1:ZZ",
          });
          const allSheetValues = sheetDataRes.data.values || [];
          sheetHeaders = (allSheetValues[0] || []).map(h => String(h || '').trim());
          sheetDataRows = allSheetValues.slice(1);
        } catch {
          sheetHeaders = [];
          sheetDataRows = [];
        }

        return { items, allResponses, sheetHeaders, sheetDataRows };
      }
    );

    // Map questionId -> parameter index (0..7) and identification / comment fields
    const questionIdToParamIndex = new Map<string, number>();
    const gridQuestionMap = new Map<string, { gridTitle: string; paramIndex: number }>();
    let studentNameQuestionId: string | null = null;
    let regNoQuestionId: string | null = null;
    let commentsQuestionId: string | null = null;

    items.forEach(item => {
      const itemTitle = (item.title || '').trim();
      const lowerItemTitle = itemTitle.toLowerCase();

      // 1. Single Question Item
      if (item.questionItem?.question) {
        const qId = item.questionItem.question.questionId;
        if (!qId) return;

        if (lowerItemTitle.includes('student name') || (lowerItemTitle.includes('name') && !lowerItemTitle.includes('faculty') && !lowerItemTitle.includes('subject'))) {
          studentNameQuestionId = qId;
        } else if (lowerItemTitle.includes('registration') || lowerItemTitle.includes('reg') || lowerItemTitle.includes('roll')) {
          regNoQuestionId = qId;
        } else if (lowerItemTitle.includes('comment') || lowerItemTitle.includes('suggestion') || lowerItemTitle.includes('general feedback') || (lowerItemTitle.includes('feedback') && !lowerItemTitle.includes('faculty'))) {
          commentsQuestionId = qId;
        } else {
          const paramIndex = BCE_FEEDBACK_PARAMETERS.findIndex(
            p => lowerItemTitle.includes(p.title.toLowerCase())
          );
          if (paramIndex !== -1) {
            questionIdToParamIndex.set(qId, paramIndex);
          }
        }
      }

      // 2. Multiple Choice Grid (questionGroupItem)
      if (item.questionGroupItem?.questions) {
        item.questionGroupItem.questions.forEach(q => {
          const qId = q.questionId;
          const rowTitle = (q.rowQuestion?.title || '').trim().toLowerCase();
          if (!qId) return;

          const paramIndex = BCE_FEEDBACK_PARAMETERS.findIndex(
            p => rowTitle.includes(p.title.toLowerCase()) || p.title.toLowerCase().includes(rowTitle)
          );
          if (paramIndex !== -1) {
            gridQuestionMap.set(qId, { gridTitle: itemTitle, paramIndex });
          }
        });
      }
    });

    const totalResponses = allResponses.length;

    if (totalResponses === 0 && sheetDataRows.length === 0) {
      return {
        success: true,
        syncedCount: 0,
        totalResponses: 0,
        message: 'No responses submitted yet in Google Form or connected Google Sheet.',
      };
    }

    // 4. Check which responses are already recorded in the Google Sheet
    const existingIds = await getExistingSheetResponseIds(googleSheetId);
    const rowsToAppend: (string | number)[][] = [];

    for (const resp of allResponses) {
      const responseId = resp.responseId || '';
      if (existingIds.has(responseId)) {
        continue; // Already synced
      }

      const timestamp = resp.lastSubmittedTime || resp.createTime || new Date().toISOString();
      const email = resp.respondentEmail || '';
      const studentName = (studentNameQuestionId && resp.answers?.[studentNameQuestionId]?.textAnswers?.answers?.[0]?.value) || '';
      const regNo = (regNoQuestionId && resp.answers?.[regNoQuestionId]?.textAnswers?.answers?.[0]?.value) || '';
      const comments = (commentsQuestionId && resp.answers?.[commentsQuestionId]?.textAnswers?.answers?.[0]?.value) || '';

      const singleAnswerRow: string[] = new Array(8).fill('N/A');
      const gridAnswerMap = new Map<string, string>(); // `${gridTitle.toLowerCase()}_${paramIndex}` -> answer value

      if (resp.answers) {
        const answersRecord = resp.answers as Record<string, forms_v1.Schema$Answer>;
        for (const [qId, answerObj] of Object.entries(answersRecord)) {
          const val = answerObj.textAnswers?.answers?.[0]?.value || '';

          // Single question match
          const paramIdx = questionIdToParamIndex.get(qId);
          if (paramIdx !== undefined && paramIdx >= 0 && paramIdx < 8) {
            singleAnswerRow[paramIdx] = val;
          }

          // Grid question match
          const gridInfo = gridQuestionMap.get(qId);
          if (gridInfo) {
            gridAnswerMap.set(`${gridInfo.gridTitle.toLowerCase()}_${gridInfo.paramIndex}`, val);
          }
        }
      }

      if (sheetHeaders.length > 0) {
        // Map dynamically to the exact columns of the target sheet
        const row: (string | number)[] = sheetHeaders.map(rawHeader => {
          const h = rawHeader.toLowerCase();
          if (h.includes('timestamp') || h === 'date' || h === 'time') return timestamp;
          if (h.includes('response id') || h === 'submission id' || (h === 'id' && !h.includes('student'))) return responseId;
          if (h.includes('email') || h.includes('username')) return email;
          if (h.includes('student name') || (h.includes('name') && !h.includes('faculty') && !h.includes('subject'))) return studentName;
          if (h.includes('registration') || h.includes('reg') || h.includes('roll')) return regNo;
          if (h.includes('comment') || h.includes('suggestion') || h.includes('general feedback') || (h.includes('feedback') && !h.includes('faculty'))) return comments;

          // Check if column is a grid column: "<Grid Title> [<Row Title>]"
          for (const [gridKey, val] of gridAnswerMap.entries()) {
            const [gt, pIdxStr] = gridKey.split('_');
            const pIdx = parseInt(pIdxStr, 10);
            const param = BCE_FEEDBACK_PARAMETERS[pIdx];
            if (param && h.includes(gt) && h.includes(param.title.toLowerCase())) {
              return val;
            }
          }

          // Check single question column match
          for (let pIdx = 0; pIdx < BCE_FEEDBACK_PARAMETERS.length; pIdx++) {
            const param = BCE_FEEDBACK_PARAMETERS[pIdx];
            if (h.includes(param.title.toLowerCase()) || h.startsWith(`${param.id}.`)) {
              return singleAnswerRow[pIdx] || 'N/A';
            }
          }

          return '';
        });

        rowsToAppend.push(row);
        sheetDataRows.push(row);
        existingIds.add(responseId);
      } else {
        // Fallback row layout
        const fallbackRow = [
          timestamp,
          responseId,
          email,
          studentName,
          regNo,
          ...singleAnswerRow,
          comments,
        ];
        rowsToAppend.push(fallbackRow);
        sheetDataRows.push(fallbackRow);
        existingIds.add(responseId);
      }
    }

    // 4. Append new response rows to the sheet
    if (rowsToAppend.length > 0) {
      await appendResponsesToSheet(googleSheetId, rowsToAppend);
    }

    // 5. Track Response Records in Supabase Database & Dispatch Confirmation Email (Idempotent)
    const supabase = createAdminClient();
    if (supabase) {
      try {
        let formRecord: any = null;
        if (formId) {
          const { data } = await supabase
            .from('feedback_forms')
            .select('id, title, branch:branches(name), semester:semesters(name), academic_year:academic_years(name)')
            .eq('id', formId)
            .maybeSingle();
          formRecord = data;
        } else {
          const { data } = await supabase
            .from('feedback_forms')
            .select('id, title, branch:branches(name), semester:semesters(name), academic_year:academic_years(name)')
            .eq('google_form_id', googleFormId)
            .maybeSingle();
          formRecord = data;
        }

        if (formRecord) {
          const formUuid = formRecord.id;
          const branchName = formRecord.branch?.name || 'Department';
          const semesterName = formRecord.semester?.name || 'Semester';
          const academicYearName = formRecord.academic_year?.name || 'Academic Session';
          const formTitle = formRecord.title || 'Faculty Feedback Form';
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bce-bgp-feedback-management-system.vercel.app';

          // Consolidate response items to track from Forms API + Sheet Rows
          interface TrackingMetadata {
            responseId: string;
            timestamp: string;
            email: string;
            studentName: string | null;
            registrationNumber: string | null;
          }
          const trackingMap = new Map<string, TrackingMetadata>();

          // Add from Forms API
          for (const resp of allResponses) {
            const responseId = resp.responseId;
            if (!responseId) continue;
            trackingMap.set(responseId, {
              responseId,
              timestamp: resp.lastSubmittedTime || resp.createTime || new Date().toISOString(),
              email: resp.respondentEmail || '',
              studentName: (studentNameQuestionId && resp.answers?.[studentNameQuestionId]?.textAnswers?.answers?.[0]?.value) || null,
              registrationNumber: (regNoQuestionId && resp.answers?.[regNoQuestionId]?.textAnswers?.answers?.[0]?.value) || null,
            });
          }

          // Add from Sheet Data Rows
          if (sheetHeaders.length > 0 && sheetDataRows.length > 0) {
            const lowerHeaders = sheetHeaders.map(h => h.toLowerCase());
            const tsIdx = lowerHeaders.findIndex(h => h.includes('timestamp') || h === 'date');
            const respIdIdx = lowerHeaders.findIndex(h => h.includes('response id') || (h === 'id' && !h.includes('student')));
            const emailIdx = lowerHeaders.findIndex(h => h.includes('email'));
            const nameIdx = lowerHeaders.findIndex(h => h.includes('student name') || (h.includes('name') && !h.includes('faculty') && !h.includes('subject')));
            const regIdx = lowerHeaders.findIndex(h => h.includes('registration') || h.includes('reg no'));

            sheetDataRows.forEach(row => {
              const rId = String((respIdIdx !== -1 ? row[respIdIdx] : '') || '').trim();
              if (!rId) return;
              if (!trackingMap.has(rId)) {
                trackingMap.set(rId, {
                  responseId: rId,
                  timestamp: String((tsIdx !== -1 ? row[tsIdx] : '') || new Date().toISOString()),
                  email: String((emailIdx !== -1 ? row[emailIdx] : '') || '').trim(),
                  studentName: nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : null,
                  registrationNumber: regIdx !== -1 && row[regIdx] ? String(row[regIdx]).trim() : null,
                });
              }
            });
          }

          for (const item of trackingMap.values()) {
            const responseId = item.responseId;

            // Check if already in feedback_response_records
            const { data: existingRec } = await supabase
              .from('feedback_response_records')
              .select('id, confirmation_email_sent_at, email_status')
              .eq('form_id', formUuid)
              .eq('google_response_id', responseId)
              .maybeSingle();

            if (existingRec) {
              // Already tracked; do not duplicate record or email
              continue;
            }

            const timestamp = item.timestamp;
            const email = item.email;
            const studentName = item.studentName;
            const regNo = item.registrationNumber;

            // Insert response record
            const { data: newRec, error: insertError } = await supabase
              .from('feedback_response_records')
              .insert({
                form_id: formUuid,
                google_response_id: responseId,
                student_email: email,
                student_name: studentName,
                registration_number: regNo,
                submitted_at: timestamp,
                synced_at: new Date().toISOString(),
                email_status: 'PENDING',
              })
              .select('id')
              .maybeSingle();

            if (insertError) {
              console.warn(`[Sync] Failed to insert feedback_response_record for ${responseId}:`, insertError.message);
              continue;
            }

            // If verified email is present, dispatch confirmation email
            if (email && email.includes('@') && newRec?.id) {
              try {
                const token = generateResponseToken({
                  responseId,
                  formId: formUuid,
                  email,
                });
                const downloadUrl = `${baseUrl}/api/feedback/response/download?token=${encodeURIComponent(token)}`;

                const emailRes = await sendStudentSubmissionConfirmationEmail({
                  studentEmail: email,
                  studentName,
                  registrationNumber: regNo,
                  formTitle,
                  academicYear: academicYearName,
                  branch: branchName,
                  semester: semesterName,
                  submittedAt: timestamp,
                  downloadUrl,
                });

                if (emailRes.status === 'SENT') {
                  await supabase
                    .from('feedback_response_records')
                    .update({
                      confirmation_email_sent_at: emailRes.sentAt,
                      email_status: 'SENT',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', newRec.id);
                } else {
                  await supabase
                    .from('feedback_response_records')
                    .update({
                      email_status: emailRes.status,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', newRec.id);
                }
              } catch (emailDispatchErr) {
                console.error(`[Sync] Email delivery exception for ${email}:`, emailDispatchErr);
                await supabase
                  .from('feedback_response_records')
                  .update({
                    email_status: 'FAILED',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', newRec.id);
              }
            }
          }

          // Authoritative student submission count
          const authoritativeStudentCount = trackingMap.size;
          if (authoritativeStudentCount > 0) {
            await supabase
              .from('feedback_forms')
              .update({
                response_count: authoritativeStudentCount,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', formUuid);
          }
        }
      } catch (dbSyncErr) {
        console.error('[Sync] Error syncing response metadata to Supabase:', dbSyncErr);
      }
    }

    const authoritativeTotal =
      allResponses.length > 0
        ? allResponses.length
        : sheetDataRows.length;

    return {
      success: true,
      syncedCount: rowsToAppend.length,
      totalResponses: authoritativeTotal,
      message:
        rowsToAppend.length > 0
          ? `Successfully synchronized ${rowsToAppend.length} new response(s) to Google Sheet (Total: ${authoritativeTotal}).`
          : `Sheet is up to date (${authoritativeTotal} response(s) already recorded).`,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      syncedCount: 0,
      totalResponses: 0,
      message: `Failed to synchronize responses: ${errMsg}`,
      error: errMsg,
    };
  }
}

