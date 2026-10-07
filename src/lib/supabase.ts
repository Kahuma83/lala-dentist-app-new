import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
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
