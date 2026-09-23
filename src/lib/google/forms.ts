import { executeWithCollegeGoogleOAuthRetry } from './auth';
import {
  buildCreateQuestionsBatchUpdateRequest,
  buildMultiFacultyGridBatchUpdateRequest,
  MultiFacultyGridItem,
  RESPONSE_COPY_INSTRUCTION,
  RESPONSE_COPY_SHORT_REMINDER,
  CANONICAL_PUBLIC_PORTAL_URL,
} from './template';

export interface CreateFormResult {
  formId: string;
  responderUri: string;
  editUri: string;
}

/**
 * Creates a Google Form and populates it with either:
 * - Multi-faculty Multiple Choice Grids (SEMESTER_FEEDBACK) if items are provided, or
 * - The standard 8 BCE evaluation questions (FACULTY_FEEDBACK)
 *
 * Authenticates using the institutional Google connection of collegeId.
 */
export async function createGoogleFeedbackForm(params: {
  collegeId: string;
  title: string;
  description: string;
  items?: MultiFacultyGridItem[];
  tenantSlug?: string;
}): Promise<CreateFormResult> {
  return executeWithCollegeGoogleOAuthRetry(params.collegeId, async ({ forms }) => {
    // 1. Create the Form container
    const createRes = await forms.forms.create({
      requestBody: {
        info: {
          title: params.title,
          documentTitle: params.title,
        },
      },
    });

    const formId = createRes.data.formId;
    const responderUri = createRes.data.responderUri;

    if (!formId || !responderUri) {
      throw new Error('Google Forms API did not return valid formId or responderUri');
    }

    // 2. Batch update: Add Form Description, Email Collection Settings, and Template Items
    const questionRequests =
      params.items && params.items.length > 0
        ? buildMultiFacultyGridBatchUpdateRequest(params.items, { tenantSlug: params.tenantSlug })
        : buildCreateQuestionsBatchUpdateRequest(params.tenantSlug);

    const effectiveDescription = params.description?.includes(RESPONSE_COPY_INSTRUCTION)
      ? params.description
      : (params.description ? `${params.description}\n\n${RESPONSE_COPY_INSTRUCTION}` : RESPONSE_COPY_INSTRUCTION);

    const updateInfoRequest = {
      updateFormInfo: {
        info: {
          description: effectiveDescription,
        },
        updateMask: 'description',
      },
    };

    const updateSettingsRequest = {
      updateSettings: {
        settings: {
          emailCollectionType: 'VERIFIED',
        },
        updateMask: 'emailCollectionType',
      },
    };

    await forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          updateInfoRequest,
          updateSettingsRequest,
          ...questionRequests,
        ],
      },
    });

    return {
      formId,
      responderUri,
      editUri: `https://docs.google.com/forms/d/${formId}/edit`,
    };
  });
}

/**
 * Retrieves Google Form details and questions for a specific college
 */
export async function getGoogleForm(formId: string, collegeId: string) {
  return executeWithCollegeGoogleOAuthRetry(collegeId, async ({ forms }) => {
    const res = await forms.forms.get({ formId });
    return res.data;
  });
}

/**
 * Retrieves all submitted responses from Google Forms API for a specific college
 */
export async function getGoogleFormResponses(formId: string, collegeId: string) {
  return executeWithCollegeGoogleOAuthRetry(collegeId, async ({ forms }) => {
    const res = await forms.forms.responses.list({ formId });
    return res.data.responses || [];
  });
}

/**
 * Validates the actual generated Google Forms structure after creation
 */
export async function validateGoogleFormRequiredStructure(formId: string, collegeId: string): Promise<{
  isValid: boolean;
  errors: string[];
  form: any;
}> {
  const form = await getGoogleForm(formId, collegeId);
  const errors: string[] = [];

  const emailCollection = (form.settings as any)?.emailCollectionType;
  if (emailCollection !== 'VERIFIED') {
    errors.push(`Expected emailCollectionType to be VERIFIED, found: ${emailCollection}`);
  }

  const items = form.items || [];
  const studentNameItem = items.find(it => it.title === 'Student Name');
  if (!studentNameItem?.questionItem?.question?.required) {
    errors.push('Student Name question is missing or not marked as required');
  }

  const regNoItem = items.find(it => it.title === 'University Registration Number');
  if (!regNoItem?.questionItem?.question?.required) {
    errors.push('University Registration Number question is missing or not marked as required');
  }

  const generalFeedbackItem = items.find(it => it.title === 'General Feedback');
  if (generalFeedbackItem?.questionItem?.question?.required) {
    errors.push('General Feedback question should be optional but is marked as required');
  }

  // Check single-faculty rating questions
  const singleRatingItems = items.filter(it =>
    it.questionItem?.question?.choiceQuestion && it.title !== 'General Feedback'
  );
  singleRatingItems.forEach(item => {
    if (!item.questionItem?.question?.required) {
      errors.push(`Single rating question "${item.title}" is not required`);
    }
  });

  // Check multi-faculty grids if present
  const gridItems = items.filter(it => Boolean(it.questionGroupItem?.grid));
  gridItems.forEach(gridItem => {
    const questions = gridItem.questionGroupItem?.questions || [];
    if (questions.length !== 8) {
      errors.push(`Grid "${gridItem.title}" has ${questions.length} rows instead of 8`);
    }
    questions.forEach((q, idx) => {
      if (!q.required) {
        errors.push(`Grid "${gridItem.title}" row ${idx + 1} ("${q.rowQuestion?.title}") is not required`);
      }
    });
  });

  // Check response-copy instruction in form description on first page
  const desc = form.info?.description || '';
  if (!desc.includes(RESPONSE_COPY_INSTRUCTION)) {
    errors.push('Form description is missing the required response copy instruction on the first page');
  }

  // Check More Feedback Forms informational item (immediately before submit/footer)
  const moreFormsItem = items.find(it => it.title === 'More Feedback Forms');
  if (!moreFormsItem || !moreFormsItem.textItem) {
    errors.push('More Feedback Forms informational item is missing');
  } else {
    if (!moreFormsItem.description?.includes(RESPONSE_COPY_SHORT_REMINDER)) {
      errors.push('More Feedback Forms item is missing the short response copy reminder');
    }
    if (!moreFormsItem.description?.includes(CANONICAL_PUBLIC_PORTAL_URL)) {
      errors.push('More Feedback Forms item is missing the canonical portal link');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    form,
  };
}
