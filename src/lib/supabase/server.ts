import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch {
    // When called outside a request context (e.g. background job, CLI script), cookies() throws
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://txerarcajxjzxifanzxw.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_BaBiHYfqG1rIf0ns3b-alQ_fqNRPoHe';

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore ? cookieStore.getAll() : [];
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        if (!cookieStore) return;
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignore if called from server component or non-mutable context
        }
      },
    },
  });
}
