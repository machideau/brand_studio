import { createClient } from "@supabase/supabase-js";
import env from "@/lib/config/env";

/**
 * Server-side only Supabase client using the service role key.
 * This client bypasses Row Level Security — never expose it to the browser.
 */
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
