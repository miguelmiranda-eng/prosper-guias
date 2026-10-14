import Link from "next/link";
import { BookOpen, FilePlus2, LayoutGrid, List, Search } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { listGuides } from "@/lib/guides/queries";
import { createGuide } from "@/lib/guides/actions";
import { canCreateGuides } from "@/lib/permissions";
import { EmptyState, PageHeader, StatusBadge, VisibilityBadge } from "@/components/ui";
import { When } from "@/components/when";
import { GuideCard } from "@/components/guide-card";

export const metadata = { title: "Biblioteca" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LibraryPage({ searchParams }: PageProps<"/guides">) {
  const sp = await searchParams;
  const { supabase, userId, workspace, role } = await getWorkspaceContext();

  const q = one(sp.q) ?? "";
  const statusParam = one(sp.status);
  const status = statusParam === "draft" || statusParam === "published" || statusParam === "archived" ? statusParam : "all";
  const scope = one(sp.scope) === "mine" ? "mine" : "all";
  const sortParam = one(sp.sort);
  const sort = sortParam === "title" || sortParam === "created" ? sortParam : "updated";
  const view = one(sp.view) === "list" ? "list" : "grid";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const error = one(sp.error);

  const result = await listGuides(supabase, { workspaceId: workspace.id, userId, q, status, scope, sort, page });
  const filtered = Boolean(q) || status !== "all" || scope !== "all";

  const href = (patch: Record<string, string | number>) => {
    const params = new URLSearchParams();
    const merged = { q, status, scope, sort, view, page, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "status" && v === "all") && !(k === "scope" && v === "all") && !(k === "sort" && v === "updated") && !(k === "view" && v === "grid") && !(k === "page" && v === 1)) {
        params.set(k, String(v));
      }
    }
    const s = params.toString();
    return s ? `/guides?${s}` : "/guides";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Biblioteca"
        subtitle={`${result.total} ${result.total === 1 ? "guía" : "guías"}${filtered ? " con estos filtros" : ""}`}
        actions={
          canCreateGuides(role) && (
            <form action={createGuide}>
              <button type="submit" className="btn btn-primary"><FilePlus2 className="h-4 w-4" />Nueva guía</button>
            </form>
          )
        }
      />

      {error && <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-3" role="search">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">Buscar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden="true" />
            <input id="q" name="q" defaultValue={q} className="input pl-9" placeholder="Título o descripción" maxLength={100} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="status">Estado</label>
          <select id="status" name="status" defaultValue={status} className="input">
            <option value="all">Todos</option>
            <option value="draft">Borrador</option>
            <option value="published">Publicada</option>
            <option value="archived">Archivada</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="scope">Autor</label>
          <select id="scope" name="scope" defaultValue={scope} className="input">
            <option value="all">Cualquiera</option>
            <option value="mine">Mías</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sort">Ordenar por</label>
          <select id="sort" name="sort" defaultValue={sort} className="input">
            <option value="updated">Última modificación</option>
            <option value="created">Fecha de creación</option>
            <option value="title">Nombre</option>
          </select>
        </div>
        <input type="hidden" name="view" value={view} />
        <button type="submit" className="btn">Aplicar</button>
        {filtered && <Link href="/guides" className="btn btn-ghost">Limpiar</Link>}
        <div className="ml-auto flex rounded-lg border border-line" role="group" aria-label="Vista">
          <Link href={href({ view: "grid" })} aria-current={view === "grid" ? "true" : undefined} className={`p-2 ${view === "grid" ? "bg-surface-2 text-primary" : "text-muted"}`} title="Cuadrícula"><LayoutGrid className="h-4 w-4" /></Link>
          <Link href={href({ view: "list" })} aria-current={view === "list" ? "true" : undefined} className={`p-2 ${view === "list" ? "bg-surface-2 text-primary" : "text-muted"}`} title="Lista"><List className="h-4 w-4" /></Link>
        </div>
      </form>

      {result.guides.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title={filtered ? "Nada coincide con la búsqueda" : "La biblioteca está vacía"}>
          {filtered ? "Prueba con otras palabras o quita filtros." : "Graba un proceso con la extensión o crea una guía en blanco."}
        </EmptyState>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.guides.map((g) => <GuideCard key={g.id} guide={g} />)}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Pasos</th>
                <th className="px-4 py-2 font-medium">Autor</th>
                <th className="px-4 py-2 font-medium">Modificada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.guides.map((g) => (
                <tr key={g.id} className="hover:bg-surface-2">
                  <td className="max-w-md px-4 py-2.5">
                    <Link href={`/guides/${g.id}`} className="font-medium hover:text-primary">{g.title}</Link>
                    {g.description && <p className="truncate text-xs text-muted">{g.description}</p>}
                  </td>
                  <td className="px-4 py-2.5"><div className="flex gap-1"><StatusBadge status={g.status} recording={g.recording} /><VisibilityBadge visibility={g.visibility} /></div></td>
                  <td className="px-4 py-2.5 tabular-nums">{g.stepCount}</td>
                  <td className="px-4 py-2.5">{g.ownerName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted"><When iso={g.updated_at} relative /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Paginación">
          {result.page > 1 ? <Link className="btn" href={href({ page: result.page - 1 })}>Anterior</Link> : <span className="btn opacity-50">Anterior</span>}
          <span className="text-sm text-muted">Página {result.page} de {result.pages}</span>
          {result.page < result.pages ? <Link className="btn" href={href({ page: result.page + 1 })}>Siguiente</Link> : <span className="btn opacity-50">Siguiente</span>}
        </nav>
      )}
    </div>
  );
}
