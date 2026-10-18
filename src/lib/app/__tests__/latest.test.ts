import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GuidanceItem } from "../../pipeline/guidance";
import { parseCompanyPage } from "../../pipeline/screener";
import type { SavedRun } from "../../pipeline/store";
import { buildResultsGrid } from "../results";
import { buildTrackerView, type StoredRun } from "../view";

const fx = (f: string) => readFileSync(join(__dirname, "../../pipeline/__tests__/fixtures", f), "utf8");
const snapshot = { ...parseCompanyPage(fx("skygold-consolidated.html"), "SKYGOLD", "consolidated", "u"), peers: [], fetchedAt: "" };
const saved = JSON.parse(fx("skygold-runs.json")) as SavedRun[];
const calls = saved.at(-1)!; // Aug 2026 call: FY27 revenue ₹8,100 Cr
const fy27 = calls.extraction.guidance.find((g) => g.metric === "revenue" && g.period === "FY27" && g.kind === "absolute")!;

const store = (r: SavedRun): StoredRun => ({
  ...r,
  quoteChecks: r.extraction.guidance.map(() => "verified"),
  guidanceIds: r.extraction.guidance.map((_, i) => `${r.concall.yearMonth}:${i}`),
  edited: r.extraction.guidance.map(() => null),
});
const conference = (date: string, g: GuidanceItem): SavedRun => ({
  ...calls,
  concall: { ...calls.concall, yearMonth: `${date.slice(0, 7)}-test-connect`, month: "Conf" },
  extraction: { ...calls.extraction, guidance: [g] },
  source: {
    id: `${date.slice(0, 7)}-test-connect`,
    kind: "conference",
    event: "Test Connect",
    date,
    links: [{ url: "https://x.com/a/status/1", author: "a", grade: "broker_note", images: [], pages: [1] }],
    text_file: "x.txt",
  },
});

describe("newest guidance leads, whatever the source", () => {
  const raised = { ...fy27, low: 9000, high: 9000, revises: null };

  it("a conference after the call sets the expected numbers, and the checklist shows both on one row", () => {
    const view = buildTrackerView(snapshot, [...saved.map(store), store(conference("2026-09-25", raised))]);
    const grid = buildResultsGrid(snapshot, view);
    const next = grid.rows[0].cells.at(-1)!;
    expect(next.basis).toContain("Test Connect");

    const rows = view.next.filter((n) => n.item.tracked.guidance.metric === "revenue" && n.item.tracked.guidance.period === "FY27");
    expect(rows).toHaveLength(1);
    expect(rows[0].item.tracked.guidance.low).toBe(9000);
    expect(rows[0].others.map((o) => o.item.tracked.guidance.low)).toContain(8100);
  });

  it("a conference before the call does not", () => {
    const view = buildTrackerView(snapshot, [store(conference("2026-07-01", raised)), ...saved.map(store)]);
    const grid = buildResultsGrid(snapshot, view);
    expect(grid.rows[0].cells.at(-1)!.basis).not.toContain("Test Connect");
    const row = view.next.find((n) => n.item.tracked.guidance.metric === "revenue" && n.item.tracked.guidance.period === "FY27")!;
    expect(row.item.tracked.guidance.low).toBe(8100);
    expect(row.others.map((o) => o.item.tracked.guidance.low)).toEqual([9000]);
  });
});
