import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace de confirmación de correo (flujo PKCE).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const url = request.nextUrl.clone();
  url.search = "";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    console.error("[auth] callback", error.code, error.message);
  }
  url.pathname = "/login";
  url.searchParams.set("error", "El enlace no es válido o ya expiró. Inicia sesión de nuevo.");
  return NextResponse.redirect(url);
}
