// Se ejecuta en cada página web, pero sólo escucha mientras hay una grabación activa.
// Registra QUÉ se hizo (clic en «Guardar», escribir en «Correo»), nunca LO QUE se escribió.
// También pinta la barra flotante de grabación (oculta durante cada captura).
(() => {
  // Si la extensión se recargó, la copia vieja de este script sigue viva pero desconectada:
  // se apaga antes de arrancar la nueva.
  if (typeof window.__pgTeardown === "function") window.__pgTeardown();

  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };

  let rec = null;
  let lastClick = { el: null, at: 0 };
  const recording = () => rec?.status === "recording";

  const INTERACTIVE =
    'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [contenteditable="true"]';
  const TEXT_TYPES = new Set(["text", "email", "search", "tel", "url", "number", "password", "date", "datetime-local", "month", "time", "week", ""]);
  const SENSITIVE_NAME = /pass|pwd|contrase|card|tarjeta|cvv|cvc|ssn|curp|rfc|token|secret|pin|otp|clabe|iban|cuenta/i;

  // ───────── Barra flotante ─────────
  const host = document.createElement("div");
  host.setAttribute("data-prosper-guias", "");
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:50%;bottom:18px;transform:translateX(-50%);";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .bar{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;border-radius:999px;
        background:#142033;color:#fff;font:600 13px/1.2 system-ui,"Segoe UI",sans-serif;
        box-shadow:0 8px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);user-select:none}
      .dot{width:10px;height:10px;border-radius:50%;background:#e74c3c;animation:p 1.2s infinite}
      .dot.paused{background:#f0b04a;animation:none}
      @keyframes p{50%{opacity:.3}}
      @media (prefers-reduced-motion:reduce){.dot{animation:none}}
      .label{min-width:120px}
      .count{color:#9fb4cc;font-weight:500}
      button{all:unset;cursor:pointer;padding:6px 12px;border-radius:999px;font:600 12px system-ui,sans-serif;
        background:rgba(255,255,255,.1);color:#fff}
      button:hover{background:rgba(255,255,255,.2)}
      button.stop{background:#2163a0}
      button.stop:hover{background:#1b5288}
      button.x{padding:6px 9px;color:#9fb4cc}
      .flash{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);white-space:nowrap;
        background:#1b7f4b;color:#fff;padding:5px 10px;border-radius:999px;font:600 12px system-ui,sans-serif;
        opacity:0;transition:opacity .2s}
      .flash.show{opacity:1}
    </style>
    <div class="flash" id="flash"></div>
    <div class="bar" role="toolbar" aria-label="Grabación de Prosper Guías">
      <span class="dot" id="dot"></span>
      <span class="label"><span id="state">Grabando</span> <span class="count" id="count"></span></span>
      <button id="pause" title="Pausar / reanudar">Pausar</button>
      <button id="stop" class="stop" title="Terminar y abrir la guía">Terminar</button>
      <button id="discard" class="x" title="Descartar grabación">✕</button>
    </div>`;
  const $ = (id) => root.getElementById(id);
  let flashTimer = null;

  function flash(text) {
    const el = $("flash");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove("show"), 1400);
  }

  function render() {
    if (!rec) {
      host.remove();
      return;
    }
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    const paused = rec.status === "paused";
    const finishing = rec.status === "finishing";
    $("dot").classList.toggle("paused", paused || finishing);
    $("state").textContent = finishing ? "Guardando…" : paused ? "En pausa" : "Grabando";
    $("count").textContent = `· ${rec.captured || 0} ${rec.captured === 1 ? "paso" : "pasos"}`;
    $("pause").textContent = paused ? "Reanudar" : "Pausar";
    for (const id of ["pause", "stop", "discard"]) $(id).style.display = finishing ? "none" : "";
  }

  const control = (type) => (e) => {
    if (!e.isTrusted) return; // la página no puede "apretar" nuestros botones con clics sintéticos
    e.stopPropagation();
    chrome.runtime.sendMessage({ type }).catch(() => undefined);
  };
  $("pause").addEventListener("click", (e) => control(rec?.status === "paused" ? "pg:resume" : "pg:pause")(e));
  $("stop").addEventListener("click", control("pg:stop"));
  $("discard").addEventListener("click", (e) => {
    if (confirm("¿Descartar esta grabación? La guía se manda a la papelera.")) control("pg:discard")(e);
  });

  chrome.storage.local.get("rec").then((s) => {
    rec = s.rec || null;
    render();
  });
  const onStorage = (changes, area) => {
    if (area === "local" && changes.rec) {
      rec = changes.rec.newValue || null;
      render();
    }
  };
  chrome.storage.onChanged.addListener(onStorage);
  listeners.push(() => chrome.storage.onChanged.removeListener(onStorage));

  // ───────── Detección de pasos ─────────
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 80);

  function textOfIds(ids) {
    return ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText || "")
      .join(" ");
  }

  function labelOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by && clean(textOfIds(by))) return clean(textOfIds(by));
    if (el.labels?.length) return clean(el.labels[0].innerText);
    if (el.placeholder) return clean(el.placeholder);
    // Jamás se usa .value de un campo de texto: sólo el texto visible de botones.
    if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes(el.type)) return clean(el.value);
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") {
      const text = clean((el.innerText || "").split("\n")[0]);
      if (text) return text;
    }
    return clean(el.title || el.getAttribute("alt") || el.querySelector?.("img[alt]")?.alt || el.name || "");
  }

  function isTextField(el) {
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && TEXT_TYPES.has((el.getAttribute("type") || "").toLowerCase());
  }

  function isSensitive(el) {
    const type = (el.getAttribute?.("type") || "").toLowerCase();
    const ac = (el.getAttribute?.("autocomplete") || "").toLowerCase();
    if (type === "password") return true;
    if (/cc-|one-time-code|password/.test(ac)) return true;
    return SENSITIVE_NAME.test(`${el.name || ""} ${el.id || ""}`);
  }

  // Oculta la barra mientras se toma la captura y avisa al usuario cuando quedó.
  function send(event) {
    host.style.visibility = "hidden";
    chrome.runtime
      .sendMessage({ type: "pg:event", event })
      .then((res) => {
        host.style.visibility = "";
        if (res?.ok && res.step) flash(`✓ Paso ${res.step} capturado`);
      })
      .catch(() => {
        // La extensión se recargó: esta copia del script quedó huérfana y se apaga sola
        // (sin tocar a la copia nueva, si ya existe).
        teardown();
      });
  }

  const quote = (label) => (label ? `«${label}»` : "");
  const inBar = (e) => e.composedPath().includes(host);

  on(
    document,
    "pointerdown",
    (e) => {
      if (!recording() || !e.isTrusted || e.button !== 0 || inBar(e)) return;
      const el = e.target instanceof Element ? e.target.closest(INTERACTIVE) || e.target : null;
      if (!el) return;
      // En un campo de texto el paso útil es "escribe en…", que se registra al cambiar el valor.
      if (isTextField(el)) return;
      const now = Date.now();
      if (lastClick.el === el && now - lastClick.at < 400) return;
      lastClick = { el, at: now };

      const label = labelOf(el);
      const role = el.getAttribute("role");
      const type = (el.getAttribute("type") || "").toLowerCase();
      let instruction;
      if (type === "checkbox" || role === "checkbox" || role === "switch") instruction = `Marca la casilla ${quote(label)}`.trim();
      else if (type === "radio" || role === "radio") instruction = `Elige la opción ${quote(label)}`.trim();
      else if (el.tagName === "SELECT") return; // se registra al elegir
      else instruction = label ? `Haz clic en ${quote(label)}` : "Haz clic en el lugar indicado";

      send({
        action: "click",
        instruction,
        label,
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
        sensitive: false,
      });
    },
    true,
  );

  on(
    document,
    "change",
    (e) => {
      if (!recording() || !e.isTrusted || inBar(e)) return;
      const el = e.target;
      if (!(el instanceof Element)) return;
      const label = labelOf(el);
      const r = el.getBoundingClientRect();
      const pos = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };

      if (el.tagName === "SELECT") {
        const option = clean(el.selectedOptions?.[0]?.text);
        send({ action: "select", instruction: `Selecciona ${quote(option)} en ${quote(label) || "la lista"}`, label, ...pos, sensitive: isSensitive(el) });
      } else if (isTextField(el)) {
        const sensitive = isSensitive(el);
        send({
          action: "input",
          instruction: `Escribe ${sensitive ? "el dato" : "la información"} en el campo ${quote(label) || "indicado"}`,
          label,
          ...pos,
          // Campos sensibles: el paso se registra SIN captura de pantalla.
          sensitive,
        });
      }
    },
    true,
  );

  on(
    document,
    "submit",
    (e) => {
      if (!recording() || !e.isTrusted) return;
      // Si el envío vino de un clic en un botón, ese clic ya quedó como paso.
      if (Date.now() - lastClick.at < 800) return;
      send({ action: "submit", instruction: "Envía el formulario (Enter)", label: "", sensitive: false });
    },
    true,
  );

  function teardown() {
    listeners.splice(0).forEach((off) => off());
    host.remove();
    if (window.__pgTeardown === teardown) window.__pgTeardown = undefined;
  }
  window.__pgTeardown = teardown;
})();
