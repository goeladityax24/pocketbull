import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCompanyPage } from "../../pipeline/screener";
import type { SavedRun } from "../../pipeline/store";
import { buildTrackerView, type StoredRun } from "../view";

const fx = (f: string) => readFileSync(join(__dirname, "../../pipeline/__tests__/fixtures", f), "utf8");
const snapshot = { ...parseCompanyPage(fx("skygold-consolidated.html"), "SKYGOLD", "consolidated", "u"), peers: [], fetchedAt: "" };
const saved = JSON.parse(fx("skygold-runs.json")) as SavedRun[];
// Stored newest first on purpose: the view must still line ids up with buildTracker's order
const runs: StoredRun[] = [...saved].reverse().map((r) => ({
  ...r,
  guidanceIds: r.extraction.guidance.map((_, i) => `${r.concall.yearMonth}:${i}`),
  edited: r.extraction.guidance.map(() => null),
}));

describe("tracker view (Skygold)", () => {
  const view = buildTrackerView(snapshot, runs);
  const fy27 = view.live.find((i) => i.tracked.guidance.metric === "revenue" && i.tracked.guidance.period === "FY27" && i.tracked.guidance.kind === "absolute")!;

  it("gives every item the id of its own run and position", () => {
    for (const item of view.items) {
      const [ym, i] = item.id.split(":");
      expect(item.tracked.source.yearMonth).toBe(ym);
      const run = saved.find((r) => r.concall.yearMonth === ym)!;
      expect(run.extraction.guidance[Number(i)].quote).toBe(item.tracked.guidance.quote);
    }
  });

  it("scores Q1 FY27 against the FY27 ₹8,100 Cr target and lists Q2 FY27 as next", () => {
    expect(fy27.cells.find((c) => c.check.period.label === "Q1 FY27")?.tag).toBe("exceeded");
    expect(view.tracker.nextPeriod?.label).toBe("Q2 FY27");
    expect(view.next.some((n) => n.item.id === fy27.id)).toBe(true);
    expect(view.scores.find((s) => s.period.label === "Q1 FY27")).toMatchObject({ kept: 1, scored: 1 });
  });

  it("applies a manual tag, and ignores a reverted one", () => {
    const base = { guidanceId: fy27.id, periodLabel: "Q1 FY27", reason: "test", changedBy: "A" };
    const v = buildTrackerView(snapshot, runs, [
      { ...base, id: "1", tag: "missed", createdAt: "2026-10-01", reverted: false },
      { ...base, id: "2", tag: "met", createdAt: "2026-10-02", reverted: true },
    ]);
    const item = v.live.find((i) => i.id === fy27.id)!;
    expect(item.cells.find((c) => c.check.period.label === "Q1 FY27")).toMatchObject({ tag: "missed", override: { id: "1" } });
    expect(v.scores.find((s) => s.period.label === "Q1 FY27")).toMatchObject({ kept: 0, missed: 1 });
  });

  it("uses an editor's correction instead of the extracted item", () => {
    const edited = runs.map((r) => ({
      ...r,
      edited: r.extraction.guidance.map((g) => (g.metric === "revenue" && g.period === "FY27" && g.kind === "absolute" ? { ...g, low: 9000, high: 9000 } : null)),
    }));
    const v = buildTrackerView(snapshot, edited);
    const item = v.live.find((i) => i.id === fy27.id)!;
    expect(item.edited).toBe(true);
    expect(item.tracked.guidance.low).toBe(9000);
  });

  it("keeps promises without numbers for tagging by hand", () => {
    expect(view.byHand.length).toBeGreaterThan(0);
    expect(view.byHand.every((i) => i.cells.length === 0)).toBe(true);
  });
});

describe("totals breakdown", () => {
  it("beaten + met = kept, and kept + missed = scored", () => {
    const t = buildTrackerView(snapshot, runs).totals;
    expect(t.scored).toBeGreaterThan(0);
    expect(t.exceeded + t.met).toBe(t.kept);
    expect(t.kept + t.missed).toBe(t.scored);
  });
});
