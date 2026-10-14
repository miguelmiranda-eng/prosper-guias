import { getBrowserClient } from "@/lib/supabase/client";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, MEDIA_BUCKET } from "@/lib/env";
import { newMediaPath } from "@/lib/media";

export function validateImage(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "Sólo se aceptan imágenes PNG o JPG.";
  if (file.size > MAX_IMAGE_BYTES) return "La imagen pesa más de 5 MB.";
  return null;
}

/**
 * Sube directo a Storage con la sesión del navegador. RLS sólo deja escribir en la carpeta
 * de una guía que el usuario puede editar; el bucket rechaza otros tipos y tamaños.
 */
export async function uploadGuideImage(guideId: string, file: Blob, contentType: string): Promise<string> {
  const problem = validateImage({ type: contentType, size: file.size });
  if (problem) throw new Error(problem);
  const path = newMediaPath(guideId, contentType);
  const { error } = await getBrowserClient().storage.from(MEDIA_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
  return path;
}

/** Limpia una subida cuyo registro en la base falló, para no dejar archivos huérfanos. */
export async function discardUpload(path: string) {
  const { error } = await getBrowserClient().storage.from(MEDIA_BUCKET).remove([path]);
  if (error) console.error("[upload] no se pudo limpiar", path, error.message);
}
