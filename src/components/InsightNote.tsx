import { NoteBlocks } from "@/components/NoteBlocks";
import { fmtDate, num } from "@/lib/app/format";
import type { ResearchNote } from "@/lib/pipeline/note";

/** The six-section insight report, followed by whatever the page adds (concall takeaways). */
export function InsightNote({ note, basis, children }: { note: ResearchNote; basis: string; children?: React.ReactNode }) {
  const m = note.market;
  const strip = [
    m.price != null && `₹${num(m.price, 0)}`,
    m.mcap_cr != null && `Mcap ₹${num(m.mcap_cr, 0)} Cr`,
    m.pe != null && `P/E ${num(m.pe, 1)}x`,
    m.pb != null && `P/B ${num(m.pb, 1)}x`,
    m.ev_ebitda != null && `EV/EBITDA ~${num(m.ev_ebitda, 0)}x`,
  ].filter(Boolean);

  return (
    <main className="mx-auto flex max-w-[940px] flex-col gap-11 px-4 py-8 sm:px-5">
      <header className="flex flex-col gap-3.5 pb-6" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="eyebrow">Insight report · {note.descriptor} · {fmtDate(note.as_of)}</div>
        <p className="m-0 max-w-[66ch] text-[17.5px] leading-relaxed">{note.lede}</p>
        <div className="num flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
          <span>{strip.join(" · ")}</span>
          <span>Prices as of {fmtDate(note.as_of)} · {basis} · ₹ in crore</span>
        </div>
      </header>

      <section className="box flex flex-col gap-3 p-5">
        <div className="eyebrow">The short version</div>
        <ul className="m-0 flex max-w-[76ch] flex-col gap-2.5 pl-5 leading-relaxed">
          {note.short_version.map((s) => (
            <li key={s.lead}>
              <strong>{s.lead}:</strong> {s.text}
            </li>
          ))}
        </ul>
      </section>

      {note.sections.map((s, i) => (
        <section key={s.id} id={s.id} className="flex flex-col gap-4">
          <h2 className="m-0 flex items-baseline gap-3 text-[22px] font-bold">
            <span className="num text-[13px] font-medium" style={{ color: "var(--ink-3)" }}>
              {i + 1}
            </span>
            {s.title}
          </h2>
          <NoteBlocks blocks={s.blocks} />
        </section>
      ))}

      {note.watch.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="eyebrow">What to check next</div>
          <div className="box grid gap-x-6 gap-y-2.5 px-5 py-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {note.watch.map((w) => (
              <div key={w} className="flex gap-2.5 text-[14.5px]">
                <span className="num" style={{ color: "var(--brand)" }}>→</span>
                {w}
              </div>
            ))}
          </div>
        </section>
      )}

      {children}

      <footer className="flex flex-col gap-2 pt-4 text-[13px]" style={{ borderTop: "1px solid var(--line)", color: "var(--ink-3)" }}>
        <div>Sources: {note.sources.join("; ")}.</div>
        <div>For research within the group only. Not investment advice.</div>
      </footer>
    </main>
  );
}
