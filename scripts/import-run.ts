/**
 * Save an analysis written by a Claude session on the Admin's own plan (no API key).
 * See docs/ANALYSIS_PLAYBOOK.md for the full routine.
 *
 *   npm run import-run -- SKYGOLD --file analysis.json --month 2026-08
 *
 * Options
 *   --file <json>        the analysis (ExtractionResult format; see src/lib/pipeline/guidance.ts)
 *   --month <YYYY-MM>    concall to file it under (default: latest with a transcript)
 *   --page <html>        a saved Screener page, if Screener can't be reached from here
 *   --transcript <file>  the transcript as .pdf, or .txt with [[page N]] markers, for the quote check
 *   --by <name>          who ran it (default: claude-session)
 *   --json               print JSON instead of the text report
 */
import { readFileSync } from "node:fs";
import { importRun } from "../src/lib/pipeline/analyze";
import { loadPdf, type PdfDoc } from "../src/lib/pipeline/documents";
import { formatTracker } from "../src/lib/pipeline/format";
import { fetchCompany, normaliseSymbol, parseCompanyPage } from "../src/lib/pipeline/screener";
import { FileRunStore } from "../src/lib/pipeline/store";
import type { CompanySnapshot } from "../src/lib/pipeline/types";

async function main() {
  const args = process.argv.slice(2);
  const value = (f: string) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const input = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const file = value("--file");
  if (!input || !file) {
    console.error("Usage: npm run import-run -- <SYMBOL> --file analysis.json [--month YYYY-MM] [--page page.html] [--transcript t.pdf|t.txt] [--by name]");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(file, "utf8"));
  const extraction = raw.extraction ?? raw; // accept a bare analysis or a saved run

  let snapshot: CompanySnapshot;
  const page = value("--page");
  if (page) {
    const html = readFileSync(page, "utf8");
    const { symbol } = normaliseSymbol(input);
    const basis = /data-consolidated="true"/.test(html) ? "consolidated" : "standalone";
    snapshot = { ...parseCompanyPage(html, symbol, basis, `https://www.screener.in/company/${symbol}/`), peers: [], fetchedAt: new Date().toISOString() };
  } else {
    snapshot = await fetchCompany(input);
  }

  let transcript: PdfDoc | null | undefined;
  const t = value("--transcript");
  if (t?.endsWith(".pdf")) {
    transcript = await loadPdf(t, new Uint8Array(readFileSync(t)));
  } else if (t) {
    const pages = readFileSync(t, "utf8").split(/\[\[page \d+\]\]/).slice(1);
    transcript = { url: t, bytes: new Uint8Array(), pages, hasText: pages.join("").length > 200 };
  }

  const { run, tracker, problems } = await importRun({
    snapshot,
    extraction,
    store: new FileRunStore(),
    concall: value("--month"),
    transcript,
    by: value("--by"),
  });

  if (args.includes("--json")) {
    console.log(JSON.stringify({ run, tracker, problems }, null, 2));
  } else {
    console.log(formatTracker(tracker, run));
    const counts = run.quoteChecks.reduce<Record<string, number>>((a, q) => ({ ...a, [q]: (a[q] ?? 0) + 1 }), {});
    console.error(`\n› Saved ${run.symbol} ${run.concall.month}: ${run.extraction.guidance.length} guidance items · quotes ${JSON.stringify(counts)}`);
  }
  if (problems.length) {
    console.error(`\n✗ ${problems.length} quote(s) not found in the transcript. Fix them and import again:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
