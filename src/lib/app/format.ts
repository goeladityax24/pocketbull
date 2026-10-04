import type { Check, Range, Tag } from "../pipeline/expected";
import { fmtRange, num } from "../pipeline/format";
import type { GuidanceItem } from "../pipeline/guidance";

export { fmtRange, num };

export const TAG_LABEL: Record<Tag, string> = {
  met: "Met",
  exceeded: "Exceeded",
  missed: "Missed",
  pending: "Pending",
  expected: "Expected",
  not_comparable: "Not comparable",
  qualitative: "Qualitative",
};

/** What management said, as a short number: "₹8,100 Cr", "30–35% growth", "5.25%" */
export function said(g: GuidanceItem): string {
  if (g.low == null) return "";
  const hi = g.high ?? g.low;
  const n = (x: number) => num(x, 2);
  const body = hi !== g.low ? `${n(g.low)}–${n(hi)}` : n(g.low);
  if (g.unit === "inr_cr") return `₹${body} Cr`;
  if (g.kind === "growth_yoy") {
    if (g.low < 0 && hi < 0) {
      const a = Math.min(-g.low, -hi);
      const b = Math.max(-g.low, -hi);
      return `down ${a === b ? a : `${a}–${b}`}%`;
    }
    return `${body}% growth`;
  }
  if (g.unit === "pct") return `${body}%`;
  return body;
}

export function fmtActual(c: Check): string {
  if (c.actual == null) return "—";
  return c.expected?.unit === "pct" ? `${num(c.actual, 2)}%` : `₹${num(c.actual)} Cr`;
}

export function fmtInr(n: number | null | undefined, dp = 1): string {
  return n == null ? "—" : `₹${num(n, dp)} Cr`;
}

export function rangeText(r: Range | null) {
  return fmtRange(r);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-04T…" → "4 Oct 2026" (fixed format so server and browser agree) */
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m) return iso;
  return `${d ? `${d} ` : ""}${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** Calendar months a fiscal period covers: Q2 FY27 → "Jul–Sep 2026" */
export function periodSpan(endDate: string, kind: "quarter" | "half" | "year"): string {
  const [y, m] = endDate.split("-").map(Number);
  const len = kind === "quarter" ? 3 : kind === "half" ? 6 : 12;
  const startM = ((m - len + 12) % 12) + 1;
  const startY = m - len < 0 ? y - 1 : y;
  return `${MONTHS[startM - 1]}${startY !== y ? ` ${startY}` : ""}–${MONTHS[m - 1]} ${y}`;
}

/** "Q2 FY26 was 23.6% of FY26, so 23.6% of ₹8,100 Cr" for an annual target split by season */
export function seasonalText(c: Check): string | null {
  const sh = c.seasonalShare;
  if (!sh || !c.base) return null;
  const pct = `${num(sh.pct, 1)}%`;
  return `${c.base.period.label} was ${pct} of ${sh.year.label}, so ${pct} of ${fmtRange(sh.target)}`;
}
