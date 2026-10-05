import type { Tracker, TrackedGuidance } from "./analyze";
import type { Check, Range } from "./expected";
import { round } from "./numbers";
import type { SavedRun } from "./store";

const TAG: Record<Check["tag"], string> = {
  met: "Met",
  exceeded: "Exceeded",
  missed: "Missed",
  pending: "Pending",
  expected: "Expected",
  not_comparable: "Not comparable",
  qualitative: "Qualitative",
};

/** Indian digit grouping: 18000 -> "18,000", 1909.52 -> "1,909.5" */
export function num(n: number, dp = 1): string {
  return round(n, dp).toLocaleString("en-IN", { maximumFractionDigits: dp });
}

export function fmtRange(r: Range | null): string {
  if (!r) return "—";
  const dp = r.unit === "pct" ? 2 : 1;
  const lo = num(r.low, dp);
  const hi = num(r.high, dp);
  const body = lo === hi ? lo : `${lo}–${hi}`;
  return r.unit === "pct" ? `${body}%` : `₹${body} Cr`;
}

function fmtActual(c: Check): string {
  if (c.actual == null) return "—";
  return c.expected?.unit === "pct" ? `${num(c.actual, 2)}%` : `₹${num(c.actual)} Cr`;
}

function fmtSaid(g: TrackedGuidance["guidance"]): string {
  if (g.low == null) return "";
  const hi = g.high ?? g.low;
  const unit = g.unit === "pct" ? "%" : g.unit === "inr_cr" ? " Cr" : "";
  const pre = g.unit === "inr_cr" ? "₹" : "";
  if (g.kind === "growth_yoy" && g.low < 0 && hi < 0) {
    const a = Math.min(-g.low, -hi), b = Math.max(-g.low, -hi);
    return `down ${a === b ? a : `${a}${b >= 100 ? "%+" : `–${b}`}`}${b >= 100 ? "" : "%"}`;
  }
  return `${pre}${num(g.low, 2)}${hi !== g.low ? `–${num(hi, 2)}` : ""}${unit}`;
}

/** Plain-text report for the CLI. The web app renders the same data. */
export function formatTracker(t: Tracker, run: SavedRun | null): string {
  const out: string[] = [];
  const s = t.snapshot;
  out.push(`\n${s.name} (${s.symbol}) · ${s.basis} · ${s.screenerUrl}`);

  if (run) {
    const ins = run.extraction.insights;
    out.push(`\n== Insight report · ${run.concall.month} concall (${run.extraction.call_period}) ==`);
    out.push(ins.summary);
    out.push(`Tone: ${ins.tone.label} — “${ins.tone.quote}”${ins.tone.page ? ` (p.${ins.tone.page})` : ""}`);
    if (ins.what_changed.length) {
      out.push("What changed:");
      ins.what_changed.forEach((w) => out.push(`  [${w.change}] ${w.text}${w.page ? ` (p.${w.page})` : ""}`));
    }
    if (ins.analyst_questions.length) {
      out.push("Analysts pushed on:");
      ins.analyst_questions.forEach((q) => out.push(`  · ${q.topic} — ${q.answer}`));
    }
    if (ins.red_flags.length) {
      out.push("Red flags:");
      ins.red_flags.forEach((r) => out.push(`  ! ${r.text}`));
    }
  }

  // Next results checklist: the user's "expected number" view
  if (t.nextPeriod) {
    out.push(`\n== Numbers to check in ${t.nextPeriod.label} results ==`);
    const live = t.items.filter((it) => !it.superseded);
    const line = (it: (typeof live)[number], c: Check) => {
      const base = c.base ? ` (base ${c.base.period.label}: ₹${num(c.base.value)} Cr)` : "";
      const inr = c.impliedInr ? ` → ${fmtRange(c.impliedInr)}` : "";
      const implied = c.seasonalShare && c.base
        ? ` · ${c.base.period.label} was ${num(c.seasonalShare.pct, 1)}% of ${c.seasonalShare.year.label}, so that share of the ${it.guidance.period} target`
        : c.impliedGrowthPct && c.period.kind !== "year" ? ` · ${c.impliedGrowthPct[0]}% growth implied by the ${it.guidance.period} target` : "";
      return `  ${it.guidance.metric_label}: expect ${fmtRange(c.expected)}${inr}${base}${implied} · ${it.source.label}`;
    };
    const next = live.flatMap((it) =>
      it.checks.filter((c) => c.tag === "expected" && c.period.label === t.nextPeriod!.label).map((c) => line(it, c)),
    );
    out.push(...(next.length ? next : ["  No numeric guidance applies to the next period."]));
    const sales = s.interim.rows.sales ?? [];
    const li = sales.findLastIndex((v) => v != null);
    if (li >= 0) {
      const prevYear = s.interim.periods.findIndex((p) => p.kind === s.interim.periods[li].kind && p.fy === s.interim.periods[li].fy - 1 && p.index === s.interim.periods[li].index);
      const yoy = prevYear >= 0 && sales[prevYear] ? ` (${num((sales[li]! / sales[prevYear]! - 1) * 100, 0)}% YoY)` : "";
      out.push(`  For context: ${s.interim.periods[li].label} revenue was ₹${num(sales[li]!)} Cr${yoy}`);
    }
    live
      .filter((it) => it.guidance.period === t.nextPeriod!.label && (it.guidance.kind === "qualitative" || it.guidance.kind === "date"))
      .forEach((it) => out.push(`  Also said for ${t.nextPeriod!.label}: “${it.guidance.quote}” (${it.source.label}, p.${it.guidance.page})`));
    const years = live.flatMap((it) =>
      it.checks.filter((c) => c.tag === "expected" && c.period.kind === "year").map((c) => ({ it, c })),
    );
    if (years.length) {
      out.push(`\n== Full-year targets ==`);
      years.forEach(({ it, c }) => out.push(line(it, c).replace("expect", `${c.period.label}:`)));
    }
  }

  out.push(`\n== Track record ==`);
  // Numbers we can check first, then items for people to tag
  const ordered = t.items.filter((x) => !x.superseded).sort((a, b) => Number(b.checks.length > 0) - Number(a.checks.length > 0));
  for (const it of ordered) {
    const g = it.guidance;
    const said = fmtSaid(g);
    out.push(
      `\n• ${g.metric_label}${said ? ` ${said}` : ""} · ${g.period ?? g.horizon_text ?? "no period"} · ${it.source.label}${it.superseded ? " · superseded" : ""}`,
    );
    out.push(`  “${g.quote.slice(0, 160)}${g.quote.length > 160 ? "…" : ""}”${g.page ? ` p.${g.page}` : ""} · quote ${it.quoteCheck}`);
    if (it.note) out.push(`  ${it.note}${g.keyword ? ` · keyword: ${g.keyword}` : ""}`);
    for (const o of it.alsoSaid) out.push(`  Also said (${o.label}): ${fmtSaid(o.guidance) || o.guidance.metric_label} · both kept`);
    for (const c of it.checks) {
      out.push(`  ${c.period.label.padEnd(8)} ${TAG[c.tag].padEnd(9)} actual ${fmtActual(c).padEnd(12)} expected ${fmtRange(c.expected)}${c.gap ? ` · ${c.gap}` : ""}`);
    }
    if (it.ytd) {
      const share = it.ytd.shareOfTarget != null ? ` · ${it.ytd.shareOfTarget}% of the full-year target done` : "";
      out.push(`  Year to date (${it.ytd.periods.join(", ")}): ${it.ytd.growthPct}% growth · ${it.ytd.status.replace("_", " ")}${share}`);
    }
  }
  return out.join("\n");
}
