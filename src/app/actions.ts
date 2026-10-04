"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminToken, getMe, keyMatches } from "@/lib/app/auth";
import { GITHUB_REPO } from "@/lib/app/config";
import { db } from "@/lib/app/supabase/admin";
import type { ManualTag } from "@/lib/app/view";
import { GuidanceItem } from "@/lib/pipeline/guidance";
import { normaliseSymbol } from "@/lib/pipeline/screener";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

/** Every write goes through here: only the Admin, and only with Supabase connected. */
async function admin(): Promise<{ name: string } | ActionResult> {
  const me = await getMe();
  if (!me.isAdmin) return fail("Only the Admin can change this.");
  if (me.demo) return fail("Demo mode: connect Supabase to save changes.");
  return { name: me.name };
}

async function audit(actor: string, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  await db().from("audit_log").insert({ actor_name: actor, action, entity, entity_id: entityId, before, after });
}

// Admin key ------------------------------------------------------------------

export async function unlockAdmin(input: { key: string }): Promise<ActionResult> {
  if (!process.env.ADMIN_KEY) return fail("ADMIN_KEY isn't set on the server.");
  if (!keyMatches(input.key)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return fail("That key doesn't match.");
  }
  (await cookies()).set(ADMIN_COOKIE, adminToken(process.env.ADMIN_KEY), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Unlocked. This browser can now edit." };
}

export async function lockAdmin(): Promise<ActionResult> {
  (await cookies()).delete(ADMIN_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true, message: "Locked." };
}

// Tags ---------------------------------------------------------------------

const TAGS: ManualTag[] = ["met", "exceeded", "missed", "not_comparable"];

export async function changeTag(input: { symbol: string; guidanceId: string; periodLabel: string; tag: ManualTag; reason: string; previous: string }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const reason = input.reason.trim();
  if (!TAGS.includes(input.tag)) return fail("Pick a tag.");
  if (!reason) return fail("Add a reason: everyone sees it.");
  const { data, error } = await db()
    .from("tag_overrides")
    .insert({ guidance_id: Number(input.guidanceId), period_label: input.periodLabel, tag: input.tag, reason, changed_by_name: me.name })
    .select("id")
    .single();
  if (error) return fail(error.message);
  await audit(me.name, "tag.change", "tag_overrides", String(data.id), { tag: input.previous, symbol: input.symbol, period: input.periodLabel }, { tag: input.tag, reason });
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Tag changed." };
}

export async function revertTag(input: { overrideId: string; symbol?: string }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const { error } = await db().from("tag_overrides").update({ reverted_at: new Date().toISOString() }).eq("id", Number(input.overrideId));
  if (error) return fail(error.message);
  await audit(me.name, "tag.revert", "tag_overrides", input.overrideId, null, { symbol: input.symbol });
  revalidatePath("/", "layout");
  return { ok: true, message: "Tag change reverted." };
}

// Guidance corrections --------------------------------------------------------

export async function editGuidance(input: { symbol: string; guidanceId: string; item: unknown }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const parsed = GuidanceItem.safeParse(input.item);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const sb = db();
  const { data: before } = await sb.from("guidance").select("item, edited_item").eq("id", Number(input.guidanceId)).single();
  const { error } = await sb.from("guidance").update({ edited_item: parsed.data, edited_at: new Date().toISOString() }).eq("id", Number(input.guidanceId));
  if (error) return fail(error.message);
  await audit(me.name, "guidance.edit", "guidance", input.guidanceId, before?.edited_item ?? before?.item ?? null, { ...parsed.data, symbol: input.symbol });
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Promise updated." };
}

export async function resetGuidance(input: { symbol: string; guidanceId: string }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const { error } = await db().from("guidance").update({ edited_item: null, edited_at: new Date().toISOString() }).eq("id", Number(input.guidanceId));
  if (error) return fail(error.message);
  await audit(me.name, "guidance.reset", "guidance", input.guidanceId, null, { symbol: input.symbol });
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Back to the extracted version." };
}

// Research space -------------------------------------------------------------

async function companyId(symbol: string): Promise<number | null> {
  const { data } = await db().from("companies").select("id").eq("symbol", symbol).maybeSingle();
  return data?.id ?? null;
}

export async function addNote(input: { symbol: string; body: string; guidanceId: string | null }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const body = input.body.trim();
  if (!body) return fail("Write something first.");
  const id = await companyId(input.symbol);
  if (!id) return fail("Company not found.");
  const { error } = await db().from("notes").insert({ company_id: id, guidance_id: input.guidanceId ? Number(input.guidanceId) : null, body, author_name: me.name });
  if (error) return fail(error.message);
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Note saved." };
}

export async function deleteNote(input: { symbol: string; noteId: string }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const { error } = await db().from("notes").delete().eq("id", Number(input.noteId));
  if (error) return fail(error.message);
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Note deleted." };
}

export async function addLink(input: { symbol: string; url: string; title: string; kind: string }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  let url: URL;
  try {
    url = new URL(input.url.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return fail("Enter a full link starting with https://");
  }
  const kind = ["report", "news", "video", "other"].includes(input.kind) ? input.kind : "other";
  const id = await companyId(input.symbol);
  if (!id) return fail("Company not found.");
  const { error } = await db().from("links").insert({ company_id: id, url: url.toString(), title: input.title.trim() || null, kind, added_by_name: me.name });
  if (error) return fail(error.message);
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Link added." };
}

export async function deleteLink(input: { symbol: string; linkId: string }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const { error } = await db().from("links").delete().eq("id", Number(input.linkId));
  if (error) return fail(error.message);
  revalidatePath(`/c/${input.symbol}`, "layout");
  return { ok: true, message: "Link removed." };
}

// Analysis requests (anyone) ----------------------------------------------------

async function openIssue(title: string, body: string): Promise<{ number: number; url: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ title, body, labels: ["analysis-request"] }),
  });
  if (!res.ok) return null;
  const issue = (await res.json()) as { number: number; html_url: string };
  return { number: issue.number, url: issue.html_url };
}

