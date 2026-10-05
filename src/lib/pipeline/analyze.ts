import type Anthropic from "@anthropic-ai/sdk";
import { checkQuote, loadPdf, type PdfDoc, type QuoteCheck } from "./documents";
import { evaluateGuidance, nextResultsPeriod, type GuidanceEvaluation, type ScoringOptions } from "./expected";
import { extractGuidance } from "./extract";
import { ExtractionResult, type GuidanceItem } from "./guidance";
import { fetchCompany } from "./screener";
import type { RunStore, SavedRun } from "./store";
import type { CompanySnapshot, Concall } from "./types";
import type { Period } from "./periods";
import { sourceLabel, type ExternalSource } from "./source";

export interface TrackedGuidance extends GuidanceEvaluation {
  /** Which concall (or conference note) it came from */
  source: { month: string; yearMonth: string; transcriptUrl: string; label: string; external: boolean };
  quoteCheck: QuoteCheck;
  /** Later guidance for the same metric and period replaces this one for future periods */
  superseded: boolean;
}

export interface Tracker {
  snapshot: CompanySnapshot;
  nextPeriod: Period | null;
  items: TrackedGuidance[];
}

/** Latest concall that has a transcript, or the one asked for. */
export function pickConcall(s: CompanySnapshot, yearMonth?: string): Concall | null {
  const withTranscript = s.concalls.filter((c) => c.transcriptUrl);
  if (yearMonth) return withTranscript.find((c) => c.yearMonth === yearMonth) ?? null;
  return withTranscript.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))[0] ?? null;
}

/** Free check (no AI): is there a concall newer than the saved runs? */
export async function checkForNewDocuments(input: string, store: RunStore) {
  const snapshot = await fetchCompany(input);
  const latest = pickConcall(snapshot);
  const runs = await store.listRuns(snapshot.symbol);
  const saved = runs.map((r) => r.concall.yearMonth).sort().at(-1) ?? null;
  return { snapshot, latest, latestSaved: saved, hasNew: !!latest && latest.yearMonth !== saved && (!saved || latest.yearMonth > saved) };
}

/** Combine all saved runs into one tracker, scored against the latest numbers. */
export function buildTracker(snapshot: CompanySnapshot, runs: SavedRun[], opts: ScoringOptions = {}): Tracker {
  const ordered = [...runs].sort((a, b) => a.concall.yearMonth.localeCompare(b.concall.yearMonth));
  const all: { g: GuidanceItem; run: SavedRun; i: number }[] = ordered.flatMap((run) =>
    run.extraction.guidance.map((g, i) => ({ g, run, i })),
  );
  const items: TrackedGuidance[] = all.map(({ g, run, i }) => {
    const sameRun = run.extraction.guidance;
    // A later call's word on the same target replaces this one. For a named metric and
    // period that holds whatever the form ("25% growth" replaces "₹3,250 Cr" for FY27
    // revenue). "other" covers unrelated things (tax rate, segment margin), so those
    // must also carry the same name.
    const later = all.some(
      (x) =>
        x.run.concall.yearMonth > run.concall.yearMonth &&
        x.g.metric === g.metric &&
        (g.metric === "other"
          ? x.g.period === g.period && x.g.metric_label.toLowerCase() === g.metric_label.toLowerCase()
          : g.period != null
            ? x.g.period === g.period
            : x.g.kind === g.kind && x.g.keyword.toLowerCase() === g.keyword.toLowerCase()),
    );
    return {
      ...evaluateGuidance(g, snapshot, sameRun, opts),
      source: {
        month: run.concall.month,
        yearMonth: run.concall.yearMonth,
        transcriptUrl: run.docs.transcriptUrl,
        label: run.source ? sourceLabel(run.source) : `${run.concall.month} call`,
        external: !!run.source,
      },
      quoteCheck: run.quoteChecks[i] ?? "unverifiable",
      superseded: later,
    };
  });
  return { snapshot, nextPeriod: nextResultsPeriod(snapshot), items };
}

export type AnalyzeStatus = "analyzed" | "cached" | "no_transcript";

