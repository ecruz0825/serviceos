import { createClient } from "@supabase/supabase-js";

// Use ONLY these env vars for the web app
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Runtime guard with clear error message
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabaseClient] Missing required environment variables:', {
    hasUrl: !!supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
    urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING',
  });
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Please set these in your .env.local file.");
}

// Log the URL (but not the key) for debugging
console.log('[supabaseClient] Initialized with URL:', supabaseUrl);

// Create a single shared Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // <-- important in SPA
    storage: window.localStorage
  },
});