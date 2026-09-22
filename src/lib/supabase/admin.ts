import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * Loads service role key from environment or local .env.local if running in development/scripts
 */
function loadServiceKeyIfNeeded(): string | undefined {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
          let val = trimmed.slice('SUPABASE_SERVICE_ROLE_KEY='.length).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) {
            process.env.SUPABASE_SERVICE_ROLE_KEY = val;
            return val;
          }
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return undefined;
}

/**
 * Creates an admin client with service_role privileges if SUPABASE_SERVICE_ROLE_KEY is set.
 * Returns null if the service role key is not configured, allowing safe fallback to the user session client.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://txerarcajxjzxifanzxw.supabase.co';
  const serviceKey = loadServiceKeyIfNeeded();

  if (!serviceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
