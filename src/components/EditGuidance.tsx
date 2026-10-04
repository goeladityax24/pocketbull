"use client";

import { useState, useTransition } from "react";
import { editGuidance, resetGuidance } from "@/app/actions";
import type { GuidanceItem } from "@/lib/pipeline/guidance";

const KINDS: GuidanceItem["kind"][] = ["growth_yoy", "absolute", "margin_pct", "date", "qualitative"];
const KIND_LABEL: Record<GuidanceItem["kind"], string> = {
  growth_yoy: "Growth % (year on year)",
  absolute: "Amount (₹ Cr)",
  margin_pct: "Margin or share %",
  date: "Timeline",
  qualitative: "Qualitative",
};
const METRICS: GuidanceItem["metric"][] = ["revenue", "ebitda", "ebitda_margin", "pat", "pat_margin", "eps", "capex", "net_debt", "order_book", "other"];

export function EditGuidance({ symbol, guidanceId, item, edited }: { symbol: string; guidanceId: string; item: GuidanceItem; edited: boolean }) {
  const [open, setOpen] = useState(false);
  const [g, setG] = useState(item);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const id = `g-${guidanceId}`;
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Edit promise</button>
        {edited && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await resetGuidance({ symbol, guidanceId })))}>
            Undo edits
          </button>
        )}
        {msg && <span role="status" className="text-xs" style={{ color: msg.ok ? "var(--brand)" : "var(--bad)" }}>{msg.message}</span>}
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-xl p-4"
      style={{ background: "var(--surface-2)", border: "1px solid var(--line)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      onSubmit={(e) => {
        e.preventDefault();
        const unit = g.kind === "absolute" ? "inr_cr" : g.kind === "growth_yoy" || g.kind === "margin_pct" ? "pct" : g.unit;
        start(async () => {
          const r = await editGuidance({ symbol, guidanceId, item: { ...g, unit, high: g.high ?? g.low } });
          setMsg(r);
          if (r.ok) setOpen(false);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor={`${id}-label`}>Name</label>
        <input id={`${id}-label`} className="input" value={g.metric_label} onChange={(e) => setG({ ...g, metric_label: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor={`${id}-metric`}>Checked against</label>
        <select id={`${id}-metric`} className="input" value={g.metric} onChange={(e) => setG({ ...g, metric: e.target.value as GuidanceItem["metric"] })}>
          {METRICS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor={`${id}-kind`}>Type</label>
        <select id={`${id}-kind`} className="input" value={g.kind} onChange={(e) => setG({ ...g, kind: e.target.value as GuidanceItem["kind"] })}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor={`${id}-period`}>Period (FY27, Q2 FY27, H1 FY27)</label>
        <input id={`${id}-period`} className="input" value={g.period ?? ""} onChange={(e) => setG({ ...g, period: e.target.value.trim() || null })} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor={`${id}-low`}>Low</label>
        <input id={`${id}-low`} className="input num" inputMode="decimal" value={g.low ?? ""} onChange={(e) => setG({ ...g, low: numOrNull(e.target.value) })} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor={`${id}-high`}>High (blank = same as low)</label>
        <input id={`${id}-high`} className="input num" inputMode="decimal" value={g.high ?? ""} onChange={(e) => setG({ ...g, high: numOrNull(e.target.value) })} />
      </div>
      <div className="flex flex-wrap items-center gap-2" style={{ gridColumn: "1 / -1" }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save promise"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setG(item); setOpen(false); }}>Cancel</button>
        <span className="sub">The quote stays as said on the call. Changes are logged.</span>
        {msg && !msg.ok && <span role="alert" className="text-xs" style={{ color: "var(--bad)" }}>{msg.message}</span>}
      </div>
    </form>
  );
}
