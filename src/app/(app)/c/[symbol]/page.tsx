import Link from "next/link";
import { fmtDate, fmtRange } from "@/lib/app/format";
import { listRequests } from "@/lib/app/repo";
import { loadCompany } from "./data";

function Icon({ d, tone = "brand" }: { d: string[]; tone?: "brand" | "warn" | "grey" }) {
  const color = tone === "warn" ? "var(--warn)" : tone === "grey" ? "var(--ink-2)" : "var(--brand)";
  const bg = tone === "warn" ? "var(--warn-bg)" : tone === "grey" ? "var(--grey-bg)" : "#EEF6F2";
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: bg }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {d.map((p) => <path key={p} d={p} />)}
      </svg>
    </div>
  );
}

export default async function CompanyOverview({ params }: PageProps<"/c/[symbol]">) {
  const { symbol } = await params;
  const { me, bundle, view, latest, runs } = await loadCompany(symbol);
  const c = bundle.company;
  const base = `/c/${c.symbol}`;
  const saved = new Set(runs.map((r) => r.concall.yearMonth));
  const newer = c.snapshot.concalls
    .filter((x) => x.transcriptUrl && !saved.has(x.yearMonth) && (!latest || x.yearMonth > latest.concall.yearMonth))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))[0];
  const requested = (await listRequests("open")).some((r) => r.symbol === c.symbol);
  const lastScore = [...view.scores].filter((s) => s.period.kind !== "year").at(-1);
  const nextRevenue = view.next.find((n) => n.item.tracked.guidance.metric === "revenue");
  const flags = latest?.extraction.insights.red_flags.length ?? 0;

  return (
    <main className="wrap flex flex-col gap-6 py-7">
      <section className="box flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          {newer ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-0.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5"><path d="M20 6L9 17l-5-5" /></svg>
          )}
          <div className="flex flex-col gap-0.5">
            <div className="font-semibold">
              {newer ? `A newer concall is on Screener: ${newer.month}` : latest ? "Saved analysis is up to date" : "Not analysed yet"}
            </div>
            <div className="text-sm" style={{ color: "var(--ink-3)" }}>
              {latest
                ? `Based on the ${latest.extraction.call_period} concall (${latest.concall.month})${latest.docs.pptUrl ? " and investor presentation" : ""} · saved ${fmtDate(latest.createdAt)}`
                : "Request an analysis to see insights and the tracker."}
              {` · Screener numbers as of ${fmtDate(c.snapshotFetchedAt)}`}
            </div>
          </div>
        </div>
        {(newer || !latest) && (
          requested ? (
            <span className="tag t-pending">Refresh requested</span>
          ) : (
            <Link className="btn btn-primary" href={`/?request=${c.symbol}`}>Request refresh</Link>
          )
        )}
      </section>

      <section aria-label="Reports" className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        <Link className="card" href={`${base}/insights`}>
          <Icon d={["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"]} />
          <div className="text-[17px] font-semibold">Insight report</div>
          <div className="text-sm leading-normal" style={{ color: "var(--ink-3)" }}>
            {latest ? latest.extraction.insights.summary.split(/(?<=\.)\s/)[0] : "What changed, management tone, what analysts pushed on, and what to watch next."}
          </div>
          {latest && <div className="sub mt-auto">Tone: {latest.extraction.insights.tone.label} · {latest.concall.month} call</div>}
        </Link>

        <Link className="card" href={`${base}/tracker`}>
          <Icon d={["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z", "M12 11.5v1"]} />
          <div className="text-[17px] font-semibold">Guidance tracker</div>
          <div className="text-sm leading-normal" style={{ color: "var(--ink-3)" }}>
            {view.live.length} promises from {runs.length} concall{runs.length === 1 ? "" : "s"}, checked against reported numbers.
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5">
            {lastScore && (
              <span className={`tag ${lastScore.missed ? "t-missed" : "t-met"}`}>
                {lastScore.period.label}: {lastScore.kept} of {lastScore.scored} kept
              </span>
            )}
            {view.totals.scored > 0 && <span className="tag t-met">Overall: {view.totals.kept} of {view.totals.scored}</span>}
            {nextRevenue && (
              <span className="tag t-pending">
                Next: revenue {fmtRange(nextRevenue.cell.check.expected)}
              </span>
            )}
          </div>
        </Link>

        <Link className="card" href={`${base}/insights#flags`}>
          <Icon tone="warn" d={["M4 22V4", "M4 4h12l-2 4 2 4H4"]} />
          <div className="text-[17px] font-semibold">Red flags</div>
          <div className="text-sm leading-normal" style={{ color: "var(--ink-3)" }}>Concerns visible in the call or presentation.</div>
          <div className="mt-auto text-xs font-semibold" style={{ color: flags ? "var(--warn)" : "var(--ink-3)" }}>
            {flags ? `${flags} item${flags === 1 ? "" : "s"} to look at` : "None noted"}
          </div>
        </Link>

        <Link className="card" href={`${base}/research`}>
          <Icon d={me.isAdmin ? ["M4 4h16v16H4z", "M8 9h8", "M8 13h8", "M8 17h5"] : ["M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1", "M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"]} />
          <div className="text-[17px] font-semibold">{me.isAdmin ? "Research space" : "Research links"}</div>
          <div className="text-sm leading-normal" style={{ color: "var(--ink-3)" }}>
            {me.isAdmin ? "Shared notes and supporting links. Notes are visible to Editors and Admins only." : "Supporting links added by Editors."}
          </div>
          <div className="sub mt-auto">
            {me.isAdmin ? `${bundle.notes?.length ?? 0} notes · ` : ""}
            {bundle.links.length} links
          </div>
        </Link>

        <div className="card">
          <Icon tone="grey" d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6"]} />
          <div className="text-[17px] font-semibold">Source documents</div>
          <div className="flex flex-col gap-1.5 text-sm">
            {runs.map((r) => (
              <div key={r.concall.yearMonth} className="flex flex-wrap gap-x-3">
                <a href={r.docs.transcriptUrl} target="_blank" rel="noreferrer">Transcript · {r.concall.month}</a>
                {r.docs.pptUrl && <a href={r.docs.pptUrl} target="_blank" rel="noreferrer">Presentation</a>}
              </div>
            ))}
            <span style={{ color: "var(--ink-3)" }}>Numbers from Screener · {c.basis}</span>
          </div>
        </div>

        <div className="card" style={{ borderStyle: "dashed", background: "var(--surface-2)" }}>
          <Icon tone="grey" d={["M3 20h18", "M6 16V9", "M12 16V5", "M18 16v-4"]} />
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-semibold" style={{ color: "var(--ink-2)" }}>Peer view</span>
            <span className="tag t-pending">Later</span>
          </div>
          <div className="text-sm leading-normal" style={{ color: "var(--ink-3)" }}>Peers from Screener, curated by Editors, compared on sector-specific metrics.</div>
        </div>
      </section>
    </main>
  );
}
