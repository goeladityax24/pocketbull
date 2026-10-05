import Link from "next/link";
import { RequestForm } from "@/components/RequestForm";
import { fmtDate } from "@/lib/app/format";
import { getSettings, listBundles, listRequests } from "@/lib/app/repo";
import { buildTrackerView } from "@/lib/app/view";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { request } = await searchParams;
  const [bundles, requests, settings] = await Promise.all([listBundles(), listRequests("open"), getSettings()]);

  const rows = bundles.map((b) => {
    const view = buildTrackerView(b.company.snapshot, b.runs, b.overrides, { tolerancePct: settings.tolerancePct });
    const latest = [...b.runs].sort((a, z) => z.concall.yearMonth.localeCompare(a.concall.yearMonth))[0];
    const savedMonths = new Set(b.runs.map((r) => r.concall.yearMonth));
    const newer = b.company.snapshot.concalls.find((c) => c.transcriptUrl && latest && c.yearMonth > latest.concall.yearMonth && !savedMonths.has(c.yearMonth));
    const requested = requests.some((r) => r.symbol === b.company.symbol);
    return { b, view, latest, newer, requested };
  });

  return (
    <main className="wrap flex flex-col gap-8 py-10">
      <section className="box flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[28px] font-bold tracking-tight">Which company are we looking at?</h1>
          <p className="m-0 text-[15px]" style={{ color: "var(--ink-3)" }}>
            Saved companies below open instantly and never use a request. For a new company, or a new concall, request an analysis: the Admin runs it and it appears here.
          </p>
        </div>
        <RequestForm initial={typeof request === "string" ? request : ""} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">Saved companies</h2>
          <span className="sub">Shared across the group</span>
        </div>
        {rows.length === 0 ? (
          <div className="box p-6 text-sm" style={{ color: "var(--ink-3)" }}>
            No companies yet. Request one above.
          </div>
        ) : (
          <div className="box scroll-x">
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Latest concall analysed</th>
                  <th>Promises kept</th>
                  <th>Status</th>
                  <th>Last run</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ b, view, latest, newer, requested }) => (
                  <tr key={b.company.symbol}>
                    <td>
                      <Link href={`/c/${b.company.symbol}`} className="font-semibold no-underline" style={{ color: "var(--ink)" }}>
                        {b.company.name}
                      </Link>
                      <div className="sub num">{b.company.symbol}</div>
                    </td>
                    <td>{latest ? `${latest.extraction.call_period} · ${latest.concall.month}` : "—"}</td>
                    <td>
                      {view.totals.scored ? (
                        <>
                          <span className="num font-semibold">{view.totals.kept} of {view.totals.scored}</span> <span className="sub">kept</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {view.totals.exceeded > 0 && <span className="tag t-exceeded">{view.totals.exceeded} beaten</span>}
                            {view.totals.met > 0 && <span className="tag t-met">{view.totals.met} met</span>}
                            {view.totals.missed > 0 && <span className="tag t-missed">{view.totals.missed} missed</span>}
                          </div>
                        </>
                      ) : (
                        <span className="sub">Nothing reported to score yet</span>
                      )}
                    </td>
                    <td>
                      {requested ? (
                        <span className="tag t-pending">Refresh requested</span>
                      ) : newer ? (
                        <span className="tag t-warn">New concall: {newer.month}</span>
                      ) : (
                        <span className="tag t-met">Up to date</span>
                      )}
                    </td>
                    <td className="sub">{latest ? `${latest.createdBy?.startsWith("stand-in") ? "Claude" : (latest.createdBy ?? "—")} · ${fmtDate(latest.createdAt, false)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sub m-0">A request is a first analysis of a company, or a refresh after a new concall. Saved companies never need one.</p>
      </section>

      {requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="h2">In the queue</h2>
          <div className="box scroll-x">
            <table className="tbl" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Requested by</th>
                  <th>When</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="num font-semibold">
                      {r.symbol}
                      {r.issueUrl && (
                        <>
                          {" "}
                          <a href={r.issueUrl} className="src">#{r.issueNumber}</a>
                        </>
                      )}
                    </td>
                    <td>{r.requestedBy}</td>
                    <td className="sub">{fmtDate(r.createdAt)}</td>
                    <td className="sub">{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
