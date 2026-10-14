/** Marca propia: un "paso" (escalón) dentro de un círculo. Toma el color por currentColor. */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="currentColor" opacity="0.15" />
      <path
        d="M8 22h5v-5h5v-5h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="12" r="2.5" fill="#05A5F3" />
    </svg>
  );
}

export function BrandName() {
  return (
    <span className="font-display text-lg font-bold tracking-tight">
      Prosper <span className="text-accent">Guías</span>
    </span>
  );
}
