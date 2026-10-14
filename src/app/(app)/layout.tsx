import Link from "next/link";
import { BookOpen, Home, Menu, Puzzle, Trash2, Users } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { logout } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/types";
import { BrandMark, BrandName } from "@/components/brand";
import { NavLink } from "@/components/nav-link";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Inicio", icon: Home, exact: true },
  { href: "/guides", label: "Biblioteca", icon: BookOpen },
  { href: "/guides/trash", label: "Papelera", icon: Trash2 },
  { href: "/team", label: "Equipo", icon: Users },
  { href: "/extension", label: "Extensión", icon: Puzzle },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, workspace, workspaces, role } = await getWorkspaceContext();

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link href="/" className="flex items-center gap-2 text-white">
        <BrandMark className="h-7 w-7 text-accent" />
        <BrandName />
      </Link>
      <WorkspaceSwitcher current={workspace.id} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} />
      <nav className="flex flex-col gap-1" aria-label="Principal">
        {NAV.map((item) => (
          <NavLink key={item.href} href={item.href} exact={item.exact}>
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="truncate font-medium text-white">{profile.name}</p>
          <p className="truncate text-xs text-nav-ink">{ROLE_LABELS[role]} · {profile.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logout} className="flex-1">
            <button type="submit" className="w-full rounded-lg px-3 py-1.5 text-left text-nav-ink hover:bg-nav-active hover:text-white">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 bg-nav text-nav-ink lg:block">{sidebar}</aside>
      {/* Móvil: menú plegable sin JavaScript. */}
      <details className="no-print group bg-nav text-nav-ink lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-white">
          <span className="flex items-center gap-2"><BrandMark className="h-6 w-6 text-accent" /><BrandName /></span>
          <Menu className="h-5 w-5" aria-label="Abrir menú" />
        </summary>
        <div className="border-t border-white/10">{sidebar}</div>
      </details>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
