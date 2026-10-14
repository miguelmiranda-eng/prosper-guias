import type { Metadata } from "next";
import { ForgotPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-xl font-bold">¿Olvidaste tu contraseña?</h1>
      <p className="mb-4 text-sm text-muted">Te mandamos un enlace a tu correo para elegir una nueva.</p>
      <ForgotPasswordForm />
    </>
  );
}
