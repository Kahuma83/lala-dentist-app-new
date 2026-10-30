import { createClient } from "@supabase/supabase-js";
import { isLocalPatientDemoEnabled } from "../utils/localPatientDemo";

const supabaseUrl = isLocalPatientDemoEnabled ? undefined : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = isLocalPatientDemoEnabled ? undefined : import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
export { isLocalPatientDemoEnabled } from "../utils/localPatientDemo";
export const hasSupabaseServiceRoleKey = false;

if (!isSupabaseConfigured && !isLocalPatientDemoEnabled) {
  console.warn(
    "⚠️ Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment/secrets. Auth will run in simulated fallback mode."
  );
}

// Instantiate client safely with placeholder values if credentials are not provided
export const supabase = createClient(
  supabaseUrl || "https://placeholder-project-id.supabase.co",
  supabaseAnonKey || "placeholder-anon-key-string",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Browser writes always use the public client so Supabase RLS remains enforced.
// Keep privileged service-role operations on the server only.
export const supabaseWriteClient = supabase;
