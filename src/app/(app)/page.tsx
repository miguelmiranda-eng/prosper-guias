import Link from "next/link";
import { BookOpen, CirclePlay, FilePlus2, History } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { createGuide } from "@/lib/guides/actions";
import { listGuides } from "@/lib/guides/queries";
import { recentActivity } from "@/lib/activity";
import { canCreateGuides } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { When } from "@/components/when";
import { GuideCard } from "@/components/guide-card";

export const metadata = { title: "Inicio" };

// Página dinámica por petición: la hora actual se lee una vez fuera del render.
function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

export default async function DashboardPage() {
  const { supabase, userId, workspace, role, profile } = await getWorkspaceContext();
  const weekAgo = daysAgoIso(7);

  // Todas las cifras salen de la base y respetan RLS: cada quien cuenta sólo lo que puede ver.
  const base = () =>
    supabase.from("guides").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).is("deleted_at", null);
  const [total, published, drafts, recentEdits, recent, activity] = await Promise.all([
    base(),
    base().eq("status", "published"),
    base().eq("status", "draft").eq("owner_id", userId),
    base().gte("updated_at", weekAgo),
    listGuides(supabase, { workspaceId: workspace.id, userId, sort: "updated", page: 1 }),
    recentActivity(supabase, workspace.id),
  ]);

  const stats = [
    { label: "Guías visibles", value: total.count ?? 0, hint: "En este espacio, que puedes ver" },
    { label: "Publicadas", value: published.count ?? 0, hint: "Listas para consulta" },
    { label: "Tus borradores", value: drafts.count ?? 0, hint: "Pendientes de revisar y publicar" },
    { label: "Modificadas en 7 días", value: recentEdits.count ?? 0, hint: "Creadas o editadas" },
  ];
  const firstName = profile.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title={`Hola, ${firstName}`} subtitle={workspace.name} />

      {canCreateGuides(role) && (
        <section className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Accesos rápidos">
          <Link href="/extension" className="card flex items-center gap-3 p-4 transition-colors hover:border-primary">
            <span className="rounded-lg bg-danger-soft p-2 text-danger"><CirclePlay className="h-5 w-5" /></span>
            <span><span className="block font-medium">Grabar un proceso</span><span className="text-xs text-muted">Con la extensión de Chrome/Edge</span></span>
          </Link>
          <form action={createGuide}>
            <button type="submit" className="card flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-primary">
              <span className="rounded-lg bg-primary-soft p-2 text-primary"><FilePlus2 className="h-5 w-5" /></span>
              <span><span className="block font-medium">Nueva guía en blanco</span><span className="text-xs text-muted">Escribe los pasos a mano</span></span>
            </button>
          </form>
          <Link href="/guides" className="card flex items-center gap-3 p-4 transition-colors hover:border-primary">
            <span className="rounded-lg bg-ok-soft p-2 text-ok"><BookOpen className="h-5 w-5" /></span>
            <span><span className="block font-medium">Ver la biblioteca</span><span className="text-xs text-muted">Buscar y filtrar guías</span></span>
          </Link>
        </section>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Estadísticas">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs font-medium text-muted">{s.label}</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recientes</h2>
            <Link href="/guides" className="text-sm text-primary hover:underline">Ver todas</Link>
          </div>
          {recent.guides.length === 0 ? (
            <p className="card p-6 text-sm text-muted">Todavía no hay guías en este espacio. Graba un proceso o crea una guía en blanco para empezar.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.guides.slice(0, 6).map((g) => <GuideCard key={g.id} guide={g} />)}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><History className="h-4 w-4" />Actividad del equipo</h2>
          <div className="card divide-y divide-line">
            {activity.length === 0 && <p className="p-4 text-sm text-muted">Sin actividad todavía.</p>}
            {activity.map((a) => (
              <div key={a.id} className="p-3 text-sm">
                <p>
                  <span className="font-medium">{a.actor}</span>{" "}
                  {a.guideId ? <Link className="hover:underline" href={`/guides/${a.guideId}`}>{a.text}</Link> : a.text}
                </p>
                <p className="mt-0.5 text-xs text-muted"><When iso={a.createdAt} relative /></p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
