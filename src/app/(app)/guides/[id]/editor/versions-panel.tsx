"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { History, Save } from "lucide-react";
import type { VersionSummary } from "@/lib/guides/queries";
import { createVersion, restoreVersion } from "@/lib/guides/actions";
import { When } from "@/components/when";
import { useSave } from "./save-status";

export function VersionsPanel({ guideId, versions, canEdit }: { guideId: string; versions: VersionSummary[]; canEdit: boolean }) {
  const router = useRouter();
  const { track } = useSave();
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();

  return (
    <section className="card p-4" aria-labelledby="versions-title">
      <h2 id="versions-title" className="mb-3 flex items-center gap-2 font-medium"><History className="h-4 w-4" />Versiones</h2>
      {canEdit && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await track(createVersion(guideId, label));
              if (res.ok) {
                setLabel("");
                router.refresh();
              }
            });
          }}
        >
          <input
            className="input py-1.5 text-xs"
            placeholder="Nombre (opcional)"
            value={label}
            maxLength={200}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Nombre de la versión"
          />
          <button type="submit" className="btn btn-sm whitespace-nowrap" disabled={pending}><Save className="h-3.5 w-3.5" />Guardar versión</button>
        </form>
      )}
      {versions.length === 0 ? (
        <p className="text-xs text-muted">
          Aún no hay versiones. Guarda una antes de cambios grandes; al publicar se guarda una sola.
        </p>
      ) : (
        <ol className="max-h-80 space-y-2 overflow-y-auto">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-line p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">v{v.versionNo}{v.label ? ` · ${v.label}` : ""}</span>
                {canEdit && (
                  <button
                    className="text-primary hover:underline disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`¿Restaurar la v${v.versionNo}? El estado actual se guarda antes como versión nueva.`)) return;
                      start(async () => {
                        const res = await track(restoreVersion(guideId, v.id));
                        if (res.ok) router.refresh();
                      });
                    }}
                  >
                    Restaurar
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-muted">{v.authorName} · {v.stepCount} pasos · <When iso={v.createdAt} relative /></p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
