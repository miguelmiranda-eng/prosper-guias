type PgError = { code?: string; message?: string } | null | undefined;

/** Traduce errores de PostgREST/Postgres a un mensaje que el usuario pueda entender. */
export function friendlyError(error: PgError, fallback = "No se pudo completar la acción."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "42501":
      // Nuestras funciones lanzan 42501 con un mensaje en español; RLS lanza uno en inglés.
      return error.message && !/row-level security|permission denied/i.test(error.message)
        ? error.message
        : "No tienes permiso para hacer esto.";
    case "PGRST116":
      return "No se encontró el elemento o no tienes acceso a él.";
    case "23505":
    case "22023":
    case "P0002":
      return error.message ?? fallback;
    case "23514":
      return "Algún dato no cumple las reglas (longitud o formato).";
    default:
      return fallback;
  }
}
