/**
 * PocketBull pipeline CLI.
 *
 *   npm run analyze -- PARTH                 # analyse latest concall (once), print tracker
 *   npm run analyze -- PARTH --check         # free: is there a new concall on Screener?
 *   npm run analyze -- PARTH --month 2025-11 # analyse a specific concall
 *   npm run analyze -- PARTH --force         # re-run AI even if saved
 *   npm run analyze -- PARTH --json          # print JSON instead of text
 */
import { config } from "dotenv";
import { analyzeCompany, checkForNewDocuments } from "../src/lib/pipeline/analyze";
import { formatTracker } from "../src/lib/pipeline/format";
import { FileRunStore } from "../src/lib/pipeline/store";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  const flag = (f: string) => args.includes(f);
  const value = (f: string) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (!input) {
    console.error("Usage: npm run analyze -- <SYMBOL or Screener link> [--check] [--month YYYY-MM] [--force] [--json]");
    process.exit(1);
  }
  const store = new FileRunStore();
  const log = (m: string) => console.error(`› ${m}`);

  if (flag("--check")) {
    const r = await checkForNewDocuments(input, store);
    console.log(
      r.hasNew
        ? `New concall available: ${r.latest!.month}. Last saved: ${r.latestSaved ?? "none"}.`
        : `Up to date. Latest concall ${r.latest?.month ?? "none"} is already saved.`,
    );
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY in .env.local or .env first (see .env.example).");
    process.exit(1);
  }
  const { status, run, tracker } = await analyzeCompany(input, {
    store,
    force: flag("--force"),
    concall: value("--month"),
    log,
  });
  if (flag("--json")) {
    console.log(JSON.stringify({ status, run, tracker }, null, 2));
  } else {
    console.log(formatTracker(tracker, run));
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
