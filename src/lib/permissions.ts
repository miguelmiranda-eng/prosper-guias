import type { WorkspaceRole } from "@/lib/types";

// Espejo de las funciones can_* de la base, SÓLO para decidir qué botones mostrar.
// La autoridad es la base: si esto se desincroniza, el servidor rechaza la acción igual.

export function canCreateGuides(role: WorkspaceRole) {
  return role !== "viewer";
}

export function canManageTeam(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

type GuideLike = { owner_id: string; visibility: string; deleted_at: string | null };

export function canEditGuide(role: WorkspaceRole, userId: string, g: GuideLike) {
  if (g.deleted_at || role === "viewer") return false;
  return g.owner_id === userId || (g.visibility === "workspace" && ["owner", "admin", "editor"].includes(role));
}

export function canManageGuide(role: WorkspaceRole, userId: string, g: GuideLike) {
  if (role === "viewer") return false;
  return g.owner_id === userId || (g.visibility === "workspace" && (role === "owner" || role === "admin"));
}
