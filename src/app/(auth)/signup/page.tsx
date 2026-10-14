import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-xl font-bold">Crear cuenta</h1>
      <p className="mb-4 text-sm text-muted">Se crea un espacio de trabajo personal; después te pueden agregar al del equipo.</p>
      <AuthForm mode="signup" />
    </>
  );
}
