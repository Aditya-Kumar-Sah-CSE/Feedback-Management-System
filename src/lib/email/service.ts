/**
 * Student Response Confirmation Email Service
 * Manages automated dispatch of submission receipts with secure response download links.
 * Explicitly tracks states: PENDING, SENT, FAILED, EMAIL_NOT_CONFIGURED.
 */

export interface SendConfirmationEmailParams {
  studentEmail: string;
  studentName?: string | null;
  registrationNumber?: string | null;
  formTitle: string;
  academicYear: string;
  branch: string;
  semester: string;
  submittedAt?: string | null;
  downloadUrl: string;
  institutionName?: string | null;
}

export interface EmailDeliveryResult {
  status: 'SENT' | 'FAILED' | 'EMAIL_NOT_CONFIGURED';
  sentAt: string | null;
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY
  );
}

/**
 * Sends a feedback submission confirmation email to the verified student.
 * 
 * Guarantees:
 * - Only sets status 'SENT' and sentAt if the email was genuinely accepted by the email service.
 * - If not configured, returns 'EMAIL_NOT_CONFIGURED' and sentAt = null.
 * - Never leaks other student data, private Google Sheet links, or system secrets.
 */
export async function sendStudentSubmissionConfirmationEmail(
  params: SendConfirmationEmailParams
): Promise<EmailDeliveryResult> {
  const {
    studentEmail,
    studentName,
    registrationNumber,
    formTitle,
    academicYear,
    branch,
    semester,
    submittedAt,
    downloadUrl,
    institutionName,
  } = params;

  if (!studentEmail || !studentEmail.includes('@')) {
    return {
      status: 'FAILED',
      sentAt: null,
      error: 'Invalid student email address',
    };
  }

  // Check if provider is configured
  if (!isEmailConfigured()) {
    console.info(
      `[EmailService] Email provider not configured (SMTP/Resend/SendGrid credentials missing in environment). State: EMAIL_NOT_CONFIGURED for ${studentEmail}`
    );
    return {
      status: 'EMAIL_NOT_CONFIGURED',
      sentAt: null,
      error: 'SMTP/Email service credentials are not configured in server environment',
    };
  }

  const subject = `Feedback Submission Confirmation — ${semester} ${branch}`;
  const formattedTime = submittedAt
    ? new Date(submittedAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

  const textContent = `
Congratulations! 🎉

You have successfully submitted your feedback for:
Form: ${formTitle}
Academic Session: ${academicYear}
Branch: ${branch}
Semester: ${semester}
Student Name: ${studentName || 'Confidential Student'}
Registration Number: ${registrationNumber || 'N/A'}
Submission Timestamp: ${formattedTime}

You can download a secure, official copy of your submitted responses using this private link:
${downloadUrl}

(Note: This link is unique and cryptographically signed for your response record.)

${institutionName || 'Faculty Feedback Management System'}
Academic Feedback Management System
`.trim();

  // If Resend API Key is available, dispatch via Resend HTTPS API
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Feedback System <noreply@feedbacksystem.internal>',
          to: studentEmail,
          subject,
          text: textContent,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[EmailService] Resend API error: ${errorText}`);
        return {
          status: 'FAILED',
          sentAt: null,
          error: `Resend error: ${errorText}`,
        };
      }

      return {
        status: 'SENT',
        sentAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error('[EmailService] Dispatch failed:', err);
      return {
        status: 'FAILED',
        sentAt: null,
        error: err.message || 'Network error dispatching email',
      };
    }
  }

  // Fallback for custom SMTP if nodemailer is available or fallback to EMAIL_NOT_CONFIGURED
  return {
    status: 'EMAIL_NOT_CONFIGURED',
    sentAt: null,
    error: 'Configured email provider driver not loaded',
  };
}
