import * as cheerio from "cheerio";
import { parseNumber } from "./numbers";
import { periodFromEndDate, type Period } from "./periods";
import type { Basis, CompanySnapshot, Concall, MetricKey, Peer, ResultsTable } from "./types";

const BASE = "https://www.screener.in";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const ROW_KEYS: Record<string, MetricKey> = {
  sales: "sales",
  revenue: "sales",
  expenses: "expenses",
  "operating profit": "operating_profit",
  "financing profit": "operating_profit",
  "opm %": "opm_pct",
  "financing margin %": "opm_pct",
  "other income": "other_income",
  interest: "interest",
  depreciation: "depreciation",
  "profit before tax": "pbt",
  "tax %": "tax_pct",
  "net profit": "net_profit",
  "eps in rs": "eps",
};

/** Accepts "PARTH", "NSE:PARTH", or a full Screener URL. */
export function normaliseSymbol(input: string): { symbol: string; basis: Basis | null } {
  const s = input.trim();
  const url = s.match(/screener\.in\/company\/([^/?#]+)\/?(consolidated)?/i);
  if (url) return { symbol: url[1].toUpperCase(), basis: url[2] ? "consolidated" : "standalone" };
  return { symbol: s.replace(/^(NSE|BSE):/i, "").toUpperCase(), basis: null };
}

export function companyUrl(symbol: string, basis: Basis): string {
  return `${BASE}/company/${encodeURIComponent(symbol)}/${basis === "consolidated" ? "consolidated/" : ""}`;
}

function cellText($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]): string {
  return $(el).text().replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function rowKey(label: string): MetricKey | null {
  const clean = label.replace(/\+$/, "").trim().toLowerCase();
  return ROW_KEYS[clean] ?? null;
}

/** Parse a Screener results <section> (#quarters or #profit-loss). */
export function parseResultsSection(
  $: cheerio.CheerioAPI,
  sectionId: "quarters" | "profit-loss",
): ResultsTable {
  const section = $(`section#${sectionId}`);
  const heading = cellText($, section.find("h2").first());
  const granularity: ResultsTable["granularity"] =
    sectionId === "profit-loss" ? "year" : /half/i.test(heading) ? "half" : "quarter";

  const table = section.find("table.data-table").first();
  const headers = table.find("thead th").toArray().slice(1);
  // Keep only dated columns (drops "TTM")
  const cols: { idx: number; period: Period }[] = [];
  headers.forEach((th, i) => {
    const key = $(th).attr("data-date-key");
    // Skip "TTM" and any other non-date column
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) cols.push({ idx: i, period: periodFromEndDate(key, granularity) });
  });

  const rows: ResultsTable["rows"] = {};
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).children("td").toArray();
    if (!cells.length) return;
    const key = rowKey(cellText($, cells[0]));
    if (!key || rows[key]) return;
    const values = cells.slice(1).map((c) => parseNumber(cellText($, c)));
    rows[key] = cols.map((c) => values[c.idx] ?? null);
  });

  return { granularity, periods: cols.map((c) => c.period), rows };
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function parseConcalls($: cheerio.CheerioAPI): Concall[] {
  const out: Concall[] = [];
  const seen = new Map<string, number>();
  $(".documents.concalls li").each((_, li) => {
    const month = cellText($, $(li).children("div").first());
    const [mon, year] = month.split(" ");
    const mm = MONTHS[mon?.slice(0, 3).toLowerCase() ?? ""];
    if (!mm || !year) return;
    const link = (label: string) => {
      const a = $(li)
        .find("a.button-chip")
        .filter((_, el) => cellText($, el).toLowerCase() === label)
        .first();
      return a.attr("href") ?? null;
    };
    // Two calls in one month (Skygold, Nov 2024) get "2024-11" and "2024-11-b"
    const ym = `${year}-${mm}`;
    const n = seen.get(ym) ?? 0;
    seen.set(ym, n + 1);
    out.push({
      month,
      yearMonth: n ? `${ym}-${String.fromCharCode(97 + n)}` : ym,
      transcriptUrl: link("transcript"),
      pptUrl: link("ppt"),
      recordingUrl: link("rec"),
    });
  });
  return out;
}

