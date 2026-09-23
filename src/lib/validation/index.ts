import { z } from 'zod';

/**
 * UUID v4 validator
 */
export const uuidSchema = z.string().uuid({ message: 'Invalid identifier format (must be UUID).' });

export function isValidUUID(val: unknown): val is string {
  return typeof val === 'string' && uuidSchema.safeParse(val).success;
}

/**
 * Admin Access Request Schema
 */
export const requestAccessSchema = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address format').toLowerCase(),
  department: z.string().trim().max(100).optional().nullable(),
  designation: z.string().trim().max(100).optional().nullable(),
  contactNumber: z.string().trim().max(20).optional().nullable(),
  collegeId: z.string().uuid('College ID must be a valid UUID').optional().nullable(),
  collegeSlug: z.string().trim().max(100).optional().nullable(),
});

export const semesterFormItemSchema = z.object({
  facultyId: z.string().uuid('Faculty ID must be a valid UUID'),
  subjectId: z.string().uuid('Subject ID must be a valid UUID'),
  assignmentId: z.string().uuid('Assignment ID must be a valid UUID').optional().nullable(),
});

export type SemesterFormItemInput = z.infer<typeof semesterFormItemSchema>;

/**
 * Form Creation Schema supporting both SEMESTER_FEEDBACK (multi-faculty) and legacy single-faculty forms
 */
export const createFormPayloadSchema = z.object({
  academicYearId: z.string().uuid('Academic Year ID must be a valid UUID'),
  branchId: z.string().uuid('Branch ID must be a valid UUID'),
  semesterId: z.string().uuid('Semester ID must be a valid UUID'),
  formType: z.enum(['SEMESTER_FEEDBACK', 'FACULTY_FEEDBACK', 'FACULTY_SPECIFIC', 'BRANCH_SPECIFIC']),
  facultyId: z.string().uuid('Faculty ID must be a valid UUID').optional().nullable(),
  subjectId: z.string().uuid('Subject ID must be a valid UUID').optional().nullable(),
  items: z.array(semesterFormItemSchema).optional(),
  collegeId: z.string().uuid('College ID must be a valid UUID').optional().nullable(),
}).refine(data => {
  if (data.formType === 'SEMESTER_FEEDBACK') {
    return Array.isArray(data.items) && data.items.length > 0;
  }
  return Boolean(data.facultyId && data.subjectId);
}, {
  message: 'For SEMESTER_FEEDBACK, at least one faculty-subject item is required. For single-faculty forms, facultyId and subjectId are required.',
});

export type CreateFormPayload = z.infer<typeof createFormPayloadSchema>;


/**
 * Feedback Form Lifecycle Status Schema
 */
export const formStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']);

/**
 * Academic Year Creation Schema
 */
export const academicYearSchema = z.object({
  name: z.string().trim().min(4, 'Session name too short (e.g. 2025-2026)').max(20),
  is_active: z.boolean().default(false),
});

/**
 * Faculty Creation Schema
 */
export const facultySchema = z.object({
  name: z.string().trim().min(2, 'Faculty name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address format').toLowerCase().optional().or(z.literal('')),
  department: z.string().trim().min(2, 'Department name required').max(100),
  designation: z.string().trim().min(2, 'Designation required').max(100),
  is_active: z.boolean().default(true),
});

/**
 * Subject Creation Schema
 */
export const subjectSchema = z.object({
  name: z.string().trim().min(2, 'Subject name required').max(150),
  code: z.string().trim().min(2, 'Subject code required').max(30),
  branch_id: z.string().uuid('Branch must be selected').optional().nullable(),
  semester_id: z.string().uuid('Semester must be selected').optional().nullable(),
  is_active: z.boolean().default(true),
});

/**
 * Branch Creation & Update Schema
 */
export const branchSchema = z.object({
  name: z.string().trim().min(2, 'Branch name must be at least 2 characters').max(150),
  code: z
    .string()
    .trim()
    .min(1, 'Branch code must be at least 1 character')
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Branch code can only contain alphanumeric characters, hyphens, or underscores')
    .transform(val => val.toUpperCase()),
  is_active: z.boolean().default(true),
});

