import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTracker } from "../analyze";
import type { GuidanceItem } from "../guidance";
import { parseCompanyPage } from "../screener";
import type { SavedRun } from "../store";

const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const snapshot = { ...parseCompanyPage(fx("skygold-consolidated.html"), "SKYGOLD", "consolidated", "u"), peers: [], fetchedAt: "" };
const [base] = JSON.parse(fx("skygold-runs.json")) as SavedRun[];
const g0 = base.extraction.guidance[0];
const item = (over: Partial<GuidanceItem>): GuidanceItem => ({ ...g0, revises: null, ...over });
const run = (yearMonth: string, guidance: GuidanceItem[]): SavedRun => ({
  ...base,
  concall: { ...base.concall, yearMonth, month: yearMonth },
  extraction: { ...base.extraction, guidance },
  quoteChecks: guidance.map(() => "verified"),
});

describe("later guidance replaces earlier guidance", () => {
  it("for the same metric and period, even in another form (₹ target → growth %)", () => {
    const t = buildTracker(snapshot, [
      run("2026-04", [item({ metric: "revenue", kind: "absolute", low: 8000, high: 8000, period: "FY27" })]),
      run("2026-07", [item({ metric: "revenue", kind: "growth_yoy", low: 25, high: 25, unit: "pct", period: "FY27" })]),
    ]);
    expect(t.items.map((i) => i.superseded)).toEqual([true, false]);
  });

  it("for 'other' items only when the name matches", () => {
    const t = buildTracker(snapshot, [
      run("2026-05", [
        item({ metric: "other", metric_label: "Tax rate", kind: "margin_pct", low: 23, high: 23, unit: "pct", period: "FY27" }),
        item({ metric: "other", metric_label: "Emerging markets EBITDA margin", kind: "margin_pct", low: 20, high: 21, unit: "pct", period: "FY27" }),
      ]),
      run("2026-08", [item({ metric: "other", metric_label: "Emerging markets EBITDA margin", kind: "margin_pct", low: 18, high: 20, unit: "pct", period: "FY27" })]),
    ]);
    expect(t.items.map((i) => [i.guidance.metric_label, i.superseded])).toEqual([
      ["Tax rate", false],
      ["Emerging markets EBITDA margin", true],
      ["Emerging markets EBITDA margin", false],
    ]);
  });
});

describe("conference notes and company calls", () => {
  const conf = (r: SavedRun): SavedRun => ({
    ...r,
    source: {
      id: `${r.concall.yearMonth}-test`,
      kind: "conference",
      event: "Test Connect",
      date: `${r.concall.yearMonth}-06`,
      links: [{ url: "https://x.com/a/status/1", author: "a", grade: "broker_note", images: [], pages: [1] }],
      text_file: "x.txt",
    },
  });

  it("keep both, each pointing at the other", () => {
    const t = buildTracker(snapshot, [
      conf(run("2026-03", [item({ metric: "revenue", kind: "absolute", low: 8000, high: 8000, period: "FY27" })])),
      run("2026-07", [item({ metric: "revenue", kind: "growth_yoy", low: 25, high: 25, unit: "pct", period: "FY27" })]),
    ]);
    expect(t.items.map((i) => i.superseded)).toEqual([false, false]);
    expect(t.items[0].alsoSaid.map((o) => [o.external, o.guidance.kind])).toEqual([[false, "growth_yoy"]]);
    expect(t.items[1].alsoSaid.map((o) => [o.external, o.guidance.kind])).toEqual([[true, "absolute"]]);
  });

  it("a later conference still replaces an earlier one", () => {
    const t = buildTracker(snapshot, [
      conf(run("2026-03", [item({ metric: "revenue", kind: "absolute", low: 8000, high: 8000, period: "FY27" })])),
      conf(run("2026-09", [item({ metric: "revenue", kind: "absolute", low: 8200, high: 8200, period: "FY27" })])),
    ]);
    expect(t.items.map((i) => [i.superseded, i.alsoSaid.length])).toEqual([[true, 0], [false, 0]]);
  });
});
