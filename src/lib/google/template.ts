/**
 * Standard BCE 8-Parameter Faculty Feedback Evaluation Template
 * Bhagalpur College of Engineering (Govt. of Bihar)
 */

export interface FeedbackParameter {
  id: number;
  title: string;
  description?: string;
  options: string[];
}

export const BCE_RATING_OPTIONS = [
  'Excellent',
  'Very Good',
  'Good',
  'Satisfactory',
  'Unsatisfactory',
] as const;

export const BCE_FEEDBACK_PARAMETERS: FeedbackParameter[] = [
  {
    id: 1,
    title: 'Syllabus covered by teacher as per curriculum',
    description: 'Coverage of prescribed course syllabus within the semester',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 2,
    title: 'Communication skills',
    description: 'Clarity of speech, presentation, and language articulation',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 3,
    title: 'Effectiveness of Teaching/Learning in terms of: Interactive classroom/Laboratory sessions',
    description: 'Pacing of lectures, conceptual depth, and student engagement',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 4,
    title: 'Accessibility of the teacher in and out of the class',
    description: 'Availability outside scheduled classroom hours for guidance',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 5,
    title: 'Willingness to offer help and advice to students beyond the classroom and multidisciplinary areas',
    description: 'Proactiveness in resolving student doubts and offering academic assistance',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 6,
    title: 'Ability of teacher to teach/explain confidently and answer queries in the class',
    description: 'Use of relevant examples, illustrations, and problem-solving techniques',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 7,
    title: 'Teacher shown fairness in the evaluation',
    description: 'Impartiality and transparency in assessments, assignments, and grading',
    options: [...BCE_RATING_OPTIONS],
  },
  {
    id: 8,
    title: 'Overall Rating',
    description: 'Comprehensive overall performance rating for this faculty member',
    options: [...BCE_RATING_OPTIONS],
  },
];

export interface FormFieldDefinition {
  id: string;
  title: string;
  description?: string;
  type: 'TEXT' | 'PARAGRAPH' | 'RADIO';
  required: boolean;
  options?: string[];
}

export const CANONICAL_PUBLIC_PORTAL_URL = 'https://feedback-management-system-kappa.vercel.app';

export const PUBLIC_FEEDBACK_PORTAL_URL =
  process.env.NEXT_PUBLIC_APP_URL || CANONICAL_PUBLIC_PORTAL_URL;

export const ADITYA_PORTFOLIO_URL = 'https://portfolio-two-ashen-zseywond41.vercel.app/';

/**
 * Returns dynamic tenant-aware portal link (e.g. https://.../bce-bgp or https://.../gec-gaya)
 */
export function getTenantPortalUrl(tenantSlug?: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || CANONICAL_PUBLIC_PORTAL_URL).replace(/\/$/, '');
  return tenantSlug ? `${base}/${tenantSlug}` : base;
}

/**
 * Standard confirmation message configured via Apps Script.
 * Plain-text URLs ensure reliable rendering in native Google Forms confirmation screen.
 */
export function getFormConfirmationMessage(tenantSlug?: string): string {
  const portalUrl = getTenantPortalUrl(tenantSlug);
  return `Your response has been recorded.

More Feedback Forms

Need to access more academic feedback forms?

Visit:
${portalUrl}

Developer: Aditya Kumar Sah

Portfolio:
${ADITYA_PORTFOLIO_URL}`;
}

export const FORM_CONFIRMATION_MESSAGE = getFormConfirmationMessage();

export const STUDENT_IDENTIFIER_FIELDS = [
  {
    id: 'student_name',
    title: 'Student Name',
    description: 'Enter your full name as per college records.',
    required: true,
  },
  {
    id: 'reg_no',
    title: 'University Registration Number',
    description: 'Enter your university registration number.',
    required: true,
  },
] as const;

export const GENERAL_FEEDBACK_FIELD = {
  id: 'general_feedback',
  title: 'General Feedback',
  description: 'Share any additional comments, suggestions, or feedback regarding the faculty or subject.',
  required: false,
  paragraph: true,
} as const;