/** Keeps an open link from flooding the queue: at most this many open requests at once */
const MAX_OPEN_REQUESTS = 20;

export async function requestAnalysis(input: { company: string; name: string; note: string }): Promise<ActionResult> {
  const me = await getMe();
  if (me.demo) return fail("Demo mode: connect Supabase to send requests.");
  const raw = input.company.trim();
  const who = input.name.trim().slice(0, 40);
  if (!raw) return fail("Enter an NSE symbol or a Screener link.");
  if (!who) return fail("Add your name so the Admin knows who asked.");
  const { symbol } = normaliseSymbol(raw);
  if (!/^[A-Z0-9&_-]{1,20}$/.test(symbol)) return fail("That doesn't look like an NSE symbol or Screener link.");

  const sb = db();
  const { data: open } = await sb.from("analysis_requests").select("symbol").eq("status", "open");
  if (open?.some((r) => r.symbol === symbol)) return fail(`${symbol} is already in the queue.`);
  if ((open?.length ?? 0) >= MAX_OPEN_REQUESTS) return fail("The queue is full. Try again after the Admin clears it.");

  const note = input.note.trim().slice(0, 300);
  const screener = raw.includes("screener.in") ? raw : `https://www.screener.in/company/${symbol}/consolidated/`;
  const issue = await openIssue(
    `Analyse ${symbol}`,
    [`**Company:** ${symbol}`, `**Screener:** ${screener}`, `**Requested by:** ${who}`, note ? `**Note:** ${note}` : null, "", `Run with "analyse ${symbol}" in a local Claude session (see docs/ANALYSIS_PLAYBOOK.md).`]
      .filter((x) => x != null)
      .join("\n"),
  );
  const { error } = await sb.from("analysis_requests").insert({
    symbol,
    note: note || null,
    requested_by_name: who,
    issue_number: issue?.number ?? null,
    issue_url: issue?.url ?? null,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, message: issue ? `Requested. The Admin has been notified (issue #${issue.number}).` : "Requested. The Admin will see it in the queue." };
}

export async function closeRequest(input: { requestId: string; status: "done" | "closed" }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  const { error } = await db().from("analysis_requests").update({ status: input.status }).eq("id", Number(input.requestId));
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, message: "Request updated." };
}

// Settings -----------------------------------------------------------------------

export async function updateSetting(input: { key: "met_tolerance_pct"; value: number }): Promise<ActionResult> {
  const me = await admin();
  if ("ok" in me) return me;
  if (!Number.isFinite(input.value) || input.value < 0) return fail("Use a number of zero or more.");
  const { error } = await db().from("settings").update({ value: input.value }).eq("key", input.key);
  if (error) return fail(error.message);
  await audit(me.name, "setting.update", "settings", input.key, null, { value: input.value });
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
