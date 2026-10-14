"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthState } from "@/lib/auth/actions";

export function AuthForm({ mode, next, initialError }: { mode: "login" | "signup"; next?: string; initialError?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? login : signup,
    initialError ? { error: initialError } : undefined,
  );

  return (
    <form action={action} className="space-y-4">
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">Nombre</label>
          <input id="name" name="name" className="input" autoComplete="name" required maxLength={120} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 10 : undefined}
          required
        />
        {mode === "signup" && <p className="mt-1 text-xs text-muted">Mínimo 10 caracteres.</p>}
        {mode === "login" && (
          <p className="mt-1 text-right text-xs">
            <Link className="text-primary hover:underline" href="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </p>
        )}
      </div>
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
      {state?.info && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.info}</p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>¿No tienes cuenta? <Link className="font-medium text-primary hover:underline" href="/signup">Regístrate</Link></>
        ) : (
          <>¿Ya tienes cuenta? <Link className="font-medium text-primary hover:underline" href="/login">Inicia sesión</Link></>
        )}
      </p>
    </form>
  );
}
