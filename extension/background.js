// Service worker del grabador. Recibe acciones de las páginas, toma la captura de la pestaña
// visible y las sube en orden a Prosper Guías. Todo el estado vive en chrome.storage.local
// para sobrevivir a que Chrome duerma el service worker o se cierre el navegador.
import * as api from "./api.js";

const PLACEHOLDER_TITLE = "Grabación en curso";
const CAPTURE_GAP_MS = 550; // Chrome permite ~2 capturas por segundo.
const RETRY_ALARM = "pg-retry";

// ───────── Estado ─────────
const get = (keys) => chrome.storage.local.get(keys);

// Serializa las escrituras de estado: varios clics seguidos no deben pisarse la cola.
let stateLock = Promise.resolve();
function mutate(keys, fn) {
  const run = stateLock.then(async () => {
    const s = await get(keys);
    const patch = await fn(s);
    if (patch) await chrome.storage.local.set(patch);
    return patch;
  });
  stateLock = run.catch((e) => console.error("[pg] mutate", e));
  return run;
}

// ───────── Sesión ─────────
let refreshing = null;
async function getSession() {
  const { cfg, session } = await get(["cfg", "session"]);
  if (!cfg) throw new api.ApiError("Configura la dirección de Prosper Guías.", 0);
  if (!session) throw new api.ApiError("Inicia sesión en la extensión.", 401);
  if (session.expires_at - 60 > Date.now() / 1000) return { cfg, session };
  refreshing ??= api
    .refreshSession(cfg, session)
    .then(async (s) => {
      await chrome.storage.local.set({ session: s });
      return s;
    })
    .catch(async (e) => {
      if (e.status === 400 || e.status === 401) await chrome.storage.local.remove("session");
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return { cfg, session: await refreshing };
}

// ───────── Captura ─────────
let captureLock = Promise.resolve();
let lastCapture = 0;
function capture(windowId) {
  const run = captureLock.then(async () => {
    const wait = lastCapture + CAPTURE_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCapture = Date.now();
    return chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 72 });
  });
  captureLock = run.catch(() => undefined);
  return run;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Registra un paso: captura (si procede) y lo encola. Nunca guarda valores escritos en campos. */
async function ingest(tab, ev) {
  const { rec } = await get(["rec"]);
  if (!rec || rec.status !== "recording") return;
  let image = null;
  let captureError = null;
  if (!ev.sensitive && tab.active) {
    try {
      image = await capture(tab.windowId);
    } catch (e) {
      captureError = String(e?.message || e);
      console.warn("[pg] captura", captureError);
    }
  }
  const item = {
    id: crypto.randomUUID(),
    guideId: rec.guideId,
    kind: ev.action === "manual" ? "manual" : "action",
    action: ev.action,
    instruction: String(ev.instruction || "").slice(0, 2000),
    elementLabel: ev.label ? String(ev.label).slice(0, 200) : null,
    pageUrl: String(tab.url || "").slice(0, 2048),
    pageTitle: String(tab.title || "").slice(0, 300),
    clickX: image && Number.isFinite(ev.x) ? Math.min(1, Math.max(0, ev.x)) : null,
    clickY: image && Number.isFinite(ev.y) ? Math.min(1, Math.max(0, ev.y)) : null,
    image,
    path: null,
  };
  const host = hostOf(tab.url);
  let stepNo = 0;
  await mutate(["queue", "rec"], (s) => {
    stepNo = (s.rec?.captured || 0) + 1;
    if (!s.rec || s.rec.guideId !== item.guideId) return null;
    return {
      queue: [...(s.queue || []), item],
      rec: {
        ...s.rec,
        captured: (s.rec.captured || 0) + 1,
        noImage: (s.rec.noImage || 0) + (image ? 0 : 1),
        hosts: host && !s.rec.hosts.includes(host) ? [...s.rec.hosts, host] : s.rec.hosts,
        lastCaptureError: captureError,
      },
    };
  });
  void kick();
  return stepNo;
}

/**
 * Las páginas que ya estaban abiertas antes de instalar o recargar la extensión no tienen
 * el script de grabación: se lo inyectamos al empezar, para que los clics cuenten desde ya.
 */
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map((t) =>
      chrome.scripting
        .executeScript({ target: { tabId: t.id }, files: ["content.js"] })
        .catch((e) => console.warn("[pg] no se pudo preparar la pestaña", t.url, e?.message)),
    ),
  );
}

// ───────── Cola de subida ─────────
let draining = null;
function kick() {
  draining ??= drain().finally(() => {
    draining = null;
  });
  return draining;
}

