import { BrandMark, BrandName } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <BrandMark />
          <span className="text-ink"><BrandName /></span>
        </div>
        <div className="card p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">Documentación de procesos · Prosper Manufacturing</p>
      </div>
    </main>
  );
}
