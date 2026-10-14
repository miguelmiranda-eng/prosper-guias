"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getWorkspaceContext, requireSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { MEDIA_BUCKET } from "@/lib/env";
import { newMediaPath, signPaths } from "@/lib/media";
import type { ServerClient } from "@/lib/supabase/server";
import type { ActionResult, StepView } from "@/lib/types";

// Todas las mutaciones de guías pasan por aquí. Validan la forma con zod y dejan que RLS
// y las funciones de la base decidan el permiso: nunca se usa una llave con privilegios.

const uuid = z.uuid();
const noteKind = z.enum(["tip", "warning", "info"]).nullable();

function fail(context: string, error: { code?: string; message?: string } | null, fallback?: string) {
  console.error(`[guides] ${context}`, error?.code, error?.message);
  return { ok: false as const, error: friendlyError(error, fallback) };
}

function invalid(err: z.ZodError) {
  return { ok: false as const, error: err.issues[0]?.message ?? "Datos inválidos." };
}

// ───────────── Guías ─────────────

export async function createGuide() {
  const { supabase, userId, workspace } = await getWorkspaceContext();
  const { data, error } = await supabase
    .from("guides")
    .insert({ workspace_id: workspace.id, owner_id: userId, title: "Guía sin título" })
    .select("id")
    .single();
  if (error) {
    console.error("[guides] createGuide", error.code, error.message);
    redirect(`/guides?error=${encodeURIComponent(friendlyError(error, "No se pudo crear la guía."))}`);
  }
  redirect(`/guides/${data.id}`);
}

const guideFields = z.object({
  title: z.string().trim().min(1, "El título no puede quedar vacío.").max(200, "Máximo 200 caracteres.").optional(),
  description: z.string().max(2000, "Máximo 2000 caracteres.").optional(),
});

export async function updateGuide(id: string, fields: z.input<typeof guideFields>): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, fields: guideFields }).safeParse({ id, fields });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.from("guides").update(parsed.data.fields).eq("id", id);
  if (error) return fail("updateGuide", error);
  return { ok: true, data: undefined };
}

export async function setGuideStatus(id: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, status: z.enum(["draft", "published", "archived"]) }).safeParse({ id, status });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  // Publicar deja una versión: así lo publicado siempre se puede recuperar.
  if (status === "published") {
    const { error: vErr } = await supabase.rpc("create_version", { p_guide: id, p_label: "Publicación" });
    if (vErr) return fail("setGuideStatus/version", vErr);
  }
  const { error } = await supabase.from("guides").update({ status }).eq("id", id);
  if (error) return fail("setGuideStatus", error);
  revalidatePath("/guides");
  revalidatePath(`/guides/${id}`);
  return { ok: true, data: undefined };
}

export async function setGuideVisibility(id: string, visibility: "private" | "workspace"): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, visibility: z.enum(["private", "workspace"]) }).safeParse({ id, visibility });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.from("guides").update({ visibility }).eq("id", id);
  if (error) return fail("setGuideVisibility", error);
  revalidatePath("/guides");
  return { ok: true, data: undefined };
}