async function drain() {
  for (;;) {
    const { queue = [], rec } = await get(["queue", "rec"]);
    const item = queue[0];
    if (!item) {
      await chrome.alarms.clear(RETRY_ALARM);
      if (rec?.status === "finishing") await finalize(rec);
      await updateBadge();
      return;
    }
    try {
      const { cfg, session } = await getSession();
      let path = item.path;
      if (item.image && !path) {
        path = `${item.guideId}/${crypto.randomUUID()}.jpg`;
        const blob = await (await fetch(item.image)).blob();
        await api.uploadImage(cfg, session, path, blob);
        // Se recuerda la ruta para no volver a subir la imagen si falla el paso siguiente.
        await mutate(["queue"], (s) => ({ queue: (s.queue || []).map((q) => (q.id === item.id ? { ...q, path } : q)) }));
      }
      await api.rpc(cfg, session, "insert_step", {
        p_guide: item.guideId,
        p_kind: item.kind,
        p_action: item.action,
        p_instruction: item.instruction,
        p_page_url: item.pageUrl || null,
        p_page_title: item.pageTitle || null,
        p_element_label: item.elementLabel,
        p_screenshot_path: path,
        p_click_x: path ? item.clickX : null,
        p_click_y: path ? item.clickY : null,
      });
      await mutate(["queue", "rec"], (s) => ({
        queue: (s.queue || []).filter((q) => q.id !== item.id),
        rec: s.rec && s.rec.guideId === item.guideId ? { ...s.rec, saved: (s.rec.saved || 0) + 1, lastError: null } : s.rec,
      }));
    } catch (e) {
      const status = e?.status ?? 0;
      const permanent = status >= 400 && status < 500 && ![401, 408, 429].includes(status);
      console.error("[pg] subida", status, e?.message);
      if (permanent) {
        // La base rechazó el paso (sin permiso, guía borrada o dato inválido): no se reintenta para no atascar la cola.
        await mutate(["queue", "rec"], (s) => ({
          queue: (s.queue || []).filter((q) => q.id !== item.id),
          rec: s.rec ? { ...s.rec, dropped: (s.rec.dropped || 0) + 1, lastError: `Un paso fue rechazado: ${e.message}` } : s.rec,
        }));
        continue;
      }
      await mutate(["rec"], (s) => (s.rec ? { rec: { ...s.rec, lastError: `Sin conexión o sesión vencida; se reintentará. (${e.message})` } } : null));
      await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 0.5 });
      await updateBadge();
      return;
    }
  }
}

async function finalize(rec) {
  try {
    const { cfg, session } = await getSession();
    const date = new Date(rec.startedAt).toLocaleDateString("es-MX", { dateStyle: "long" });
    const main = rec.hosts[0] || "el navegador";
    // Título y descripción automáticos (reglas fijas, no IA). Sólo si el usuario no los cambió ya.
    await api.rest(cfg, session, `guides?id=eq.${rec.guideId}&title=eq.${encodeURIComponent(PLACEHOLDER_TITLE)}`, {
      method: "PATCH",
      body: {
        title: `Proceso en ${main}`.slice(0, 200),
        description: `Grabado con la extensión el ${date}: ${rec.saved || 0} pasos en ${rec.hosts.join(", ") || "el navegador"}. Revisa las instrucciones y tapa datos sensibles antes de publicar.`.slice(0, 2000),
      },
      prefer: "return=minimal",
    });
    await api.rest(cfg, session, `guides?id=eq.${rec.guideId}`, {
      method: "PATCH",
      body: { recording: false },
      prefer: "return=minimal",
    });
    await chrome.storage.local.set({ rec: null, lastRecording: { guideId: rec.guideId, saved: rec.saved || 0, dropped: rec.dropped || 0, noImage: rec.noImage || 0, at: Date.now() } });
    await chrome.tabs.create({ url: `${cfg.appUrl}/guides/${rec.guideId}` });
  } catch (e) {
    console.error("[pg] finalizar", e?.status, e?.message);
    await mutate(["rec"], (s) => (s.rec ? { rec: { ...s.rec, lastError: `No se pudo cerrar la grabación: ${e.message}` } } : null));
    await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 0.5 });
  }
  await updateBadge();
}

