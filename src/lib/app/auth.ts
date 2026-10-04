import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { ADMIN_NAME, supabaseConfigured } from "./config";

/**
 * No sign-in for now: everyone with the link can view. One Admin can change
 * things, after entering ADMIN_KEY once on /admin (kept in an httpOnly cookie).
 * Running locally without ADMIN_KEY set, you are the Admin.
 */
export interface Me {
  isAdmin: boolean;
  name: string;
  /** No Supabase keys: read-only demo on data/ files */
  demo: boolean;
  /** Admin is unlocked by a key (false locally when no key is set) */
  keyed: boolean;
}

export const ADMIN_COOKIE = "pb_admin";

/** What the cookie holds: a hash of the key, never the key itself */
export function adminToken(key: string) {
  return createHash("sha256").update(`pocketbull:${key}`).digest("hex");
}

export function keyMatches(given: string): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const a = Buffer.from(adminToken(given));
  const b = Buffer.from(adminToken(key));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const getMe = cache(async (): Promise<Me> => {
  const demo = !supabaseConfigured();
  const token = (await cookies()).get(ADMIN_COOKIE)?.value; // also keeps pages per-request
  const key = process.env.ADMIN_KEY;
  if (!key) {
    // Only on your own machine: a deployed site without a key is view-only
    const local = process.env.NODE_ENV !== "production";
    return { isAdmin: local, name: ADMIN_NAME, demo, keyed: false };
  }
  return { isAdmin: token === adminToken(key), name: ADMIN_NAME, demo, keyed: true };
});
