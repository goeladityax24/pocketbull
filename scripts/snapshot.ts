/**
 * Save a company's Screener numbers to data/snapshots/<SYMBOL>.json.
 * The web app scores guidance against this snapshot; `npm run sync-db` copies it to Supabase.
 *
 *   npm run snapshot -- SKYGOLD
 *   npm run snapshot -- SKYGOLD --page tmp/SKYGOLD.html   (a page saved through the browser)
 *   npm run snapshot -- AFCOM --page tmp/AFCOM.html --url https://www.screener.in/company/544224/
 *     (BSE SME companies: Screener knows them by BSE code; --url keeps the "Open on Screener" link working)
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchCompany, normaliseSymbol, parseCompanyPage } from "../src/lib/pipeline/screener";
import type { CompanySnapshot } from "../src/lib/pipeline/types";

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const pageIdx = args.indexOf("--page");
  const page = pageIdx >= 0 ? args[pageIdx + 1] : undefined;
  const urlIdx = args.indexOf("--url");
  const pageUrl = urlIdx >= 0 ? args[urlIdx + 1] : undefined;
  if (!input) {
    console.error("Usage: npm run snapshot -- <SYMBOL> [--page saved-screener-page.html [--url screener-link]]");
    process.exit(1);
  }

  let snapshot: CompanySnapshot;
  if (page) {
    const html = readFileSync(page, "utf8");
    const { symbol } = normaliseSymbol(input);
    const basis = /data-consolidated="true"/.test(html) ? "consolidated" : "standalone";
    const url = pageUrl ?? `https://www.screener.in/company/${symbol}/${basis === "consolidated" ? "consolidated/" : ""}`;
    snapshot = { ...parseCompanyPage(html, symbol, basis, url), peers: [], fetchedAt: new Date().toISOString() };
  } else {
    snapshot = await fetchCompany(input);
  }

  const dir = join(process.cwd(), "data", "snapshots");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${snapshot.symbol}.json`);
  await writeFile(file, JSON.stringify(snapshot, null, 2) + "\n");
  const last = snapshot.interim.periods.at(-1)?.label ?? "none";
  console.log(`› Saved ${snapshot.name} (${snapshot.symbol}) · ${snapshot.basis} · latest results ${last} → ${file}`);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
