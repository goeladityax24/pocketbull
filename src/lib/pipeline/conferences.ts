import { z } from "zod";
import { SourceGrade } from "./source";

/**
 * A conference compendium: one broker PDF with notes on many companies
 * (e.g. Arihant's Bharat Connect post-conference compendium). Stored once in
 * data/conferences/<id>/ and checked for every company we analyse.
 * `npm run conference-notes` searches these and turns a company's pages into a
 * data/sources/<SYMBOL>/<id>.json note for `import-run --source`.
 */
export const Compendium = z.object({
  /** "2026-09-arihant-bharat-connect": also the id of the per-company source notes made from it */
  id: z.string().regex(/^\d{4}-\d{2}-[a-z0-9-]+$/),
  event: z.string(),
  /** Date on the compendium, ISO (event days are often not printed) */
  date: z.string(),
  publisher: z.string(),
  grade: SourceGrade,
  /** Relative to the repo */
  pdf: z.string(),
  /** Extracted text with [[page N]] markers, relative to the repo */
  text: z.string(),
  /** Where the PDF can be opened (GitHub copy); "#page=N" is appended per company */
  url: z.string().url(),
  /** From the compendium's own index; pages are PDF page numbers, inclusive */
  companies: z.array(z.object({ name: z.string(), pages: z.tuple([z.number().int(), z.number().int()]) })),
});
export type Compendium = z.infer<typeof Compendium>;

const STOP = new Set(["ltd", "limited", "the", "india", "co", "company", "and", "of", "pvt", "private", "corporation", "corp"]);

/** "L. T. Elevator Ltd" -> ["lt", "elevator"]; "Shree Refrigerations Limited" -> ["shree", "refrigerations"] */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b([a-z])\.\s*(?=[a-z]\.|[a-z]\b)/g, "$1") // "l. t." -> "lt"
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/** Same company if the shorter name's first two significant words lead the other's */
export function sameCompany(a: string, b: string): boolean {
  const [x, y] = [nameTokens(a), nameTokens(b)].sort((p, q) => p.length - q.length);
  const n = Math.min(2, x.length);
  return n > 0 && x.slice(0, n).every((w, i) => y[i] === w);
}

/** Parse an index of the form "12 HFCL Ltd 182" (serial, name, starting page) into page ranges */
export function parseIndex(pages: string[], lastPage = pages.length): Compendium["companies"] {
  const rows: { name: string; start: number }[] = [];
  for (const p of pages) {
    if (!/index/i.test(p)) continue;
    for (const m of p.matchAll(/^\s*\d+\s+(.+?)\s+(\d+)\s*$/gm)) rows.push({ name: m[1].trim(), start: Number(m[2]) });
  }
  rows.sort((a, b) => a.start - b.start);
  return rows.map((r, i) => ({ name: r.name, pages: [r.start, Math.max(r.start, (rows[i + 1]?.start ?? lastPage + 1) - 1)] }));
}

/** Split "[[page N]]" text into a page-number -> text map */
export function splitPages(text: string): Map<number, string> {
  const parts = text.split(/\[\[page (\d+)\]\]/);
  const out = new Map<number, string>();
  for (let i = 1; i < parts.length; i += 2) out.set(Number(parts[i]), parts[i + 1]);
  return out;
}

export interface CompendiumHit {
  compendium: Compendium;
  /** The company's own section, if it presented */
  section: Compendium["companies"][number] | null;
  /** Other pages that mention the company by name (peers, customers, suppliers) */
  mentions: number[];
}

/** Does this company appear in the compendium, as a presenter or by mention? */
export function findCompany(c: Compendium, text: string, company: { name: string; symbol?: string }): CompendiumHit {
  const section = c.companies.find((x) => sameCompany(x.name, company.name)) ?? null;
  const toks = nameTokens(company.name).slice(0, 2);
  const phrase = new RegExp(`\\b${toks.map((t) => t.replace(/[^a-z0-9]/g, "")).join("[^a-z0-9]{1,3}")}\\b`, "i");
  const mentions: number[] = [];
  for (const [n, t] of splitPages(text)) {
    if (section && n >= section.pages[0] && n <= section.pages[1]) continue;
    if (/index of participating/i.test(t)) continue;
    if (toks.length && phrase.test(t.toLowerCase().replace(/&/g, " and "))) mentions.push(n);
  }
  return { compendium: c, section, mentions };
}
