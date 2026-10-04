"use client";

import { useState, useTransition } from "react";
import { closeRequest, lockAdmin, revertTag, unlockAdmin, updateSetting } from "@/app/actions";

type Result = { ok: boolean; message: string } | null;

function Msg({ m }: { m: Result }) {
  if (!m) return null;
  return <span role="status" className="text-[13px]" style={{ color: m.ok ? "var(--brand)" : "var(--bad)" }}>{m.message}</span>;
}

export function UnlockForm() {
  const [key, setKey] = useState("");
  const [m, setM] = useState<Result>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setM(await unlockAdmin({ key })));
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="admin-key" className="label">Admin key</label>
        <input id="admin-key" type="password" className="input" style={{ width: 260 }} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Checking…" : "Unlock editing"}</button>
      <Msg m={m} />
    </form>
  );
}

export function LockButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => void (await lockAdmin()))}>
      Lock
    </button>
  );
}

export function SettingInput({ settingKey, value, label, unit }: { settingKey: "met_tolerance_pct"; value: number; label: string; unit: string }) {
  const [v, setV] = useState(String(value));
  const [m, setM] = useState<Result>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={settingKey} className="label">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={settingKey} className="input num" style={{ width: 90 }} type="number" min={0} step="any" value={v} onChange={(e) => setV(e.target.value)} />
        <span className="sub">{unit}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending || Number(v) === value} onClick={() => start(async () => setM(await updateSetting({ key: settingKey, value: Number(v) })))}>
          Save
        </button>
        <Msg m={m} />
      </div>
    </div>
  );
}

export function RequestActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [m, setM] = useState<Result>(null);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setM(await closeRequest({ requestId: id, status: "done" })))}>Mark done</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setM(await closeRequest({ requestId: id, status: "closed" })))}>Close</button>
      <Msg m={m} />
    </div>
  );
}

export function RevertButton({ overrideId }: { overrideId: string }) {
  const [pending, start] = useTransition();
  const [m, setM] = useState<Result>(null);
  if (m?.ok) return <span className="sub">Reverted</span>;
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setM(await revertTag({ overrideId })))}>Revert</button>
      <Msg m={m} />
    </>
  );
}
