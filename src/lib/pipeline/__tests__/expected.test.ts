import { describe, expect, it } from "vitest";
import { evaluateGuidance, nextResultsPeriod, scoreValue } from "../expected";
import type { GuidanceItem } from "../guidance";
import { makePeriod } from "../periods";
import type { CompanySnapshot } from "../types";

// Fictional "Acme Forgings" numbers used in the mocks (₹ Cr, consolidated)
const q = (fy: number, i: number) => makePeriod("quarter", fy, i);
const acme: CompanySnapshot = {
  symbol: "ACME",
  name: "Acme Forgings",
  screenerUrl: "",
  basis: "consolidated",
  companyId: null,
  warehouseId: null,
  ratios: {},
  interim: {
    granularity: "quarter",
    periods: [q(2026, 1), q(2026, 2), q(2026, 3), q(2026, 4), q(2027, 1)],
    rows: {
      sales: [200, 212, 220, 236, 238],
      opm_pct: [16, 16.2, 15.1, 16.8, 18.2],
    },
  },
  annual: {
    granularity: "year",
    periods: [makePeriod("year", 2025), makePeriod("year", 2026)],
    rows: { sales: [754, 868], opm_pct: [15.4, 16.1] },
  },
  concalls: [],
  peers: [],
  fetchedAt: "",
};
// Same-quarter-last-year bases for FY26 quarters
acme.interim.periods.unshift(q(2025, 1), q(2025, 2), q(2025, 3), q(2025, 4));
acme.interim.rows.sales!.unshift(175, 184, 190, 205);
acme.interim.rows.opm_pct!.unshift(15, 15, 15.5, 16);

const guide = (over: Partial<GuidanceItem>): GuidanceItem => ({
  metric: "revenue",
  metric_label: "revenue growth",
  kind: "growth_yoy",
  low: 18,
  high: 20,
  unit: "pct",
  approx: false,
  period: "FY27",
  horizon_text: null,
  basis: "consolidated",
  segment: null,
  condition: null,
  quote: "",
  page: null,
  speaker: null,
  confidence: "high",
  keyword: "revenue growth",
  revises: null,
  ...over,
});

describe("scoreValue", () => {
  it("tags ranges with rounding slack", () => {
    const r = { low: 229.4, high: 235.6, unit: "inr_cr" as const };
    expect(scoreValue(238, r).tag).toBe("exceeded");
    expect(scoreValue(236, r).tag).toBe("met"); // whole crores: rounding slack applies
    expect(scoreValue(229, r).tag).toBe("met");
    expect(scoreValue(228, r).tag).toBe("missed");
    expect(scoreValue(236.2, r).tag).toBe("exceeded"); // decimals are exact
    expect(scoreValue(null, r).tag).toBe("pending");
    expect(scoreValue(null, r, {}, false).tag).toBe("expected");
  });

  it("applies ±3% to single-number targets", () => {
    const r = { low: 17, high: 17, unit: "pct" as const };
    expect(scoreValue(17.4, r, { roundingSlack: 0 }).tag).toBe("met");
    expect(scoreValue(18.2, r, { roundingSlack: 0 }).tag).toBe("exceeded");
  });
});

describe("evaluateGuidance", () => {
  it("turns FY27 growth guidance into the next quarter's expected revenue", () => {
    const ev = evaluateGuidance(guide({}), acme);
    const q1 = ev.checks.find((c) => c.period.label === "Q1 FY27")!;
    expect(q1.base?.value).toBe(200);
    expect(q1.tag).toBe("met"); // 238 vs 236-240
    const q2 = ev.checks.find((c) => c.period.label === "Q2 FY27")!;
    expect(q2.tag).toBe("expected");
    expect(q2.base?.value).toBe(212);
    expect(q2.expected!.low).toBeCloseTo(250.16, 2);
    expect(q2.expected!.high).toBeCloseTo(254.4, 2);
    // stops at the next unreported quarter, then the full year
    expect(ev.checks.map((c) => c.period.label)).toEqual(["Q1 FY27", "Q2 FY27", "FY27"]);
    const fy = ev.checks.at(-1)!;
    expect(fy.expected!.low).toBeCloseTo(1024.24, 2);
    expect(ev.ytd).toMatchObject({ periods: ["Q1 FY27"], growthPct: 19, status: "on_track" });
  });

  it("scores past quarters against the guidance in force", () => {
    const ev = evaluateGuidance(guide({ low: 15, high: 18, period: "FY26" }), acme);
    expect(ev.checks.map((c) => `${c.period.label}:${c.tag}`)).toEqual([
      "Q1 FY26:missed",
      "Q2 FY26:met",
      "Q3 FY26:met",
      "Q4 FY26:met",
      "FY26:met",
    ]);
  });

  it("derives ₹ EBITDA from a margin guide plus a revenue guide", () => {
    const margin = guide({ metric: "ebitda_margin", kind: "margin_pct", low: 17, high: 18 });
    const ev = evaluateGuidance(margin, acme, [guide({}), margin]);
    const q2 = ev.checks.find((c) => c.period.label === "Q2 FY27")!;
    expect(q2.impliedInr!.low).toBeCloseTo(42.53, 1);
    expect(q2.impliedInr!.high).toBeCloseTo(45.79, 1);
    expect(ev.checks.find((c) => c.period.label === "Q1 FY27")!.tag).toBe("exceeded");
  });

  it("leaves qualitative and unmapped guidance for people", () => {
    expect(evaluateGuidance(guide({ kind: "qualitative", low: null }), acme).note).toBe("Qualitative");
    expect(evaluateGuidance(guide({ metric: "capex", kind: "absolute", low: 350 }), acme).note).toMatch(/by hand/);
  });

  it("finds the next results period", () => {
    expect(nextResultsPeriod(acme)?.label).toBe("Q2 FY27");
  });
});
