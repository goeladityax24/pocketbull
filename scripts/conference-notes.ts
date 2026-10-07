/**
 * Conference compendia: broker PDFs with notes on many companies, stored in data/conferences/<id>/.
 * Check every company we analyse against them (docs/ANALYSIS_PLAYBOOK.md, section 8).
 *
 *   npm run conference-notes                      (every saved company)
 *   npm run conference-notes -- HFCL "Sky Gold"   (symbols from data/snapshots, or names)
 *   npm run conference-notes -- HFCL --save       (write data/sources/HFCL/<id>.json + .txt for import-run --source)
 *   npm run conference-notes -- --add notes.pdf --id 2026-09-arihant-bharat-connect \
 *     --event "Arihant Bharat Connect Rising Stars, Sep 2026" --date 2026-10-05 --publisher "Arihant Capital"
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Compendium, findCompany, parseIndex, splitPages } from "../src/lib/pipeline/conferences";
import { loadPdf, withPageMarkers } from "../src/lib/pipeline/documents";
import { ExternalSource } from "../src/lib/pipeline/source";

const DIR = join(process.cwd(), "data", "conferences");
const args = process.argv.slice(2);
const flag = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

function repoUrl(path: string): string {
  const origin = execSync("git remote get-url origin").toString().trim();
  const slug = origin.replace(/^git@github\.com:|^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return `https://github.com/${slug}/blob/main/${path}`;
}

async function add() {
  const pdf = flag("--add")!;
  const id = flag("--id"), event = flag("--event"), date = flag("--date"), publisher = flag("--publisher");
  if (!id || !event || !date || !publisher) throw new Error("--add needs --id, --event, --date and --publisher");
  const dir = join(DIR, id);
  mkdirSync(dir, { recursive: true });
  copyFileSync(pdf, join(dir, "compendium.pdf"));
  const doc = await loadPdf(pdf, new Uint8Array(readFileSync(pdf)));
  if (!doc.hasText) throw new Error("PDF has no text layer; transcribe it as in section 7 instead");
  writeFileSync(join(dir, "compendium.txt"), withPageMarkers(doc.pages));
  const rel = `data/conferences/${id}/compendium.pdf`;
  const meta = Compendium.parse({
    id, event, date, publisher,
    grade: flag("--grade") ?? "broker_note",
    pdf: rel,
    text: `data/conferences/${id}/compendium.txt`,
    url: repoUrl(rel),
    companies: parseIndex(doc.pages),
  });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 1) + "\n");
  console.log(`› ${event}: ${doc.pages.length} pages, ${meta.companies.length} companies in the index → ${dir}`);
}

function compendia(): { meta: Compendium; text: string }[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((d) => existsSync(join(DIR, d, "meta.json")))
    .map((d) => {
      const meta = Compendium.parse(JSON.parse(readFileSync(join(DIR, d, "meta.json"), "utf8")));
      return { meta, text: readFileSync(meta.text, "utf8") };
    });
}

function companies(): { symbol: string; name: string }[] {
  const snaps = readdirSync("data/snapshots").map((f) => JSON.parse(readFileSync(`data/snapshots/${f}`, "utf8")));
  const wanted = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  if (!wanted.length) return snaps.map((s) => ({ symbol: s.symbol, name: s.name }));
  return wanted.map((w) => {
    const s = snaps.find((x) => x.symbol === w.toUpperCase());
    return s ? { symbol: s.symbol, name: s.name } : { symbol: w.toUpperCase().replace(/[^A-Z0-9]/g, ""), name: w };
  });
}

function save(symbol: string, meta: Compendium, text: string, pages: [number, number]) {
  const file = `data/sources/${symbol}/${meta.id}.json`;
  if (existsSync(file)) return console.log(`    ${file} already exists`);
  mkdirSync(`data/sources/${symbol}`, { recursive: true });
  const byPage = splitPages(text);
  const nums = Array.from({ length: pages[1] - pages[0] + 1 }, (_, i) => pages[0] + i);
  // Keep the compendium's own page numbers, so "p.182" points into the PDF
  writeFileSync(`data/sources/${symbol}/${meta.id}.txt`, nums.map((n) => `[[page ${n}]]\n${byPage.get(n) ?? ""}`).join("\n"));
  const source = ExternalSource.parse({
    id: meta.id,
    kind: "conference",
    event: meta.event,
    date: meta.date,
    links: [{ url: `${meta.url}#page=${pages[0]}`, author: meta.publisher, grade: meta.grade, images: [meta.pdf], pages: nums }],
    text_file: `data/sources/${symbol}/${meta.id}.txt`,
  });
  writeFileSync(file, JSON.stringify(source, null, 2) + "\n");
  console.log(`    saved ${file} (pages ${pages[0]}-${pages[1]}); now write the analysis and run import-run --source ${file}`);
}

async function main() {
  if (args.includes("--add")) return add();
  const all = compendia();
  if (!all.length) return console.log("No compendia in data/conferences yet.");
  for (const co of companies()) {
    const hits = all.map(({ meta, text }) => ({ ...findCompany(meta, text, co), text }));
    const found = hits.filter((h) => h.section || h.mentions.length);
    if (!found.length) {
      console.log(`${co.symbol}\t${co.name}\tnot in any compendium`);
      continue;
    }
    for (const h of found) {
      const sec = h.section ? `presented, pages ${h.section.pages[0]}-${h.section.pages[1]}` : "did not present";
      const men = h.mentions.length ? `; mentioned on pages ${h.mentions.join(", ")}` : "";
      console.log(`${co.symbol}\t${co.name}\t${h.compendium.event}: ${sec}${men}`);
      if (h.section && args.includes("--save")) save(co.symbol, h.compendium, h.text, h.section.pages);
    }
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
