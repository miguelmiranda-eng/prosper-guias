import type { Metadata } from "next";
import { ResetPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: "Contraseña nueva" };

// Se llega aquí desde el enlace del correo (ya con sesión). Sin sesión, el proxy manda a /login.
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-4 font-display text-xl font-bold">Elige tu contraseña nueva</h1>
      <ResetPasswordForm />
    </>
  );
}
