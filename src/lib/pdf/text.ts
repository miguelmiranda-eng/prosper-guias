// Utilidades de texto para PDF con las fuentes estándar (codificación WinAnsi).

const REPLACEMENTS: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
  "…": "...", " ": " ", "•": "-", "→": "->", "«": '"', "»": '"',
};

// Latin-1 imprimible (incluye á é í ó ú ñ ü ¿ ¡) + saltos de línea.
const WIN_ANSI_SAFE = /[\n\x20-\x7E\xA1-\xFF]/;

/** Deja sólo caracteres que Helvetica estándar puede dibujar; lo demás se sustituye o se vuelve "?". */
export function toWinAnsi(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "  ")) {
    if (WIN_ANSI_SAFE.test(ch)) out += ch;
    else if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch];
    else if (/\p{Extended_Pictographic}|[​-‍️]/u.test(ch)) continue;
    else out += "?";
  }
  return out;
}

type Measurer = (text: string) => number;

/**
 * Parte el texto en renglones que caben en `maxWidth`. Respeta saltos de línea explícitos
 * y corta palabras más largas que el renglón (URLs) carácter por carácter.
 */
export function wrapText(text: string, measure: Measurer, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/ +/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (measure(chunk + ch) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

/** Nombre de archivo seguro para Content-Disposition. */
export function pdfFileName(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return `${base || "guia"}.pdf`;
}
