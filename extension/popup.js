import * as api from "./api.js";

const app = document.getElementById("app");
const errorBox = document.getElementById("error");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function showError(msg) {
  errorBox.textContent = msg || "";
  errorBox.hidden = !msg;
}

async function send(type, extra = {}) {
  const win = await chrome.windows.getCurrent();
  const res = await chrome.runtime.sendMessage({ type, windowId: win.id, ...extra });
  if (!res?.ok) throw new Error(res?.error || "No se pudo completar la acción.");
}

function busy(button, fn) {
  return async () => {
    showError("");
    button.disabled = true;
    try {
      await fn();
    } catch (e) {
      showError(e?.message || String(e));
    } finally {
      button.disabled = false;
      await render();
    }
  };
}

let timer = null;

async function render() {
  const s = await chrome.storage.local.get(["cfg", "session", "workspaceId", "workspaces", "rec", "queue", "lastRecording"]);
  clearInterval(timer);

  if (!s.cfg) return renderSetup();
  if (s.rec) return renderRecording(s);
  if (!s.session) return renderLogin(s);
  return renderIdle(s);
}

const DEFAULT_APP_URL = "https://prosper-guias.vercel.app";

function renderSetup(prefill = DEFAULT_APP_URL) {
  app.innerHTML = `
    <p>Conecta la extensión con tu Prosper Guías.</p>
    <label for="url">Dirección de la app</label>
    <input id="url" type="url" placeholder="https://prosper-guias.vercel.app" value="${esc(prefill)}" />
    <button id="save" class="primary">Conectar</button>
    <p class="muted small">La encuentras en Prosper Guías → Extensión.</p>`;
  const btn = document.getElementById("save");
  btn.onclick = busy(btn, async () => {
    const cfg = await api.fetchConfig(document.getElementById("url").value.trim());
    await chrome.storage.local.set({ cfg });
  });
}

function renderLogin(s) {
  app.innerHTML = `
    <p class="muted small">Conectada a ${esc(new URL(s.cfg.appUrl).host)}</p>
    <form id="login">
      <label for="email">Correo</label>
      <input id="email" type="email" autocomplete="username" required />
      <label for="password">Contraseña</label>
      <input id="password" type="password" autocomplete="current-password" required />
      <button id="go" class="primary" type="submit">Iniciar sesión</button>
    </form>
    <button id="forgot" class="link">¿Olvidaste tu contraseña?</button>
    <button id="reset" class="link">Cambiar dirección de la app</button>`;
  document.getElementById("forgot").onclick = () => chrome.tabs.create({ url: `${s.cfg.appUrl}/forgot-password` });
  const btn = document.getElementById("go");
  document.getElementById("login").onsubmit = (e) => {
    e.preventDefault();
    busy(btn, async () => {
      const session = await api.signIn(s.cfg, document.getElementById("email").value.trim(), document.getElementById("password").value);
      const rows = await api.rest(s.cfg, session, `workspace_members?select=role,workspace:workspaces(id,name)&user_id=eq.${session.user.id}&order=created_at`);
      const workspaces = rows
        .filter((r) => r.workspace && r.role !== "viewer")
        .map((r) => ({ id: r.workspace.id, name: r.workspace.name }));
      await chrome.storage.local.set({ session, workspaces, workspaceId: workspaces[0]?.id ?? null });
    })();
  };
  document.getElementById("reset").onclick = async () => {
    await chrome.storage.local.remove(["cfg", "session", "workspaces", "workspaceId"]);
    render();
  };
}

