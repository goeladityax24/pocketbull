import { buildTracker, type TrackedGuidance, type Tracker } from "../pipeline/analyze";
import type { Check, ScoringOptions, Tag } from "../pipeline/expected";
import type { GuidanceItem } from "../pipeline/guidance";
import type { Period } from "../pipeline/periods";
import type { SavedRun } from "../pipeline/store";
import type { CompanySnapshot } from "../pipeline/types";

export type ManualTag = "met" | "exceeded" | "missed" | "not_comparable";

/** A saved run as the app stores it: each guidance item has an id and maybe an editor's correction. */
export interface StoredRun extends SavedRun {
  guidanceIds: string[];
  /** Same order as extraction.guidance; an Editor's correction wins over the extracted item */
  edited: (GuidanceItem | null)[];
}

export interface TagOverride {
  id: string;
  guidanceId: string;
  /** "Q2 FY27", "FY27", or "overall" for promises without a numeric check */
  periodLabel: string;
  tag: ManualTag;
  reason: string;
  changedBy: string;
  createdAt: string;
  reverted: boolean;
}

export interface CellView {
  check: Check;
  /** Manual tag if someone changed it, else the computed one */
  tag: Tag;
  override: TagOverride | null;
}

export interface ItemView {
  id: string;
  tracked: TrackedGuidance;
  edited: boolean;
  cells: CellView[];
  /** Manual tag for the promise as a whole (qualitative, timelines, items not in reported results) */
  overall: TagOverride | null;
}

export interface PeriodScore {
  period: Period;
  kept: number;
  scored: number;
  missed: number;
}

export interface TrackerView {
  tracker: Tracker;
  items: ItemView[];
  live: ItemView[];
  superseded: ItemView[];
  /** Live items with at least one numeric check */
  numeric: ItemView[];
  /** Live items checked by people: qualitative, timelines, no clear period, not in results */
  byHand: ItemView[];
  /** Expected numbers for the next results */
  next: { item: ItemView; cell: CellView }[];
  /** Full-year targets still open */
  fullYear: { item: ItemView; cell: CellView }[];
  /** Interim periods with checks, oldest first (including the next, still expected) */
  interimColumns: Period[];
  yearColumns: Period[];
  scores: PeriodScore[];
  totals: { kept: number; scored: number };
}

const KEPT: Tag[] = ["met", "exceeded"];
const SCORED: Tag[] = ["met", "exceeded", "missed"];

export function isKept(t: Tag) {
  return KEPT.includes(t);
}

function latestOverrides(overrides: TagOverride[]) {
  const map = new Map<string, TagOverride>();
  const sorted = overrides.filter((o) => !o.reverted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of sorted) map.set(`${o.guidanceId}|${o.periodLabel}`, o);
  return map;
}

function uniquePeriods(ps: Period[]): Period[] {
  const seen = new Map<string, Period>();
  for (const p of ps) seen.set(p.label, p);
  return [...seen.values()].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

/** Everything the tracker pages show, from the snapshot, saved runs and manual tags. */
export function buildTrackerView(
  snapshot: CompanySnapshot,
  runs: StoredRun[],
  overrides: TagOverride[] = [],
  opts: ScoringOptions = {},
): TrackerView {
  const ordered = [...runs].sort((a, b) => a.concall.yearMonth.localeCompare(b.concall.yearMonth));
  const effective: SavedRun[] = ordered.map((r) => ({
    ...r,
    extraction: { ...r.extraction, guidance: r.extraction.guidance.map((g, i) => r.edited[i] ?? g) },
  }));
  const tracker = buildTracker(snapshot, effective, opts);
  // buildTracker keeps run order (by month) and item order inside each run
  const ids = ordered.flatMap((r) => r.guidanceIds);
  const editedFlags = ordered.flatMap((r) => r.extraction.guidance.map((_, i) => r.edited[i] != null));
  const manual = latestOverrides(overrides);

  const items: ItemView[] = tracker.items.map((tracked, k) => {
    const id = ids[k];
    const cells = tracked.checks.map((check) => {
      const override = manual.get(`${id}|${check.period.label}`) ?? null;
      return { check, tag: override?.tag ?? check.tag, override };
    });
    return { id, tracked, edited: editedFlags[k], cells, overall: manual.get(`${id}|overall`) ?? null };
  });

  const live = items.filter((i) => !i.tracked.superseded);
  const numeric = live.filter((i) => i.cells.length > 0);
  const byHand = live.filter((i) => i.cells.length === 0);
  const nextLabel = tracker.nextPeriod?.label;
  const next = numeric.flatMap((item) =>
    item.cells.filter((c) => c.check.period.label === nextLabel && c.check.tag === "expected").map((cell) => ({ item, cell })),
  );
  const fullYear = numeric.flatMap((item) =>
    item.cells.filter((c) => c.check.period.kind === "year" && c.check.tag === "expected").map((cell) => ({ item, cell })),
  );

  const allCells = numeric.flatMap((i) => i.cells);
  const interimColumns = uniquePeriods(allCells.map((c) => c.check.period).filter((p) => p.kind !== "year"));
  const yearColumns = uniquePeriods(allCells.map((c) => c.check.period).filter((p) => p.kind === "year"));

  const scores: PeriodScore[] = uniquePeriods([...interimColumns, ...yearColumns])
    .map((period) => {
      const tags = allCells.filter((c) => c.check.period.label === period.label).map((c) => c.tag);
      return {
        period,
        kept: tags.filter(isKept).length,
        scored: tags.filter((t) => SCORED.includes(t)).length,
        missed: tags.filter((t) => t === "missed").length,
      };
    })
    .filter((s) => s.scored > 0);
  const handTags = byHand.map((i) => i.overall?.tag).filter((t): t is ManualTag => !!t);
  const totals = {
    kept: scores.reduce((a, s) => a + s.kept, 0) + handTags.filter(isKept).length,
    scored: scores.reduce((a, s) => a + s.scored, 0) + handTags.filter((t) => SCORED.includes(t)).length,
  };

  return {
    tracker,
    items,
    live,
    superseded: items.filter((i) => i.tracked.superseded),
    numeric,
    byHand,
    next,
    fullYear,
    interimColumns,
    yearColumns,
    scores,
    totals,
  };
}
