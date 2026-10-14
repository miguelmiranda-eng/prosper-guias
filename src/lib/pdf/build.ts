import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { toWinAnsi, wrapText } from "./text";

export type PdfStep = {
  instruction: string;
  note: string;
  noteKind: "tip" | "warning" | "info" | null;
  image: { bytes: Uint8Array; type: "png" | "jpg" } | null;
  click: { x: number; y: number } | null;
};

export type PdfGuide = {
  title: string;
  description: string;
  author: string;
  updatedAt: string;
  steps: PdfStep[];
};

const PAGE_W = 612; // Carta
const PAGE_H = 792;
const M = 50;
const CONTENT_W = PAGE_W - M * 2;
const INDENT = 34;
const IMG_MAX_H = 380;

const INK = rgb(0.08, 0.13, 0.2);
const MUTED = rgb(0.35, 0.4, 0.47);
const PRIMARY = rgb(0.129, 0.388, 0.627);
const ACCENT = rgb(0.02, 0.647, 0.953);
const NOTE: Record<NonNullable<PdfStep["noteKind"]>, { bg: ReturnType<typeof rgb>; bar: ReturnType<typeof rgb>; label: string }> = {
  tip: { bg: rgb(0.89, 0.96, 0.92), bar: rgb(0.11, 0.5, 0.29), label: "Consejo" },
  warning: { bg: rgb(1, 0.96, 0.86), bar: rgb(0.6, 0.36, 0), label: "Advertencia" },
  info: { bg: rgb(0.89, 0.93, 0.97), bar: PRIMARY, label: "Nota" },
};

/** Genera el PDF completo de una guía: portada breve, pasos numerados, notas, capturas y marcador de clic. */
export async function buildGuidePdf(g: PdfGuide): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(g.title));
  doc.setAuthor(toWinAnsi(g.author));
  doc.setCreator("Prosper Guías");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const lines = (text: string, f: PDFFont, size: number, width: number) =>
    wrapText(toWinAnsi(text), (t) => f.widthOfTextAtSize(t, size), width);
  const drawLines = (ls: string[], f: PDFFont, size: number, x: number, color = INK, lh = size * 1.35) => {
    for (const l of ls) {
      ensure(lh);
      page.drawText(l, { x, y: y - size, size, font: f, color });
      y -= lh;
    }
  };

  // Encabezado
  page.drawRectangle({ x: M, y: y - 4, width: 40, height: 4, color: ACCENT });
  y -= 18;
  drawLines(lines(g.title, bold, 22, CONTENT_W), bold, 22, M);
  y -= 4;
  if (g.description.trim()) {
    drawLines(lines(g.description, font, 11, CONTENT_W), font, 11, M, MUTED);
    y -= 4;
  }
  drawLines(lines(`${g.author} · ${g.steps.length} pasos · actualizada ${g.updatedAt}`, font, 9, CONTENT_W), font, 9, M, MUTED);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: rgb(0.85, 0.88, 0.92) });
  y -= 20;

  const images = await Promise.all(
    g.steps.map(async (s): Promise<PDFImage | null> => {
      if (!s.image) return null;
      try {
        return s.image.type === "png" ? await doc.embedPng(s.image.bytes) : await doc.embedJpg(s.image.bytes);
      } catch (e) {
        console.error("[pdf] imagen inválida", e);
        return null;
      }
    }),
  );

  g.steps.forEach((s, i) => {
    const insLines = lines(s.instruction || "(sin instrucción)", bold, 12, CONTENT_W - INDENT);
    const img = images[i];
    const scale = img ? Math.min(1, (CONTENT_W - INDENT) / img.width, IMG_MAX_H / img.height) : 0;
    // Mantiene número, instrucción e imagen juntos cuando cabe en una página.
    ensure(insLines.length * 16 + (img ? img.height * scale + 12 : 0) + 8);

    page.drawCircle({ x: M + 11, y: y - 9, size: 11, color: PRIMARY });
    const num = String(i + 1);
    page.drawText(num, { x: M + 11 - bold.widthOfTextAtSize(num, 10) / 2, y: y - 12.5, size: 10, font: bold, color: rgb(1, 1, 1) });
    drawLines(insLines, bold, 12, M + INDENT, INK, 16);
    y -= 4;

    if (s.note.trim()) {
      const style = NOTE[s.noteKind ?? "info"];
      const noteLines = lines(`${style.label}: ${s.note}`, font, 10, CONTENT_W - INDENT - 16);
      const h = noteLines.length * 13.5 + 10;
      ensure(h);
      page.drawRectangle({ x: M + INDENT, y: y - h, width: CONTENT_W - INDENT, height: h, color: style.bg });
      page.drawRectangle({ x: M + INDENT, y: y - h, width: 3, height: h, color: style.bar });
      y -= 5;
      drawLines(noteLines, font, 10, M + INDENT + 10, INK, 13.5);
      y -= 9;
    }

    if (img) {
      const w = img.width * scale;
      const h = img.height * scale;
      ensure(h + 6);
      const x = M + INDENT;
      page.drawImage(img, { x, y: y - h, width: w, height: h });
      page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: rgb(0.85, 0.88, 0.92), borderWidth: 0.5 });
      if (s.click) {
        page.drawCircle({
          x: x + s.click.x * w,
          y: y - s.click.y * h,
          size: 11,
          borderColor: ACCENT,
          borderWidth: 2.5,
          color: ACCENT,
          opacity: 0.15,
          borderOpacity: 1,
        });
      }
      y -= h + 6;
    }
    y -= 18;
  });

  if (g.steps.length === 0) drawLines(["Esta guía todavía no tiene pasos."], font, 11, M, MUTED);

  const pages = doc.getPages();
  const footerTitle = toWinAnsi(g.title).slice(0, 80);
  pages.forEach((p: PDFPage, i) => {
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(footerTitle, { x: M, y: 28, size: 8, font, color: MUTED });
    p.drawText(toWinAnsi(label), { x: PAGE_W - M - font.widthOfTextAtSize(toWinAnsi(label), 8), y: 28, size: 8, font, color: MUTED });
  });

  return doc.save();
}