export type BranchInput = z.infer<typeof branchSchema>;

// ====================================================================
// BILLING & PAYMENT VALIDATION SCHEMAS
// ====================================================================

export const planTypeSchema = z.enum(['FREE', 'MONTHLY', 'YEARLY']);
export const paidPlanTypeSchema = z.enum(['MONTHLY', 'YEARLY']);
export const paymentMethodSchema = z.enum(['UPI', 'BANK_TRANSFER']);

export const submitPaymentRequestSchema = z.object({
  billingPlanId: z.string().uuid('Billing plan ID must be a valid UUID'),
  paymentMethod: paymentMethodSchema,
  paymentReference: z.string().trim().min(4, 'UTR / transaction reference must be at least 4 characters').max(255),
  paymentProofUrl: z.string().max(1024).optional().nullable(),
});

export type SubmitPaymentRequestInput = z.infer<typeof submitPaymentRequestSchema>;

export const updatePaymentSettingsSchema = z.object({
  upiId: z.string().trim().max(255).default(''),
  accountName: z.string().trim().max(255).default(''),
  bankName: z.string().trim().max(255).default(''),
  accountNumber: z.string().trim().max(50).default(''),
  ifscCode: z.string().trim().max(20).default(''),
  supportPhone: z.string().trim().max(20).default('9470870830'),
  paymentInstructions: z.string().trim().max(2000).default(''),
});

export type UpdatePaymentSettingsInput = z.infer<typeof updatePaymentSettingsSchema>;

export const reviewPaymentSchema = z.object({
  requestId: z.string().uuid('Payment request ID must be a valid UUID'),
  rejectionReason: z.string().trim().max(500).optional(),
});

export type ReviewPaymentInput = z.infer<typeof reviewPaymentSchema>;

// ====================================================================
// BILLING PLAN MANAGEMENT SCHEMAS (Super Admin only)
// ====================================================================

export const billingIntervalSchema = z.string().trim().max(20).transform(v => v.toUpperCase());

export const createBillingPlanSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required').max(100),
  slug: z.string().trim().max(50).optional(),
  description: z.string().trim().max(500).default(''),
  price: z.number().min(0, 'Price must be 0 or more'),
  currency: z.string().trim().max(10).default('INR'),
  billingInterval: billingIntervalSchema,
  durationDays: z.number().int().min(0).nullable().optional(),
  features: z.array(z.string().trim().max(200)).max(20).default([]),
  isActive: z.boolean().default(true),
  isRecommended: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
});

export type CreateBillingPlanInput = z.infer<typeof createBillingPlanSchema>;

export const updateBillingPlanSchema = createBillingPlanSchema.partial().extend({
  id: z.string().uuid('Plan ID must be a valid UUID'),
});

export type UpdateBillingPlanInput = z.infer<typeof updateBillingPlanSchema>;

// ====================================================================
// TRIAL MANAGEMENT SCHEMAS (Super Admin only)
// ====================================================================

export const grantTrialSchema = z.object({
  collegeId: z.string().uuid('College ID must be a valid UUID').optional(),
  adminId: z.string().uuid('Admin ID must be a valid UUID').optional(),
  durationDays: z.number().int().min(1, 'Duration must be at least 1 day').max(365, 'Duration cannot exceed 365 days'),
  startsAt: z.string().datetime({ offset: true }).optional().or(z.string().datetime().optional()),
  features: z.array(z.string().trim().min(1)).min(1, 'At least one feature must be selected'),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable(),
}).refine(data => data.collegeId !== undefined || data.adminId !== undefined, {
  message: 'College ID is required',
});

export type GrantTrialInput = z.infer<typeof grantTrialSchema>;

export const extendTrialSchema = z.object({
  trialId: z.string().uuid('Trial ID must be a valid UUID'),
  additionalDays: z.number().int().min(1, 'Additional days must be at least 1').max(365, 'Cannot extend beyond 365 days').optional(),
  newExpiresAt: z.string().datetime({ offset: true }).optional().or(z.string().datetime().optional()),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable(),
}).refine(data => data.additionalDays !== undefined || data.newExpiresAt !== undefined, {
  message: 'Either additional days or a new expiry date must be provided',
});

