"use client";

import { useState, useTransition } from "react";
import { changeTag, revertTag } from "@/app/actions";
import type { ManualTag } from "@/lib/app/view";

const OPTIONS: { tag: ManualTag; label: string }[] = [
  { tag: "exceeded", label: "Exceeded" },
  { tag: "met", label: "Met" },
  { tag: "missed", label: "Missed" },
  { tag: "not_comparable", label: "Not comparable" },
];

export interface TagControlProps {
  symbol: string;
  guidanceId: string;
  periodLabel: string;
  /** What shows now (manual or computed) */
  tag: string;
  label: string;
  override: { id: string; changedBy: string; reason: string; createdAt: string } | null;
  computedLabel: string | null;
  isAdmin: boolean;
  readOnly?: boolean;
}

export function TagControl(p: TagControlProps) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<ManualTag | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const fid = `${p.guidanceId}-${p.periodLabel}`.replace(/\W/g, "-");

  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`tag t-${p.tag}`} title={p.override ? `Changed by ${p.override.changedBy}: ${p.override.reason}` : undefined}>
        {p.label}
      </span>
      {p.override && (
        <span className="sub">
          by {p.override.changedBy}
          {p.computedLabel ? ` (was ${p.computedLabel})` : ""}: {p.override.reason}
        </span>
      )}
      {!p.readOnly && (
        <div className="flex gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Change tag
          </button>
          {p.override && p.isAdmin && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => start(async () => setMsg(await revertTag({ overrideId: p.override!.id, symbol: p.symbol })))}
            >
              Revert
            </button>
          )}
        </div>
      )}
      {open && (
        <form
          className="mt-1 flex w-64 flex-col gap-2 rounded-xl p-3"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!tag) return setMsg({ ok: false, message: "Pick a tag." });
            start(async () => {
              const r = await changeTag({ symbol: p.symbol, guidanceId: p.guidanceId, periodLabel: p.periodLabel, tag, reason, previous: p.tag });
              setMsg(r);
              if (r.ok) {
                setOpen(false);
                setReason("");
                setTag(null);
              }
            });
          }}
        >
          <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
            <legend className="label mb-1.5">New tag · {p.periodLabel === "overall" ? "whole promise" : p.periodLabel}</legend>
            {OPTIONS.map((o) => (
              <label key={o.tag} className={`tag t-${o.tag} cursor-pointer`} style={{ outline: tag === o.tag ? "2px solid var(--ink)" : "none" }}>
                <input type="radio" name={`tag-${fid}`} value={o.tag} className="sr-only" checked={tag === o.tag} onChange={() => setTag(o.tag)} />
                {o.label}
              </label>
            ))}
          </fieldset>
          <label htmlFor={`reason-${fid}`} className="label">Reason (everyone sees it)</label>
          <textarea id={`reason-${fid}`} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. guidance was standalone, not consolidated" required />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save tag"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {msg && !msg.ok && <span role="alert" className="text-xs" style={{ color: "var(--bad)" }}>{msg.message}</span>}
    </div>
  );
}
