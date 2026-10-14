"use client";

import { useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Copy, EyeOff, Globe, ImagePlus, ImageOff, Keyboard, ListChecks,
  MessageSquarePlus, MousePointerClick, PenLine, Send, Trash2,
} from "lucide-react";
import type { NoteKind, StepView } from "@/lib/types";
import { NOTE_LABELS } from "@/lib/types";
import { removeStepImage, setStepImage, updateStep } from "@/lib/guides/actions";
import { useDebouncedSave, useSave } from "./save-status";
import { RedactDialog } from "./redact-dialog";
import { discardUpload, uploadGuideImage, validateImage } from "./upload";

const ACTION_ICON: Record<string, typeof Globe> = {
  click: MousePointerClick,
  input: Keyboard,
  select: ListChecks,
  submit: Send,
  navigate: Globe,
  manual: PenLine,
};

export const NOTE_STYLE: Record<NoteKind, string> = {
  tip: "border-ok bg-ok-soft",
  warning: "border-warn bg-warn-soft",
  info: "border-primary bg-primary-soft",
};

export function StepCard({
  guideId,
  step,
  index,
  total,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  busy,
}: {
  guideId: string;
  step: StepView;
  index: number;
  total: number;
  onChange: (s: StepView) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { track, notify } = useSave();
  const fileRef = useRef<HTMLInputElement>(null);
  const [redacting, setRedacting] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [showNote, setShowNote] = useState(Boolean(step.note));

  const instruction = useDebouncedSave((v: string) => updateStep(step.id, { instruction: v }));
  const note = useDebouncedSave((v: string) => updateStep(step.id, { note: v }));

  const Icon = ACTION_ICON[step.action ?? "manual"] ?? PenLine;
  const contentType = step.screenshot_path?.endsWith(".png") ? "image/png" : "image/jpeg";

  async function replaceImage(file: Blob, type: string, keepClick: boolean) {
    setImageBusy(true);
    let path: string | null = null;
    try {
      path = await uploadGuideImage(guideId, file, type);
      const res = await track(setStepImage(guideId, step.id, path, { keepClick }));
      if (res.ok) onChange(res.data as StepView);
      else await discardUpload(path);
    } catch (e) {
      if (path) await discardUpload(path);
      notify(e instanceof Error ? e.message : "No se pudo cambiar la imagen.");
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <article className="card overflow-hidden" aria-label={`Paso ${index + 1}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex flex-col items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-on-primary">
            {index + 1}
          </span>
          <Icon className="h-4 w-4 text-muted" aria-label={step.action ?? "manual"} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <label className="sr-only" htmlFor={`ins-${step.id}`}>Instrucción del paso {index + 1}</label>
          <textarea
            id={`ins-${step.id}`}
            className="input min-h-[2.75rem] resize-y font-medium"
            rows={2}
            maxLength={2000}
            defaultValue={step.instruction}
            placeholder="Describe qué hacer en este paso"
            onChange={(e) => {
              onChange({ ...step, instruction: e.target.value });
              instruction.schedule(e.target.value);
            }}
            onBlur={instruction.flush}
          />
          {(step.page_title || step.page_url) && (
            <p className="truncate text-xs text-muted" title={step.page_url ?? undefined}>
              <Globe className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {step.page_title || step.page_url}
            </p>
          )}
          {showNote && (
            <div className={`rounded-lg border-l-4 p-2 ${NOTE_STYLE[step.note_kind ?? "info"]}`}>
              <div className="mb-1 flex items-center gap-2">
                <select
                  aria-label="Tipo de nota"
                  className="rounded border border-line bg-surface px-1 py-0.5 text-xs"
                  value={step.note_kind ?? "info"}
                  onChange={(e) => {
                    const kind = e.target.value as NoteKind;
                    onChange({ ...step, note_kind: kind });
                    void track(updateStep(step.id, { note_kind: kind }));
                  }}
                >
                  {(Object.keys(NOTE_LABELS) as NoteKind[]).map((k) => (
                    <option key={k} value={k}>{NOTE_LABELS[k]}</option>
                  ))}
                </select>
                <button
                  className="ml-auto text-xs text-muted hover:text-danger"
                  onClick={() => {
                    setShowNote(false);
                    onChange({ ...step, note: "", note_kind: null });
                    void track(updateStep(step.id, { note: "", note_kind: null }));
                  }}
                >
                  Quitar nota
                </button>
              </div>
              <textarea
                aria-label="Texto de la nota"
                className="w-full resize-y bg-transparent text-sm outline-none"
                rows={2}
                maxLength={2000}
                defaultValue={step.note}
                placeholder="Advertencia, consejo o aclaración"
                onChange={(e) => {
                  onChange({ ...step, note: e.target.value });
                  note.schedule(e.target.value);
                }}
                onBlur={note.flush}
              />
            </div>
          )}
        </div>
      </div>

      {step.imageUrl ? (
        <div className="relative border-t border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.imageUrl} alt={`Captura del paso ${index + 1}`} loading="lazy" className="mx-auto block max-h-[520px] w-auto max-w-full" />
          {step.click_x != null && step.click_y != null && (
            <span
              className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-accent/20 shadow-[0_0_0_4px_rgba(5,165,243,0.25)]"
              style={{ left: `${step.click_x * 100}%`, top: `${step.click_y * 100}%` }}
              aria-hidden="true"
            />
          )}
          {imageBusy && <div className="absolute inset-0 flex items-center justify-center bg-surface/70 text-sm">Procesando imagen…</div>}
        </div>
      ) : step.screenshot_path ? (
        <p className="border-t border-line bg-surface-2 p-4 text-center text-xs text-muted">La imagen no se pudo cargar (puede haberse borrado al tapar datos en otra versión).</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 border-t border-line bg-surface px-3 py-2">
        <button className="btn btn-ghost btn-sm" disabled={busy || index === 0} onClick={() => onMove(-1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /><span className="sr-only">Subir</span></button>
        <button className="btn btn-ghost btn-sm" disabled={busy || index === total - 1} onClick={() => onMove(1)} title="Bajar"><ArrowDown className="h-3.5 w-3.5" /><span className="sr-only">Bajar</span></button>
        <span className="mx-1 h-4 w-px bg-line" />
        {!showNote && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNote(true)}><MessageSquarePlus className="h-3.5 w-3.5" />Nota</button>
        )}
        <button className="btn btn-ghost btn-sm" disabled={imageBusy} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" />{step.screenshot_path ? "Reemplazar imagen" : "Agregar imagen"}
        </button>
        {step.screenshot_path && step.imageUrl && (
          <button className="btn btn-ghost btn-sm" disabled={imageBusy} onClick={() => setRedacting(true)}><EyeOff className="h-3.5 w-3.5" />Tapar datos</button>
        )}
        {step.screenshot_path && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={imageBusy}
            onClick={async () => {
              const res = await track(removeStepImage(step.id));
              if (res.ok) onChange({ ...step, screenshot_path: null, imageUrl: null, click_x: null, click_y: null });
            }}
          >
            <ImageOff className="h-3.5 w-3.5" />Quitar imagen
          </button>
        )}
        <span className="ml-auto" />
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" />Duplicar</button>
        <button
          className="btn btn-ghost btn-sm text-danger"
          disabled={busy}
          onClick={() => {
            if (confirm(`¿Eliminar el paso ${index + 1}? Puedes recuperarlo restaurando una versión guardada.`)) onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />Eliminar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const problem = validateImage(file);
            if (problem) return notify(problem);
            void replaceImage(file, file.type, false);
          }}
        />
      </div>

      {redacting && step.screenshot_path && (
        <RedactDialog
          path={step.screenshot_path}
          contentType={contentType}
          onCancel={() => setRedacting(false)}
          onApply={async (blob) => {
            await replaceImage(blob, contentType, true);
            setRedacting(false);
          }}
        />
      )}
    </article>
  );
}