export async function trashGuide(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Guía inválida." };
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("guides")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return fail("trashGuide", error);
  if (!data?.length) return { ok: false, error: "No tienes permiso para enviar esta guía a la papelera." };
  revalidatePath("/guides");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

export async function restoreGuide(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Guía inválida." };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.from("guides").update({ deleted_at: null }).eq("id", id).select("id");
  if (error) return fail("restoreGuide", error);
  if (!data?.length) return { ok: false, error: "No tienes permiso para restaurar esta guía." };
  revalidatePath("/guides");
  revalidatePath("/guides/trash");
  return { ok: true, data: undefined };
}

/** Borrado definitivo: sólo desde la papelera. Primero los archivos, luego la fila. */
export async function deleteGuidePermanently(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Guía inválida." };
  const { supabase } = await requireSession();
  const { data: guide } = await supabase.from("guides").select("id, deleted_at").eq("id", id).maybeSingle();
  if (!guide) return { ok: false, error: "Guía no encontrada." };
  if (!guide.deleted_at) return { ok: false, error: "Primero envía la guía a la papelera." };

  const removeErr = await removeFolder(supabase, id);
  if (removeErr) return { ok: false, error: removeErr };

  const { data, error } = await supabase.from("guides").delete().eq("id", id).select("id");
  if (error) return fail("deleteGuidePermanently", error);
  if (!data?.length) return { ok: false, error: "No tienes permiso para borrar esta guía." };
  revalidatePath("/guides/trash");
  return { ok: true, data: undefined };
}

async function removeFolder(supabase: ServerClient, guideId: string): Promise<string | null> {
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  for (;;) {
    const { data: files, error } = await bucket.list(guideId, { limit: 100 });
    if (error) {
      console.error("[guides] removeFolder/list", error.message);
      return "No se pudieron listar las imágenes de la guía.";
    }
    if (!files?.length) return null;
    const { data: removed, error: rmErr } = await bucket.remove(files.map((f) => `${guideId}/${f.name}`));
    if (rmErr) {
      console.error("[guides] removeFolder/remove", rmErr.message);
      return "No se pudieron borrar las imágenes de la guía.";
    }
    if (!removed?.length) return "No tienes permiso para borrar las imágenes de esta guía.";
  }
}

/** Copia la guía (y sus imágenes, a la carpeta de la copia) como borrador privado propio. */
export async function duplicateGuide(id: string): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Guía inválida." };
  const { supabase, userId } = await requireSession();
  const { data: src } = await supabase.from("guides").select("*").eq("id", id).maybeSingle();
  if (!src) return { ok: false, error: "Guía no encontrada." };
  const { data: steps } = await supabase.from("guide_steps").select("*").eq("guide_id", id).order("position");

  const { data: copy, error } = await supabase
    .from("guides")
    .insert({
      workspace_id: src.workspace_id,
      owner_id: userId,
      title: `${src.title} (copia)`.slice(0, 200),
      description: src.description,
      visibility: "private",
    })
    .select("id")
    .single();
  if (error) return fail("duplicateGuide", error);

  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const copied = new Map<string, string>();
  for (const s of steps ?? []) {
    let path: string | null = null;
    if (s.screenshot_path) {
      path = copied.get(s.screenshot_path) ?? newMediaPath(copy.id, s.screenshot_path.endsWith(".png") ? "image/png" : "image/jpeg");
      if (!copied.has(s.screenshot_path)) {
        const { error: cpErr } = await bucket.copy(s.screenshot_path, path);
        if (cpErr) {
          console.error("[guides] duplicateGuide/copy", cpErr.message);
          path = null;
        } else {
          copied.set(s.screenshot_path, path);
        }
      }
    }
    const { error: stepErr } = await supabase.from("guide_steps").insert({
      guide_id: copy.id,
      position: s.position,
      kind: s.kind,
      action: s.action,
      instruction: s.instruction,
      note: s.note,
      note_kind: s.note_kind,
      page_url: s.page_url,
      page_title: s.page_title,
      element_label: s.element_label,
      screenshot_path: path,
      click_x: s.click_x,
      click_y: s.click_y,
    });
    if (stepErr) return fail("duplicateGuide/step", stepErr, "La copia quedó incompleta.");
  }
  revalidatePath("/guides");
  return { ok: true, data: { id: copy.id } };
}

// ───────────── Pasos ─────────────

const stepFields = z.object({
  instruction: z.string().max(2000, "Máximo 2000 caracteres.").optional(),
  note: z.string().max(2000, "Máximo 2000 caracteres.").optional(),
  note_kind: noteKind.optional(),
});

export async function updateStep(stepId: string, fields: z.input<typeof stepFields>): Promise<ActionResult> {
  const parsed = z.object({ stepId: uuid, fields: stepFields }).safeParse({ stepId, fields });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data, error } = await supabase.from("guide_steps").update(parsed.data.fields).eq("id", stepId).select("id");
  if (error) return fail("updateStep", error);
  if (!data?.length) return { ok: false, error: "No tienes permiso para editar este paso." };
  return { ok: true, data: undefined };
}

async function toView(supabase: ServerClient, row: StepView | Omit<StepView, "imageUrl">): Promise<StepView> {
  const signed = await signPaths(supabase, [row.screenshot_path]);
  return { ...row, imageUrl: row.screenshot_path ? (signed.get(row.screenshot_path) ?? null) : null };
}

const imagePath = (guideId: string) =>
  z
    .string()
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/, "Ruta de imagen inválida.")
    .refine((p) => p.startsWith(`${guideId}/`), "La imagen no pertenece a esta guía.");

