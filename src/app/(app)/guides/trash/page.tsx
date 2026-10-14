import { Trash2 } from "lucide-react";
import { getWorkspaceContext } from "@/lib/session";
import { listGuides } from "@/lib/guides/queries";
import { canManageGuide } from "@/lib/permissions";
import { EmptyState, PageHeader, VisibilityBadge } from "@/components/ui";
import { When } from "@/components/when";
import { TrashActions } from "./trash-actions";

export const metadata = { title: "Papelera" };

export default async function TrashPage({ searchParams }: PageProps<"/guides/trash">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const { supabase, userId, workspace, role } = await getWorkspaceContext();
  const result = await listGuides(supabase, { workspaceId: workspace.id, userId, trash: true, page });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Papelera"
        subtitle="Las guías aquí no aparecen en la biblioteca. Puedes restaurarlas o borrarlas para siempre (con sus imágenes)."
      />
      {result.guides.length === 0 ? (
        <EmptyState icon={<Trash2 className="h-6 w-6" />} title="La papelera está vacía" />
      ) : (
        <div className="card divide-y divide-line">
          {result.guides.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.title}</p>
                <p className="text-xs text-muted">
                  {g.ownerName} · {g.stepCount} pasos · enviada a la papelera <When iso={g.deleted_at!} relative />
                </p>
              </div>
              <VisibilityBadge visibility={g.visibility} />
              {canManageGuide(role, userId, g) && <TrashActions id={g.id} title={g.title} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
