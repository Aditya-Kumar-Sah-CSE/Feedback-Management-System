/**
 * Multi-Tenant Authentication & Authorization Types
 */

export type PlatformRole = 'PLATFORM_SUPER_ADMIN';
export type CollegeRole = 'COLLEGE_ADMIN';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED';
export type CollegeAdminRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminCollegeMembership {
  collegeId: string;
  slug: string;
  name: string;
  code: string;
  logoUrl: string | null;
  role: CollegeRole;
  status: MembershipStatus;
}

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  isPlatformSuperAdmin: boolean;
  colleges: AdminCollegeMembership[];
  activeCollegeId: string | null;
  activeCollege: AdminCollegeMembership | null;
  isAuthenticated: boolean;
  isActive: boolean;
  isPending: boolean;
  isRejected: boolean;
  /** Compatibility alias for isPlatformSuperAdmin */
  isSuperAdmin: boolean;
  /** Compatibility alias for isActive */
  isApproved: boolean;
  /** Compatibility object for legacy single-tenant admin references */
  admin: {
    id: string;
    user_id: string;
    email: string;
    name: string;
    role: string;
    status: string;
  } | null;
  /** Compatibility object for legacy user reference */
  user?: {
    id: string;
    email: string;
    user_metadata?: Record<string, any>;
  } | null;
}

export interface CollegeAdminRequest {
  id: string;
  userId: string | null;
  collegeId: string;
  email: string;
  name: string;
  designation?: string | null;
  department?: string | null;
  contactNumber?: string | null;
  status: CollegeAdminRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}
