// Indian fiscal periods. FY27 = April 2026 to March 2027.
// Screener labels columns by period END date ("2026-03-31", "Mar 2026").

export type PeriodKind = "quarter" | "half" | "year";

export interface Period {
  kind: PeriodKind;
  /** Fiscal year by its ending calendar year: FY27 -> 2027 */
  fy: number;
  /** 1-4 for quarters, 1-2 for halves, 0 for a full year */
  index: number;
  /** ISO end date, e.g. "2026-06-30" */
  endDate: string;
  /** "Q1 FY27", "H2 FY26", "FY26" */
  label: string;
}

const END_DAY: Record<number, number> = { 3: 31, 6: 30, 9: 30, 12: 31 };

function fyLabel(fy: number): string {
  return `FY${String(fy % 100).padStart(2, "0")}`;
}

/** Fiscal year a calendar month belongs to (Apr-Mar years). */
export function fiscalYearOf(year: number, month: number): number {
  return month <= 3 ? year : year + 1;
}

/** Build a period from its end date (ISO "YYYY-MM-DD" or "YYYY-MM"). */
export function periodFromEndDate(endDate: string, kind: PeriodKind): Period {
  const [y, m] = endDate.split("-").map(Number);
  if (!y || !m) throw new Error(`Bad period end date: ${endDate}`);
  const fy = fiscalYearOf(y, m);
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(END_DAY[m] ?? 30).padStart(2, "0")}`;
  if (kind === "year") {
    return { kind, fy, index: 0, endDate: iso, label: fyLabel(fy) };
  }
  if (kind === "quarter") {
    // Jun -> Q1, Sep -> Q2, Dec -> Q3, Mar -> Q4
    const index = m === 6 ? 1 : m === 9 ? 2 : m === 12 ? 3 : m === 3 ? 4 : 0;
    if (!index) throw new Error(`Not a quarter end: ${endDate}`);
    return { kind, fy, index, endDate: iso, label: `Q${index} ${fyLabel(fy)}` };
  }
  // half: Sep -> H1, Mar -> H2
  const index = m === 9 ? 1 : m === 3 ? 2 : 0;
  if (!index) throw new Error(`Not a half-year end: ${endDate}`);
  return { kind, fy, index, endDate: iso, label: `H${index} ${fyLabel(fy)}` };
}

/** Build a period from fiscal coordinates. */
export function makePeriod(kind: PeriodKind, fy: number, index = 0): Period {
  if (kind === "year") return periodFromEndDate(`${fy}-03-31`, "year");
  if (kind === "quarter") {
    const month = [6, 9, 12, 3][index - 1];
    const year = index === 4 ? fy : fy - 1;
    return periodFromEndDate(`${year}-${String(month).padStart(2, "0")}`, "quarter");
  }
  const month = index === 1 ? 9 : 3;
  const year = index === 1 ? fy - 1 : fy;
  return periodFromEndDate(`${year}-${String(month).padStart(2, "0")}`, "half");
}

/** The same period one year earlier (the base for year-on-year growth). */
export function samePeriodLastYear(p: Period): Period {
  return makePeriod(p.kind, p.fy - 1, p.index);
}

/** The period that follows p (next quarter / half / year). */
export function nextPeriod(p: Period): Period {
  if (p.kind === "year") return makePeriod("year", p.fy + 1);
  const per = p.kind === "quarter" ? 4 : 2;
  return p.index === per ? makePeriod(p.kind, p.fy + 1, 1) : makePeriod(p.kind, p.fy, p.index + 1);
}

/** Interim periods (quarters or halves) inside a fiscal year. */
export function periodsInYear(fy: number, kind: "quarter" | "half"): Period[] {
  const n = kind === "quarter" ? 4 : 2;
  return Array.from({ length: n }, (_, i) => makePeriod(kind, fy, i + 1));
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.kind === b.kind && a.fy === b.fy && a.index === b.index;
}

/** Parse labels like "FY27", "Q2 FY27", "H1 FY27", "FY2027". */
export function parsePeriodLabel(text: string): Period | null {
  const t = text.trim().toUpperCase().replace(/\s+/g, " ");
  const m = t.match(/^(?:(Q[1-4]|H[12])\s*)?FY\s*'?(\d{2}|\d{4})$/);
  if (!m) return null;
  const yy = Number(m[2]);
  const fy = yy < 100 ? 2000 + yy : yy;
  if (!m[1]) return makePeriod("year", fy);
  const idx = Number(m[1].slice(1));
  return makePeriod(m[1][0] === "Q" ? "quarter" : "half", fy, idx);
}