export function parseRatios($: cheerio.CheerioAPI): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  $("#top-ratios li").each((_, li) => {
    const name = cellText($, $(li).find(".name")).toLowerCase();
    const nums = $(li).find(".number").toArray().map((n) => parseNumber(cellText($, n)));
    if (name === "high / low") {
      out["high"] = nums[0] ?? null;
      out["low"] = nums[1] ?? null;
    } else if (name) {
      out[name] = nums[0] ?? null;
    }
  });
  return out;
}

export function parsePeers(html: string): Peer[] {
  const $ = cheerio.load(html);
  const header = $("table.data-table tr").first().find("th").toArray().map((th) => cellText($, th).toLowerCase());
  const col = (prefix: string) => header.findIndex((h) => h.startsWith(prefix));
  const iMcap = col("mar cap"), iPe = col("p/e"), iSales = col("sales qtr"), iVar = col("qtr sales var"), iRoce = col("roce");
  const peers: Peer[] = [];
  $("table.data-table tbody tr[data-row-company-id]").each((_, tr) => {
    const tds = $(tr).children("td").toArray();
    const a = $(tds[1]).find("a");
    const num = (i: number) => (i >= 0 ? parseNumber(cellText($, tds[i])) : null);
    peers.push({
      name: cellText($, a),
      screenerPath: a.attr("href") ?? "",
      marketCapCr: num(iMcap),
      pe: num(iPe),
      salesQtrCr: num(iSales),
      salesGrowthQtrPct: num(iVar),
      roce: num(iRoce),
    });
  });
  return peers;
}

function hasNumbers(t: ResultsTable): boolean {
  return (t.rows.sales ?? []).some((v) => v != null);
}

/** Parse a full company page (pure; no network). */
export function parseCompanyPage(html: string, symbol: string, basis: Basis, url: string) {
  const $ = cheerio.load(html);
  const info = $("#company-info");
  const name =
    cellText($, $("h1 span.min-width-0").first()) || cellText($, $("h1").first()) || symbol;
  return {
    symbol,
    name,
    screenerUrl: url,
    basis,
    companyId: info.attr("data-company-id") ?? null,
    warehouseId: info.attr("data-warehouse-id") ?? null,
    ratios: parseRatios($),
    interim: parseResultsSection($, "quarters"),
    annual: parseResultsSection($, "profit-loss"),
    concalls: parseConcalls($),
  };
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  if (!res.ok) throw new Error(`Screener returned ${res.status} for ${url}`);
  return res.text();
}

/**
 * Fetch a company from Screener. Uses consolidated numbers by default and
 * falls back to standalone when the company has no consolidated results.
 */
export async function fetchCompany(input: string, prefer?: Basis): Promise<CompanySnapshot> {
  const { symbol, basis: fromUrl } = normaliseSymbol(input);
  const order: Basis[] =
    (prefer ?? fromUrl) === "standalone" ? ["standalone", "consolidated"] : ["consolidated", "standalone"];

  let page: ReturnType<typeof parseCompanyPage> | null = null;
  for (const basis of order) {
    const url = companyUrl(symbol, basis);
    const parsed = parseCompanyPage(await get(url), symbol, basis, url);
    if (hasNumbers(parsed.interim) || hasNumbers(parsed.annual)) {
      page = parsed;
      break;
    }
    page ??= parsed;
  }
  if (!page) throw new Error(`No data for ${symbol}`);

  let peers: Peer[] = [];
  if (page.warehouseId) {
    try {
      peers = parsePeers(await get(`${BASE}/api/company/${page.warehouseId}/peers/`));
    } catch {
      peers = []; // peers are nice-to-have
    }
  }
  return { ...page, peers, fetchedAt: new Date().toISOString() };
}
