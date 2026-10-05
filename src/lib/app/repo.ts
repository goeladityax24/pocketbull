import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { GuidanceItem, InsightReport } from "../pipeline/guidance";
import type { ResearchNote } from "../pipeline/note";
import type { ExternalSource } from "../pipeline/source";
import type { QuoteCheck } from "../pipeline/documents";
import type { SavedRun } from "../pipeline/store";
import type { Basis, CompanySnapshot } from "../pipeline/types";
import { supabaseConfigured } from "./config";
import { db } from "./supabase/admin";
import type { ManualTag, StoredRun, TagOverride } from "./view";

export interface Company {
  id: string;
  symbol: string;
  name: string;
  basis: Basis;
  screenerUrl: string;
  snapshot: CompanySnapshot;
  snapshotFetchedAt: string | null;
  /** Six-section analyst report, if one has been written */
  researchNote: ResearchNote | null;
}

export interface Note {
  id: string;
  body: string;
  authorName: string;
  guidanceId: string | null;
  createdAt: string;
}

export interface Link {
  id: string;
  url: string;
  title: string | null;
  kind: "report" | "news" | "video" | "conference" | "other";
  addedByName: string;
  createdAt: string;
  /** Conference links: event date, and when a Claude session analysed it */
  eventDate: string | null;
  analysedAt: string | null;
}

export interface CompanyBundle {
  company: Company;
  runs: StoredRun[];
  overrides: TagOverride[];
  /** null when the member may not see notes (Viewers) */
  notes: Note[] | null;
  links: Link[];
}

export interface Settings {
  tolerancePct: number;
}

const DATA = join(process.cwd(), "data");

// ---------------------------------------------------------------------------
// Demo mode: no Supabase keys yet, so read the files in data/ (read-only)

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function fileBundle(symbol: string): Promise<CompanyBundle | null> {
  const snapshot = await readJson<CompanySnapshot>(join(DATA, "snapshots", `${symbol}.json`));
  if (!snapshot) return null;
  let files: string[] = [];
  try {
    files = (await readdir(join(DATA, "runs", symbol))).filter((f) => f.endsWith(".json")).sort();
  } catch {
    // no runs yet
  }
  const saved = await Promise.all(files.map((f) => readJson<SavedRun>(join(DATA, "runs", symbol, f))));
  const researchNote = await readJson<ResearchNote>(join(DATA, "notes", `${symbol}.json`));
  const runs: StoredRun[] = saved
    .filter((r): r is SavedRun => r != null)
    .map((r) => ({
      ...r,
      guidanceIds: r.extraction.guidance.map((_, i) => `${symbol}:${r.concall.yearMonth}:${i}`),
      edited: r.extraction.guidance.map(() => null),
    }));
  return {
    company: {
      id: symbol,
      symbol,
      name: snapshot.name,
      basis: snapshot.basis,
      screenerUrl: snapshot.screenerUrl,
      snapshot,
      snapshotFetchedAt: snapshot.fetchedAt || null,
      researchNote,
    },
    runs,
    overrides: [],
    notes: [],
    links: [],
  };
}

