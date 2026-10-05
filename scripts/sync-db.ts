/**
 * Copy saved runs and Screener snapshots from data/ into Supabase.
 * The repo stays the source of truth; the web app reads Supabase.
 *
 *   npm run sync-db              (every company in data/snapshots)
 *   npm run sync-db -- SKYGOLD   (one company)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 * Runs already in the database are left alone, so edits and tags made in the app survive.
 */
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ResearchNote } from "../src/lib/pipeline/note";
import type { SavedRun } from "../src/lib/pipeline/store";
import type { CompanySnapshot } from "../src/lib/pipeline/types";

config({ path: ".env.local" });

const DATA = join(process.cwd(), "data");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const only = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toUpperCase();
  const symbols = (await readdir(join(DATA, "snapshots")))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((s) => !only || s === only);
  if (!symbols.length) {
    console.error(`✗ No snapshot in data/snapshots${only ? ` for ${only}` : ""}. Run: npm run snapshot -- ${only ?? "<SYMBOL>"}`);
    process.exit(1);
  }

  for (const symbol of symbols) {
    const snapshot = JSON.parse(await readFile(join(DATA, "snapshots", `${symbol}.json`), "utf8")) as CompanySnapshot;
    // Research note (optional): validated before it reaches the app
    let researchNote: ResearchNote | null = null;
    try {
      const raw = JSON.parse(await readFile(join(DATA, "notes", `${symbol}.json`), "utf8"));
      const parsed = ResearchNote.safeParse(raw);
      if (!parsed.success) throw new Error(`${symbol} research note: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      researchNote = parsed.data;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const noteFields = researchNote ? { research_note: researchNote, research_note_at: researchNote.as_of } : {};

    const { data: company, error } = await sb
      .from("companies")
      .upsert(
        {
          symbol,
          name: snapshot.name,
          basis: snapshot.basis,
          screener_url: snapshot.screenerUrl,
          granularity: snapshot.interim.granularity === "half" ? "half" : "quarter",
          snapshot,
          snapshot_fetched_at: snapshot.fetchedAt || new Date().toISOString(),
          ...noteFields,
        },
        { onConflict: "symbol" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`${symbol}: ${error.message}`);

    let files: string[] = [];
    try {
      files = (await readdir(join(DATA, "runs", symbol))).filter((f) => f.endsWith(".json")).sort();
    } catch {
      // snapshot only
    }
    const { data: existing } = await sb.from("analysis_runs").select("concall_year_month").eq("company_id", company.id);
    const have = new Set((existing ?? []).map((r) => r.concall_year_month));
    let added = 0;

    for (const f of files) {
      const run = JSON.parse(await readFile(join(DATA, "runs", symbol, f), "utf8")) as SavedRun;
      if (have.has(run.concall.yearMonth)) continue;
      const { data: row, error: runErr } = await sb
        .from("analysis_runs")
        .insert({
          company_id: company.id,
          concall_year_month: run.concall.yearMonth,
          concall_month: run.concall.month,
          transcript_url: run.docs.transcriptUrl,
          ppt_url: run.docs.pptUrl,
          call_period: run.extraction.call_period,
          call_date: run.extraction.call_date,
          insights: run.extraction.insights,
          model: run.usage.model,
          input_tokens: run.usage.inputTokens,
          output_tokens: run.usage.outputTokens,
          cost_usd: run.usage.costUsd,
          created_by_name: run.createdBy,
          created_at: run.createdAt,
          docs: run.docs,
        })
        .select("id")
        .single();
      if (runErr) throw new Error(`${symbol} ${run.concall.yearMonth}: ${runErr.message}`);
      // One insert keeps the ids in extraction order, which the app relies on
      const { error: gErr } = await sb.from("guidance").insert(
        run.extraction.guidance.map((item, i) => ({
          run_id: row.id,
          company_id: company.id,
          item,
          quote_check: run.quoteChecks[i] ?? "unverifiable",
        })),
      );
      if (gErr) throw new Error(`${symbol} ${run.concall.yearMonth} guidance: ${gErr.message}`);
      added++;
    }
    console.log(`› ${snapshot.name} (${symbol}): snapshot updated${researchNote ? " · research note" : ""} · ${added} new run${added === 1 ? "" : "s"} · ${files.length - added} already there`);
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
