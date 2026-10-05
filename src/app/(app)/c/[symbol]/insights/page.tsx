import Link from "next/link";
import { InsightNote } from "@/components/InsightNote";
import { fmtDate, fmtRange, num } from "@/lib/app/format";
import type { ResultsTable } from "@/lib/pipeline/types";
import { loadCompany } from "../data";

export const metadata = { title: "Insight report" };

const CHANGE_TAG: Record<string, string> = {
  raised: "t-exceeded",
  cut: "t-missed",
  new: "t-met",
  delayed: "t-warn",
  withdrawn: "t-missed",
  reiterated: "t-pending",
};

function last(t: ResultsTable, key: keyof ResultsTable["rows"]) {
  const row = t.rows[key] ?? [];
  const i = row.findLastIndex((v) => v != null);
  if (i < 0) return null;
  const p = t.periods[i];
  const j = t.periods.findIndex((x) => x.kind === p.kind && x.index === p.index && x.fy === p.fy - 1);
  return { value: row[i]!, period: p, prev: j >= 0 ? row[j] : null };
}

export default async function InsightsPage({ params, searchParams }: PageProps<"/c/[symbol]/insights">) {
  const { symbol } = await params;
  const { call } = await searchParams;
  const { bundle, runs, view } = await loadCompany(symbol);
  const c = bundle.company;
  const run = runs.find((r) => r.concall.yearMonth === call) ?? runs[0];

  if (!run) {
    return (
      <main className="wrap py-8">
        <div className="box p-6 text-sm">No concall analysed yet for {c.name}.</div>
      </main>
    );
  }

  const ins = run.extraction.insights;
  const pdf = (page: number | null) => (page ? `${run.docs.transcriptUrl}#page=${page}` : run.docs.transcriptUrl);

  // Full write-up written: show it, with the selected concall's takeaways as the last section
  if (c.researchNote) {
    return (
      <InsightNote note={c.researchNote} basis={c.basis}>
        <section id="concall" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="m-0 text-[22px] font-bold">Concall takeaways</h2>
            {runs.length > 1 && (
              <nav aria-label="Concalls" className="flex flex-wrap gap-1.5">
                {runs.map((r) => (
                  <Link
                    key={r.concall.yearMonth}
                    href={`?call=${r.concall.yearMonth}#concall`}
                    className="btn btn-ghost btn-sm"
                    aria-current={r === run ? "page" : undefined}
                    style={r === run ? { background: "var(--muted-bg)", fontWeight: 600 } : undefined}
                  >
                    {r.concall.month}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="eyebrow">
            {run.concall.month} concall · {run.extraction.call_period} results ·{" "}
            <a href={run.docs.transcriptUrl} target="_blank" rel="noreferrer">transcript</a>
          </div>
          <p className="m-0 max-w-[68ch] leading-relaxed">{ins.summary}</p>
          <div className="box flex flex-wrap items-baseline gap-3 p-4">
            <span className="tag t-pending capitalize">{ins.tone.label}</span>
            <span className="text-[14.5px] italic" style={{ color: "var(--ink-2)" }}>
              “{ins.tone.quote}” {ins.tone.page && <a className="src not-italic" href={pdf(ins.tone.page)} target="_blank" rel="noreferrer">p.{ins.tone.page}</a>}
            </span>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <div className="box flex min-w-0 flex-col gap-2.5 p-5">
              <h3 className="m-0 text-[15.5px] font-semibold">What changed</h3>
              <ul className="m-0 flex flex-col gap-2 pl-5 text-[14.5px] leading-normal">
                {ins.what_changed.map((w, i) => (
                  <li key={i}>
                    <span className="capitalize" style={{ fontWeight: 600 }}>{w.change}:</span> {w.text}{" "}
                    {w.page && <a className="src" href={pdf(w.page)} target="_blank" rel="noreferrer">p.{w.page}</a>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="box flex min-w-0 flex-col gap-2.5 p-5">
              <h3 className="m-0 text-[15.5px] font-semibold">What analysts pushed on</h3>
              <ul className="m-0 flex flex-col gap-2 pl-5 text-[14.5px] leading-normal">
                {ins.analyst_questions.map((q, i) => (
                  <li key={i}>
                    <strong>{q.topic}:</strong> {q.answer}{" "}
                    {q.page && <a className="src" href={pdf(q.page)} target="_blank" rel="noreferrer">p.{q.page}</a>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="sub m-0">
            Every promise from these calls is scored in the <Link href={`/c/${c.symbol}/tracker`}>guidance tracker</Link>.
          </p>
        </section>
      </InsightNote>
    );
  }
  const s = c.snapshot;
  const sales = last(s.interim, "sales");
  const opm = last(s.interim, "opm_pct");
  const pat = last(s.interim, "net_profit");
  const ratio = (k: string) => s.ratios[k];
  const yoy = (x: { value: number; prev: number | null | undefined } | null) =>
    x?.prev ? `${x.value >= x.prev ? "+" : ""}${num((x.value / x.prev - 1) * 100, 0)}%` : null;
  const stats = [
    ratio("current price") != null && { v: `₹${num(ratio("current price")!, 0)}`, l: `Share price · ${fmtDate(c.snapshotFetchedAt, false)}` },
    ratio("market cap") != null && { v: `₹${num(ratio("market cap")!, 0)} Cr`, l: `Market cap · ${fmtDate(c.snapshotFetchedAt, false)}` },
    ratio("stock p/e") != null && { v: `${num(ratio("stock p/e")!, 1)}x`, l: `P/E · ${fmtDate(c.snapshotFetchedAt, false)}` },
    sales && { v: `₹${num(sales.value, 0)} Cr`, l: `Revenue ${sales.period.label}${yoy(sales) ? ` (${yoy(sales)} YoY)` : ""}` },
    opm && { v: `${num(opm.value, 1)}%`, l: `Operating margin ${opm.period.label}` },
    pat && { v: `₹${num(pat.value, 0)} Cr`, l: `Net profit ${pat.period.label}${yoy(pat) ? ` (${yoy(pat)} YoY)` : ""}` },
    ratio("roce") != null && { v: `${num(ratio("roce")!, 1)}%`, l: "ROCE" },
  ].filter((x): x is { v: string; l: string } => !!x);
  const nextChecks = view.next;

  return (
    <main className="mx-auto flex max-w-[940px] flex-col gap-10 px-4 py-8 sm:px-5">
      <section className="flex flex-col gap-3.5 pb-6" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">
            Insight report · {run.concall.month} concall · {run.extraction.call_period} results
          </div>
          {runs.length > 1 && (
            <nav aria-label="Concalls" className="flex flex-wrap gap-1.5">
              {runs.map((r) => (
                <Link
                  key={r.concall.yearMonth}
                  href={`?call=${r.concall.yearMonth}`}
                  className="btn btn-ghost btn-sm"
                  aria-current={r === run ? "page" : undefined}
                  style={r === run ? { background: "var(--muted-bg)", fontWeight: 600 } : undefined}
                >
                  {r.concall.month}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <p className="m-0 max-w-[68ch] text-[17px] leading-relaxed">{ins.summary}</p>
        <div className="num flex flex-wrap gap-x-4 gap-y-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
          <span>Saved {fmtDate(run.createdAt)}</span>
          <span>FY = Apr–Mar · ₹ in crore · {c.basis}</span>
          <a href={run.docs.transcriptUrl} target="_blank" rel="noreferrer">Transcript</a>
          {run.docs.pptUrl && <a href={run.docs.pptUrl} target="_blank" rel="noreferrer">Presentation</a>}
        </div>
      </section>

      <section className="box flex flex-col gap-3 p-5">
        <div className="eyebrow">Management tone</div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="tag t-pending capitalize" style={{ fontSize: 13 }}>{ins.tone.label}</span>
          <blockquote className="m-0 text-[15px] italic leading-relaxed" style={{ color: "var(--ink-2)" }}>
            “{ins.tone.quote}” {ins.tone.page && <a className="src not-italic" href={pdf(ins.tone.page)} target="_blank" rel="noreferrer">p.{ins.tone.page}</a>}
          </blockquote>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="h2">Key numbers</h2>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {stats.map((x) => (
              <div key={x.l} className="rounded-lg p-3" style={{ background: "#F4F6F9" }}>
                <b className="num block text-lg font-medium">{x.v}</b>
                <small className="text-xs" style={{ color: "var(--ink-3)" }}>{x.l}</small>
              </div>
            ))}
          </div>
          <p className="sub m-0">
            Not live: price, market cap and P/E are as of {fmtDate(c.snapshotFetchedAt)}, when Screener was last read. Results are the latest reported.
          </p>
        </section>
      )}

      {ins.what_changed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="h2">What changed</h2>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {ins.what_changed.map((w, i) => (
              <li key={i} className="flex items-baseline gap-3 text-[15px] leading-normal">
                <span className={`tag ${CHANGE_TAG[w.change] ?? "t-pending"} capitalize`} style={{ minWidth: 78, textAlign: "center" }}>{w.change}</span>
                <span>
                  {w.text} {w.page && <a className="src" href={pdf(w.page)} target="_blank" rel="noreferrer">p.{w.page}</a>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="h2">The business</h2>
        <div className="box scroll-x">
          <table className="tbl" style={{ minWidth: 480 }}>
            <tbody>
              {[
                ["What they make", ins.business_snapshot.what_they_make],
                ["Customers", ins.business_snapshot.customers],
                ["Revenue mix", ins.business_snapshot.revenue_mix],
                ["Demand drivers", ins.business_snapshot.demand_drivers],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: "var(--ink-3)", width: "28%" }}>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ins.analyst_questions.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="h2">What analysts pushed on</h2>
          <div className="flex flex-col gap-3">
            {ins.analyst_questions.map((q, i) => (
              <div key={i} className="flex flex-col gap-1 pl-4" style={{ borderLeft: "2px solid var(--line-strong)" }}>
                <div className="font-semibold">{q.topic}</div>
                <div className="text-[15px] leading-normal" style={{ color: "var(--ink-2)" }}>
                  {q.answer} {q.page && <a className="src" href={pdf(q.page)} target="_blank" rel="noreferrer">p.{q.page}</a>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="flags" className="box flex flex-col gap-3 p-5" style={{ borderTop: "4px solid var(--bad)" }}>
        <div className="eyebrow" style={{ color: "var(--bad)" }}>Red flags</div>
        {ins.red_flags.length ? (
          <ul className="m-0 flex flex-col gap-2 pl-5 text-[15px] leading-normal">
            {ins.red_flags.map((f, i) => (
              <li key={i}>
                {f.text} {f.page && <a className="src" href={pdf(f.page)} target="_blank" rel="noreferrer">p.{f.page}</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm" style={{ color: "var(--ink-3)" }}>None noted in this call.</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">What to check{view.tracker.nextPeriod ? ` in ${view.tracker.nextPeriod.label} results` : " next"}</h2>
          <Link href={`/c/${c.symbol}/tracker`} className="text-sm">Expected numbers in the tracker</Link>
        </div>
        <div className="box flex flex-col gap-2.5 p-5 text-[15px] leading-normal">
          {nextChecks.map(({ item, cell }) => (
            <div key={`${item.id}-${cell.check.period.label}`}>
              {item.tracked.guidance.metric_label}: <b className="num">{fmtRange(cell.check.expected)}</b>
              {cell.check.base && (
                <span className="sub"> (on {cell.check.base.period.label}: ₹{num(cell.check.base.value)} Cr)</span>
              )}
            </div>
          ))}
          {ins.watch_next.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
