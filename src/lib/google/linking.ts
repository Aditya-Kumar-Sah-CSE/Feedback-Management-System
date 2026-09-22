import { FORM_CONFIRMATION_MESSAGE } from './template';
import { executeWithCollegeGoogleOAuthRetry } from './auth';

export interface LinkingResult {
  success: boolean;
  destinationType: 'NATIVE_SHEET' | 'APPLICATION_MANAGED';
  message: string;
  confirmationConfigured?: boolean;
  error?: string;
}

export interface ConfigurationResult {
  success: boolean;
  confirmationConfigured: boolean;
  message: string;
  error?: string;
}

/**
 * Ensures the Google Apps Script execution account has writer access to
 * the Google Drive file (Form or Sheet) before invoking the Apps Script Web App.
 * Access is granted using the institutional Google connection of the specified college.
 */
async function ensureWriterAccess(fileId: string, collegeId: string): Promise<void> {
  const runnerEmail =
    process.env.GOOGLE_APPS_SCRIPT_RUNNER_EMAIL || 'iamsmartlearner4@gmail.com';
  if (!runnerEmail || !fileId || !collegeId) return;

  try {
    await executeWithCollegeGoogleOAuthRetry(collegeId, async ({ drive }) => {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: runnerEmail,
        },
        fields: 'id',
      });
    });
  } catch {
    // Drive API throws if already shared, or if sharing with self; safe to ignore
  }
}

/**
 * Attempts to bind the Form's native response destination to the Google Sheet
 * and configure the canonical post-submission confirmation message
 * using a deployed Google Apps Script Web App if configured.
 *
 * If the Apps Script Web App is not configured or unavailable, falls back
 * transparently to Application-Managed Response Synchronization.
 */
export async function linkFormToSpreadsheet(
  formId: string,
  sheetId: string,
  confirmationMessage: string = FORM_CONFIRMATION_MESSAGE,
  collegeId?: string
): Promise<LinkingResult> {
  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const scriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET;

  if (!scriptUrl) {
    return {
      success: true,
      destinationType: 'APPLICATION_MANAGED',
      confirmationConfigured: false,
      message:
        'Apps Script Web App connector not configured (GOOGLE_APPS_SCRIPT_URL). Using Application-Managed Response Synchronization via Google Forms Responses API + Sheets API.',
    };
  }

  try {
    if (collegeId) {
      await Promise.allSettled([
        ensureWriterAccess(formId, collegeId),
        ensureWriterAccess(sheetId, collegeId),
      ]);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'linkFormToSheet',
        formId,
        sheetId,
        confirmationMessage,
        secret: scriptSecret || '',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        destinationType: 'APPLICATION_MANAGED',
        confirmationConfigured: false,
        message: `Apps Script call returned HTTP ${response.status}: ${errText}. Using Application-Managed Synchronization.`,
        error: errText,
      };
    }

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        destinationType: 'NATIVE_SHEET',
        confirmationConfigured: Boolean(data.confirmationConfigured),
        message:
          data.message ||
          'Successfully connected Google Form native response destination to Google Sheet and configured confirmation message via Google Apps Script.',
      };
    } else {
      return {
        success: false,
        destinationType: 'APPLICATION_MANAGED',
        confirmationConfigured: false,
        message: `Apps Script failed to link: ${data.error || 'Unknown error'}. Using Application-Managed Synchronization.`,
        error: data.error,
      };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      destinationType: 'APPLICATION_MANAGED',
      confirmationConfigured: false,
      message: `Failed to reach Google Apps Script connector (${errMsg}). Using Application-Managed Synchronization.`,
      error: errMsg,
    };
  }
}

/**
 * Explicit helper to configure the post-submission confirmation message
 * and "Submit another response" setting on a Google Form via the Apps Script connector.
 */
export async function configureGoogleFormConfirmation(
  formId: string,
  confirmationMessage: string = FORM_CONFIRMATION_MESSAGE,
  collegeId?: string
): Promise<ConfigurationResult> {
  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const scriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET;

  if (!formId || typeof formId !== 'string' || formId.trim() === '') {
    return {
      success: false,
      confirmationConfigured: false,
      message: 'A valid Google Form ID is required.',
      error: 'INVALID_FORM_ID',
    };
  }

  if (!scriptUrl) {
    return {
      success: false,
      confirmationConfigured: false,
      message:
        'Apps Script Web App connector not configured (GOOGLE_APPS_SCRIPT_URL). Official Google Forms REST API v1 does not support setting confirmationMessage directly.',
      error: 'APPS_SCRIPT_NOT_CONFIGURED',
    };
  }

  try {
    if (collegeId) {
      await ensureWriterAccess(formId, collegeId);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'configureFormConfirmation',
        formId,
        confirmationMessage,
        secret: scriptSecret || '',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        confirmationConfigured: false,
        message: `Apps Script connector returned HTTP ${response.status}: ${errText}`,
        error: errText,
      };
    }

    const data = await response.json();
    return {
      success: Boolean(data.success),
      confirmationConfigured: Boolean(data.confirmationConfigured),
      message: data.message || 'Confirmation message configured successfully.',
      error: data.error,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      confirmationConfigured: false,
      message: `Failed to communicate with Google Apps Script connector: ${errMsg}`,
      error: errMsg,
    };
  }
}
