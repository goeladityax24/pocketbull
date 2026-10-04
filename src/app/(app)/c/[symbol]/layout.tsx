import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { loadCompany } from "./data";

export async function generateMetadata({ params }: LayoutProps<"/c/[symbol]">) {
  const { symbol } = await params;
  return { title: symbol.toUpperCase() };
}

export default async function CompanyLayout({ children, params }: LayoutProps<"/c/[symbol]">) {
  const { symbol } = await params;
  const { me, bundle } = await loadCompany(symbol);
  const c = bundle.company;
  const base = `/c/${c.symbol}`;
  return (
    <>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div className="wrap flex flex-col gap-3 pt-5">
          <nav aria-label="Breadcrumb" className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            <Link href="/">Companies</Link> / {c.name}
          </nav>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="m-0 text-[26px] font-bold">{c.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
              <span className="num font-medium" style={{ color: "var(--ink)" }}>{c.symbol}</span>
              <span>·</span>
              <span className="capitalize">{c.basis}</span>
              <span>·</span>
              <a href={c.screenerUrl} target="_blank" rel="noreferrer">Open on Screener</a>
            </div>
          </div>
          <nav aria-label="Company sections" className="flex flex-wrap gap-6">
            <NavLink href={base} exact className="tab">Overview</NavLink>
            <NavLink href={`${base}/insights`} className="tab">Insight report</NavLink>
            <NavLink href={`${base}/tracker`} className="tab">Guidance tracker</NavLink>
            <NavLink href={`${base}/research`} className="tab">{me.isAdmin ? "Research space" : "Research links"}</NavLink>
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}
