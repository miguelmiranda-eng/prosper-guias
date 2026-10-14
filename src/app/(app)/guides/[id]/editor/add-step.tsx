"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { StepView } from "@/lib/types";
import { insertManualStep } from "@/lib/guides/actions";
import { useSave } from "./save-status";
import { discardUpload, uploadGuideImage, validateImage } from "./upload";

/** Paso manual: para lo que la grabación no detecta (atajos, apps de escritorio, avisos). */
export function AddStep({
  guideId,
  position,
  onAdded,
  compact = false,
}: {
  guideId: string;
  position: number | null;
  onAdded: (s: StepView) => void;
  compact?: boolean;
}) {
  const { track, notify } = useSave();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return compact ? (
      <div className="group flex justify-center py-1">
        <button
          className="flex items-center gap-1 rounded-full px-3 py-0.5 text-xs text-muted opacity-60 hover:bg-surface hover:text-primary hover:opacity-100 focus:opacity-100"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3 w-3" />Insertar paso aquí
        </button>
      </div>
    ) : (
      <button className="btn w-full border-dashed py-3" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />Agregar paso manual
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    let path: string | null = null;
    try {
      if (file) path = await uploadGuideImage(guideId, file, file.type);
      const res = await track(insertManualStep(guideId, { position, instruction: text.trim(), screenshotPath: path }));
      if (res.ok) {
        onAdded(res.data as StepView);
        setText("");
        setFile(null);
        setOpen(false);
      } else if (path) {
        await discardUpload(path);
      }
    } catch (e) {
      if (path) await discardUpload(path);
      notify(e instanceof Error ? e.message : "No se pudo agregar el paso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card my-2 space-y-3 border-primary p-4">
      <p className="text-sm font-medium">Nuevo paso manual</p>
      <textarea
        className="input"
        rows={2}
        maxLength={2000}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ej. Presiona Ctrl + S para guardar el reporte"
      />
      <div>
        <label className="label" htmlFor={`file-${position ?? "end"}`}>Imagen (opcional, PNG o JPG, máx. 5 MB)</label>
        <input
          id={`file-${position ?? "end"}`}
          type="file"
          accept="image/png,image/jpeg"
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            const problem = f ? validateImage(f) : null;
            if (problem) {
              notify(problem);
              e.target.value = "";
              return;
            }
            setFile(f);
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
        <button className="btn btn-sm btn-primary" onClick={submit} disabled={busy || (!text.trim() && !file)}>
          {busy ? "Agregando…" : "Agregar paso"}
        </button>
      </div>
    </div>
  );
}
