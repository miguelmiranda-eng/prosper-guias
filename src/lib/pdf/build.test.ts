import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { deflateSync } from "node:zlib";
import { buildGuidePdf } from "./build";

/** PNG RGB mínimo de w×h de un solo color, para no depender de archivos de prueba. */
function solidPng(w: number, h: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 200)]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("buildGuidePdf", () => {
  it("genera un PDF válido con todos los pasos, notas e imágenes", async () => {
    const bytes = await buildGuidePdf({
      title: "Alta de una orden en producción",
      description: "Cómo dar de alta una orden nueva.",
      author: "Ana Pérez",
      updatedAt: "14 de octubre de 2026",
      steps: Array.from({ length: 12 }, (_, i) => ({
        instruction: `Paso número ${i + 1}: haz clic en «Guardar»`,
        note: i % 3 === 0 ? "Revisa el folio antes de continuar." : "",
        noteKind: i % 3 === 0 ? ("warning" as const) : null,
        image: { bytes: solidPng(1280, 720), type: "png" as const },
        click: { x: 0.5, y: 0.25 },
      })),
    });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Alta de una orden en producción");
    expect(doc.getAuthor()).toBe("Ana Pérez");
    // 12 capturas de 1280×720 no caben en una página: debe paginar.
    expect(doc.getPageCount()).toBeGreaterThan(3);
  });

  it("acepta una guía sin pasos ni imágenes", async () => {
    const bytes = await buildGuidePdf({ title: "Vacía", description: "", author: "", updatedAt: "hoy", steps: [] });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("no falla si una imagen está corrupta (la omite)", async () => {
    const bytes = await buildGuidePdf({
      title: "Con imagen rota",
      description: "",
      author: "",
      updatedAt: "hoy",
      steps: [{ instruction: "Uno", note: "", noteKind: null, image: { bytes: new Uint8Array([1, 2, 3]), type: "jpg" }, click: null }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
