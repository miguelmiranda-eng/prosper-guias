"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Tema del sistema", light: "Tema claro", dark: "Tema oscuro" };

function read(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("pg-theme");
      else localStorage.setItem("pg-theme", next);
    } catch {
      // Sin almacenamiento local (modo privado): el tema dura sólo esta pestaña.
    }
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="rounded-lg p-1.5 text-nav-ink hover:bg-nav-active hover:text-white"
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]} (cambiar)`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
