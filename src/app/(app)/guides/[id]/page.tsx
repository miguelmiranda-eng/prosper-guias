import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/session";
import { getGuide, listVersions } from "@/lib/guides/queries";
import { canEditGuide, canManageGuide } from "@/lib/permissions";
import { GuideEditor } from "./editor/guide-editor";

export const metadata: Metadata = { title: "Editor" };

export default async function GuideEditorPage({ params }: PageProps<"/guides/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, userId, role } = await getWorkspaceContext();

  // RLS: si no puede leerla, la consulta no la devuelve y respondemos 404 (no se revela que existe).
  const data = await getGuide(supabase, id);
  if (!data) notFound();
  const { guide, steps } = data;

  // Lectores, guías de otros sin permiso de edición o en la papelera: vista de lectura.
  if (!canEditGuide(role, userId, guide)) redirect(`/guides/${id}/view`);

  const versions = await listVersions(supabase, id);
  return (
    <GuideEditor
      // Al restaurar una versión o cambiar estado, la página se vuelve a pedir: remontar resincroniza el estado local.
      key={`${guide.updated_at}-${versions[0]?.id ?? ""}`}
      guide={guide}
      steps={steps}
      versions={versions}
      canManage={canManageGuide(role, userId, guide)}
    />
  );
}
