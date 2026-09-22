import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('List users error:', error);
    return;
  }
  console.log('=== AUTH USERS ===');
  for (const u of users.users) {
    console.log({
      id: u.id,
      email: u.email,
      confirmed_at: u.email_confirmed_at,
      created_at: u.created_at,
    });
  }

  const { data: colleges } = await supabase.from('colleges').select('id, name, code, slug, is_active');
  console.log('\n=== COLLEGES ===', colleges);

  const { data: platformAdmins } = await supabase.from('platform_admins').select('*');
  console.log('\n=== PLATFORM ADMINS ===', platformAdmins);

  const { data: memberships } = await supabase.from('college_memberships').select('*');
  console.log('\n=== COLLEGE MEMBERSHIPS ===', memberships);

  const { data: requests } = await supabase.from('college_admin_requests').select('*');
  console.log('\n=== ADMIN REQUESTS ===', requests);
}

run();
