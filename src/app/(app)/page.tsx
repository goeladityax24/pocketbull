import { type CompanyRow, CompanySearch } from "@/components/CompanySearch";
import { fmtDate } from "@/lib/app/format";
import { getSettings, listBundles, listRequests } from "@/lib/app/repo";
import { buildTrackerView } from "@/lib/app/view";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { request } = await searchParams;
  const [bundles, requests, settings] = await Promise.all([listBundles(), listRequests("open"), getSettings()]);

  const rows: CompanyRow[] = bundles.map((b) => {
    const view = buildTrackerView(b.company.snapshot, b.runs, b.overrides, { tolerancePct: settings.tolerancePct });
    const latest = [...b.runs].sort((a, z) => z.concall.yearMonth.localeCompare(a.concall.yearMonth))[0];
    const savedMonths = new Set(b.runs.map((r) => r.concall.yearMonth));
    const newer = b.company.snapshot.concalls.find((c) => c.transcriptUrl && latest && c.yearMonth > latest.concall.yearMonth && !savedMonths.has(c.yearMonth));
    const requested = requests.some((r) => r.symbol === b.company.symbol);
    const { scored, kept, exceeded, met, missed } = view.totals;
    return {
      symbol: b.company.symbol,
      name: b.company.name,
      latest: latest ? `${latest.extraction.call_period} · ${latest.concall.month}` : null,
      scored, kept, exceeded, met, missed,
      status: requested ? "requested" : newer ? "newer" : "current",
      newerMonth: newer?.month ?? null,
      lastRun: latest ? `${latest.createdBy?.startsWith("stand-in") ? "Claude" : (latest.createdBy ?? "—")} · ${fmtDate(latest.createdAt, false)}` : null,
    };
  });

  return (
    <main className="wrap flex flex-col gap-8 py-10">
      <CompanySearch rows={rows} request={typeof request === "string" ? request : undefined} />

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
