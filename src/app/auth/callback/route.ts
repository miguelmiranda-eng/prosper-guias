import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces de correo (confirmación y recuperación de contraseña, flujo PKCE).
// `next` sólo acepta rutas internas para no convertirse en una redirección abierta.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  const url = request.nextUrl.clone();
  url.search = "";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      url.pathname = safeNext;
      return NextResponse.redirect(url);
    }
    console.error("[auth] callback", error.code, error.message);
  }
  url.pathname = "/login";
  url.searchParams.set("error", "El enlace no es válido o ya expiró. Pide uno nuevo.");
  return NextResponse.redirect(url);
}
