import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

// Un solo cliente por pestaña. Se usa para subir imágenes directo a Storage (RLS lo valida)
// y no pasar archivos grandes por las funciones del servidor.
export function getBrowserClient() {
  client ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey);
  return client;
}
