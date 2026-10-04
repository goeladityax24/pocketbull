"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A link that marks itself as the current page. `exact` for "/" style roots. */
export function NavLink({ href, className, exact, children }: { href: string; className: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const current = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={className} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
