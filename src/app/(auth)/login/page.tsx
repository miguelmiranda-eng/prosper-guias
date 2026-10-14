import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : undefined;
  return (
    <>
      <h1 className="mb-4 font-display text-xl font-bold">Iniciar sesión</h1>
      <AuthForm mode="login" next={next} initialError={error} />
    </>
  );
}
