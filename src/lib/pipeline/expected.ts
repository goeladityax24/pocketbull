import type { GuidanceItem } from "./guidance";
import { round } from "./numbers";
import {
  makePeriod,
  parsePeriodLabel,
  periodsInYear,
  samePeriod,
  samePeriodLastYear,
  type Period,
} from "./periods";
import type { CompanySnapshot, MetricKey, ResultsTable } from "./types";

export type Tag = "met" | "exceeded" | "missed" | "pending" | "expected" | "not_comparable" | "qualitative";

export interface Range {
  low: number;
  high: number;
  unit: "inr_cr" | "pct";
}

export interface Check {
  period: Period;
  /** Screener row the actual comes from */
  row: MetricKey | "pat_margin";
  base: { period: Period; value: number } | null;
  expected: Range | null;
  /** EBITDA or PAT in ₹ Cr implied by a margin guide and a revenue guide, if both exist */
  impliedInr: Range | null;
  actual: number | null;
  tag: Tag;
  gap: string;
  /** Growth % implied by an annual ₹ target, used to set this period's expected value */
  impliedGrowthPct: [number, number] | null;
  /**
   * For an annual ₹ target checked quarter by quarter (or half by half): this
   * period's share of last year, so the target is split by seasonality, not evenly.
   * Expected = target × share, which equals base × (1 + implied growth).
   */
  seasonalShare: { pct: number; year: Period; target: Range } | null;
}

export interface YearToDate {
  periods: string[];
  actual: number;
  base: number;
  growthPct: number;
  status: "ahead" | "on_track" | "behind";
  /** For ₹ targets: share of the annual target already reported, in % */
  shareOfTarget: number | null;
}

export interface GuidanceEvaluation {
  guidance: GuidanceItem;
  target: Period | null;
  checks: Check[];
  ytd: YearToDate | null;
  note: string | null;
}

export interface ScoringOptions {
  /** Relative tolerance for single-number targets, in percent. Default 3. */
  tolerancePct?: number;
  /**
   * Screener rounds small companies to whole crores and margins to whole percents.
   * Actuals within this distance of a range edge count as inside it. Default 0.5.
   */
  roundingSlack?: number;
}

const ROW_FOR: Partial<Record<GuidanceItem["metric"], { growth?: MetricKey; level?: MetricKey | "pat_margin" }>> = {
  revenue: { growth: "sales", level: "sales" },
  ebitda: { growth: "operating_profit", level: "operating_profit" },
  ebitda_margin: { level: "opm_pct" },
  pat: { growth: "net_profit", level: "net_profit" },
  pat_margin: { level: "pat_margin" },
  eps: { growth: "eps", level: "eps" },
};

function valueAt(table: ResultsTable, row: MetricKey | "pat_margin", p: Period): number | null {
  const i = table.periods.findIndex((x) => samePeriod(x, p));
  if (i < 0) return null;
  if (row === "pat_margin") {
    const np = table.rows.net_profit?.[i];
    const s = table.rows.sales?.[i];
    return np != null && s ? (np / s) * 100 : null;
  }
  return table.rows[row]?.[i] ?? null;
}

function tableFor(s: CompanySnapshot, p: Period): ResultsTable {
  return p.kind === "year" ? s.annual : s.interim;
}

export function scoreValue(
  actual: number | null,
  exp: Range,
  opts: ScoringOptions = {},
  hasResults = true,
): { tag: Tag; gap: string } {
  const tol = opts.tolerancePct ?? 3;
  if (actual == null) return { tag: hasResults ? "pending" : "expected", gap: "" };
  // Only whole numbers can be Screener rounding; decimals are taken as exact
  const slack = Number.isInteger(actual) ? (opts.roundingSlack ?? 0.5) : 0;
  const unit = exp.unit === "pct" ? " pts" : " Cr";
  const fmt = (n: number) => (exp.unit === "pct" ? `${round(n, 1)}${unit}` : `₹${round(n, 1)}${unit}`);
  let lo = exp.low;
  let hi = exp.high;
  if (lo === hi) {
    const band = (Math.abs(lo) * tol) / 100;
    lo -= band;
    hi += band;
  }
  if (actual > hi + slack) return { tag: "exceeded", gap: `${fmt(actual - exp.high)} above` };
  if (actual < lo - slack) return { tag: "missed", gap: `${fmt(exp.low - actual)} below` };
  return { tag: "met", gap: actual >= exp.low && actual <= exp.high ? "inside range" : "within tolerance" };
}

