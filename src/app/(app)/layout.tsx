import Link from "next/link";
import { LockButton } from "@/components/AdminForms";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { getMe } from "@/lib/app/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await getMe();
  return (
    <div className="min-h-screen">
      {me.demo && (
        <div className="px-4 py-2 text-center text-[13px]" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
          Demo mode: reading <code>data/</code> files, nothing is saved. Add the Supabase keys to <code>.env.local</code> to save changes.
        </div>
      )}
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div className="wrap flex flex-wrap items-center gap-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold no-underline" style={{ color: "var(--ink)" }}>
            <Logo /> PocketBull
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            <NavLink href="/" exact className="nav">Companies</NavLink>
            <NavLink href="/admin" className="nav">Admin</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me.isAdmin ? (
              <>
                <span className="tag t-met">Editing as {me.name}</span>
                {me.keyed && <LockButton />}
              </>
            ) : (
              <span className="tag t-pending">View only</span>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="wrap py-8 text-[13px]" style={{ color: "var(--ink-3)" }}>
        For research within the group only. Not investment advice.
      </footer>
    </div>
  );
}
