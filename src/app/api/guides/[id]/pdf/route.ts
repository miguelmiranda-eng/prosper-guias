import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/env";
import { buildGuidePdf, type PdfStep } from "@/lib/pdf/build";
import { pdfFileName } from "@/lib/pdf/text";

export const maxDuration = 60;

// GET /api/guides/:id/pdf → application/pdf (descarga).
// Lee con la sesión del usuario: si RLS no le deja ver la guía, responde 404 sin revelar que existe.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/guides/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Guía inválida." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { data: guide, error } = await supabase
    .from("guides")
    .select("title, description, updated_at, owner:profiles!guides_owner_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[pdf] guía", error.message);
    return NextResponse.json({ error: "No se pudo leer la guía." }, { status: 500 });
  }
  if (!guide) return NextResponse.json({ error: "Guía no encontrada." }, { status: 404 });

  const { data: steps, error: stepsErr } = await supabase
    .from("guide_steps")
    .select("instruction, note, note_kind, screenshot_path, click_x, click_y")
    .eq("guide_id", id)
    .order("position");
  if (stepsErr) {
    console.error("[pdf] pasos", stepsErr.message);
    return NextResponse.json({ error: "No se pudieron leer los pasos." }, { status: 500 });
  }

  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const pdfSteps: PdfStep[] = await Promise.all(
    (steps ?? []).map(async (s) => {
      let image: PdfStep["image"] = null;
      if (s.screenshot_path) {
        const { data: blob, error: dlErr } = await bucket.download(s.screenshot_path);
        if (blob) image = { bytes: new Uint8Array(await blob.arrayBuffer()), type: s.screenshot_path.endsWith(".png") ? "png" : "jpg" };
        else console.error("[pdf] imagen", s.screenshot_path, dlErr?.message);
      }
      return {
        instruction: s.instruction,
        note: s.note,
        noteKind: s.note_kind,
        image,
        click: s.click_x != null && s.click_y != null ? { x: s.click_x, y: s.click_y } : null,
      };
    }),
  );

  const bytes = await buildGuidePdf({
    title: guide.title,
    description: guide.description,
    author: guide.owner?.full_name ?? "",
    updatedAt: new Date(guide.updated_at).toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "UTC" }),
    steps: pdfSteps,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(guide.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
