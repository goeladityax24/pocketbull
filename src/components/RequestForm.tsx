"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { requestAnalysis } from "@/app/actions";

const NAME_KEY = "pocketbull:name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return ""; // storage blocked: just type the name
  }
}
const noSubscribe = () => () => {};

export function RequestForm({ initial = "" }: { initial?: string }) {
  const [company, setCompany] = useState(initial);
  const remembered = useSyncExternalStore(noSubscribe, savedName, () => "");
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? remembered;
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          localStorage.setItem(NAME_KEY, name.trim());
        } catch {}
        start(async () => {
          const r = await requestAnalysis({ company, name, note });
          setResult(r);
          if (r.ok) {
            setCompany("");
            setNote("");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-[2_1_300px] flex-col gap-1.5">
          <label htmlFor="req-company" className="label">NSE symbol or Screener link</label>
          <input id="req-company" className="input" style={{ minHeight: 48 }} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. SKYGOLD or a screener.in link" required />
        </div>
        <div className="flex min-w-[140px] flex-[1_1_160px] flex-col gap-1.5">
          <label htmlFor="req-name" className="label">Your name</label>
          <input id="req-name" className="input" style={{ minHeight: 48 }} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
        </div>
        <div className="flex min-w-[180px] flex-[2_1_240px] flex-col gap-1.5">
          <label htmlFor="req-note" className="label">Note (optional)</label>
          <input id="req-note" className="input" style={{ minHeight: 48 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new concall in October" />
        </div>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 48 }} disabled={pending}>
          {pending ? "Requesting…" : "Request analysis"}
        </button>
      </div>
      {result && (
        <p role="status" className="m-0 text-sm" style={{ color: result.ok ? "var(--brand)" : "var(--bad)" }}>
          {result.message}
        </p>
      )}
    </form>
  );
}
