import { DeleteButton, LinkForm, NoteForm } from "@/components/ResearchForms";
import { fmtDate } from "@/lib/app/format";
import { loadCompany } from "../data";

export const metadata = { title: "Research" };

const KIND_TAG: Record<string, string> = { report: "t-exceeded", news: "t-pending", video: "t-warn", other: "t-pending" };

export default async function ResearchPage({ params }: PageProps<"/c/[symbol]/research">) {
  const { symbol } = await params;
  const { me, bundle, view } = await loadCompany(symbol);
  const c = bundle.company;
  const editor = me.isAdmin && !me.demo;
  const promises = view.live.map((i) => ({ id: i.id, label: `${i.tracked.guidance.metric_label}${i.tracked.guidance.period ? ` · ${i.tracked.guidance.period}` : ""}` }));
  const promiseLabel = new Map(promises.map((p) => [p.id, p.label]));

  return (
    <main className="wrap flex flex-wrap items-start gap-6 py-6">
      {bundle.notes && (
        <section className="box flex min-w-0 flex-[3_1_560px] flex-col gap-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-lg font-semibold">Notes</h2>
            <span className="tag t-pending">Visible to the Admin only</span>
          </div>
          {editor && <NoteForm symbol={c.symbol} promises={promises} />}
          {bundle.notes.length === 0 && <p className="sub m-0">No notes yet.</p>}
          {bundle.notes.map((n) => (
            <article key={n.id} className="flex flex-col gap-1.5 rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
              <div className="sub flex flex-wrap items-center gap-x-2">
                <b style={{ color: "var(--ink)" }}>{n.authorName}</b>
                <span>· {fmtDate(n.createdAt)}</span>
                <span>· {n.guidanceId ? `about ${promiseLabel.get(n.guidanceId) ?? "a promise"}` : "whole company"}</span>
                {editor && (
                  <span className="ml-auto"><DeleteButton symbol={c.symbol} kind="note" id={n.id} /></span>
                )}
              </div>
              <div className="whitespace-pre-wrap text-[14.5px] leading-normal">{n.body}</div>
            </article>
          ))}
        </section>
      )}

      <section className="box flex min-w-0 flex-[2_1_340px] flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">Supporting links</h2>
          <span className="sub">Everyone can read</span>
        </div>
        {editor && <LinkForm symbol={c.symbol} />}
        {bundle.links.length === 0 && <p className="sub m-0">No links yet.</p>}
        <div className="flex flex-col">
          {bundle.links.map((l) => (
            <div key={l.id} className="flex items-start gap-3 py-3" style={{ borderTop: "1px solid var(--line)" }}>
              <span className={`tag ${KIND_TAG[l.kind]} capitalize`}>{l.kind}</span>
              <div className="min-w-0 flex-1">
                <a href={l.url} target="_blank" rel="noreferrer" className="break-words">{l.title || l.url}</a>
                <div className="sub">Added by {l.addedByName} · {fmtDate(l.createdAt, false)}</div>
              </div>
              {editor && <DeleteButton symbol={c.symbol} kind="link" id={l.id} />}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
