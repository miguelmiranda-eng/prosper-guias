"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/lib/types";

type Status = { pending: number; error: string | null; savedAt: number | null };

type Ctx = {
  status: Status;
  /** Registra un guardado en curso; el indicador muestra "Guardando…" hasta que termine. */
  track: (p: Promise<ActionResult<unknown>>) => Promise<ActionResult<unknown>>;
  notify: (message: string) => void;
  toast: string | null;
};

const SaveContext = createContext<Ctx | null>(null);

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>({ pending: 0, error: null, savedAt: null });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const track = useCallback(
    async (p: Promise<ActionResult<unknown>>) => {
      setStatus((s) => ({ ...s, pending: s.pending + 1 }));
      let res: ActionResult<unknown>;
      try {
        res = await p;
      } catch (e) {
        console.error("[editor] guardado", e);
        res = { ok: false, error: "Sin conexión con el servidor. Tus últimos cambios no se guardaron." };
      }
      setStatus((s) => ({
        pending: s.pending - 1,
        error: res.ok ? null : res.error,
        savedAt: res.ok ? Date.now() : s.savedAt,
      }));
      if (!res.ok) notify(res.error);
      return res;
    },
    [notify],
  );

  // Avisa al salir si hay guardados en vuelo.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (status.pending > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [status.pending]);

  const value = useMemo(() => ({ status, track, notify, toast }), [status, track, notify, toast]);
  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSave() {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error("useSave fuera de SaveProvider");
  return ctx;
}

export function SaveIndicator() {
  const { status } = useSave();
  if (status.pending > 0) return <span className="text-xs text-muted">Guardando…</span>;
  if (status.error) return <span className="text-xs text-danger">Error al guardar</span>;
  if (status.savedAt) return <span className="text-xs text-ok">Guardado</span>;
  return <span className="text-xs text-muted">Sin cambios</span>;
}

export function Toast() {
  const { toast } = useSave();
  if (!toast) return null;
  return (
    <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-lg">
      {toast}
    </div>
  );
}

/**
 * Guardado automático con espera: agrupa las teclas y guarda 800 ms después de la última.
 * `flush` guarda de inmediato (al salir del campo).
 */
export function useDebouncedSave<T>(save: (value: T) => Promise<ActionResult<unknown>>, delay = 800) {
  const { track } = useSave();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ value: T } | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = latest.current;
    latest.current = null;
    if (pending) void track(saveRef.current(pending.value));
  }, [track]);

  const schedule = useCallback(
    (value: T) => {
      latest.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => () => flush(), [flush]);
  return { schedule, flush };
}