// ───────── Controles ─────────
async function start(windowId) {
  const { cfg, session } = await getSession();
  const { workspaceId, rec } = await get(["workspaceId", "rec"]);
  if (rec) throw new Error("Ya hay una grabación en curso.");
  if (!workspaceId) throw new Error("Elige un espacio de trabajo.");
  const [guide] = await api.rest(cfg, session, "guides?select=id", {
    method: "POST",
    body: {
      workspace_id: workspaceId,
      owner_id: session.user.id,
      title: PLACEHOLDER_TITLE,
      source: "extension",
      recording: true,
      visibility: "private",
    },
    prefer: "return=representation",
  });
  await chrome.storage.local.set({
    rec: { guideId: guide.id, status: "recording", startedAt: Date.now(), captured: 0, saved: 0, dropped: 0, noImage: 0, hosts: [], lastError: null },
  });
  await updateBadge();
  await injectIntoOpenTabs();
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab && /^https?:/.test(tab.url || "")) {
    await ingest(tab, { action: "navigate", instruction: `Abre «${tab.title || hostOf(tab.url)}»` });
  }
}

async function setStatus(status) {
  await mutate(["rec"], (s) => (s.rec && s.rec.status !== "finishing" ? { rec: { ...s.rec, status } } : null));
  await updateBadge();
}

async function stop() {
  await mutate(["rec"], (s) => (s.rec ? { rec: { ...s.rec, status: "finishing" } } : null));
  await updateBadge();
  await kick();
}

/** Descarta la grabación: la guía se va a la papelera (recuperable) y se vacía su cola. */
async function discard() {
  const { rec } = await get(["rec"]);
  if (!rec) return;
  await mutate(["queue"], (s) => ({ queue: (s.queue || []).filter((q) => q.guideId !== rec.guideId) }));
  try {
    const { cfg, session } = await getSession();
    await api.rest(cfg, session, `guides?id=eq.${rec.guideId}`, {
      method: "PATCH",
      body: { recording: false, deleted_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
  } catch (e) {
    console.error("[pg] descartar", e?.message);
  }
  await chrome.storage.local.set({ rec: null });
  await updateBadge();
}

async function updateBadge() {
  const { rec, queue = [] } = await get(["rec", "queue"]);
  const text = !rec ? (queue.length ? String(queue.length) : "") : rec.status === "recording" ? "REC" : rec.status === "paused" ? "II" : "…";
  const color = rec?.status === "recording" ? "#c0392b" : rec?.status === "paused" ? "#9a5b00" : "#2163a0";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// ───────── Mensajes ─────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Sólo nuestro popup y nuestro script de página pueden hablar con el service worker (no hay
  // externally_connectable: el JavaScript de las páginas no puede mandarnos mensajes).
  // Iniciar y capturar a mano: sólo desde el popup. Pausar/terminar: también desde la barra flotante.
  const ours = sender.id === chrome.runtime.id;
  const fromExtensionPage = ours && !sender.tab;
  const fromOurBar = ours && Boolean(sender.tab);
  const handle = async () => {
    switch (msg?.type) {
      case "pg:event": {
        if (!fromOurBar) break;
        const step = await ingest(sender.tab, msg.event || {});
        return { ok: true, step };
      }
      case "pg:start":
        if (!fromExtensionPage) break;
        await start(msg.windowId);
        return { ok: true };
      case "pg:pause":
        if (!fromExtensionPage && !fromOurBar) break;
        await setStatus("paused");
        return { ok: true };
      case "pg:resume":
        if (!fromExtensionPage && !fromOurBar) break;
        await setStatus("recording");
        return { ok: true };
      case "pg:stop":
        if (!fromExtensionPage && !fromOurBar) break;
        await stop();
        return { ok: true };
      case "pg:discard":
        if (!fromExtensionPage && !fromOurBar) break;
        await discard();
        return { ok: true };
      case "pg:retry":
        if (!fromExtensionPage) break;
        await kick();
        return { ok: true };
      case "pg:capture-now": {
        if (!fromExtensionPage) break;
        const [tab] = await chrome.tabs.query({ active: true, windowId: msg.windowId });
        if (!tab || !/^https?:/.test(tab.url || "")) throw new Error("Esta pestaña no se puede capturar.");
        await ingest(tab, { action: "manual", instruction: `Revisa la pantalla «${tab.title || hostOf(tab.url)}»` });
        return { ok: true };
      }
    }
    return { ok: false, error: "Mensaje no permitido." };
  };
  handle()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true;
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === RETRY_ALARM) void kick();
});
chrome.runtime.onStartup.addListener(() => {
  void updateBadge();
  void kick();
});
chrome.runtime.onInstalled.addListener(() => {
  void updateBadge();
  void kick();
});
