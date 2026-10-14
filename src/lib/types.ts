import type { Database } from "@/lib/database.types";

type PublicTables = Database["public"]["Tables"];
type PublicEnums = Database["public"]["Enums"];

export type WorkspaceRole = PublicEnums["workspace_role"];
export type GuideStatus = PublicEnums["guide_status"];
export type GuideVisibility = PublicEnums["guide_visibility"];
export type NoteKind = PublicEnums["note_kind"];

export type GuideRow = PublicTables["guides"]["Row"];
export type StepRow = PublicTables["guide_steps"]["Row"];
export type VersionRow = PublicTables["guide_versions"]["Row"];

/** Paso listo para la UI: la ruta privada ya convertida en URL firmada temporal. */
export type StepView = StepRow & { imageUrl: string | null };

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Editor",
  member: "Colaborador",
  viewer: "Lector",
};

export const STATUS_LABELS: Record<GuideStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  archived: "Archivada",
};

export const NOTE_LABELS: Record<NoteKind, string> = {
  tip: "Consejo",
  warning: "Advertencia",
  info: "Nota",
};
