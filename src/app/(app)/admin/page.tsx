import { RequestActions, RevertButton, SettingInput, UnlockForm } from "@/components/AdminForms";
import { getMe } from "@/lib/app/auth";
import { fmtDate } from "@/lib/app/format";
import { getSettings, listBundles, listRequests } from "@/lib/app/repo";
import { db } from "@/lib/app/supabase/admin";

export const metadata = { title: "Admin" };

const ACTION: Record<string, string> = {
  "tag.change": "changed a tag",
  "tag.revert": "reverted a tag change",
  "guidance.edit": "edited a promise",
  "guidance.reset": "undid edits to a promise",
  "setting.update": "changed a setting",
};

export default async function AdminPage() {
  const me = await getMe();
  if (!me.isAdmin) {
    return (
      <main className="wrap py-10">
        <section className="box flex max-w-xl flex-col gap-4 p-6">
          <h1 className="m-0 text-2xl font-bold">Admin</h1>
          <p className="m-0 text-[15px]" style={{ color: "var(--ink-3)" }}>
            Everyone can read PocketBull. Editing tags, promises, notes and links is for the Admin. Enter the admin key once and this browser stays unlocked.
          </p>
          {me.keyed ? <UnlockForm /> : <p className="sub m-0">Editing is turned off on this site: no ADMIN_KEY is set.</p>}
        </section>
      </main>
    );
  }
  if (me.demo) {
    return (
      <main className="wrap py-10">
        <div className="box p-6 text-sm">The Admin console needs Supabase. Add the keys to <code>.env.local</code>.</div>
      </main>
    );
  }

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [settings, bundles, open, monthReqs, log] = await Promise.all([
    getSettings(),
    listBundles(),
    listRequests("open"),
    db().from("analysis_requests").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    db().from("audit_log").select("id, actor_name, action, entity_id, before, after, created_at").order("created_at", { ascending: false }).limit(25),
  ]);
  const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date());

  return (
    <main className="wrap flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="m-0 text-[26px] font-bold">Admin console</h1>
        <span className="sub">{monthName}</span>
      </div>

      <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {[
          { l: "Requests this month", n: String(monthReqs.count ?? 0), s: `${open.length} waiting in the queue` },
          { l: "Saved companies", n: String(bundles.length), s: "Opening them is free" },
        ].map((x) => (
          <div key={x.l} className="box flex flex-col gap-1 p-4">
            <div className="sub">{x.l}</div>
            <div className="num text-2xl font-medium">{x.n}</div>
            <div className="sub">{x.s}</div>
          </div>
        ))}
      </section>

      <section className="box flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">Analysis queue</h2>
        <p className="sub m-0">Run these in a local Claude session (&ldquo;run the pending requests&rdquo;, see docs/ANALYSIS_PLAYBOOK.md), then mark them done.</p>
        {open.length === 0 ? (
          <p className="m-0 text-sm" style={{ color: "var(--ink-3)" }}>Nothing waiting.</p>
        ) : (
          <div className="scroll-x">
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead><tr><th>Company</th><th>Requested by</th><th>When</th><th>Note</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {open.map((r) => (
                  <tr key={r.id}>
                    <td className="num font-semibold">{r.symbol} {r.issueUrl && <a className="src" href={r.issueUrl}>#{r.issueNumber}</a>}</td>
                    <td>{r.requestedBy}</td>
                    <td className="sub">{fmtDate(r.createdAt)}</td>
                    <td className="sub">{r.note}</td>
                    <td><RequestActions id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-6">
        <div className="box flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-5">
          <h2 className="m-0 text-lg font-semibold">Settings</h2>
          <SettingInput settingKey="met_tolerance_pct" value={settings.tolerancePct} label="“Met” tolerance for single-number targets" unit="± % · ranges: actual must fall inside" />
        </div>
        <div className="box flex min-w-0 flex-[2_1_480px] flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">Recent changes</h2>
          {(log.data ?? []).length === 0 && <p className="sub m-0">Nothing yet.</p>}
          {(log.data ?? []).map((e) => {
            const after = (e.after ?? {}) as Record<string, unknown>;
            const before = (e.before ?? {}) as Record<string, unknown>;
            const detail =
              e.action === "tag.change"
                ? `on ${before.symbol ?? ""} ${before.period ?? ""}: ${before.tag} → ${after.tag} · “${after.reason}”`
                : e.action === "guidance.edit"
                  ? `on ${after.symbol ?? ""}: ${after.metric_label ?? ""}`
                  : e.action === "setting.update"
                    ? `${e.entity_id} → ${after.value}`
                    : "";
            return (
              <div key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="sub" style={{ minWidth: 52 }}>{fmtDate(e.created_at, false)}</span>
                <span className="min-w-0 flex-1">
                  <b>{e.actor_name ?? "Admin"}</b> {ACTION[e.action] ?? e.action} {detail}
                </span>
                {e.action === "tag.change" && <RevertButton overrideId={e.entity_id} />}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
