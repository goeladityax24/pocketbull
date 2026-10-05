import type { NoteBlock, NoteCell } from "@/lib/pipeline/note";

const TAG_CLASS: Record<string, string> = {
  kept: "t-met",
  ahead: "t-exceeded",
  partial: "t-warn",
  pending: "t-pending",
  missed: "t-missed",
  neutral: "t-not_comparable",
};

function Src({ src }: { src?: string | null }) {
  return src ? <span className="src ml-1">{src}</span> : null;
}

function Cell({ cell }: { cell: NoteCell }) {
  if (typeof cell === "string") return <>{cell}</>;
  return <span className={`tag ${TAG_CLASS[cell.tag] ?? "t-pending"}`}>{cell.text}</span>;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-IN") : String(Math.round(n * 10) / 10));

/** Bars on one scale; a second series sits beside the first, negatives hang below the axis. */
function Bars({ block }: { block: Extract<NoteBlock, { type: "bars" }> }) {
  const W = 340;
  const H = 180;
  const pad = { l: 12, r: 12, t: 22, b: 30 };
  const all = block.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const plotH = H - pad.t - pad.b - 14; // room for labels below negative bars
  const y0 = pad.t + (max / span) * plotH;
  const n = block.labels.length;
  const slot = (W - pad.l - pad.r) / n;
  const k = block.series.length;
  const bw = Math.min(34, (slot * 0.7) / k);
  const colors = ["var(--chart-1)", "var(--chart-2)"];

  return (
    <figure className="box m-0 flex min-w-0 flex-col gap-2 p-4">
      <div className="eyebrow">{block.title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${block.title}: ${block.labels.map((l, i) => `${l} ${block.series.map((s) => `${s.name} ${s.values[i] ?? "n/a"}`).join(", ")}`).join("; ")}`}>
        <line x1={pad.l} x2={W - pad.r} y1={y0} y2={y0} stroke="var(--line-strong)" />
        {block.labels.map((label, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={label}>
              {block.series.map((s, j) => {
                const v = s.values[i];
                if (v == null) return null;
                const h = (Math.abs(v) / span) * plotH;
                const x = cx - (bw * k) / 2 + j * bw + 1;
                const y = v >= 0 ? y0 - h : y0;
                const neg = v < 0;
                return (
                  <g key={s.name}>
                    <rect x={x} y={y} width={bw - 2} height={Math.max(h, 0.5)} fill={neg ? "var(--chart-neg)" : colors[j]} />
                    <text x={x + (bw - 2) / 2} y={neg ? y + h + 11 : y - 4} textAnchor="middle" className="chart-val">
                      {fmt(v)}
                    </text>
                  </g>
                );
              })}
              <text x={cx} y={H - 6} textAnchor="middle" className="chart-label">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {(block.caption || k > 1) && (
        <figcaption className="sub">
          {k > 1 &&
            block.series.map((s, j) => (
              <span key={s.name} className="mr-3">
                <span style={{ color: colors[j] }}>■</span> {s.name}
              </span>
            ))}
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function NoteBlocks({ blocks }: { blocks: NoteBlock[] }) {
  // Consecutive charts sit side by side
  const groups: NoteBlock[][] = [];
  for (const b of blocks) {
    const last = groups.at(-1);
    if (b.type === "bars" && last?.[0].type === "bars") last.push(b);
    else if (b.type === "bullets" && b.title && last?.[0].type === "bullets" && (last[0] as { title?: string | null }).title) last.push(b);
    else groups.push([b]);
  }

  return (
    <>
      {groups.map((group, gi) => {
        const b = group[0];
        if (b.type === "bars") {
          return (
            <div key={gi} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {group.map((g, i) => (
                <Bars key={i} block={g as Extract<NoteBlock, { type: "bars" }>} />
              ))}
            </div>
          );
        }
        if (b.type === "bullets" && b.title) {
          return (
            <div key={gi} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {group.map((g, i) => {
                const list = g as Extract<NoteBlock, { type: "bullets" }>;
                return (
                  <div key={i} className="box flex min-w-0 flex-col gap-2.5 p-5">
                    <h3 className="m-0 text-[15.5px] font-semibold">{list.title}</h3>
                    <ul className="m-0 flex flex-col gap-2 pl-5 text-[14.5px] leading-normal">
                      {list.items.map((it, j) => (
                        <li key={j}>
                          {it.lead && <strong>{it.lead} </strong>}
                          {it.text}
                          <Src src={it.src} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        }
        switch (b.type) {
          case "text":
            return (
              <p key={gi} className="m-0 max-w-[68ch] leading-relaxed">
                {b.text}
                <Src src={b.src} />
              </p>
            );
          case "bullets":
            return (
              <ul key={gi} className="m-0 flex max-w-[72ch] flex-col gap-2.5 pl-5 leading-relaxed">
                {b.items.map((it, j) => (
                  <li key={j}>
                    {it.lead && <strong>{it.lead} </strong>}
                    {it.text}
                    <Src src={it.src} />
                  </li>
                ))}
              </ul>
            );
          case "tiles":
            return (
              <div key={gi} className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                {b.items.map((t) => (
                  <div key={t.label} className="flex flex-col gap-0.5 rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                    <b className="num text-lg font-medium">{t.value}</b>
                    <small className="text-[12.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
                      {t.label}
                    </small>
                  </div>
                ))}
              </div>
            );
          case "table":
            return (
              <div key={gi} className="flex flex-col gap-2">
                {b.title && <div className="eyebrow">{b.title}</div>}
                <div className="box scroll-x">
                  <table className="tbl" style={{ minWidth: Math.max(480, b.columns.length * 110) }}>
                    <thead>
                      <tr>
                        {b.columns.map((c) => (
                          <th key={c.label} style={c.numeric ? { textAlign: "right" } : undefined}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r, ri) => (
                        <tr key={ri} style={r.highlight ? { background: "var(--brand-bg)" } : undefined}>
                          {r.cells.map((c, ci) => (
                            <td
                              key={ci}
                              className={b.columns[ci]?.numeric ? "num" : undefined}
                              style={b.columns[ci]?.numeric ? { textAlign: "right", whiteSpace: "nowrap" } : r.highlight && ci === 0 ? { fontWeight: 600 } : undefined}
                            >
                              <Cell cell={c} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {b.note && <p className="sub m-0">{b.note}</p>}
              </div>
            );
          case "scenarios":
            return (
              <div key={gi} className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {b.items.map((s) => (
                  <div
                    key={s.name}
                    className="box flex min-w-0 flex-col gap-2 p-4"
                    style={{ borderTop: `3px solid ${s.name === "Bull" ? "var(--brand)" : s.name === "Bear" ? "var(--bad)" : "var(--ink-3)"}` }}
                  >
                    <div className="eyebrow">{s.name}</div>
                    <b className="num text-[22px] font-medium">{s.value}</b>
                    <div className="sub">{s.sub}</div>
                    <p className="m-0 text-sm leading-normal">{s.text}</p>
                  </div>
                ))}
              </div>
            );
        }
      })}
    </>
  );
}
