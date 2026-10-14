"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/lib/env";

type Rect = { x: number; y: number; w: number; h: number }; // fracciones 0..1 de la imagen

/**
 * Tapar datos sensibles: el usuario arrastra rectángulos y se rellenan de negro sólido
 * sobre la imagen a resolución completa. No se usa desenfoque porque puede revertirse.
 */
export function RedactDialog({
  path,
  contentType,
  onCancel,
  onApply,
}: {
  path: string;
  contentType: "image/png" | "image/jpeg";
  onCancel: () => void;
  onApply: (blob: Blob) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Se descarga con la sesión (no con la URL firmada) para que el canvas no quede bloqueado por CORS.
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    getBrowserClient()
      .storage.from(MEDIA_BUCKET)
      .download(path)
      .then(({ data, error: dlErr }) => {
        if (cancelled) return;
        if (dlErr || !data) {
          setError("No se pudo cargar la imagen original.");
          return;
        }
        url = URL.createObjectURL(data);
        setSrc(url);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  const point = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  function onDown(e: React.PointerEvent) {
    if (!src) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = point(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    const p = point(e);
    const s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function onUp() {
    if (draft && draft.w > 0.005 && draft.h > 0.005) setRects((r) => [...r, draft]);
    start.current = null;
    setDraft(null);
  }

  async function apply() {
    const img = imgRef.current;
    if (!img || !src || rects.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "#111111";
      for (const r of rects) {
        ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
      }
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, contentType, 0.9));
      if (!blob) throw new Error("No se pudo generar la imagen.");
      await onApply(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo tapar la imagen.");
      setBusy(false);
    }
  }

  const all = draft ? [...rects, draft] : rects;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(1100px,95vw)] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="font-medium">Tapar información sensible</h2>
          <p className="text-xs text-muted">Arrastra sobre la imagen para cubrir correos, contraseñas, montos o datos personales.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy} aria-label="Cerrar"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[70vh] overflow-auto bg-surface-2 p-4">
        <div
          ref={boxRef}
          className="relative mx-auto w-fit cursor-crosshair touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgRef} src={src} alt="Captura a editar" className="block max-h-[62vh] max-w-full" draggable={false} />
          ) : (
            <p className="p-10 text-sm text-muted">{error ?? "Cargando imagen…"}</p>
          )}
          {all.map((r, i) => (
            <div
              key={i}
              className="absolute bg-black/85 ring-2 ring-accent"
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
        <p className="text-xs text-muted">
          Al aplicar se reemplaza la imagen y se borra la original, así que no se puede recuperar el contenido tapado.
        </p>
        <div className="flex gap-2">
          {error && src && <span role="alert" className="self-center text-xs text-danger">{error}</span>}
          <button className="btn btn-sm" onClick={() => setRects((r) => r.slice(0, -1))} disabled={busy || rects.length === 0}>
            <Undo2 className="h-3.5 w-3.5" />Deshacer
          </button>
          <button className="btn btn-sm" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="btn btn-sm btn-primary" onClick={apply} disabled={busy || rects.length === 0}>
            {busy ? "Aplicando…" : `Aplicar (${rects.length})`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
