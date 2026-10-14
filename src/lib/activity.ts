import type { ServerClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/types";

const GUIDE_VERBS: Record<string, string> = {
  created: "creó",
  published: "publicó",
  draft: "regresó a borrador",
  archived: "archivó",
  trashed: "envió a la papelera",
  restored: "restauró",
  deleted: "borró definitivamente",
  visibility_private: "hizo privada",
  visibility_workspace: "compartió con el equipo",
};

export type ActivityItem = {
  id: number;
  createdAt: string;
  actor: string;
  text: string;
  guideId: string | null;
};

/**
 * Actividad reciente del espacio. Los títulos se resuelven con RLS: un evento de una guía
 * que el lector no puede ver se omite, en vez de mostrar "algo pasó con algo privado".
 */
export async function recentActivity(supabase: ServerClient, workspaceId: string, limit = 12): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, created_at, action, entity_type, entity_id, meta, actor:profiles(full_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  if (error) {
    console.error("[activity]", error.message);
    return [];
  }
  const rows = data ?? [];
  const guideIds = [...new Set(rows.filter((r) => r.entity_type === "guide").map((r) => r.entity_id))];
  const memberIds = [...new Set(rows.filter((r) => r.entity_type === "member").map((r) => r.entity_id))];

  const [{ data: guides }, { data: members }] = await Promise.all([
    guideIds.length
      ? supabase.from("guides").select("id, title, deleted_at").in("id", guideIds)
      : Promise.resolve({ data: [] as { id: string; title: string; deleted_at: string | null }[] }),
    memberIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const titleOf = new Map((guides ?? []).map((g) => [g.id, g]));
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  const items: ActivityItem[] = [];
  for (const r of rows) {
    const actor = r.actor?.full_name ?? "Alguien";
    const meta = (r.meta ?? {}) as { title?: string; role?: WorkspaceRole };
    if (r.entity_type === "guide") {
      const g = titleOf.get(r.entity_id);
      const verb = GUIDE_VERBS[r.action] ?? r.action;
      if (r.action === "deleted") {
        if (!meta.title) continue;
        items.push({ id: r.id, createdAt: r.created_at, actor, text: `${verb} «${meta.title}»`, guideId: null });
      } else if (g) {
        items.push({ id: r.id, createdAt: r.created_at, actor, text: `${verb} «${g.title}»`, guideId: g.deleted_at ? null : g.id });
      }
    } else if (r.entity_type === "member") {
      const who = nameOf.get(r.entity_id) ?? "un miembro";
      const text =
        r.action === "member_added"
          ? `agregó a ${who} como ${meta.role ? ROLE_LABELS[meta.role] : "miembro"}`
          : r.action === "member_role"
            ? `cambió el rol de ${who} a ${meta.role ? ROLE_LABELS[meta.role] : "otro"}`
            : `quitó a ${who} del espacio`;
      items.push({ id: r.id, createdAt: r.created_at, actor, text, guideId: null });
    }
    if (items.length >= limit) break;
  }
  return items;
}
