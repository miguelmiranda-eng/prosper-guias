import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, Pencil } from "lucide-react";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/session";
import { getGuide } from "@/lib/guides/queries";
import { canEditGuide } from "@/lib/permissions";
import { NOTE_LABELS } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { When } from "@/components/when";
import { PrintButton } from "./print-button";

const NOTE_STYLE = { tip: "border-ok bg-ok-soft", warning: "border-warn bg-warn-soft", info: "border-primary bg-primary-soft" } as const;

export async function generateMetadata({ params }: PageProps<"/guides/[id]/view">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Guía" };
  const { supabase } = await getWorkspaceContext();
  const { data } = await supabase.from("guides").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Guía" };
}

export default async function GuideViewPage({ params }: PageProps<"/guides/[id]/view">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, userId, role } = await getWorkspaceContext();
  const data = await getGuide(supabase, id);
  if (!data) notFound();
  const { guide, steps } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <Link href="/guides" className="btn btn-ghost btn-sm"><ArrowLeft className="h-4 w-4" />Biblioteca</Link>
        <div className="ml-auto flex gap-2">
          {canEditGuide(role, userId, guide) && <Link href={`/guides/${id}`} className="btn btn-sm"><Pencil className="h-3.5 w-3.5" />Editar</Link>}
          <PrintButton />
          <a href={`/api/guides/${id}/pdf`} className="btn btn-sm btn-primary"><FileDown className="h-3.5 w-3.5" />Descargar PDF</a>
        </div>
      </div>

      {guide.deleted_at && (
        <p className="no-print mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Esta guía está en la papelera.</p>
      )}

      <article>
        <header className="mb-8 border-b border-line pb-6">
          <div className="no-print mb-2"><StatusBadge status={guide.status} /></div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{guide.title}</h1>
          {guide.description && <p className="mt-2 whitespace-pre-line text-muted">{guide.description}</p>}
          <p className="mt-3 text-xs text-muted">
            {guide.owner?.full_name ?? "—"} · {steps.length} pasos · actualizada <When iso={guide.updated_at} />
          </p>
        </header>

        {steps.length === 0 && <p className="text-sm text-muted">Esta guía todavía no tiene pasos.</p>}

        <ol className="space-y-10">
          {steps.map((s, i) => (
            <li key={s.id} className="print-step">
              <div className="mb-3 flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-on-primary">{i + 1}</span>
                <p className="whitespace-pre-line pt-0.5 font-medium">{s.instruction || <span className="text-muted">(sin instrucción)</span>}</p>
              </div>
              {s.note && (
                <div className={`mb-3 ml-10 rounded-lg border-l-4 p-3 text-sm ${NOTE_STYLE[s.note_kind ?? "info"]}`}>
                  <span className="font-medium">{NOTE_LABELS[s.note_kind ?? "info"]}: </span>
                  <span className="whitespace-pre-line">{s.note}</span>
                </div>
              )}
              {s.imageUrl && (
                <div className="relative ml-10 overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.imageUrl} alt={`Paso ${i + 1}`} loading="lazy" className="block w-full" />
                  {s.click_x != null && s.click_y != null && (
                    <span
                      className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-accent/20"
                      style={{ left: `${s.click_x * 100}%`, top: `${s.click_y * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
