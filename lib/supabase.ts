import { createClient } from "@supabase/supabase-js";

// Service-role client — server-only. Never expose this key to the browser.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
