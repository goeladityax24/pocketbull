import { notFound } from "next/navigation";
import { cache } from "react";
import { getMe } from "@/lib/app/auth";
import { getBundle, getSettings } from "@/lib/app/repo";
import { buildTrackerView } from "@/lib/app/view";

/** Everything a company page needs, loaded once per request. */
export const loadCompany = cache(async (symbol: string) => {
  const me = await getMe();
  // Notes are for the Admin only
  const [bundle, settings] = await Promise.all([getBundle(decodeURIComponent(symbol), me.isAdmin), getSettings()]);
  if (!bundle) notFound();
  const view = buildTrackerView(bundle.company.snapshot, bundle.runs, bundle.overrides, { tolerancePct: settings.tolerancePct });
  const runs = [...bundle.runs].sort((a, b) => b.concall.yearMonth.localeCompare(a.concall.yearMonth));
  return { me, bundle, view, settings, runs, latest: runs[0] ?? null };
});