export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

export const revokeTrialSchema = z.object({
  trialId: z.string().uuid('Trial ID must be a valid UUID'),
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional().nullable(),
});

export type RevokeTrialInput = z.infer<typeof revokeTrialSchema>;

export const replaceTrialSchema = grantTrialSchema;
export type ReplaceTrialInput = GrantTrialInput;

// ====================================================================
// INSTITUTION / COLLEGE MANAGEMENT SCHEMAS (Super Admin only)
// ====================================================================

export const createCollegeSchema = z.object({
  name: z.string().trim().min(2, 'College name must be at least 2 characters').max(255, 'College name cannot exceed 255 characters'),
  code: z.string().trim().min(2, 'College code must be at least 2 characters').max(50, 'College code cannot exceed 50 characters').regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  slug: z.string().trim().min(2, 'Slug must be at least 2 characters').max(100, 'Slug cannot exceed 100 characters').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must consist of lowercase alphanumeric characters and hyphens (e.g. bce-bgp)'),
  logoUrl: z.string().trim().url('Invalid URL format for logo').optional().or(z.literal('')).nullable(),
  address: z.string().trim().max(500, 'Address cannot exceed 500 characters').optional().or(z.literal('')).nullable(),
  contactEmail: z.string().trim().email('Invalid email address format').optional().or(z.literal('')).nullable(),
  contactPhone: z.string().trim().max(50, 'Phone cannot exceed 50 characters').optional().or(z.literal('')).nullable(),
  websiteUrl: z.string().trim().url('Invalid URL format for website').optional().or(z.literal('')).nullable(),
  tagline: z.string().trim().max(255, 'Tagline cannot exceed 255 characters').optional().or(z.literal('')).nullable(),
  affiliatedUniversity: z.string().trim().max(255, 'Affiliated university cannot exceed 255 characters').optional().or(z.literal('')).nullable(),
  establishedYear: z.number().int().min(1800, 'Established year must be 1800 or later').max(2100, 'Established year is too far in future').optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateCollegeInput = z.infer<typeof createCollegeSchema>;

export const updateCollegeSchema = z.object({
  id: z.string().uuid('College ID must be a valid UUID'),
  name: z.string().trim().min(2, 'College name must be at least 2 characters').max(255, 'College name cannot exceed 255 characters'),
  code: z.string().trim().min(2, 'College code must be at least 2 characters').max(50, 'College code cannot exceed 50 characters').regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  slug: z.string().trim().min(2, 'Slug must be at least 2 characters').max(100, 'Slug cannot exceed 100 characters').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must consist of lowercase alphanumeric characters and hyphens (e.g. bce-bgp)'),
  logoUrl: z.string().trim().url('Invalid URL format for logo').optional().or(z.literal('')).nullable(),
  address: z.string().trim().max(500, 'Address cannot exceed 500 characters').optional().or(z.literal('')).nullable(),
  contactEmail: z.string().trim().email('Invalid email address format').optional().or(z.literal('')).nullable(),
  contactPhone: z.string().trim().max(50, 'Phone cannot exceed 50 characters').optional().or(z.literal('')).nullable(),
  websiteUrl: z.string().trim().url('Invalid URL format for website').optional().or(z.literal('')).nullable(),
  tagline: z.string().trim().max(255, 'Tagline cannot exceed 255 characters').optional().or(z.literal('')).nullable(),
  affiliatedUniversity: z.string().trim().max(255, 'Affiliated university cannot exceed 255 characters').optional().or(z.literal('')).nullable(),
  establishedYear: z.number().int().min(1800, 'Established year must be 1800 or later').max(2100, 'Established year is too far in future').optional().nullable(),
  isActive: z.boolean(),
});

export type UpdateCollegeInput = z.infer<typeof updateCollegeSchema>;