export async function insertManualStep(
  guideId: string,
  input: { position: number | null; instruction: string; screenshotPath: string | null },
): Promise<ActionResult<StepView>> {
  const parsed = z
    .object({
      guideId: uuid,
      position: z.number().int().min(1).nullable(),
      instruction: z.string().max(2000),
      screenshotPath: imagePath(guideId).nullable(),
    })
    .safeParse({ guideId, ...input });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc("insert_step", {
    p_guide: guideId,
    p_position: input.position ?? undefined,
    p_kind: "manual",
    p_action: "manual",
    p_instruction: input.instruction,
    p_screenshot_path: input.screenshotPath ?? undefined,
  });
  if (error || !data) return fail("insertManualStep", error);
  return { ok: true, data: await toView(supabase, data) };
}

export async function deleteStep(stepId: string): Promise<ActionResult> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: "Paso inválido." };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("delete_step", { p_step: stepId });
  if (error) return fail("deleteStep", error);
  return { ok: true, data: undefined };
}

export async function duplicateStep(stepId: string): Promise<ActionResult<StepView>> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: "Paso inválido." };
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc("duplicate_step", { p_step: stepId });
  if (error || !data) return fail("duplicateStep", error);
  return { ok: true, data: await toView(supabase, data) };
}

export async function reorderSteps(guideId: string, ids: string[]): Promise<ActionResult> {
  const parsed = z.object({ guideId: uuid, ids: z.array(uuid).max(500) }).safeParse({ guideId, ids });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("reorder_steps", { p_guide: guideId, p_ids: ids });
  if (error) return fail("reorderSteps", error, "No se pudo guardar el nuevo orden.");
  return { ok: true, data: undefined };
}

/**
 * Cambia la imagen de un paso (reemplazo o versión tapada). La imagen nueva ya la subió el navegador
 * con su propia sesión. La anterior se borra si ningún otro paso la usa: tapar datos sensibles
 * sólo sirve si el original deja de existir (las versiones viejas que la usaban se quedan sin esa imagen).
 */
export async function setStepImage(
  guideId: string,
  stepId: string,
  path: string,
  opts: { keepClick: boolean },
): Promise<ActionResult<StepView>> {
  const parsed = z
    .object({ guideId: uuid, stepId: uuid, path: imagePath(guideId) })
    .safeParse({ guideId, stepId, path });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();

  const { data: before } = await supabase
    .from("guide_steps")
    .select("screenshot_path")
    .eq("id", stepId)
    .eq("guide_id", guideId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Paso no encontrado." };

  const patch: { screenshot_path: string; click_x?: null; click_y?: null } = { screenshot_path: path };
  if (!opts.keepClick) Object.assign(patch, { click_x: null, click_y: null });
  const { data, error } = await supabase.from("guide_steps").update(patch).eq("id", stepId).select("*").single();
  if (error) return fail("setStepImage", error);

  const old = before.screenshot_path;
  if (old && old !== path) {
    const { count } = await supabase
      .from("guide_steps")
      .select("id", { count: "exact", head: true })
      .eq("screenshot_path", old);
    if (!count) {
      const { error: rmErr } = await supabase.storage.from(MEDIA_BUCKET).remove([old]);
      if (rmErr) console.error("[guides] setStepImage/remove-old", rmErr.message);
    }
  }
  return { ok: true, data: await toView(supabase, data) };
}

export async function removeStepImage(stepId: string): Promise<ActionResult> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: "Paso inválido." };
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("guide_steps")
    .update({ screenshot_path: null, click_x: null, click_y: null })
    .eq("id", stepId)
    .select("id");
  if (error) return fail("removeStepImage", error);
  if (!data?.length) return { ok: false, error: "No tienes permiso para editar este paso." };
  return { ok: true, data: undefined };
}

// ───────────── Versiones ─────────────

export async function createVersion(guideId: string, label: string): Promise<ActionResult> {
  const parsed = z.object({ guideId: uuid, label: z.string().max(200) }).safeParse({ guideId, label });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("create_version", { p_guide: guideId, p_label: label.trim() });
  if (error) return fail("createVersion", error);
  revalidatePath(`/guides/${guideId}`);
  return { ok: true, data: undefined };
}

export async function restoreVersion(guideId: string, versionId: string): Promise<ActionResult> {
  const parsed = z.object({ guideId: uuid, versionId: uuid }).safeParse({ guideId, versionId });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("restore_version", { p_version: versionId });
  if (error) return fail("restoreVersion", error);
  revalidatePath(`/guides/${guideId}`);
  return { ok: true, data: undefined };
}
