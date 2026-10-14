"use client";

import { formatDate, timeAgo } from "@/components/ui";

/**
 * Fecha en la zona horaria del navegador (el servidor de Vercel corre en UTC).
 * El servidor pinta una aproximación y el cliente la corrige al hidratar.
 */
export function When({ iso, relative = false }: { iso: string; relative?: boolean }) {
  return (
    <time dateTime={iso} title={formatDate(iso)} suppressHydrationWarning>
      {relative ? timeAgo(iso) : formatDate(iso)}
    </time>
  );
}
