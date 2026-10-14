"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type AuthState } from "@/lib/auth/actions";

function Messages({ state }: { state: AuthState }) {
  return (
    <>
      {state?.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.info && <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.info}</p>}
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <Messages state={state} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link className="font-medium text-primary hover:underline" href="/login">Volver a iniciar sesión</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Contraseña nueva</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required />
        <p className="mt-1 text-xs text-muted">Mínimo 10 caracteres.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Repítela</label>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={10} required />
      </div>
      <Messages state={state} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