async function fileSymbols(): Promise<string[]> {
  try {
    return (await readdir(join(DATA, "snapshots"))).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Supabase

interface RunRow {
  id: number;
  company_id: number;
  concall_year_month: string;
  concall_month: string;
  transcript_url: string;
  ppt_url: string | null;
  call_period: string | null;
  call_date: string | null;
  insights: InsightReport;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  created_by_name: string | null;
  created_at: string;
  docs: SavedRun["docs"] | null;
  source: ExternalSource | null;
}

interface GuidanceRow {
  id: number;
  run_id: number;
  item: GuidanceItem;
  quote_check: QuoteCheck;
  edited_item: GuidanceItem | null;
}

interface CompanyRow {
  id: number;
  symbol: string;
  name: string;
  basis: Basis;
  screener_url: string;
  snapshot: CompanySnapshot;
  snapshot_fetched_at: string | null;
  research_note: ResearchNote | null;
}

function toCompany(c: CompanyRow): Company {
  return {
    id: String(c.id),
    symbol: c.symbol,
    name: c.name,
    basis: c.basis,
    screenerUrl: c.screener_url,
    snapshot: c.snapshot,
    snapshotFetchedAt: c.snapshot_fetched_at,
    researchNote: c.research_note ?? null,
  };
}

function toRuns(company: CompanyRow, runs: RunRow[], guidance: GuidanceRow[]): StoredRun[] {
  return runs.map((r) => {
    const rows = guidance.filter((g) => g.run_id === r.id).sort((a, b) => a.id - b.id);
    return {
      symbol: company.symbol,
      concall: { month: r.concall_month, yearMonth: r.concall_year_month, transcriptUrl: r.transcript_url, pptUrl: r.ppt_url, recordingUrl: null },
      basis: company.basis,
      createdAt: r.created_at,
      createdBy: r.created_by_name,
      usage: { model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd },
      extraction: { call_period: r.call_period ?? "", call_date: r.call_date, guidance: rows.map((g) => g.item), insights: r.insights },
      quoteChecks: rows.map((g) => g.quote_check),
      docs: r.docs ?? { transcriptUrl: r.transcript_url, pptUrl: r.ppt_url, transcriptPages: 0, transcriptHasText: false },
      source: r.source ?? null,
      guidanceIds: rows.map((g) => String(g.id)),
      edited: rows.map((g) => g.edited_item),
    };
  });
}

async function dbBundles(symbol: string | null, withNotes: boolean): Promise<CompanyBundle[]> {
  const sb = db();
  let cq = sb.from("companies").select("id, symbol, name, basis, screener_url, snapshot, snapshot_fetched_at, research_note").order("name");
  if (symbol) cq = cq.eq("symbol", symbol);
  const { data: companies, error } = await cq;
  if (error) throw new Error(error.message);
  if (!companies?.length) return [];
  const ids = companies.map((c) => c.id);

  const [runs, guidance, overrides, links, notes] = await Promise.all([
    sb.from("analysis_runs").select("*").in("company_id", ids).order("concall_year_month"),
    sb.from("guidance").select("id, run_id, item, quote_check, edited_item, company_id").in("company_id", ids),
    sb
      .from("tag_overrides")
      .select("id, guidance_id, period_label, tag, reason, created_at, reverted_at, changed_by_name, guidance!inner(company_id)")
      .in("guidance.company_id", ids),
    symbol
      ? sb.from("links").select("id, url, title, kind, created_at, company_id, added_by_name, event_date, analysed_at").in("company_id", ids).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    symbol && withNotes
      ? sb.from("notes").select("id, body, author_name, guidance_id, created_at, company_id").in("company_id", ids).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [runs, guidance, overrides, links, notes]) if (r.error) throw new Error(r.error.message);

  const guidanceCompany = new Map((guidance.data ?? []).map((g) => [g.id as number, g.company_id as number]));
  return (companies as CompanyRow[]).map((c) => ({
    company: toCompany(c),
    runs: toRuns(c, ((runs.data ?? []) as RunRow[]).filter((r) => r.company_id === c.id), (guidance.data ?? []) as GuidanceRow[]),
    overrides: (overrides.data ?? [])
      .filter((o) => guidanceCompany.get(o.guidance_id as number) === c.id)
      .map((o) => ({
        id: String(o.id),
        guidanceId: String(o.guidance_id),
        periodLabel: o.period_label as string,
        tag: o.tag as ManualTag,
        reason: o.reason as string,
        changedBy: o.changed_by_name ?? "Someone",
        createdAt: o.created_at as string,
        reverted: o.reverted_at != null,
      })),
    links: (links.data ?? [])
      .filter((l) => l.company_id === c.id)
      .map((l) => ({ id: String(l.id), url: l.url, title: l.title, kind: l.kind, addedByName: l.added_by_name ?? "Someone", createdAt: l.created_at, eventDate: l.event_date ?? null, analysedAt: l.analysed_at ?? null })),
    notes: withNotes
      ? (notes.data ?? [])
          .filter((n) => n.company_id === c.id)
          .map((n) => ({
            id: String(n.id),
            body: n.body,
            authorName: n.author_name ?? "Someone",
            guidanceId: n.guidance_id != null ? String(n.guidance_id) : null,
            createdAt: n.created_at,
          }))
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Public API. Database reads are cached across requests under DATA_TAG; every
// write in src/app/actions.ts expires it, and it refreshes on its own after a
// minute so `npm run sync-db` shows up without a redeploy.

export const DATA_TAG = "pb-data";
const shared = { tags: [DATA_TAG], revalidate: 60 };

const cachedBundles = unstable_cache((symbol: string | null, withNotes: boolean) => dbBundles(symbol, withNotes), ["bundles"], shared);

export const listBundles = cache(async (): Promise<CompanyBundle[]> => {
  if (!supabaseConfigured()) {
    const bundles = await Promise.all((await fileSymbols()).map(fileBundle));
    return bundles.filter((b): b is CompanyBundle => b != null);
  }
  return cachedBundles(null, false);
});

export const getBundle = cache(async (symbol: string, withNotes: boolean): Promise<CompanyBundle | null> => {
  const s = symbol.toUpperCase();
  if (!supabaseConfigured()) return fileBundle(s);
  return (await cachedBundles(s, withNotes))[0] ?? null;
});

const cachedSettings = unstable_cache(
  async (): Promise<Settings> => {
    const { data } = await db().from("settings").select("key, value").eq("key", "met_tolerance_pct").maybeSingle();
    return { tolerancePct: data ? Number(data.value) : 3 };
  },
  ["settings"],
  shared,
);

export const getSettings = cache(async (): Promise<Settings> => {
  if (!supabaseConfigured()) return { tolerancePct: 3 };
  return cachedSettings();
});

export interface AnalysisRequest {
  id: string;
  symbol: string;
  note: string | null;
  requestedBy: string;
  issueNumber: number | null;
  issueUrl: string | null;
  status: "open" | "done" | "closed";
  createdAt: string;
}

export const listRequests = cache(async (status: "open" | "all" = "open"): Promise<AnalysisRequest[]> => {
  if (!supabaseConfigured()) return [];
  return cachedRequests(status);
});

const cachedRequests = unstable_cache(
  async (status: "open" | "all"): Promise<AnalysisRequest[]> => {
    let q = db()
      .from("analysis_requests")
      .select("id, symbol, note, requested_by_name, issue_number, issue_url, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (status === "open") q = q.eq("status", "open");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: String(r.id),
      symbol: r.symbol,
      note: r.note,
      requestedBy: r.requested_by_name,
      issueNumber: r.issue_number,
      issueUrl: r.issue_url,
      status: r.status,
      createdAt: r.created_at,
    }));
  },
  ["requests"],
  shared,
);
