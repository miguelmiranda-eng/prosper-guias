import type { ServerClient } from "@/lib/supabase/server";
import type { GuideStatus, StepView } from "@/lib/types";
import { signPaths } from "@/lib/media";

export const PAGE_SIZE = 24;

export type LibraryParams = {
  workspaceId: string;
  userId: string;
  q?: string;
  status?: GuideStatus | "all";
  scope?: "all" | "mine";
  sort?: "updated" | "created" | "title";
  page?: number;
  trash?: boolean;
};

/** Quita los caracteres con significado en los filtros de PostgREST (coma, paréntesis, comodines). */
export function sanitizeSearch(q: string | undefined) {
  return (q ?? "").replace(/[%_*,()\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function listGuides(supabase: ServerClient, p: LibraryParams) {
  const page = Math.max(1, p.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("guides")
    .select(
      "id, title, description, status, visibility, owner_id, created_at, updated_at, deleted_at, recording, owner:profiles!guides_owner_id_fkey(full_name), steps:guide_steps(count)",
      { count: "exact" },
    )
    .eq("workspace_id", p.workspaceId);

  query = p.trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (p.status && p.status !== "all") query = query.eq("status", p.status);
  if (p.scope === "mine") query = query.eq("owner_id", p.userId);
  const q = sanitizeSearch(p.q);
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

  if (p.trash) query = query.order("deleted_at", { ascending: false });
  else if (p.sort === "title") query = query.order("title", { ascending: true });
  else if (p.sort === "created") query = query.order("created_at", { ascending: false });
  else query = query.order("updated_at", { ascending: false });

  const { data, count, error } = await query.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`No se pudo leer la biblioteca: ${error.message}`);

  const rows = data ?? [];
  // Miniatura = captura del primer paso que tenga imagen. Una consulta para toda la página.
  const ids = rows.map((r) => r.id);
  const thumbs = new Map<string, string>();
  if (ids.length) {
    const { data: firstSteps } = await supabase
      .from("guide_steps")
      .select("guide_id, screenshot_path, position")
      .in("guide_id", ids)
      .not("screenshot_path", "is", null)
      .order("position");
    for (const s of firstSteps ?? []) {
      if (!thumbs.has(s.guide_id) && s.screenshot_path) thumbs.set(s.guide_id, s.screenshot_path);
    }
  }
  const signed = await signPaths(supabase, [...thumbs.values()]);

  return {
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    guides: rows.map((r) => ({
      ...r,
      ownerName: r.owner?.full_name ?? "—",
      stepCount: r.steps?.[0]?.count ?? 0,
      thumbUrl: thumbs.has(r.id) ? (signed.get(thumbs.get(r.id)!) ?? null) : null,
    })),
  };
}

export type LibraryGuide = Awaited<ReturnType<typeof listGuides>>["guides"][number];

export async function getGuide(supabase: ServerClient, id: string) {
  const { data: guide, error } = await supabase
    .from("guides")
    .select("*, owner:profiles!guides_owner_id_fkey(full_name, email)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la guía: ${error.message}`);
  if (!guide) return null;

  const { data: steps, error: stepsError } = await supabase
    .from("guide_steps")
    .select("*")
    .eq("guide_id", id)
    .order("position");
  if (stepsError) throw new Error(`No se pudieron leer los pasos: ${stepsError.message}`);

  const signed = await signPaths(supabase, (steps ?? []).map((s) => s.screenshot_path));
  const stepViews: StepView[] = (steps ?? []).map((s) => ({
    ...s,
    imageUrl: s.screenshot_path ? (signed.get(s.screenshot_path) ?? null) : null,
  }));
  return { guide, steps: stepViews };
}

export async function listVersions(supabase: ServerClient, guideId: string) {
  const { data, error } = await supabase
    .from("guide_versions")
    .select("id, version_no, label, created_at, step_count, author:profiles!guide_versions_created_by_fkey(full_name)")
    .eq("guide_id", guideId)
    .order("version_no", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer las versiones: ${error.message}`);
  return (data ?? []).map((v) => ({
    id: v.id,
    versionNo: v.version_no,
    label: v.label,
    createdAt: v.created_at,
    authorName: v.author?.full_name ?? "—",
    stepCount: v.step_count,
  }));
}

export type VersionSummary = Awaited<ReturnType<typeof listVersions>>[number];
