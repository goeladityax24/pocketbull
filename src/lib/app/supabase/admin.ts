import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../config";

/**
 * Supabase with the secret key. Server only: visitors never get a key, and
 * every write checks for the Admin first (see src/lib/app/auth.ts).
 */
export function db() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
