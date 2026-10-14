import type { ServerClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET, SIGNED_URL_TTL } from "@/lib/env";

/** Firma varias rutas privadas en una sola llamada. RLS de Storage decide cuáles se pueden firmar. */
export async function signPaths(supabase: ServerClient, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL);
  if (error) {
    console.error("[media] createSignedUrls", error.message);
    return map;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

/** Ruta nueva para una imagen de la guía. El primer segmento DEBE ser el id de la guía (RLS + constraint). */
export function newMediaPath(guideId: string, contentType: string) {
  const ext = contentType === "image/png" ? "png" : "jpg";
  return `${guideId}/${crypto.randomUUID()}.${ext}`;
}
