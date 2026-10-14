import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { LibraryGuide } from "@/lib/guides/queries";
import { StatusBadge, VisibilityBadge } from "@/components/ui";
import { When } from "@/components/when";

export function GuideCard({ guide }: { guide: LibraryGuide }) {
  return (
    <Link href={`/guides/${guide.id}`} className="card group flex flex-col overflow-hidden transition-colors hover:border-primary">
      <div className="relative aspect-[16/9] bg-surface-2">
        {guide.thumbUrl ? (
          // URL firmada y temporal de Storage: next/image no aporta aquí y obligaría a abrir el dominio.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guide.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted"><ImageOff className="h-6 w-6" aria-hidden="true" /></div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 font-medium group-hover:text-primary">{guide.title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={guide.status} recording={guide.recording} />
          <VisibilityBadge visibility={guide.visibility} />
          <span className="text-xs text-muted">{guide.stepCount} pasos</span>
        </div>
        <p className="mt-auto text-xs text-muted">
          {guide.ownerName} · <When iso={guide.updated_at} relative />
        </p>
      </div>
    </Link>
  );
}
