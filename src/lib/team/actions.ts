"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext, requireSession, WORKSPACE_COOKIE } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const role = z.enum(["admin", "editor", "member", "viewer"]);

function fail(context: string, error: { code?: string; message?: string } | null) {
  console.error(`[team] ${context}`, error?.code, error?.message);
  return { ok: false as const, error: friendlyError(error) };
}

export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  const { workspaces } = await getWorkspaceContext();
  if (!workspaces.some((w) => w.id === workspaceId)) return { ok: false, error: "No perteneces a ese espacio." };
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function renameWorkspace(name: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1, "El nombre no puede quedar vacío.").max(80).safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, workspace } = await getWorkspaceContext();
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name: parsed.data })
    .eq("id", workspace.id)
    .select("id");
  if (error) return fail("renameWorkspace", error);
  if (!data?.length) return { ok: false, error: "Sólo propietario o administrador pueden renombrar el espacio." };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function addMember(email: string, memberRole: string): Promise<ActionResult> {
  const parsed = z.object({ email: z.email("Correo inválido."), role }).safeParse({ email, role: memberRole });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, workspace } = await getWorkspaceContext();
  const { error } = await supabase.rpc("add_member", {
    p_ws: workspace.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return fail("addMember", error);
  revalidatePath("/team");
  return { ok: true, data: undefined };
}

export async function updateMemberRole(userId: string, memberRole: string): Promise<ActionResult> {
  const parsed = z
    .object({ userId: z.uuid(), role: z.enum(["owner", "admin", "editor", "member", "viewer"]) })
    .safeParse({ userId, role: memberRole });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { supabase, workspace } = await getWorkspaceContext();
  const { error } = await supabase.rpc("update_member_role", {
    p_ws: workspace.id,
    p_user: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return fail("updateMemberRole", error);
  revalidatePath("/team");
  return { ok: true, data: undefined };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Miembro inválido." };
  const { supabase, workspace } = await getWorkspaceContext();
  const { error } = await supabase.rpc("remove_member", { p_ws: workspace.id, p_user: userId });
  if (error) return fail("removeMember", error);
  revalidatePath("/team");
  return { ok: true, data: undefined };
}

export async function updateProfileName(name: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1, "Escribe tu nombre.").max(120).safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, userId } = await requireSession();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", userId);
  if (error) return fail("updateProfileName", error);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
