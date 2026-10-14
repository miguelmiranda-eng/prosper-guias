// Cliente mínimo de Supabase sobre fetch (sin dependencias ni paso de compilación).
// Usa la llave PÚBLICA del proyecto y el token del usuario: RLS decide qué puede escribir.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readError(res) {
  try {
    const body = await res.json();
    return body.msg || body.message || body.error_description || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Lee la configuración pública desde la app (URL y llave pública de Supabase). */
export async function fetchConfig(appUrl) {
  const base = appUrl.replace(/\/+$/, "");
  const url = new URL(base);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new ApiError("La dirección de la app debe usar https.", 0);
  }
  const res = await fetch(`${base}/api/ext/config`, { cache: "no-store" });
  if (!res.ok) throw new ApiError("No se encontró Prosper Guías en esa dirección.", res.status);
  const cfg = await res.json();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new ApiError("Respuesta de configuración incompleta.", 0);
  return { appUrl: base, supabaseUrl: cfg.supabaseUrl, supabaseKey: cfg.supabaseKey };
}

function sessionFrom(body) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    user: { id: body.user.id, email: body.user.email },
  };
}

export async function signIn(cfg, email, password) {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new ApiError(res.status === 400 ? "Correo o contraseña incorrectos." : await readError(res), res.status);
  }
  return sessionFrom(await res.json());
}

export async function refreshSession(cfg, session) {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: cfg.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) throw new ApiError("La sesión expiró. Vuelve a iniciar sesión.", res.status);
  return sessionFrom(await res.json());
}

export async function signOut(cfg, session) {
  await fetch(`${cfg.supabaseUrl}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${session.access_token}` },
  }).catch((e) => console.warn("[api] logout", e));
}

function headers(cfg, session, extra = {}) {
  return { apikey: cfg.supabaseKey, Authorization: `Bearer ${session.access_token}`, ...extra };
}

export async function rest(cfg, session, path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: headers(cfg, session, {
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.status === 204 ? null : res.json();
}

export async function rpc(cfg, session, fn, args) {
  return rest(cfg, session, `rpc/${fn}`, { method: "POST", body: args });
}

export async function uploadImage(cfg, session, path, blob) {
  const res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/guide-media/${path}`, {
    method: "POST",
    headers: headers(cfg, session, { "Content-Type": blob.type, "x-upsert": "false" }),
    body: blob,
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
}
