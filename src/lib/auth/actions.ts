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

/**
 * Manda el correo de recuperación. Siempre responde lo mismo, exista o no la cuenta,
 * para no revelar qué correos están registrados.
 */
export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.email("Correo inválido.").safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) {
    console.error("[auth] reset", error.code, error.message);
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Se alcanzó el límite de correos. Espera unos minutos e intenta de nuevo." };
    }
  }
  return { info: "Si ese correo tiene cuenta, te llegará un enlace para elegir una contraseña nueva. Ábrelo en este mismo navegador." };
}

const newPasswordSchema = z
  .object({
    password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "El enlace expiró. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[auth] updatePassword", error.code, error.message);
    if (error.code === "same_password") return { error: "Usa una contraseña distinta a la anterior." };
    if (error.code === "weak_password") return { error: "Contraseña demasiado débil; usa una más larga." };
    return { error: "No se pudo cambiar la contraseña." };
  }
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
