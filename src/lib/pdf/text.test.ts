import { describe, expect, it } from "vitest";
import { pdfFileName, toWinAnsi, wrapText } from "./text";

const mono = (t: string) => t.length; // 1 unidad por carácter

describe("toWinAnsi", () => {
  it("conserva acentos y signos del español", () => {
    expect(toWinAnsi("¿Cómo añadir la línea? ¡Sí!")).toBe("¿Cómo añadir la línea? ¡Sí!");
  });
  it("sustituye comillas tipográficas y guiones largos", () => {
    expect(toWinAnsi("“Guardar” — listo…")).toBe('"Guardar" - listo...');
  });
  it("quita emojis y marca lo no representable", () => {
    expect(toWinAnsi("OK ✅ 日本")).toBe("OK  ??");
  });
  it("normaliza saltos de línea de Windows", () => {
    expect(toWinAnsi("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("wrapText", () => {
  it("parte por palabras sin pasarse del ancho", () => {
    const lines = wrapText("haz clic en el botón guardar", mono, 12);
    expect(lines).toEqual(["haz clic en", "el botón", "guardar"]);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(12));
  });
  it("respeta saltos de línea explícitos y renglones vacíos", () => {
    expect(wrapText("uno\n\ndos", mono, 20)).toEqual(["uno", "", "dos"]);
  });
  it("corta palabras más largas que el renglón", () => {
    expect(wrapText("https://ejemplo.com/ruta", mono, 10)).toEqual(["https://ej", "emplo.com/", "ruta"]);
  });
});

describe("pdfFileName", () => {
  it("genera un nombre seguro sin acentos", () => {
    expect(pdfFileName("Alta de órdenes: Producción / Envíos")).toBe("alta-de-ordenes-produccion-envios.pdf");
  });
  it("usa un nombre por defecto si no queda nada", () => {
    expect(pdfFileName("¿¿??")).toBe("guia.pdf");
  });
});
