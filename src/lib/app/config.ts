/** Environment for the web app. Without Supabase keys the app runs in demo mode on data/ files. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function supabaseConfigured(): boolean {
  return SUPABASE_URL !== "" && !!process.env.SUPABASE_SECRET_KEY;
}

/** Shown on notes, tags and links the Admin writes */
export const ADMIN_NAME = process.env.ADMIN_NAME ?? "Admin";

/** "owner/repo" for analysis-request issues */
export const GITHUB_REPO = process.env.GITHUB_REPO ?? "goeladityax24/pocketbull";
