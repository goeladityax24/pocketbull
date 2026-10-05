/**
 * Conference / broker-note links the Admin added in the app that haven't been analysed yet.
 *
 *   npm run pending-sources
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("links")
    .select("id, url, title, event_date, added_by_name, created_at, companies(symbol)")
    .eq("kind", "conference")
    .is("analysed_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!data?.length) return console.log("No conference links waiting.");
  for (const l of data) {
    const c = l.companies as unknown as { symbol: string } | null;
    console.log(`${c?.symbol ?? "?"}\t${l.event_date ?? "no date"}\t${l.title ?? ""}\t${l.url}\t(added by ${l.added_by_name ?? "?"})`);
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
