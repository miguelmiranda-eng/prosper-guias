// Sin "use client": estos componentes se usan en el servidor; las funciones de fecha también desde When.
import { Lock, Users } from "lucide-react";
import { STATUS_LABELS, type GuideStatus, type GuideVisibility } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const STATUS_STYLE: Record<GuideStatus, string> = {
  draft: "bg-warn-soft text-warn",
  published: "bg-ok-soft text-ok",
  archived: "bg-surface-2 text-muted",
};

export function StatusBadge({ status, recording }: { status: GuideStatus; recording?: boolean }) {
  if (recording) return <span className="badge bg-danger-soft text-danger">● Grabando</span>;
  return <span className={`badge ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function VisibilityBadge({ visibility }: { visibility: GuideVisibility }) {
  return visibility === "private" ? (
    <span className="badge bg-surface-2 text-muted" title="Sólo tú puedes verla"><Lock className="h-3 w-3" />Privada</span>
  ) : (
    <span className="badge bg-primary-soft text-primary" title="Visible para el espacio de trabajo"><Users className="h-3 w-3" />Equipo</span>
  );
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-primary-soft p-3 text-primary">{icon}</div>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const dtf = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** "hace 5 minutos"; pasados 7 días, la fecha completa. */
export function timeAgo(iso: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "hace un momento";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return dtf.format(new Date(iso));
}

export function formatDate(iso: string) {
  return dtf.format(new Date(iso));
}
