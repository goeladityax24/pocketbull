"use client";

import { useState, useTransition } from "react";
import { addLink, addNote, deleteLink, deleteNote } from "@/app/actions";

function Msg({ m }: { m: { ok: boolean; message: string } | null }) {
  if (!m) return null;
  return <span role="status" className="text-[13px]" style={{ color: m.ok ? "var(--brand)" : "var(--bad)" }}>{m.message}</span>;
}

export function NoteForm({ symbol, promises }: { symbol: string; promises: { id: string; label: string }[] }) {
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("");
  const [m, setM] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addNote({ symbol, body, guidanceId: about || null });
          setM(r);
          if (r.ok) setBody("");
        });
      }}
    >
      <label htmlFor="note" className="label">Add a note</label>
      <textarea id="note" className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you notice? Link it to a promise if you can." />
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="about" className="text-[13px]" style={{ color: "var(--ink-3)" }}>About</label>
        <select id="about" className="input" style={{ minHeight: 38, maxWidth: 280 }} value={about} onChange={(e) => setAbout(e.target.value)}>
          <option value="">Whole company</option>
          {promises.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <Msg m={m} />
        <button type="submit" className="btn btn-primary ml-auto" disabled={pending}>{pending ? "Saving…" : "Save note"}</button>
      </div>
    </form>
  );
}

export function LinkForm({ symbol }: { symbol: string }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("report");
  const [eventDate, setEventDate] = useState("");
  const [m, setM] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addLink({ symbol, url, title, kind, eventDate });
          setM(r);
          if (r.ok) {
            setUrl("");
            setTitle("");
            setEventDate("");
          }
        });
      }}
    >
      <label htmlFor="link-url" className="label">Add a link</label>
      <input id="link-url" className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />
      <label htmlFor="link-title" className="sr-only">Title</label>
      <input
        id="link-title"
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === "conference" ? "Event, e.g. Arihant Bharat Connect, Mar 2026" : "Title (optional)"}
        required={kind === "conference"}
      />
      <div className="flex flex-wrap gap-2">
        <label htmlFor="link-kind" className="sr-only">Link type</label>
        <select id="link-kind" className="input flex-1" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="report">Report</option>
          <option value="news">News</option>
          <option value="video">Video</option>
          <option value="conference">Conference / broker note</option>
          <option value="other">Other</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      </div>
      {kind === "conference" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="link-date" className="label">Event date</label>
          <input id="link-date" className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          <span className="sub">Notes or transcripts from a conference (an X post with images, a PDF). The promises are added to the tracker after the next analysis, marked with their source.</span>
        </div>
      )}
      <Msg m={m} />
    </form>
  );
}

export function DeleteButton({ symbol, kind, id }: { symbol: string; kind: "note" | "link"; id: string }) {
  const [pending, start] = useTransition();
  const [m, setM] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete this ${kind}?`)) return;
          start(async () => setM(kind === "note" ? await deleteNote({ symbol, noteId: id }) : await deleteLink({ symbol, linkId: id })));
        }}
      >
        Delete
      </button>
      {m && !m.ok && <Msg m={m} />}
    </>
  );
}