function renderIdle(s) {
  const last = s.lastRecording && Date.now() - s.lastRecording.at < 30 * 60 * 1000 ? s.lastRecording : null;
  const pending = (s.queue || []).length;
  const options = (s.workspaces || [])
    .map((w) => `<option value="${esc(w.id)}" ${w.id === s.workspaceId ? "selected" : ""}>${esc(w.name)}</option>`)
    .join("");
  app.innerHTML = `
    <p class="muted small">${esc(s.session.user.email)}</p>
    ${
      options
        ? `<label for="ws">Guardar en el espacio</label><select id="ws">${options}</select>
           <button id="start" class="primary big">● Iniciar grabación</button>
           <p class="muted small">Al iniciar, esta ventana se cierra. Controla la grabación con la barra que aparece abajo en la página.</p>`
        : `<p class="warn">Tu rol no permite crear guías en ningún espacio (eres lector).</p>`
    }
    ${pending ? `<p class="warn">${pending} paso(s) de una grabación anterior siguen pendientes de subir.</p><button id="retry">Reintentar subida</button>` : ""}
    ${last ? `<div class="card small">Última grabación: ${last.saved} pasos guardados${last.noImage ? `, ${last.noImage} sin captura` : ""}${last.dropped ? `, <span class="warn">${last.dropped} rechazados</span>` : ""}. <a href="${esc(s.cfg.appUrl)}/guides/${esc(last.guideId)}" target="_blank">Abrir guía</a></div>` : ""}
    <p class="muted small">Graba en pestañas http/https. No funciona en páginas internas del navegador (chrome://, tienda de extensiones) ni en apps de escritorio.</p>
    <div class="row">
      <button id="open" class="link">Abrir Prosper Guías</button>
      <button id="logout" class="link">Cerrar sesión</button>
    </div>`;
  const start = document.getElementById("start");
  if (start) {
    document.getElementById("ws").onchange = (e) => chrome.storage.local.set({ workspaceId: e.target.value });
    start.onclick = busy(start, async () => {
      await send("pg:start");
      window.close(); // como Scribe: se quita de en medio y la barra flotante toma el control
    });
  }
  const retry = document.getElementById("retry");
  if (retry) retry.onclick = busy(retry, () => send("pg:retry"));
  document.getElementById("open").onclick = () => chrome.tabs.create({ url: s.cfg.appUrl });
  document.getElementById("logout").onclick = async () => {
    await api.signOut(s.cfg, s.session);
    await chrome.storage.local.remove(["session", "workspaces", "workspaceId"]);
    render();
  };
}

function renderRecording(s) {
  const rec = s.rec;
  const pending = (s.queue || []).filter((q) => q.guideId === rec.guideId).length;
  const paused = rec.status === "paused";
  const finishing = rec.status === "finishing";
  app.innerHTML = `
    <div class="rec"><span class="dot ${paused || finishing ? "paused" : ""}"></span>
      <span>${finishing ? "Terminando…" : paused ? "En pausa" : "Grabando"}</span>
      <span class="muted" id="elapsed" style="margin-left:auto"></span></div>
    <div class="stats card">
      <div><b>${rec.captured || 0}</b><span class="muted small">detectados</span></div>
      <div><b>${rec.saved || 0}</b><span class="muted small">guardados</span></div>
      <div><b>${pending}</b><span class="muted small">por subir</span></div>
    </div>
    ${rec.noImage ? `<p class="muted small">${rec.noImage} paso(s) sin captura (campo sensible o pestaña no visible).</p>` : ""}
    ${rec.lastError ? `<p class="warn">${esc(rec.lastError)}</p>` : ""}
    ${!s.session ? `<p class="warn">La sesión expiró: los pasos se guardan aquí y se subirán al volver a iniciar sesión.</p>` : ""}
    ${
      finishing
        ? `<button id="retry">Reintentar ahora</button>`
        : `<div class="row">
            <button id="pause">${paused ? "▶ Reanudar" : "❚❚ Pausar"}</button>
            <button id="shot" ${paused ? "disabled" : ""}>Capturar pantalla</button>
           </div>
           <button id="stop" class="primary">■ Terminar y abrir la guía</button>
           <button id="discard" class="link">Descartar grabación</button>`
    }
    <p class="muted small">Se registran clics y en qué campo escribes, nunca lo que escribes. Los campos de contraseña o tarjeta no llevan captura.</p>`;

  const elapsed = document.getElementById("elapsed");
  const tick = () => {
    const sec = Math.floor((Date.now() - rec.startedAt) / 1000);
    elapsed.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };
  tick();
  timer = setInterval(tick, 1000);

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onclick = busy(el, fn);
  };
  bind("retry", () => send("pg:retry"));
  bind("pause", () => send(paused ? "pg:resume" : "pg:pause"));
  bind("shot", () => send("pg:capture-now"));
  bind("stop", () => send("pg:stop"));
  const discard = document.getElementById("discard");
  if (discard) {
    discard.onclick = () => {
      if (confirm("¿Descartar esta grabación? La guía se manda a la papelera de Prosper Guías.")) busy(discard, () => send("pg:discard"))();
    };
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.rec || changes.queue || changes.session || changes.cfg)) render();
});

render();
