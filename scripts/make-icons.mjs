// Genera los íconos PNG de la extensión (la misma marca que src/components/brand.tsx) sin dependencias.
// Uso: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const NAVY = [33, 99, 160];
const WHITE = [255, 255, 255];
const CYAN = [5, 165, 243];
// Escalón en coordenadas de 32×32, como el SVG.
const SEGMENTS = [[8, 22, 13, 22], [13, 22, 13, 17], [13, 17, 18, 17], [18, 17, 18, 12], [18, 12, 24, 12]];

function distToSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function icon(size) {
  const S = 4; // supermuestreo para bordes suaves
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = ((x + (sx + 0.5) / S) / size) * 32;
        const v = ((y + (sy + 0.5) / S) / size) * 32;
        let col = null;
        if (Math.hypot(u - 16, v - 16) <= 15.5) col = NAVY;
        if (col && Math.min(...SEGMENTS.map((s) => distToSeg(u, v, s))) <= 1.7) col = WHITE;
        if (Math.hypot(u - 24, v - 12) <= 2.8) col = CYAN;
        if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
      }
      const n = S * S, o = y * (size * 4 + 1) + 1 + x * 4;
      const cov = a / 255;
      raw[o] = cov ? r / cov : 0; raw[o + 1] = cov ? g / cov : 0; raw[o + 2] = cov ? b / cov : 0; raw[o + 3] = a / n;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = new URL("../extension/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`icon${size}.png`, out), icon(size));
writeFileSync(new URL("../src/app/icon.png", import.meta.url), icon(64));
console.log("Íconos generados.");
