"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGuidePermanently, restoreGuide } from "@/lib/guides/actions";

export function TrashActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo completar la acción.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={pending} onClick={() => run(() => restoreGuide(id))}>Restaurar</button>
        <button
          className="btn btn-sm btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm(`¿Borrar «${title}» para siempre? Se eliminan también sus imágenes y versiones. No se puede deshacer.`)) {
              run(() => deleteGuidePermanently(id));
            }
          }}
        >
          Borrar para siempre
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
