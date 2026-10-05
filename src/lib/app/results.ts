import { scoreValue, type Range, type ScoringOptions, type Tag } from "../pipeline/expected";
import type { GuidanceItem } from "../pipeline/guidance";
import { parsePeriodLabel, samePeriod, samePeriodLastYear, type Period } from "../pipeline/periods";
import type { CompanySnapshot, MetricKey } from "../pipeline/types";
import { said, seasonalText } from "./format";
import type { ItemView, TrackerView } from "./view";

export type ResultMetric = "revenue" | "ebitda" | "pat";

export interface ResultCell {
  period: Period;
  actual: number | null;
  yoyPct: number | null;
  /** EBITDA or PAT as % of revenue */
  marginPct: number | null;
  expected: Range | null;
  /** How the expected number was set, e.g. "₹8,100 Cr for FY27 · Aug 2026 call" */
  basis: string | null;
  tag: Tag | null;
  /**
   * Not guided, next results only: expected revenue × the margin of the last
   * 4 reported periods. A rough guide, never scored.
   */
  estimate: { range: Range; marginPct: number; basis: string } | null;
}

export interface ResultsGrid {
  periods: Period[];
  rows: { metric: ResultMetric; label: string; cells: ResultCell[] }[];
}

const ROW: Record<ResultMetric, MetricKey> = { revenue: "sales", ebitda: "operating_profit", pat: "net_profit" };
const MARGIN: Partial<Record<ResultMetric, GuidanceItem["metric"]>> = { ebitda: "ebitda_margin", pat: "pat_margin" };
const LABEL: Record<ResultMetric, string> = { revenue: "Revenue", ebitda: "EBITDA", pat: "PAT" };

function value(s: CompanySnapshot, row: MetricKey, p: Period): number | null {
  const i = s.interim.periods.findIndex((x) => samePeriod(x, p));
  return i < 0 ? null : (s.interim.rows[row]?.[i] ?? null);
}

/** Does guidance for `label` (FY27, Q2 FY27, H1 FY27) cover period p? */
function covers(label: string | null, p: Period): boolean {
  const t = label ? parsePeriodLabel(label) : null;
  if (!t) return false;
  return t.kind === "year" ? t.fy === p.fy : samePeriod(t, p);
}

/** The company's own word first, then conference notes; newest first within each */
const newestFirst = (a: ItemView, b: ItemView) =>
  Number(a.tracked.source.external) - Number(b.tracked.source.external) || b.tracked.source.yearMonth.localeCompare(a.tracked.source.yearMonth);

/** A ₹ expectation for this metric and period straight from the tracker (growth or ₹ target). */
function direct(view: TrackerView, metric: ResultMetric, p: Period) {
  for (const item of [...view.numeric].sort(newestFirst)) {
    if (item.tracked.guidance.metric !== metric) continue;
    const cell = item.cells.find((c) => c.check.period.label === p.label && c.check.expected?.unit === "inr_cr");
    if (cell?.check.expected) {
      const g = item.tracked.guidance;
      const split = seasonalText(cell.check);
      return { expected: cell.check.expected, basis: `${split ?? `${said(g)}${g.period ? ` for ${g.period}` : ""}`} · ${item.tracked.source.label}` };
    }
  }
  return null;
}

/** EBITDA or PAT from a guided margin × revenue (actual revenue once reported, else expected revenue). */
function fromMargin(view: TrackerView, metric: ResultMetric, p: Period, revenue: Range | null) {
  const kind = MARGIN[metric];
  if (!kind || !revenue) return null;
  const item = [...view.live]
    .sort(newestFirst)
    .find((i) => i.tracked.guidance.metric === kind && i.tracked.guidance.low != null && covers(i.tracked.guidance.period, p));
  if (!item) return null;
  const g = item.tracked.guidance;
  const lo = g.low!;
  const hi = g.high ?? lo;
  return {
    expected: { low: (revenue.low * lo) / 100, high: (revenue.high * hi) / 100, unit: "inr_cr" as const },
    basis: `${said(g)} margin${g.period ? ` for ${g.period}` : ""} · ${item.tracked.source.label}`,
  };
}

/**
 * Revenue, EBITDA and PAT for the last reported periods and the next one:
 * actuals from Screener, and the expected number wherever guidance gives one.
 */
