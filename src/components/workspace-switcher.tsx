"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchWorkspace } from "@/lib/team/actions";

export function WorkspaceSwitcher({ current, workspaces }: { current: string; workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (workspaces.length === 1) {
    return <p className="truncate rounded-lg bg-nav-active px-3 py-2 text-xs text-white">{workspaces[0].name}</p>;
  }
  return (
    <label className="block">
      <span className="sr-only">Espacio de trabajo</span>
      <select
        className="w-full rounded-lg border border-white/10 bg-nav-active px-2 py-2 text-xs text-white"
        value={current}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await switchWorkspace(e.target.value);
            if (!res.ok) alert(res.error);
            router.push("/");
          })
        }
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </label>
  );
}
