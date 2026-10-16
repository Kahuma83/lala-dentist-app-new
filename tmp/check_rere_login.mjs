import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.log('MISSING_ENV');
  process.exit(0);
}

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const candidates = ['laladentist123', '123456', 'rere123', 'RERE123', 'password123'];

for (const pw of candidates) {
  const res = await supabase.auth.signInWithPassword({ email: 'rere@laladentist.com', password: pw });
  console.log('TRY', pw, 'ERROR', res.error ? res.error.message : 'OK');
  if (!res.error) {
    console.log('SESSION_OK', !!res.data?.session);
    break;
  }
}
