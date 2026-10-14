// Se ejecuta en cada página web, pero sólo escucha mientras hay una grabación activa.
// Registra QUÉ se hizo (clic en «Guardar», escribir en «Correo»), nunca LO QUE se escribió.
(() => {
  if (window.__prosperGuias) return;
  window.__prosperGuias = true;

  let recording = false;
  let lastClick = { el: null, at: 0 };

  const INTERACTIVE =
    'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [contenteditable="true"]';
  const TEXT_TYPES = new Set(["text", "email", "search", "tel", "url", "number", "password", "date", "datetime-local", "month", "time", "week", ""]);
  const SENSITIVE_NAME = /pass|pwd|contrase|card|tarjeta|cvv|cvc|ssn|curp|rfc|token|secret|pin|otp|clabe|iban|cuenta/i;

  chrome.storage.local.get("rec").then(({ rec }) => (recording = rec?.status === "recording"));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rec) recording = changes.rec.newValue?.status === "recording";
  });

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

  function send(event) {
    chrome.runtime.sendMessage({ type: "pg:event", event }).catch(() => {
      // La extensión se recargó: esta página tiene un script viejo. Dejamos de escuchar.
      recording = false;
    });
  }

  function quote(label) {
    return label ? `«${label}»` : "";
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!recording || !e.isTrusted || e.button !== 0) return;
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

  document.addEventListener(
    "change",
    (e) => {
      if (!recording || !e.isTrusted) return;
      const el = e.target;
      if (!(el instanceof Element)) return;
      const label = labelOf(el);
      const r = el.getBoundingClientRect();
      const pos = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };

      if (el.tagName === "SELECT") {
        const option = clean(el.selectedOptions?.[0]?.text);
        send({
          action: "select",
          instruction: `Selecciona ${quote(option)} en ${quote(label) || "la lista"}`,
          label,
          ...pos,
          sensitive: isSensitive(el),
        });
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

  document.addEventListener(
    "submit",
    (e) => {
      if (!recording || !e.isTrusted) return;
      // Si el envío vino de un clic en un botón, ese clic ya quedó como paso.
      if (Date.now() - lastClick.at < 800) return;
      send({ action: "submit", instruction: "Envía el formulario (Enter)", label: "", sensitive: false });
    },
    true,
  );
})();
