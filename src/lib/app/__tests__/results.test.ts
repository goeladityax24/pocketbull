import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GuidanceItem } from "../../pipeline/guidance";
import { parseCompanyPage } from "../../pipeline/screener";
import type { SavedRun } from "../../pipeline/store";
import { buildResultsGrid, buildYearTargets } from "../results";
import { buildTrackerView, type StoredRun } from "../view";

const fx = (f: string) => readFileSync(join(__dirname, "../../pipeline/__tests__/fixtures", f), "utf8");
const snapshot = { ...parseCompanyPage(fx("skygold-consolidated.html"), "SKYGOLD", "consolidated", "u"), peers: [], fetchedAt: "" };
const saved = JSON.parse(fx("skygold-runs.json")) as SavedRun[];
const stored = (extra: GuidanceItem[] = []): StoredRun[] =>
  saved.map((r, k) => {
    const guidance = k === saved.length - 1 ? [...r.extraction.guidance, ...extra] : r.extraction.guidance;
    return {
      ...r,
      extraction: { ...r.extraction, guidance },
      quoteChecks: guidance.map((_, i) => r.quoteChecks[i] ?? "verified"),
      guidanceIds: guidance.map((_, i) => `${r.concall.yearMonth}:${i}`),
      edited: guidance.map(() => null),
    };
  });

describe("results grid (Skygold)", () => {
  it("shows the last 4 quarters plus the next, with actuals for revenue, EBITDA and PAT", () => {
    const grid = buildResultsGrid(snapshot, buildTrackerView(snapshot, stored()));
    expect(grid.periods.map((p) => p.label)).toEqual(["Q2 FY26", "Q3 FY26", "Q4 FY26", "Q1 FY27", "Q2 FY27"]);
    const [rev, ebitda, pat] = grid.rows;
    expect(rev.cells[3]).toMatchObject({ actual: 2013, tag: "exceeded" });
    expect(Math.round(rev.cells[3].yoyPct!)).toBe(78); // 2013 vs 1131
    expect(ebitda.cells[3]).toMatchObject({ actual: 157, expected: null });
    expect(pat.cells[3].actual).toBe(105);
    expect(Math.round(pat.cells[3].marginPct! * 10) / 10).toBe(5.2);
    expect(rev.cells[4]).toMatchObject({ actual: null, tag: "expected" });
  });

  it("estimates next-quarter EBITDA and PAT from expected revenue and the last 4 quarters' margin when not guided", () => {
    const grid = buildResultsGrid(snapshot, buildTrackerView(snapshot, stored()));
    const rev = grid.rows[0].cells[4].expected!;
    const ebitda = grid.rows[1].cells[4];
    const pat = grid.rows[2].cells[4];
    // Q2 FY26–Q1 FY27: EBITDA 520 / revenue 7,177; PAT 344 / 7,177
    expect(ebitda.expected).toBeNull();
    expect(ebitda.estimate!.marginPct).toBeCloseTo((520 / 7177) * 100, 5);
    expect(ebitda.estimate!.range.low).toBeCloseTo((rev.low * 520) / 7177, 5);
    expect(pat.estimate!.range.high).toBeCloseTo((rev.high * 344) / 7177, 5);
    expect(grid.rows[0].cells[4].estimate).toBeNull();
    expect(grid.rows[1].cells[3].estimate).toBeNull(); // reported quarters never get one
  });

  it("turns an FY27 EBITDA margin guide into ₹ on expected revenue for the next quarter", () => {
    const margin = { ...saved[1].extraction.guidance[0], metric: "ebitda_margin", metric_label: "EBITDA margin", kind: "margin_pct", low: 7, high: 8, unit: "pct", period: "FY27", keyword: "ebitda margin" } as GuidanceItem;
    const view = buildTrackerView(snapshot, stored([margin]));
    const grid = buildResultsGrid(snapshot, view);
    const rev = grid.rows[0].cells[4].expected!;
    const ebitda = grid.rows[1].cells[4];
    expect(ebitda.expected!.low).toBeCloseTo(rev.low * 0.07, 5);
    expect(ebitda.expected!.high).toBeCloseTo(rev.high * 0.08, 5);
    expect(ebitda.basis).toContain("margin for FY27");
    // Reported quarter: margin × actual revenue, scored against actual EBITDA (157 vs 141–161)
    expect(grid.rows[1].cells[3]).toMatchObject({ tag: "met" });
  });
});

describe("full-year targets (Skygold)", () => {
  it("shows revenue, EBITDA and PAT for the target year with the change against last year", () => {
    const years = buildYearTargets(snapshot, buildTrackerView(snapshot, stored()));
    const fy = years.find((y) => y.period.label === "FY27")!;
    const [rev, ebitda, pat] = fy.rows;
    expect(rev.lastYear!.period.label).toBe("FY26");
    expect(rev.changePct![0]).toBeCloseTo(((rev.expected!.low / rev.lastYear!.value) - 1) * 100, 0);
    // Not guided: estimated at last year's margin, so the change equals revenue's
    expect(ebitda.estimate).toBe(true);
    expect(ebitda.changePct![0]).toBeCloseTo(rev.changePct![0], 0);
    expect(pat.estimate).toBe(true);
  });
});
