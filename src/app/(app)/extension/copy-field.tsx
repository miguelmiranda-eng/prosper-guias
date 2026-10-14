"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input font-mono text-xs" aria-label="Dirección de la app" onFocus={(e) => e.target.select()} />
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            alert("No se pudo copiar; selecciona el texto y cópialo a mano.");
          }
        }}
      >
        {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
