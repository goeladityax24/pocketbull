"use client";

import Link from "next/link";
import { useState } from "react";
import { RequestForm } from "@/components/RequestForm";
import { matchesCompany } from "@/lib/app/search";

export type CompanyRow = {
  symbol: string;
  name: string;
  latest: string | null;
  scored: number;
  kept: number;
  exceeded: number;
  met: number;
  missed: number;
  status: "requested" | "newer" | "current";
  newerMonth: string | null;
  lastRun: string | null;
};

export function CompanySearch({ rows, request }: { rows: CompanyRow[]; request?: string }) {
  const [query, setQuery] = useState(request ?? "");
  const [asking, setAsking] = useState(Boolean(request));
  const shown = rows.filter((r) => matchesCompany(r, query));
  const q = query.trim();

  return (
    <>
      <section className="box flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[28px] font-bold tracking-tight">Which company are we looking at?</h1>
          <p className="m-0 text-[15px]" style={{ color: "var(--ink-3)" }}>
            Search the companies we follow by name or NSE symbol. Saved companies open instantly.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-search" className="label">Company name or symbol</label>
          <input
            id="company-search"
            type="search"
            className="input"
            style={{ minHeight: 48 }}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAsking(false);
            }}
            placeholder="e.g. Sky Gold, SKYGOLD, gold"
            autoComplete="off"
          />
        </div>
        {q && shown.length === 0 && (
          <div className="flex flex-col gap-3">
            <p role="status" className="m-0 text-sm" style={{ color: "var(--ink-3)" }}>
              No saved company matches “{q}”.{asking ? "" : " Ask the Admin to add it."}
            </p>
            {asking ? (
              <RequestForm initial={q} />
            ) : (
              <div>
                <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => setAsking(true)}>
                  Request analysis
                </button>
              </div>
            )}
          </div>
        )}
        {asking && shown.length > 0 && <RequestForm initial={q} />}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">Saved companies</h2>
          <span className="sub">{q ? `${shown.length} of ${rows.length}` : "Shared across the group"}</span>
        </div>
        {rows.length === 0 ? (
          <div className="box p-6 text-sm" style={{ color: "var(--ink-3)" }}>
            No companies yet.
          </div>
        ) : shown.length === 0 ? null : (
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
                {shown.map((r) => (
                  <tr key={r.symbol}>
                    <td>
                      <Link href={`/c/${r.symbol}`} className="font-semibold no-underline" style={{ color: "var(--ink)" }}>
                        {r.name}
                      </Link>
                      <div className="sub num">{r.symbol}</div>
                    </td>
                    <td>{r.latest ?? "—"}</td>
                    <td>
                      {r.scored ? (
                        <>
                          <span className="num font-semibold">{r.kept} of {r.scored}</span> <span className="sub">kept</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.exceeded > 0 && <span className="tag t-exceeded">{r.exceeded} beaten</span>}
                            {r.met > 0 && <span className="tag t-met">{r.met} met</span>}
                            {r.missed > 0 && <span className="tag t-missed">{r.missed} missed</span>}
                          </div>
                        </>
                      ) : (
                        <span className="sub">Nothing reported to score yet</span>
                      )}
                    </td>
                    <td>
                      {r.status === "requested" ? (
                        <span className="tag t-pending">Refresh requested</span>
                      ) : r.status === "newer" ? (
                        <span className="tag t-warn">New concall: {r.newerMonth}</span>
                      ) : (
                        <span className="tag t-met">Up to date</span>
                      )}
                    </td>
                    <td className="sub">{r.lastRun ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