interface Growth {
  low: number;
  high: number;
  /** "guided" for a growth %, "implied" when derived from an annual ₹ target */
  source: "guided" | "implied";
}

function growthRange(base: number, g: Growth): Range {
  return { low: base * (1 + g.low / 100), high: base * (1 + g.high / 100), unit: "inr_cr" };
}

/** Which periods a guidance item should be checked against. */
function checkPeriods(target: Period, s: CompanySnapshot): Period[] {
  if (target.kind !== "year") return [target];
  const kind = s.interim.granularity === "half" ? "half" : "quarter";
  return [...periodsInYear(target.fy, kind), target];
}

/** The latest period with reported numbers. */
function lastReported(t: ResultsTable): Period | null {
  for (let i = t.periods.length - 1; i >= 0; i--) {
    if (t.rows.sales?.[i] != null) return t.periods[i];
  }
  return null;
}

/**
 * Growth to apply period by period. A growth guide is used as given; an annual
 * ₹ target ("₹8,100 Cr revenue in FY27") becomes the growth it implies over the
 * previous year, so each quarter still gets an expected number.
 */
function growthFor(g: GuidanceItem, target: Period, s: CompanySnapshot, row: MetricKey | undefined): Growth | null {
  if (g.low == null || !row) return null;
  const high = g.high ?? g.low;
  if (g.kind === "growth_yoy") return { low: g.low, high, source: "guided" };
  if (g.kind === "absolute" && target.kind === "year") {
    const prev = valueAt(s.annual, row, makePeriod("year", target.fy - 1));
    if (!prev) return null;
    return { low: (g.low / prev - 1) * 100, high: (high / prev - 1) * 100, source: "implied" };
  }
  return null;
}

