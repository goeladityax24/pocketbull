import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTracker } from "../analyze";
import { ExtractionResult } from "../guidance";
import { parseCompanyPage } from "../screener";
import type { SavedRun } from "../store";

// Real data: Screener page captured 4 Oct 2026, and guidance from the
// May 2026 (Q4 FY26) and Aug 2026 (Q1 FY27) concalls, quotes verified
// word for word against the transcripts.
const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const page = parseCompanyPage(fx("skygold-consolidated.html"), "SKYGOLD", "consolidated", "u");
const snapshot = { ...page, peers: [], fetchedAt: "" };
const runs = JSON.parse(fx("skygold-runs.json")) as SavedRun[];

describe("Skygold Screener page", () => {
  it("skips the TTM column in the annual table", () => {
    expect(page.annual.periods.map((p) => p.label)).toEqual(["FY22", "FY23", "FY24", "FY25", "FY26"]);
    expect(page.annual.rows.sales).toEqual([786, 1154, 1745, 3548, 6295]);
  });

  it("reads quarterly results up to Q1 FY27", () => {
    expect(page.interim.granularity).toBe("quarter");
    expect(page.interim.periods.at(-1)?.label).toBe("Q1 FY27");
    expect(page.interim.rows.sales?.at(-1)).toBe(2013);
    expect(page.interim.rows.opm_pct?.[0]).toBe(5);
  });

  it("keeps two concalls in the same month apart", () => {
    expect(page.concalls.map((c) => c.yearMonth)).toEqual(["2026-08", "2026-06", "2026-02", "2024-11", "2024-11-b", "2023-08"]);
    expect(page.concalls.at(-1)?.transcriptUrl).toBeNull();
  });
});

describe("Skygold tracker", () => {
  it("stored extractions match the schema", () => {
    for (const r of runs) expect(() => ExtractionResult.parse(r.extraction)).not.toThrow();
  });

  const t = buildTracker(snapshot, runs);
  const fy27 = t.items.find((i) => i.guidance.metric_label === "FY27 revenue" && !i.superseded)!;

  it("turns the ₹8,100 Cr FY27 target into quarterly expected revenue", () => {
    expect(t.nextPeriod?.label).toBe("Q2 FY27");
    const q1 = fy27.checks.find((c) => c.period.label === "Q1 FY27")!;
    expect(q1.impliedGrowthPct).toEqual([28.7, 28.7]); // 8,100 / 6,295 − 1
    expect(q1.expected!.low).toBeCloseTo(1455.3, 1); // ₹1,131 Cr × 1.2867
    expect(q1.tag).toBe("exceeded"); // actual ₹2,013 Cr
    const q2 = fy27.checks.find((c) => c.period.label === "Q2 FY27")!;
    expect(q2.tag).toBe("expected");
    expect(q2.expected!.low).toBeCloseTo(1909.5, 1); // ₹1,484 Cr × 1.2867
    expect(fy27.ytd).toMatchObject({ growthPct: 78, status: "ahead", shareOfTarget: 24.9 });
  });

  it("marks the May version of a repeated target as superseded", () => {
    const may = t.items.find((i) => i.guidance.metric_label === "FY27 revenue" && i.source.yearMonth === "2026-06")!;
    expect(may.superseded).toBe(true);
  });

  it("leaves items Screener cannot check for people", () => {
    const debt = t.items.find((i) => i.guidance.keyword === "net debt down 50%")!;
    expect(debt.checks).toHaveLength(0);
    expect(debt.note).toMatch(/by hand/);
  });
});

describe("importRun (analysis written by a Claude session, no API)", () => {
  it("validates, checks quotes and saves", async () => {
    const { importRun } = await import("../analyze");
    const saved: SavedRun[] = [];
    const store = {
      getRun: async () => null,
      listRuns: async () => saved,
      saveRun: async (r: SavedRun) => void saved.push(r),
    };
    const extraction = runs[1].extraction;
    const transcript = {
      url: "t",
      bytes: new Uint8Array(),
      hasText: true,
      pages: [extraction.guidance.map((g) => g.quote).join(" ").repeat(2)],
    };
    const { run, problems, tracker } = await importRun({ snapshot, extraction, store, concall: "2026-08", transcript });
    expect(problems).toEqual([]);
    expect(run.quoteChecks.every((q) => q === "verified")).toBe(true);
    expect(run.usage.costUsd).toBe(0);
    expect(saved).toHaveLength(1);
    expect(tracker.nextPeriod?.label).toBe("Q2 FY27");
  });

  it("rejects an analysis in the wrong format and flags invented quotes", async () => {
    const { importRun } = await import("../analyze");
    const store = { getRun: async () => null, listRuns: async () => [], saveRun: async () => {} };
    await expect(importRun({ snapshot, extraction: { guidance: [] }, store, concall: "2026-08", transcript: null })).rejects.toThrow(/format/);
    const bad = structuredClone(runs[1].extraction);
    bad.guidance[0].quote = "We will reach revenue of INR10,000 crores in FY27 with nine percent EBITDA margins.";
    const transcript = { url: "t", bytes: new Uint8Array(), hasText: true, pages: [runs[1].extraction.guidance.map((g) => g.quote).join(" ")] };
    const { problems } = await importRun({ snapshot, extraction: bad, store, concall: "2026-08", transcript });
    expect(problems).toHaveLength(1);
  });
});
