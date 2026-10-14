import { NextResponse } from "next/server";
import { env } from "@/lib/env";

// GET /api/ext/config → { supabaseUrl, supabaseKey }
// Sólo datos públicos (los mismos que ya viajan al navegador). La extensión los pide para
// hablar con Supabase usando la sesión del usuario; los permisos los aplica RLS.
export function GET() {
  return NextResponse.json(
    { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