export function evaluateGuidance(
  g: GuidanceItem,
  s: CompanySnapshot,
  all: GuidanceItem[] = [g],
  opts: ScoringOptions = {},
): GuidanceEvaluation {
  const target = g.period ? parsePeriodLabel(g.period) : null;
  const base: GuidanceEvaluation = { guidance: g, target, checks: [], ytd: null, note: null };

  if (g.kind === "qualitative" || g.kind === "date") {
    return { ...base, note: g.kind === "date" ? "Timeline promise: tag by hand when the date passes" : "Qualitative" };
  }
  const map = ROW_FOR[g.metric];
  if (!map || !target || g.low == null) {
    return { ...base, note: !target ? "No clear period" : "Not in reported results; check by hand" };
  }

  const lastInterim = lastReported(s.interim);
  const lastAnnual = lastReported(s.annual);
  const isReported = (p: Period) => {
    const last = p.kind === "year" ? lastAnnual : lastInterim;
    return !!last && p.endDate <= last.endDate;
  };
  // Interim periods up to the next unreported one, then the full year
  const periods: Period[] = [];
  // Targets two or more years out (e.g. FY30) are checked only as a full year
  const farOut = target.kind === "year" && !!lastAnnual && target.fy > lastAnnual.fy + 1;
  for (const p of checkPeriods(target, s)) {
    if (farOut && p.kind !== "year") continue;
    if (p.kind === "year") {
      periods.push(p);
      continue;
    }
    if (p.kind !== s.interim.granularity) continue;
    if (periods.some((x) => x.kind !== "year" && !isReported(x))) continue;
    periods.push(p);
  }

  const growth = growthFor(g, target, s, map.growth);
  // A revenue guide for the same target lets us turn a margin guide into ₹
  const revenueGuide = all.find((x) => x.metric === "revenue" && x.period === g.period && x.low != null);
  const revenueGrowth = revenueGuide ? growthFor(revenueGuide, target, s, "sales") : null;

  for (const p of periods) {
    const table = tableFor(s, p);
    const reported = isReported(p);
    let check: Check;

    if (g.kind === "absolute" && (p.kind === "year" || samePeriod(p, target)) && map.level) {
      // The target period itself (a year, or a quarter given its own ₹ target) is checked exactly
      const expected: Range = { low: g.low, high: g.high ?? g.low, unit: "inr_cr" };
      const actual = valueAt(table, map.level, p);
      const scored = scoreValue(actual, expected, opts, reported);
      check = { period: p, row: map.level, base: null, expected, impliedInr: null, actual, tag: scored.tag, gap: scored.gap, impliedGrowthPct: growth ? [round(growth.low, 1), round(growth.high, 1)] : null, seasonalShare: null };
    } else if (growth && map.growth) {
      const bp = samePeriodLastYear(p);
      const bv = valueAt(table, map.growth, bp);
      const expected = bv != null ? growthRange(bv, growth) : null;
      const actual = valueAt(table, map.growth, p);
      const scored = expected ? scoreValue(actual, expected, opts, reported) : { tag: "not_comparable" as Tag, gap: "No base period" };
      check = { period: p, row: map.growth, base: bv != null ? { period: bp, value: bv } : null, expected, impliedInr: null, actual, tag: scored.tag, gap: scored.gap, impliedGrowthPct: growth.source === "implied" ? [round(growth.low, 1), round(growth.high, 1)] : null, seasonalShare: null };
      if (growth.source === "implied" && p.kind !== "year" && bv != null) {
        const year = makePeriod("year", p.fy - 1);
        const total = valueAt(s.annual, map.growth, year);
        if (total) check.seasonalShare = { pct: (bv / total) * 100, year, target: { low: g.low, high: g.high ?? g.low, unit: "inr_cr" } };
      }
    } else if (g.kind === "margin_pct" && map.level) {
      const expected: Range = { low: g.low, high: g.high ?? g.low, unit: "pct" };
      const actual = valueAt(table, map.level, p);
      let impliedInr: Range | null = null;
      if (revenueGrowth) {
        const bv = valueAt(table, "sales", samePeriodLastYear(p));
        if (bv != null) {
          const rev = growthRange(bv, revenueGrowth);
          impliedInr = { low: (rev.low * expected.low) / 100, high: (rev.high * expected.high) / 100, unit: "inr_cr" };
        }
      }
      const scored = scoreValue(actual, expected, opts, reported);
      check = { period: p, row: map.level, base: null, expected, impliedInr, actual, tag: scored.tag, gap: scored.gap, impliedGrowthPct: null, seasonalShare: null };
    } else {
      continue;
    }
    base.checks.push(check);
  }

  // Year-to-date view for annual growth or ₹ targets
  if (target.kind === "year" && growth && map.growth) {
    const done = base.checks.filter((c) => c.period.kind !== "year" && c.actual != null && c.base);
    if (done.length) {
      const actual = done.reduce((a, c) => a + (c.actual ?? 0), 0);
      const b = done.reduce((a, c) => a + (c.base?.value ?? 0), 0);
      const growthPct = (actual / b - 1) * 100;
      const status = growthPct > growth.high ? "ahead" : growthPct >= growth.low - 0.5 ? "on_track" : "behind";
      base.ytd = {
        periods: done.map((c) => c.period.label),
        actual,
        base: b,
        growthPct: round(growthPct, 1),
        status,
        shareOfTarget: g.kind === "absolute" ? round((actual / g.low) * 100, 1) : null,
      };
    }
  }
  return base;
}

/** Next results to check: the first period after the latest reported one. */
export function nextResultsPeriod(s: CompanySnapshot): Period | null {
  const last = lastReported(s.interim);
  if (!last) return null;
  const kind = last.kind === "half" ? "half" : "quarter";
  const per = kind === "quarter" ? 4 : 2;
  return last.index === per ? makePeriod(kind, last.fy + 1, 1) : makePeriod(kind, last.fy, last.index + 1);
}
