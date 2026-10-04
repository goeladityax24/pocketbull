import Link from "next/link";
import { EditGuidance } from "@/components/EditGuidance";
import { TagControl } from "@/components/TagControl";
import { fmtActual, fmtRange, num, periodSpan, said, TAG_LABEL } from "@/lib/app/format";
import { buildResultsGrid } from "@/lib/app/results";
import type { CellView, ItemView } from "@/lib/app/view";
import { loadCompany } from "../data";

export const metadata = { title: "Guidance tracker" };

function Source({ item, transcript }: { item: ItemView; transcript: string }) {
  const g = item.tracked.guidance;
  const q = item.tracked.quoteCheck;
  return (
    <span className="flex flex-wrap gap-1.5">
      <a className="src" href={g.page ? `${transcript}#page=${g.page}` : transcript} target="_blank" rel="noreferrer">
        {item.tracked.source.month} call{g.page ? ` · p.${g.page}` : ""}
      </a>
      {q !== "verified" && <span className="src" title="Quote check against the transcript">quote {q.replace("_", " ")}</span>}
      {item.edited && <span className="src">edited</span>}
    </span>
  );
}

export default async function TrackerPage({ params, searchParams }: PageProps<"/c/[symbol]/tracker">) {
  const { symbol } = await params;
  const { view: mode } = await searchParams;
  const { me, bundle, view, settings } = await loadCompany(symbol);
  const c = bundle.company;
  const byYear = mode === "year";
  const transcripts = new Map(bundle.runs.map((r) => [r.concall.month, r.docs.transcriptUrl]));
  const tx = (item: ItemView) => transcripts.get(item.tracked.source.month) ?? c.screenerUrl;
  const next = view.tracker.nextPeriod;
  const interimScores = view.scores.filter((s) => s.period.kind !== "year");
  const latestScore = interimScores.at(-1);
  const prevScore = interimScores.at(-2);
  const editor = me.isAdmin && !me.demo;
  const results = buildResultsGrid(c.snapshot, view, { tolerancePct: settings.tolerancePct });

  const tagCell = (item: ItemView, cell: CellView) => (
    <TagControl
      symbol={c.symbol}
      guidanceId={item.id}
      periodLabel={cell.check.period.label}
      tag={cell.tag}
      label={TAG_LABEL[cell.tag]}
      override={cell.override}
      computedLabel={cell.override ? TAG_LABEL[cell.check.tag] : null}
      isAdmin={me.isAdmin}
      readOnly={!editor || cell.check.tag === "expected"}
    />
  );

  const handNext = next ? view.byHand.filter((i) => i.tracked.guidance.period === next.label) : [];

  return (
    <main className="wrap flex flex-col gap-8 py-7">
      <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {[
          latestScore && { e: `Latest · ${latestScore.period.label}`, n: `${latestScore.kept} of ${latestScore.scored} kept`, s: latestScore.missed ? `${latestScore.missed} missed` : "Nothing missed" },
          prevScore && { e: `Previous · ${prevScore.period.label}`, n: `${prevScore.kept} of ${prevScore.scored} kept`, s: prevScore.missed ? `${prevScore.missed} missed` : "Nothing missed" },
          { e: "All checked so far", n: view.totals.scored ? `${view.totals.kept} of ${view.totals.scored} kept` : "—", s: `${view.live.length} live promises · ${view.byHand.length} checked by hand` },
          next && { e: `Next results · ${next.label}`, n: periodSpan(next.endDate, next.kind), s: `${view.next.length} expected number${view.next.length === 1 ? "" : "s"} to check` },
        ]
          .filter((x): x is { e: string; n: string; s: string } => !!x)
          .map((x) => (
            <div key={x.e} className="box flex flex-col gap-1.5 p-4">
              <div className="eyebrow">{x.e}</div>
              <div className="num text-xl font-medium">{x.n}</div>
              <div className="sub">{x.s}</div>
            </div>
          ))}
      </section>

      {results.periods.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="h2">Revenue, EBITDA and PAT</h2>
            <p className="sub m-0">
              Reported numbers from Screener ({c.basis}), and what guidance implies for each. EBITDA and PAT come from guidance on them directly, or a guided margin on revenue.
            </p>
          </div>
          <div className="box scroll-x">
            <table className="tbl" style={{ minWidth: 160 + results.periods.length * 170 }}>
              <thead>
                <tr>
                  <th>₹ Cr</th>
                  {results.periods.map((p) => (
                    <th key={p.label}>
                      {p.label}
                      <div style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-plex-sans)" }} className="sub">
                        {p.label === next?.label ? "next results" : periodSpan(p.endDate, p.kind)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row) => (
                  <tr key={row.metric}>
                    <td className="font-semibold">{row.label}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.period.label} style={cell.period.label === next?.label ? { background: "var(--surface-2)" } : undefined}>
                        {cell.actual != null ? (
                          <>
                            <div className="num font-semibold">₹{num(cell.actual)}</div>
                            <div className="sub num">
                              {[
                                cell.yoyPct != null && `${cell.yoyPct >= 0 ? "+" : ""}${num(cell.yoyPct, 0)}% YoY`,
                                cell.marginPct != null && `${num(cell.marginPct, 1)}% margin`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </>
                        ) : (
                          <div className="sub">Not reported yet</div>
                        )}
                        {cell.expected ? (
                          <div className="mt-1.5 flex flex-col items-start gap-0.5">
                            {cell.tag && <span className={`tag t-${cell.tag}`}>{TAG_LABEL[cell.tag]}</span>}
                            <span className="sub num">Expected {fmtRange(cell.expected)}</span>
                            <span className="sub">{cell.basis}</span>
                          </div>
                        ) : (
                          <div className="sub mt-1.5">Not guided</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {next && (
        <section className="box flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="eyebrow">Next results · {next.label} ({periodSpan(next.endDate, next.kind)})</div>
              <h2 className="h2">Numbers to check when results come out</h2>
            </div>
            <details className="text-sm">
              <summary className="btn btn-ghost btn-sm">How expected is worked out</summary>
              <p className="box m-0 mt-2 max-w-md p-3 text-[13px] leading-normal" style={{ color: "var(--ink-2)" }}>
                Expected = same period last year × (1 + guided growth), {c.basis} numbers. A range gives a range. An annual ₹ target becomes the growth it implies over last year, so every quarter gets an expected number.
              </p>
            </details>
          </div>
          <div className="scroll-x">
            <table className="tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Promise</th>
                  <th>What they said</th>
                  <th>Base</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {view.next.map(({ item, cell }) => (
                  <tr key={`${item.id}-${cell.check.period.label}`}>
                    <td className="font-semibold">{item.tracked.guidance.metric_label}</td>
                    <td>
                      {said(item.tracked.guidance)} {item.tracked.guidance.period && `for ${item.tracked.guidance.period}`}
                      <div className="mt-1"><Source item={item} transcript={tx(item)} /></div>
                      {cell.check.impliedGrowthPct && (
                        <div className="sub">
                          Implies {cell.check.impliedGrowthPct[0]}
                          {cell.check.impliedGrowthPct[1] !== cell.check.impliedGrowthPct[0] ? `–${cell.check.impliedGrowthPct[1]}` : ""}% growth over last year
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {cell.check.base ? `₹${num(cell.check.base.value)} Cr` : "—"}
                      {cell.check.base && <div className="sub">{cell.check.base.period.label}</div>}
                    </td>
                    <td>
                      <span className="num font-semibold">{fmtRange(cell.check.expected)}</span>
                      {cell.check.impliedInr && <div className="sub num">≈ {fmtRange(cell.check.impliedInr)}</div>}
                    </td>
                  </tr>
                ))}
                {handNext.map((item) => (
                  <tr key={item.id}>
                    <td className="font-semibold">{item.tracked.guidance.metric_label}</td>
                    <td colSpan={3}>
                      “{item.tracked.guidance.quote}”
                      <div className="mt-1"><Source item={item} transcript={tx(item)} /></div>
                    </td>
                  </tr>
                ))}
                {view.next.length + handNext.length === 0 && (
                  <tr>
                    <td colSpan={4} className="sub">No promise applies to {next.label} yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {view.fullYear.length > 0 && (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="label">Full-year targets</div>
              {view.fullYear.map(({ item, cell }) => (
                <div key={`${item.id}-${cell.check.period.label}`}>
                  {cell.check.period.label}: {item.tracked.guidance.metric_label} <b className="num">{fmtRange(cell.check.expected)}</b>
                  {item.tracked.ytd && (
                    <span className="sub">
                      {" "}· so far ({item.tracked.ytd.periods.join(", ")}): {item.tracked.ytd.growthPct}% growth, {item.tracked.ytd.status.replace("_", " ")}
                      {item.tracked.ytd.shareOfTarget != null && `, ${item.tracked.ytd.shareOfTarget}% of the target done`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Track record</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-lg" style={{ border: "1px solid var(--line-strong)" }}>
              <Link href="?view=quarter" className="px-3 py-2 text-sm no-underline" aria-current={!byYear ? "page" : undefined} style={{ background: !byYear ? "var(--ink)" : "var(--surface)", color: !byYear ? "#fff" : "var(--ink)" }}>
                By {c.snapshot.interim.granularity === "half" ? "half" : "quarter"}
              </Link>
              <Link href="?view=year" className="px-3 py-2 text-sm no-underline" aria-current={byYear ? "page" : undefined} style={{ background: byYear ? "var(--ink)" : "var(--surface)", color: byYear ? "#fff" : "var(--ink)" }}>
                By year
              </Link>
            </div>
            <details className="text-sm">
              <summary className="btn btn-ghost btn-sm">How tags work</summary>
              <p className="box m-0 mt-2 max-w-md p-3 text-[13px] leading-normal" style={{ color: "var(--ink-2)" }}>
                Met: actual inside the guided range, or within ±{settings.tolerancePct}% of a single-number target. Above it is Exceeded, below it is Missed. Whole-number Screener values get ±0.5 rounding slack. Anyone can change a tag with a reason; the change is logged and the Admin can revert it.
              </p>
            </details>
          </div>
        </div>

        {(() => {
          const cols = byYear ? view.yearColumns : view.interimColumns;
          const rows = view.numeric.filter((i) => i.cells.some((c) => cols.some((p) => p.label === c.check.period.label)));
          if (!rows.length) return <div className="box p-5 text-sm" style={{ color: "var(--ink-3)" }}>No numeric promise has a {byYear ? "full-year" : "quarterly"} check yet.</div>;
          return (
            <div className="box scroll-x">
              <table className="tbl" style={{ minWidth: 240 + cols.length * 200 }}>
                <thead>
                  <tr>
                    <th>Promise</th>
                    {cols.map((p) => (
                      <th key={p.label}>
                        {p.label}
                        <div style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-plex-sans)" }} className="sub">{periodSpan(p.endDate, p.kind)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td style={{ minWidth: 220 }}>
                        <div className="font-semibold">{item.tracked.guidance.metric_label}</div>
                        <div className="sub">{said(item.tracked.guidance)}{item.tracked.guidance.period ? ` · ${item.tracked.guidance.period}` : ""}</div>
                        <div className="mt-1"><Source item={item} transcript={tx(item)} /></div>
                      </td>
                      {cols.map((p) => {
                        const cell = item.cells.find((x) => x.check.period.label === p.label);
                        if (!cell) return <td key={p.label} className="sub">—</td>;
                        return (
                          <td key={p.label}>
                            {tagCell(item, cell)}
                            <div className="sub num mt-1">
                              {cell.check.actual != null ? `${fmtActual(cell.check)} vs ` : "Expect "}
                              {fmtRange(cell.check.expected)}
                            </div>
                            {cell.check.gap && cell.check.actual != null && <div className="sub">{cell.check.gap}</div>}
                            {cell.check.impliedGrowthPct && p.kind !== "year" && (
                              <div className="sub">{cell.check.impliedGrowthPct[0]}% growth implied by the {item.tracked.guidance.period} target</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="font-semibold">Kept</td>
                    {cols.map((p) => {
                      const s = view.scores.find((x) => x.period.label === p.label);
                      return <td key={p.label} className="num">{s ? `${s.kept} of ${s.scored}` : "—"}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="h2">Checked by hand</h2>
          <p className="sub m-0">Timelines, qualitative promises, and numbers Screener doesn&apos;t report (capex, debt, mix). Tag them when you can tell.</p>
        </div>
        <div className="box scroll-x">
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Promise</th>
                <th>What they said</th>
                <th>Tag</th>
              </tr>
            </thead>
            <tbody>
              {view.byHand.map((item) => {
                const g = item.tracked.guidance;
                const tag = item.overall?.tag ?? "pending";
                return (
                  <tr key={item.id}>
                    <td style={{ minWidth: 200 }}>
                      <div className="font-semibold">{g.metric_label}</div>
                      <div className="sub">
                        {[said(g), g.period ?? g.horizon_text, item.tracked.note].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td>
                      <div className="text-[13.5px] leading-normal">“{g.quote}”</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Source item={item} transcript={tx(item)} />
                        {g.condition && <span className="sub">Condition: {g.condition}</span>}
                        {g.revises && <span className="sub">{g.revises}</span>}
                      </div>
                      {editor && <div className="mt-2"><EditGuidance symbol={c.symbol} guidanceId={item.id} item={g} edited={item.edited} /></div>}
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <TagControl
                        symbol={c.symbol}
                        guidanceId={item.id}
                        periodLabel="overall"
                        tag={tag}
                        label={item.overall ? TAG_LABEL[item.overall.tag] : "Not tagged"}
                        override={item.overall}
                        computedLabel={null}
                        isAdmin={me.isAdmin}
                        readOnly={!editor}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editor && view.numeric.length > 0 && (
        <details className="box p-5">
          <summary className="font-semibold">Edit numeric promises</summary>
          <div className="mt-4 flex flex-col gap-4">
            {view.numeric.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
                <div>
                  <b>{item.tracked.guidance.metric_label}</b> <span className="sub">{said(item.tracked.guidance)} · {item.tracked.guidance.period}</span>
                </div>
                <div className="text-[13.5px]">“{item.tracked.guidance.quote}”</div>
                <EditGuidance symbol={c.symbol} guidanceId={item.id} item={item.tracked.guidance} edited={item.edited} />
              </div>
            ))}
          </div>
        </details>
      )}

      {view.superseded.length > 0 && (
        <details className="box p-5">
          <summary className="font-semibold">Earlier versions ({view.superseded.length})</summary>
          <p className="sub">Promises a later call restated. The newer version is the one tracked.</p>
          <ul className="m-0 flex flex-col gap-2 pl-5 text-sm">
            {view.superseded.map((item) => (
              <li key={item.id}>
                <b>{item.tracked.guidance.metric_label}</b> {said(item.tracked.guidance)} · {item.tracked.source.month} call · “{item.tracked.guidance.quote.slice(0, 140)}
                {item.tracked.guidance.quote.length > 140 ? "…" : ""}”
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="sub m-0">
        {editor
          ? "You can correct a promise's numbers and period, and change any tag with a reason. The original quote and every change are kept."
          : "Tags are set from reported numbers; the Admin can change one with a reason, shown here."}
      </p>
    </main>
  );
}
