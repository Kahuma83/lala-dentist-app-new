import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.log('MISSING_ENV');
  process.exit(0);
}

const supabase = createClient(url, service || anon, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data, error } = await supabase
  .from('user_accounts')
  .select('id,username,email,role,active,branch_id,auth_user_id')
  .or('username.ilike.rere,email.ilike.rere%');

console.log('ERROR', error ? error.message : 'NONE');
console.log('COUNT', data ? data.length : 0);
console.log(JSON.stringify(data || [], null, 2));
