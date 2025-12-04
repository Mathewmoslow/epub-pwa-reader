import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase configuration!");
  console.error("VITE_SUPABASE_URL:", supabaseUrl ? "set" : "MISSING");
  console.error("VITE_SUPABASE_ANON_KEY:", supabaseAnonKey ? "set" : "MISSING");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "epub-reader-auth",
  },
  global: {
    headers: {
      apikey: supabaseAnonKey,
    },
  },
});

supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth state changed:", event);
  if (session) {
    console.log("User:", session.user?.email);
  }
});

export default supabase;