export async function analyzeCompany(
  input: string,
  opts: {
    store: RunStore;
    /** Run AI again even if this concall was already analysed */
    force?: boolean;
    /** Analyse a specific concall, "YYYY-MM" */
    concall?: string;
    user?: string | null;
    client?: Anthropic;
    model?: string;
    scoring?: ScoringOptions;
    log?: (msg: string) => void;
  },
): Promise<{ status: AnalyzeStatus; run: SavedRun | null; tracker: Tracker }> {
  const log = opts.log ?? (() => {});
  log(`Reading Screener for ${input}…`);
  const snapshot = await fetchCompany(input);
  log(`${snapshot.name} · ${snapshot.basis} · ${snapshot.interim.granularity}ly results · ${snapshot.concalls.length} concalls listed`);

  const concall = pickConcall(snapshot, opts.concall);
  const runs = await opts.store.listRuns(snapshot.symbol);
  if (!concall) {
    log("No concall transcript on Screener. Nothing to analyse.");
    return { status: "no_transcript", run: null, tracker: buildTracker(snapshot, runs, opts.scoring) };
  }

  const existing = runs.find((r) => r.concall.yearMonth === concall.yearMonth);
  if (existing && !opts.force) {
    log(`${concall.month} concall already analysed on ${existing.createdAt.slice(0, 10)}. Using the saved run (no AI cost).`);
    return { status: "cached", run: existing, tracker: buildTracker(snapshot, runs, opts.scoring) };
  }

  log(`Downloading ${concall.month} transcript${concall.pptUrl ? " and presentation" : ""}…`);
  const transcript = await loadPdf(concall.transcriptUrl!);
  let ppt: PdfDoc | null = null;
  if (concall.pptUrl) {
    try {
      ppt = await loadPdf(concall.pptUrl);
      if (ppt.pages.length > 80) ppt = null; // an annual report filed as "PPT"; skip it
    } catch (e) {
      log(`Presentation skipped: ${(e as Error).message}`);
    }
  }
  log(`Transcript: ${transcript.pages.length} pages${transcript.hasText ? "" : " (scanned)"}${ppt ? ` · PPT: ${ppt.pages.length} slides` : ""}`);

  const previous = runs
    .filter((r) => r.concall.yearMonth < concall.yearMonth)
    .flatMap((r) => r.extraction.guidance)
    .filter((g) => g.kind !== "qualitative");

  log("Reading with Claude…");
  const { result, usage } = await extractGuidance({ snapshot, transcript, ppt, previous, client: opts.client, model: opts.model });
  log(`Done: ${result.guidance.length} guidance items · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out tokens${usage.costUsd != null ? ` · ~$${usage.costUsd.toFixed(3)}` : ""}`);

  const run: SavedRun = {
    symbol: snapshot.symbol,
    concall,
    basis: snapshot.basis,
    createdAt: new Date().toISOString(),
    createdBy: opts.user ?? null,
    usage,
    extraction: result,
    quoteChecks: result.guidance.map((g) => checkQuote(g.quote, transcript)),
    docs: {
      transcriptUrl: concall.transcriptUrl!,
      pptUrl: ppt ? concall.pptUrl : null,
      transcriptPages: transcript.pages.length,
      transcriptHasText: transcript.hasText,
    },
  };
  await opts.store.saveRun(run);
  const allRuns = [...runs.filter((r) => r.concall.yearMonth !== concall.yearMonth), run];
  return { status: "analyzed", run, tracker: buildTracker(snapshot, allRuns, opts.scoring) };
}

/**
 * Save an analysis that a Claude session produced on the Admin's own plan
 * (no API call). It goes through the same checks as an API run: schema
 * validation, word-for-word quote check against the transcript, scoring.
 */
export async function importRun(args: {
  snapshot: CompanySnapshot;
  extraction: unknown;
  store: RunStore;
  /** Concall to file it under, "YYYY-MM" (defaults to the latest with a transcript) */
  concall?: string;
  /** The transcript, if already in hand (otherwise it is downloaded) */
  transcript?: PdfDoc | null;
  by?: string | null;
  scoring?: ScoringOptions;
  /** A conference or broker note instead of a Screener concall */
  source?: ExternalSource;
}): Promise<{ run: SavedRun; tracker: Tracker; problems: string[] }> {
  const parsed = ExtractionResult.safeParse(args.extraction);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`The analysis does not match the app's format:\n  ${issues.join("\n  ")}`);
  }
  const s = args.snapshot;
  // Companies without transcripts (some SMEs): an analysis of the investor presentation,
  // with the presentation as the document the quotes are checked against
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fromSource: Concall | null = args.source
    ? {
        month: `${MONTHS[Number(args.source.date.slice(5, 7)) - 1]} ${args.source.date.slice(0, 4)}`,
        yearMonth: args.source.id,
        transcriptUrl: args.source.links[0].url,
        pptUrl: null,
        recordingUrl: null,
      }
    : null;
  const concall =
    fromSource ??
    pickConcall(s, args.concall) ??
    (args.concall && args.transcript ? (s.concalls.find((c) => c.yearMonth === args.concall && c.pptUrl) ?? null) : null);
  if (!concall) throw new Error(`No concall ${args.concall ?? "with a transcript"} on Screener for ${s.symbol}`);
  const sourceUrl = concall.transcriptUrl ?? concall.pptUrl!;

  let transcript = args.transcript ?? null;
  if (transcript === undefined || transcript === null) {
    try {
      transcript = await loadPdf(sourceUrl);
    } catch {
      transcript = null; // quotes will show as unverifiable
    }
  }
  const quoteChecks = parsed.data.guidance.map((g) => checkQuote(g.quote, transcript));
  const problems = parsed.data.guidance
    .map((g, i) => (quoteChecks[i] === "not_found" ? `Quote not found in transcript: “${g.quote.slice(0, 80)}”` : null))
    .filter((x): x is string => x != null);

  const run: SavedRun = {
    symbol: s.symbol,
    concall,
    basis: s.basis,
    createdAt: new Date().toISOString(),
    createdBy: args.by ?? "claude-session",
    usage: { model: "claude-session (Admin's plan)", inputTokens: 0, outputTokens: 0, costUsd: 0 },
    extraction: parsed.data,
    quoteChecks,
    source: args.source ?? null,
    docs: {
      transcriptUrl: sourceUrl,
      pptUrl: concall.pptUrl,
      transcriptPages: transcript?.pages.length ?? 0,
      transcriptHasText: transcript?.hasText ?? false,
    },
  };
  await args.store.saveRun(run);
  const runs = [...(await args.store.listRuns(s.symbol)).filter((r) => r.concall.yearMonth !== concall.yearMonth), run];
  return { run, tracker: buildTracker(s, runs, args.scoring), problems };
}
