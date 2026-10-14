"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  // /guides no debe quedar activo dentro de /guides/trash, que tiene su propia entrada.
  const active = exact
    ? path === href
    : path === href || (path.startsWith(`${href}/`) && !(href === "/guides" && path.startsWith("/guides/trash")));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-nav-active font-medium text-white" : "hover:bg-nav-active/60 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
