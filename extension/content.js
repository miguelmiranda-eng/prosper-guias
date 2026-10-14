// Se ejecuta en cada página web, pero sólo escucha mientras hay una grabación activa.
// Registra QUÉ se hizo (clic en «Guardar», escribir en «Correo»), nunca LO QUE se escribió.
// Pinta la tarjeta flotante de grabación (estilo Scribe) y la oculta durante cada captura.
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
  let steps = [];
  let collapsed = false;
  let lastClick = { el: null, at: 0 };
  let tick = null;
  const recording = () => rec?.status === "recording";

  const INTERACTIVE =
    'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [contenteditable="true"]';
  const TEXT_TYPES = new Set(["text", "email", "search", "tel", "url", "number", "password", "date", "datetime-local", "month", "time", "week", ""]);
  const SENSITIVE_NAME = /pass|pwd|contrase|card|tarjeta|cvv|cvc|ssn|curp|rfc|token|secret|pin|otp|clabe|iban|cuenta/i;

  // ───────── Tarjeta flotante ─────────
  const host = document.createElement("div");
  host.setAttribute("data-prosper-guias", "");
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:20px;bottom:20px;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box}
      .card{width:320px;max-height:min(520px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;
        border-radius:16px;background:#0f1824;color:#e8eef5;border:1px solid rgba(255,255,255,.1);
        box-shadow:0 18px 50px rgba(0,0,0,.45);font:13px/1.35 system-ui,"Segoe UI",sans-serif}
      .head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#142033;border-bottom:1px solid rgba(255,255,255,.08)}
      .dot{width:10px;height:10px;border-radius:50%;background:#e74c3c;box-shadow:0 0 0 4px rgba(231,76,60,.2);animation:p 1.2s infinite}
      .dot.paused{background:#f0b04a;box-shadow:0 0 0 4px rgba(240,176,74,.2);animation:none}
      @keyframes p{50%{opacity:.35}}
      .title{font-weight:700}
      .meta{color:#93a6bd;font-size:12px}
      .grow{flex:1}
      .icon{all:unset;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:8px;color:#93a6bd;font-size:15px}
      .icon:hover{background:rgba(255,255,255,.08);color:#fff}
      .list{overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
      .empty{padding:18px 14px;color:#93a6bd;text-align:center}
      .empty b{display:block;color:#e8eef5;margin-bottom:4px}
      .step{display:flex;gap:10px;padding:8px;border-radius:10px;background:rgba(255,255,255,.04)}
      .step.new{animation:in .35s ease-out}
      @keyframes in{from{background:rgba(5,165,243,.25);transform:translateY(-4px)}to{background:rgba(255,255,255,.04)}}
      .thumb{position:relative;flex:none;width:96px;height:56px;border-radius:6px;overflow:hidden;background:#1c2838;display:grid;place-items:center;color:#93a6bd;font-size:11px}
      .thumb img{width:100%;height:100%;object-fit:cover;object-position:top}
      .mark{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #05a5f3;background:rgba(5,165,243,.3)}
      .num{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#2163a0;color:#fff;font-size:11px;font-weight:700;margin-bottom:3px}
      .ins{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .foot{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08)}
      .btn{all:unset;cursor:pointer;flex:1;text-align:center;padding:9px 10px;border-radius:10px;font-weight:600;background:rgba(255,255,255,.08);color:#fff}
      .btn:hover{background:rgba(255,255,255,.14)}
      .btn.primary{background:#2163a0}
      .btn.primary:hover{background:#2a74bb}
      .pill{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:#142033;color:#fff;cursor:pointer;
        border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.4);font:600 13px system-ui,sans-serif}
      .hidden{display:none !important}
      @media (prefers-reduced-motion:reduce){.dot,.step.new{animation:none}}
    </style>
    <div class="pill hidden" id="pill" role="button" tabindex="0" title="Mostrar grabación">
      <span class="dot" id="pdot"></span><span id="ptext">Grabando</span>
    </div>
    <div class="card" id="card" role="region" aria-label="Grabación de Prosper Guías">
      <div class="head">
        <span class="dot" id="dot"></span>
        <div class="grow">
          <div class="title" id="state">Grabando</div>
          <div class="meta"><span id="count">0 pasos</span> · <span id="time">0:00</span></div>
        </div>
        <button class="icon" id="min" title="Minimizar">—</button>
      </div>
      <div class="list" id="list"></div>
      <div class="foot">
        <button class="btn" id="pause">Pausar</button>
        <button class="btn primary" id="stop">Terminar</button>
        <button class="icon" id="discard" title="Descartar grabación">🗑</button>
      </div>
    </div>`;
  const $ = (id) => root.getElementById(id);

  // Efecto de clic (fuera de la tarjeta), se dibuja DESPUÉS de la captura para no salir en ella.
  const fx = document.createElement("div");
  fx.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
  const fxRoot = fx.attachShadow({ mode: "closed" });
  fxRoot.innerHTML = `<style>
    .r{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #05a5f3;
      background:rgba(5,165,243,.18);animation:r .6s ease-out forwards}
    @keyframes r{from{transform:scale(.4);opacity:1}to{transform:scale(1.4);opacity:0}}
    @media (prefers-reduced-motion:reduce){.r{animation:none;opacity:.6}}
  </style>`;

  function ripple(x, y) {
    if (x == null || y == null) return;
    if (!fx.isConnected) (document.body || document.documentElement).appendChild(fx);
    const r = document.createElement("div");
    r.className = "r";
    r.style.left = `${x * 100}vw`;
    r.style.top = `${y * 100}vh`;
    fxRoot.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function renderList(highlight) {
    const list = $("list");
    if (!steps.length) {
      list.innerHTML = `<div class="empty"><b>Haz el proceso normalmente</b>Cada clic, campo que llenes o lista que elijas se vuelve un paso con su captura.</div>`;
      return;
    }
    list.innerHTML = steps
      .map(
        (s) => `<div class="step ${s.n === highlight ? "new" : ""}">
          <div class="thumb">${
            s.thumb
              ? `<img src="${esc(s.thumb)}" alt="">${s.x != null && s.y != null ? `<span class="mark" style="left:${s.x * 100}%;top:${s.y * 100}%"></span>` : ""}`
              : esc(s.sensitive ? "Dato sensible" : "Sin captura")
          }</div>
          <div><span class="num">${s.n}</span><div class="ins">${esc(s.instruction || "Paso")}</div></div>
        </div>`,
      )
      .join("");
  }

  function fmtTime(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  function render(highlight) {
    if (!rec) {
      host.remove();
      fx.remove();
      clearInterval(tick);
      tick = null;
      return;
    }
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    const paused = rec.status === "paused";
    const finishing = rec.status === "finishing";
    const label = finishing ? "Guardando la guía…" : paused ? "En pausa" : "Grabando";
    const n = rec.captured || 0;
    for (const id of ["dot", "pdot"]) $(id).classList.toggle("paused", paused || finishing);
    $("state").textContent = label;
    $("count").textContent = `${n} ${n === 1 ? "paso" : "pasos"}`;
    $("ptext").textContent = `${label} · ${n}`;
    $("pause").textContent = paused ? "Reanudar" : "Pausar";
    $("pause").classList.toggle("hidden", finishing);
    $("stop").classList.toggle("hidden", finishing);
    $("discard").classList.toggle("hidden", finishing);
    $("card").classList.toggle("hidden", collapsed);
    $("pill").classList.toggle("hidden", !collapsed);
    renderList(highlight);
    $("time").textContent = fmtTime(Date.now() - rec.startedAt);
    if (!tick) tick = setInterval(() => rec && ($("time").textContent = fmtTime(Date.now() - rec.startedAt)), 1000);
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
  $("min").addEventListener("click", () => {
    collapsed = true;
    render();
  });
  $("pill").addEventListener("click", () => {
    collapsed = false;
    render();
  });

  chrome.storage.local.get(["rec", "recSteps"]).then((s) => {
    rec = s.rec || null;
    steps = s.recSteps || [];
    render();
  });
  const onStorage = (changes, area) => {
    if (area !== "local" || (!changes.rec && !changes.recSteps)) return;
    if (changes.rec) rec = changes.rec.newValue || null;
    let highlight;
    if (changes.recSteps) {
      steps = changes.recSteps.newValue || [];
      highlight = steps[0]?.n;
    }
    render(highlight);
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

  // Oculta la tarjeta mientras se toma la captura; al volver, marca el clic con una onda.
  function send(event) {
    host.style.visibility = "hidden";
    chrome.runtime
      .sendMessage({ type: "pg:event", event })
      .then((res) => {
        host.style.visibility = "";
        if (res?.ok && res.step) ripple(event.x, event.y);
      })
      .catch(() => {
        // La extensión se recargó: esta copia del script quedó huérfana y se apaga sola
        // (sin tocar a la copia nueva, si ya existe).
        teardown();
      });
  }

  const quote = (label) => (label ? `«${label}»` : "");
  const inUi = (e) => e.composedPath().includes(host);

  on(
    document,
    "pointerdown",
    (e) => {
      if (!recording() || !e.isTrusted || e.button !== 0 || inUi(e)) return;
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
      if (!recording() || !e.isTrusted || inUi(e)) return;
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
    clearInterval(tick);
    host.remove();
    fx.remove();
    if (window.__pgTeardown === teardown) window.__pgTeardown = undefined;
  }
  window.__pgTeardown = teardown;
})();
