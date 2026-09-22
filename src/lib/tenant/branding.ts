/**
 * Tenant Branding Loader — Server-Only
 * Loads college branding from the `colleges` table using a trusted college_id.
 * Never trust college_id from client input — caller must derive it from DB.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface CollegeBranding {
  name: string;
  code: string;
  slug: string;
  tagline?: string;
  establishedYear?: number;
  affiliatedUniversity?: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  websiteUrl?: string;
}

/**
 * Safe generic fallback — never references any specific institution.
 */
export const DEFAULT_BRANDING: CollegeBranding = {
  name: 'Faculty Feedback Management System',
  code: 'FMS',
  slug: 'institution',
  primaryColor: '#0B192C',
  secondaryColor: '#1E3E62',
  accentColor: '#F6995C',
};

/**
 * Loads college branding from the `colleges` table.
 *
 * SECURITY: This function uses service-role and trusts the provided `collegeId`.
 * The caller MUST derive `collegeId` from an authoritative DB record
 * (e.g., `feedback_forms.college_id`), NEVER from client input.
 *
 * Returns DEFAULT_BRANDING if the college is not found or DB is unavailable.
 */
export async function getCollegeBranding(collegeId: string): Promise<CollegeBranding> {
  if (!collegeId) return DEFAULT_BRANDING;

  try {
    const supabase = createAdminClient();
    if (!supabase) return DEFAULT_BRANDING;

    const { data, error } = await supabase
      .from('colleges')
      .select(
        'name, code, slug, tagline, established_year, affiliated_university, logo_url, primary_color, secondary_color, accent_color, contact_email, contact_phone, address, website_url'
      )
      .eq('id', collegeId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return DEFAULT_BRANDING;

    return {
      name: data.name || DEFAULT_BRANDING.name,
      code: data.code || DEFAULT_BRANDING.code,
      slug: data.slug || DEFAULT_BRANDING.slug,
      tagline: data.tagline || undefined,
      establishedYear: data.established_year || undefined,
      affiliatedUniversity: data.affiliated_university || undefined,
      logoUrl: data.logo_url || undefined,
      primaryColor: data.primary_color || DEFAULT_BRANDING.primaryColor,
      secondaryColor: data.secondary_color || DEFAULT_BRANDING.secondaryColor,
      accentColor: data.accent_color || DEFAULT_BRANDING.accentColor,
      contactEmail: data.contact_email || undefined,
      contactPhone: data.contact_phone || undefined,
      address: data.address || undefined,
      websiteUrl: data.website_url || undefined,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}