export function buildResultsGrid(s: CompanySnapshot, view: TrackerView, opts: ScoringOptions = {}, count = 4): ResultsGrid {
  const reported = s.interim.periods.filter((p) => value(s, "sales", p) != null).slice(-count);
  const next = view.tracker.nextPeriod;
  const periods = next && !reported.some((p) => samePeriod(p, next)) ? [...reported, next] : reported;

  const revenueRange = (p: Period): Range | null => {
    const actual = value(s, "sales", p);
    if (actual != null) return { low: actual, high: actual, unit: "inr_cr" };
    return direct(view, "revenue", p)?.expected ?? null;
  };

  // Margin over the last 4 reported periods, for estimates when nothing is guided
  const trailingMargin = (row: MetricKey): number | null => {
    const sum = (k: MetricKey) => reported.reduce((a, p) => a + (value(s, k, p) ?? NaN), 0);
    const m = (sum(row) / sum("sales")) * 100;
    return reported.length && Number.isFinite(m) ? m : null;
  };

  const rows = (["revenue", "ebitda", "pat"] as ResultMetric[]).map((metric) => ({
    metric,
    label: LABEL[metric],
    cells: periods.map((p): ResultCell => {
      const actual = value(s, ROW[metric], p);
      const prev = value(s, ROW[metric], samePeriodLastYear(p));
      const sales = value(s, "sales", p);
      const exp = direct(view, metric, p) ?? fromMargin(view, metric, p, revenueRange(p));
      const isNext = !!next && samePeriod(p, next);
      const rev = isNext && !exp && metric !== "revenue" ? direct(view, "revenue", p)?.expected : null;
      const margin = rev ? trailingMargin(ROW[metric]) : null;
      return {
        period: p,
        actual,
        yoyPct: actual != null && prev ? ((actual / prev) - 1) * 100 : null,
        marginPct: metric !== "revenue" && actual != null && sales ? (actual / sales) * 100 : null,
        expected: exp?.expected ?? null,
        basis: exp?.basis ?? null,
        tag: exp ? scoreValue(actual, exp.expected, opts, actual != null).tag : null,
        estimate:
          rev && margin != null
            ? {
                range: { low: (rev.low * margin) / 100, high: (rev.high * margin) / 100, unit: "inr_cr" },
                marginPct: margin,
                basis: `Not guided. Estimate: expected revenue at the last ${reported.length} ${reported[0]?.kind === "half" ? "halves'" : "quarters'"} margin`,
              }
            : null,
      };
    }),
  }));
  return { periods, rows };
}

export interface YearTargetRow {
  metric: ResultMetric;
  label: string;
  expected: Range | null;
  /** How it was set: guided figure, margin on revenue, or an estimate */
  basis: string | null;
  /** Not guided: expected revenue × last year's margin, never scored */
  estimate: boolean;
  lastYear: { period: Period; value: number } | null;
  /** Change of the expected range against last year, in % */
  changePct: [number, number] | null;
  /** Targets more than a year out: the yearly growth this needs (CAGR), in % */
  cagrPct: [number, number] | null;
}

function annualValue(s: CompanySnapshot, row: MetricKey, p: Period): number | null {
  const i = s.annual.periods.findIndex((x) => samePeriod(x, p));
  return i < 0 ? null : (s.annual.rows[row]?.[i] ?? null);
}

/**
 * Revenue, EBITDA and PAT for each full year with an open target, each against
 * last year's reported number. EBITDA or PAT with no guidance get an estimate at
 * last year's margin when revenue is guided.
 */
export function buildYearTargets(s: CompanySnapshot, view: TrackerView): { period: Period; rows: YearTargetRow[] }[] {
  const years = [...new Map(view.fullYear.map(({ cell }) => [cell.check.period.label, cell.check.period])).values()].sort((a, b) => a.fy - b.fy);
  return years.map((p) => {
    // Last year, or for a target years out (FY30) the latest year reported
    const reportedYears = s.annual.periods.filter((x) => x.fy < p.fy && annualValue(s, "sales", x) != null);
    const prev = reportedYears.at(-1) ?? samePeriodLastYear(p);
    const years = p.fy - prev.fy;
    const revenue = direct(view, "revenue", p)?.expected ?? null;
    const rows = (["revenue", "ebitda", "pat"] as ResultMetric[]).map((metric): YearTargetRow => {
      const last = annualValue(s, ROW[metric], prev);
      const guided = direct(view, metric, p) ?? fromMargin(view, metric, p, revenue);
      let expected = guided?.expected ?? null;
      let basis = guided?.basis ?? null;
      const lastSales = annualValue(s, "sales", prev);
      const estimate = !guided && metric !== "revenue" && !!revenue && last != null && !!lastSales;
      if (estimate) {
        const m = last! / lastSales!;
        expected = { low: revenue!.low * m, high: revenue!.high * m, unit: "inr_cr" };
        basis = `Not guided. Estimate: expected revenue at ${prev.label}'s ${Math.round(m * 1000) / 10}% margin`;
      }
      const pct = (v: number) => Math.round(((v / last!) - 1) * 1000) / 10;
      const cagr = (v: number) => Math.round((Math.pow(v / last!, 1 / years) - 1) * 1000) / 10;
      return {
        metric,
        label: LABEL[metric],
        expected,
        basis,
        estimate,
        lastYear: last != null ? { period: prev, value: last } : null,
        changePct: expected && last != null && last > 0 ? [pct(expected.low), pct(expected.high)] : null,
        cagrPct: expected && last != null && last > 0 && years > 1 ? [cagr(expected.low), cagr(expected.high)] : null,
      };
    });
    return { period: p, rows };
  });
}
