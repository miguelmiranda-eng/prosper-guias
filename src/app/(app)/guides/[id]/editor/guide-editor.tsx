"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { ArrowLeft, Copy, Eye, FileDown, Lock, Trash2, Users } from "lucide-react";
import type { GuideRow, GuideStatus, StepView } from "@/lib/types";
import type { VersionSummary } from "@/lib/guides/queries";
import {
  deleteStep, duplicateGuide, duplicateStep, reorderSteps, setGuideStatus, setGuideVisibility, trashGuide, updateGuide,
} from "@/lib/guides/actions";
import { StatusBadge } from "@/components/ui";
import { When } from "@/components/when";
import { SaveIndicator, SaveProvider, Toast, useDebouncedSave, useSave } from "./save-status";
import { StepCard } from "./step-card";
import { AddStep } from "./add-step";
import { VersionsPanel } from "./versions-panel";

type Props = {
  guide: GuideRow & { owner: { full_name: string; email: string } | null };
  steps: StepView[];
  versions: VersionSummary[];
  canManage: boolean;
};

export function GuideEditor(props: Props) {
  return (
    <SaveProvider>
      <EditorBody {...props} />
      <Toast />
    </SaveProvider>
  );
}

function EditorBody({ guide, steps: initialSteps, versions, canManage }: Props) {
  const router = useRouter();
  const { track, notify } = useSave();
  const [steps, setSteps] = useState(initialSteps);
  const [title, setTitle] = useState(guide.title);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();

  const titleSave = useDebouncedSave((v: string) => updateGuide(guide.id, { title: v }));
  const descSave = useDebouncedSave((v: string) => updateGuide(guide.id, { description: v }));

  const replaceStep = (s: StepView) => setSteps((list) => list.map((x) => (x.id === s.id ? s : x)));
  const renumber = (list: StepView[]) => list.map((s, i) => ({ ...s, position: i + 1 }));

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const before = steps;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(renumber(next));
    setBusy(true);
    const res = await track(reorderSteps(guide.id, next.map((s) => s.id)));
    setBusy(false);
    if (!res.ok) {
      setSteps(before);
      router.refresh();
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await track(deleteStep(id));
    setBusy(false);
    if (res.ok) setSteps((list) => renumber(list.filter((s) => s.id !== id)));
  }

  async function duplicate(index: number) {
    setBusy(true);
    const res = await track(duplicateStep(steps[index].id));
    setBusy(false);
    if (res.ok) {
      const copy = res.data as StepView;
      setSteps((list) => renumber([...list.slice(0, index + 1), copy, ...list.slice(index + 1)]));
    }
  }

  function inserted(s: StepView) {
    setSteps((list) => renumber([...list.slice(0, s.position - 1), s, ...list.slice(s.position - 1)]));
  }

  function changeStatus(status: GuideStatus) {
    start(async () => {
      titleSave.flush();
      descSave.flush();
      const res = await track(setGuideStatus(guide.id, status));
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="no-print sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href="/guides" className="btn btn-ghost btn-sm" aria-label="Volver a la biblioteca"><ArrowLeft className="h-4 w-4" /></Link>
        <StatusBadge status={guide.status} recording={guide.recording} />
        <SaveIndicator />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={`/guides/${guide.id}/view`} className="btn btn-sm"><Eye className="h-3.5 w-3.5" />Vista previa</Link>
          <a href={`/api/guides/${guide.id}/pdf`} className="btn btn-sm"><FileDown className="h-3.5 w-3.5" />PDF</a>
          {guide.status === "published" ? (
            <button className="btn btn-sm" disabled={pending} onClick={() => changeStatus("draft")}>Regresar a borrador</button>
          ) : (
            <button className="btn btn-sm btn-primary" disabled={pending || steps.length === 0 || guide.recording} onClick={() => changeStatus("published")}>
              Publicar
            </button>
          )}
        </div>
      </div>

      {guide.recording && (
        <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          Esta guía se está grabando con la extensión. Los pasos nuevos aparecerán al recargar; termina la grabación antes de publicar.
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <label className="sr-only" htmlFor="title">Título</label>
            <input
              id="title"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-3xl font-bold tracking-tight hover:border-line focus:border-primary focus:outline-none"
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) titleSave.schedule(e.target.value.trim());
              }}
              onBlur={() => {
                if (!title.trim()) setTitle(guide.title);
                titleSave.flush();
              }}
            />
            <label className="sr-only" htmlFor="description">Descripción</label>
            <textarea
              id="description"
              className="w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1 text-muted hover:border-line focus:border-primary focus:outline-none"
              rows={2}
              maxLength={2000}
              defaultValue={guide.description}
              placeholder="Agrega una descripción: para qué sirve este proceso y quién debe seguirlo"
              onChange={(e) => descSave.schedule(e.target.value)}
              onBlur={descSave.flush}
            />
            <p className="px-2 text-xs text-muted">
              {guide.owner?.full_name ?? "—"} · creada <When iso={guide.created_at} /> · modificada <When iso={guide.updated_at} relative />
            </p>
          </div>

          {steps.length === 0 && (
            <p className="card p-6 text-center text-sm text-muted">
              Esta guía no tiene pasos. Agrega pasos manuales o graba el proceso con la extensión.
            </p>
          )}

          {steps.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && <AddStep compact guideId={guide.id} position={i + 1} onAdded={inserted} />}
              <StepCard
                guideId={guide.id}
                step={s}
                index={i}
                total={steps.length}
                busy={busy}
                onChange={replaceStep}
                onMove={(dir) => move(i, dir)}
                onDuplicate={() => duplicate(i)}
                onDelete={() => remove(s.id)}
              />
            </Fragment>
          ))}

          <AddStep guideId={guide.id} position={null} onAdded={inserted} />
        </div>

        <aside className="no-print space-y-4 xl:sticky xl:top-20 xl:self-start">
          {canManage && (
            <section className="card space-y-3 p-4">
              <h2 className="font-medium">Acceso</h2>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 text-xs" role="radiogroup" aria-label="Visibilidad">
                {(["private", "workspace"] as const).map((v) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={guide.visibility === v}
                    disabled={pending}
                    className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 ${guide.visibility === v ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
                    onClick={() =>
                      start(async () => {
                        const res = await track(setGuideVisibility(guide.id, v));
                        if (res.ok) router.refresh();
                      })
                    }
                  >
                    {v === "private" ? <><Lock className="h-3 w-3" />Sólo yo</> : <><Users className="h-3 w-3" />Equipo</>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                {guide.visibility === "private" ? "Sólo tú la ves." : "Todo el espacio de trabajo puede verla; editores y administradores pueden editarla."}
              </p>
            </section>
          )}

          <VersionsPanel guideId={guide.id} versions={versions} canEdit />

          <section className="card space-y-2 p-4">
            <h2 className="font-medium">Más acciones</h2>
            <button
              className="btn btn-sm w-full justify-start"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await track(duplicateGuide(guide.id));
                  if (res.ok) router.push(`/guides/${(res.data as { id: string }).id}`);
                })
              }
            >
              <Copy className="h-3.5 w-3.5" />Duplicar guía
            </button>
            {guide.status !== "archived" && (
              <button className="btn btn-sm w-full justify-start" disabled={pending} onClick={() => changeStatus("archived")}>
                Archivar
              </button>
            )}
            {canManage && (
              <button
                className="btn btn-sm w-full justify-start text-danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm("¿Enviar esta guía a la papelera? Podrás restaurarla desde ahí.")) return;
                  start(async () => {
                    const res = await track(trashGuide(guide.id));
                    if (res.ok) router.push("/guides");
                    else notify(res.error);
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />Enviar a la papelera
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
