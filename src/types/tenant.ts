/**
 * Multi-Tenant College and Tenant Context Types
 */

export interface College {
  id: string;
  name: string;
  code: string;
  slug: string;
  website_url?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  tagline?: string | null;
  affiliated_university?: string | null;
  established_year?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface TenantContext {
  collegeId: string;
  slug: string;
  name: string;
  shortName: string;
  code: string;
  logo: string | null;
  websiteUrl: string | null;
  address?: string | null;
  branding: TenantBranding;
  isActive: boolean;
  college: College;
}

export interface TenantResolverOptions {
  requireActive?: boolean;
}
