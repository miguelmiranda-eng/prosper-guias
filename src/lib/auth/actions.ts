"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; info?: string } | undefined;

/** Sólo rutas internas: evita usar ?next= como redirección abierta a otro dominio. */
function safeNext(next: FormDataEntryValue | null) {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

const loginSchema = z.object({
  email: z.email("Correo inválido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Mismo mensaje para correo inexistente y contraseña mala: no revela qué cuentas existen.
    if (error.code === "email_not_confirmed") return { error: "Confirma tu correo antes de entrar (revisa tu bandeja)." };
    return { error: "Correo o contraseña incorrectos." };
  }
  redirect(safeNext(form.get("next")));
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre.").max(120),
  email: z.email("Correo inválido."),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(72),
});

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.name }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    console.error("[auth] signup", error.code, error.message);
    if (error.code === "weak_password") return { error: "Contraseña demasiado débil; usa una más larga." };
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Se alcanzó el límite de correos de confirmación. Intenta más tarde." };
    }
    return { error: "No se pudo crear la cuenta." };
  }
  if (data.session) redirect("/");
  return { info: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y después inicia sesión." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