// Backward-compatibility alias
export const ADDITIONAL_FEEDBACK_FIELDS = [
  {
    id: 'comments',
    title: 'General Feedback',
    description: 'Share any additional comments, suggestions, or feedback regarding the faculty or subject.',
    required: false,
    paragraph: true,
  },
] as const;

export const RESPONSE_COPY_INSTRUCTION =
  'IMPORTANT: Please check your email after submitting this feedback form and keep the response copy safely. The first page of your response is important for your End Semester (End Sem) examination form filling.';

export const RESPONSE_COPY_SHORT_REMINDER =
  'IMPORTANT: Check your email after submission and keep your response copy. The first page is important for End Sem examination form filling.';

export function getMoreFeedbackInfoItem(tenantSlug?: string) {
  const portalUrl = getTenantPortalUrl(tenantSlug);
  return {
    title: 'More Feedback Forms',
    description: `${RESPONSE_COPY_SHORT_REMINDER}\n\nNeed to access more academic feedback forms?\nVisit:\n${portalUrl}`,
  };
}

export const MORE_FEEDBACK_INFO_ITEM = getMoreFeedbackInfoItem();

export interface FormMetadataInputs {
  facultyName: string;
  subjectName: string;
  semesterName: string;
  academicYearName: string;
  branchName: string;
}

export interface MultiFacultyGridItem {
  facultyId?: string;
  subjectId?: string;
  assignmentId?: string | null;
  subjectName: string;
  facultyName: string;
  subjectCode?: string;
  gridTitle?: string;
}

export function generateFeedbackFormTitle(meta: FormMetadataInputs): string {
  return `Faculty Feedback — ${meta.facultyName} — ${meta.subjectName} — ${meta.semesterName} — ${meta.academicYearName}`;
}

export function generateFeedbackFormDescription(meta: FormMetadataInputs & { institutionName?: string }): string {
  const institution = meta.institutionName || 'Faculty Feedback Management System';
  return `Official Student Feedback Form for ${meta.facultyName} teaching ${meta.subjectName} (${meta.semesterName}, ${meta.branchName}, Session ${meta.academicYearName}).\n\n${institution}.\n\n${RESPONSE_COPY_INSTRUCTION}\n\nNOTE: Please provide your student details accurately. This feedback is collected to improve instructional delivery, lab engagement, and course learning outcomes.\n\nPlease rate objectively on all 8 parameters. Honest feedback is appreciated.`;
}

export function generateSemesterFormTitle(meta: {
  semesterName: string;
  branchName: string;
  academicYearName?: string;
}): string {
  return `Feedback Form — ${meta.semesterName} Students — ${meta.branchName}${meta.academicYearName ? ` — ${meta.academicYearName}` : ''}`;
}

export function generateSemesterFormDescription(meta: {
  semesterName: string;
  branchName: string;
  academicYearName?: string;
  facultyCount?: number;
  institutionName?: string;
}): string {
  const institution = meta.institutionName || 'Faculty Feedback Management System';
  return `Official Student Feedback Form for ${meta.semesterName} (${meta.branchName}${meta.academicYearName ? `, ${meta.academicYearName}` : ''}).\n\n${institution}.\n\n${RESPONSE_COPY_INSTRUCTION}\n\nNOTE: Please provide your student details accurately. This feedback form contains evaluations for all subjects and faculty members teaching this semester.\n\nPlease rate each teacher across all 8 parameters objectively. Constructive comments and suggestions are welcome.`;
}

/**
 * Builds the Google Forms API batchUpdate request body:
 * 1. Student Name (Short answer, required)
 * 2. University Registration Number (Short answer, required)
 * 3. 8 Standard BCE Rating Parameters (Radio 1-5, required)
 * 4. General Feedback (Paragraph text, optional)
 * 5. More Feedback Forms (Text item with public portal link)
 */
