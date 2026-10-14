import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/lib/types";

export const WORKSPACE_COOKIE = "pg_ws";

/** Sesión verificada (firma del JWT). Redirige a /login si no hay. */
export const requireSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? "" };
});

/**
 * Espacio de trabajo activo. La cookie sólo elige entre los espacios donde el usuario YA es miembro;
 * poner otro id en la cookie no da acceso a nada (RLS filtra igual).
 */
export const getWorkspaceContext = cache(async () => {
  const { supabase, userId, email } = await requireSession();
  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("role, created_at, workspace:workspaces(id, name)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw new Error(`No se pudieron leer tus espacios de trabajo: ${error.message}`);

  const list = (memberships ?? [])
    .filter((m) => m.workspace)
    .map((m) => ({ id: m.workspace!.id, name: m.workspace!.name, role: m.role as WorkspaceRole }));
  if (list.length === 0) {
    throw new Error("Tu cuenta no pertenece a ningún espacio de trabajo.");
  }
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const current = list.find((w) => w.id === wanted) ?? list[0];

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return {
    supabase,
    userId,
    profile: { name: profile?.full_name || email, email: profile?.email ?? email },
    workspace: current,
    role: current.role,
    workspaces: list,
  };
});