export function buildCreateQuestionsBatchUpdateRequest(tenantSlug?: string) {
  const requests: any[] = [];
  let currentIndex = 0;

  // 1. Student Name
  requests.push({
    createItem: {
      item: {
        title: 'Student Name',
        description: 'Enter your full name as per college records.',
        questionItem: {
          question: {
            required: true,
            textQuestion: {
              paragraph: false,
            },
          },
        },
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  // 2. University Registration Number
  requests.push({
    createItem: {
      item: {
        title: 'University Registration Number',
        description: 'Enter your university registration number.',
        questionItem: {
          question: {
            required: true,
            textQuestion: {
              paragraph: false,
            },
          },
        },
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  // 3. 8 Standard BCE Rating Parameters
  BCE_FEEDBACK_PARAMETERS.forEach(param => {
    requests.push({
      createItem: {
        item: {
          title: `${param.id}. ${param.title}`,
          description: param.description,
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO' as const,
                options: param.options.map(opt => ({ value: opt })),
                shuffle: false,
              },
            },
          },
        },
        location: {
          index: currentIndex++,
        },
      },
    });
  });

  // 9. General Feedback (Optional)
  requests.push({
    createItem: {
      item: {
        title: 'General Feedback',
        description: 'Share any additional comments, suggestions, or feedback regarding the faculty or subject.',
        questionItem: {
          question: {
            required: false,
            textQuestion: {
              paragraph: true,
            },
          },
        },
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  // 10. More Feedback Forms (Informational Text Item)
  const moreInfo = getMoreFeedbackInfoItem(tenantSlug);
  requests.push({
    createItem: {
      item: {
        title: moreInfo.title,
        description: moreInfo.description,
        textItem: {},
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  return requests;
}

/**
 * Builds the Google Forms API batchUpdate request body for Multi-Faculty SEMESTER_FEEDBACK forms:
 * 1. Student Name (Short answer, required)
 * 2. University Registration Number (Short answer, required)
 * 3. Multiple Choice Grid (questionGroupItem) for EACH selected faculty/subject
 * 4. General Feedback (Paragraph text, optional)
 * 5. More Feedback Forms (Text item with public portal link)
 */
export function buildMultiFacultyGridBatchUpdateRequest(
  items: MultiFacultyGridItem[],
  options?: { isElective?: boolean; tenantSlug?: string }
) {
  const requests: any[] = [];
  let currentIndex = 0;

  // 1. Student Name
  requests.push({
    createItem: {
      item: {
        title: 'Student Name',
        description: 'Enter your full name as per college records.',
        questionItem: {
          question: {
            required: true,
            textQuestion: {
              paragraph: false,
            },
          },
        },
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  // 2. University Registration Number
  requests.push({
    createItem: {
      item: {
        title: 'University Registration Number',
        description: 'Enter your university registration number.',
        questionItem: {
          question: {
            required: true,
            textQuestion: {
              paragraph: false,
            },
          },
        },
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  // 3. One Multiple Choice Grid (questionGroupItem) per Faculty-Subject
  items.forEach(item => {
    const gridTitle =
      item.gridTitle ||
      `${item.subjectName}${item.subjectCode ? ` (${item.subjectCode})` : ''} — ${item.facultyName}`;

    requests.push({
      createItem: {
        item: {
          title: gridTitle,
          description: `Teacher: ${item.facultyName} | Subject: ${item.subjectName}${item.subjectCode ? ` (${item.subjectCode})` : ''}`,
          questionGroupItem: {
            grid: {
              columns: {
                type: 'RADIO' as const,
                options: BCE_RATING_OPTIONS.map(opt => ({ value: opt })),
              },
              shuffleQuestions: false,
            },
            questions: BCE_FEEDBACK_PARAMETERS.map(param => ({
              rowQuestion: {
                title: param.title,
              },
              required: true,
            })),
          },
        },
        location: {
          index: currentIndex++,
        },
      },
    });
  });

  // 4. General Feedback (Optional)
  requests.push({
    createItem: {
      item: {
        title: 'General Feedback',
        description: 'Share any additional comments, suggestions, or overall feedback regarding this semester.',
        questionItem: {
          question: {
            required: false,
            textQuestion: {
              paragraph: true,
            },
          },
        },
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  // 5. More Feedback Forms (Informational Text Item)
  const moreInfo = getMoreFeedbackInfoItem(options?.tenantSlug);
  requests.push({
    createItem: {
      item: {
        title: moreInfo.title,
        description: moreInfo.description,
        textItem: {},
      },
      location: {
        index: currentIndex++,
      },
    },
  });

  return requests;
}

