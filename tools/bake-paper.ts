// Bakes the paper's grain into one opaque 900×900 tile: docs/rsc/paper.jpg (a PNG turned into a JPEG by macOS's sips).
//
//   bun tools/bake-paper.ts
//
// It draws what the grain layer in rsc/site.css used to draw live: two tiles of SVG feTurbulence noise
// (fine fibre, 300 px; large stains, 900 px), each coloured by an feColorMatrix that takes its alpha from the
// noise, the fibre laid over the stains, and the whole multiplied at GRAIN_OPACITY into the parchment colour.
// The noise is the SVG specification's reference turbulence (seeds, octaves and tile stitching as there), and
// the colours are worked in linearRGB, as SVG filters are by default. Change the settings below and run it again.
import { execFileSync } from "node:child_process";
import { rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const SIZE = 900;
const PARCHMENT = [0xec, 0xdc, 0xb4];   // --parchment
const GRAIN_OPACITY = 0.55;
// each layer: tile size, baseFrequency, numOctaves, seed, colour (linearRGB) and alpha = a * noise + b
const FIBRE = { tile: 300, freq: 0.8, octaves: 4, seed: 0, color: [0.45, 0.32, 0.16], a: 0.55, b: 0 };
const STAINS = { tile: 900, freq: 0.012, octaves: 3, seed: 7, color: [0.5, 0.33, 0.12], a: 1.1, b: -0.45 };

// ---------- feTurbulence, after the reference code in the SVG 1.1 specification ----------
const BSize = 0x100, BM = 0xff, PerlinN = 0x1000;
const RAND_m = 2147483647, RAND_a = 16807, RAND_q = 127773, RAND_r = 2836;
const random = (seed: number) => {
  let r = RAND_a * (seed % RAND_q) - RAND_r * Math.trunc(seed / RAND_q);
  if (r <= 0) r += RAND_m;
  return r;
};
function makeNoise(seedIn: number) {
  const lattice = new Int32Array(BSize + BSize + 2);
  const gradient = [0, 1, 2, 3].map(() => new Float64Array((BSize + BSize + 2) * 2));
  let seed = seedIn;
  if (seed <= 0) seed = -(seed % (RAND_m - 1)) + 1;
  if (seed > RAND_m - 1) seed = RAND_m - 1;
  let i = 0;
  for (let k = 0; k < 4; k++) {
    for (i = 0; i < BSize; i++) {
      lattice[i] = i;
      for (let j = 0; j < 2; j++) gradient[k][i * 2 + j] = (((seed = random(seed)) % (BSize + BSize)) - BSize) / BSize;
      const s = Math.hypot(gradient[k][i * 2], gradient[k][i * 2 + 1]);
      gradient[k][i * 2] /= s;
      gradient[k][i * 2 + 1] /= s;
    }
  }
  while (--i) {
    const k = lattice[i];
    const j = (seed = random(seed)) % BSize;
    lattice[i] = lattice[j];
    lattice[j] = k;
  }
  for (i = 0; i < BSize + 2; i++) {
    lattice[BSize + i] = lattice[i];
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) gradient[k][(BSize + i) * 2 + j] = gradient[k][i * 2 + j];
  }
  const sCurve = (t: number) => t * t * (3 - 2 * t);
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  type Stitch = { w: number; h: number; wrapX: number; wrapY: number };
  const noise2 = (ch: number, x: number, y: number, st: Stitch) => {
    // lattice cell and position in it; stitching works on the unmasked cell (as browsers do: the reference
    // code masks first, which would make its stitch test never pass)
    const tx = x + PerlinN, ty = y + PerlinN;
    let bx0 = Math.trunc(tx), by0 = Math.trunc(ty);
    let bx1 = bx0 + 1, by1 = by0 + 1;
    const rx0 = tx - bx0, ry0 = ty - by0, rx1 = rx0 - 1, ry1 = ry0 - 1;
    if (bx0 >= st.wrapX) bx0 -= st.w;
    if (bx1 >= st.wrapX) bx1 -= st.w;
    if (by0 >= st.wrapY) by0 -= st.h;
    if (by1 >= st.wrapY) by1 -= st.h;
    bx0 &= BM; bx1 &= BM; by0 &= BM; by1 &= BM;
    const i = lattice[bx0], j = lattice[bx1];
    const b00 = lattice[i + by0], b10 = lattice[j + by0], b01 = lattice[i + by1], b11 = lattice[j + by1];
    const sx = sCurve(rx0), sy = sCurve(ry0);
    const g = gradient[ch];
    let u = rx0 * g[b00 * 2] + ry0 * g[b00 * 2 + 1];
    let v = rx1 * g[b10 * 2] + ry0 * g[b10 * 2 + 1];
    const a = lerp(sx, u, v);
    u = rx0 * g[b01 * 2] + ry1 * g[b01 * 2 + 1];
    v = rx1 * g[b11 * 2] + ry1 * g[b11 * 2 + 1];
    const b = lerp(sx, u, v);
    return lerp(sy, a, b);
  };
  // fractalNoise with stitchTiles="stitch" over a tile of `tile` px; returns the channel's value, 0–1
  return (ch: number, px: number, py: number, freq0: number, octaves: number, tile: number) => {
    const lo = Math.floor(tile * freq0) / tile, hi = Math.ceil(tile * freq0) / tile;
    const freq = lo && freq0 / lo < hi / freq0 ? lo : hi;
    const w = Math.trunc(tile * freq + 0.5);
    const st: Stitch = { w, h: w, wrapX: PerlinN + w, wrapY: PerlinN + w };
    let sum = 0, x = px * freq, y = py * freq, ratio = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise2(ch, x, y, st) / ratio;
      x *= 2; y *= 2; ratio *= 2;
      st.w *= 2; st.wrapX = 2 * st.wrapX - PerlinN;
      st.h *= 2; st.wrapY = 2 * st.wrapY - PerlinN;
    }
    return Math.min(Math.max((sum * 255 + 255) / 2, 0), 255) / 255;
  };
}

const toSRGB = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// one layer's colour (sRGB, 0–1) and alpha at a pixel of the 900 px tile
function layer(spec: typeof FIBRE) {
  const noise = makeNoise(spec.seed);
  const color = spec.color.map(toSRGB);
  return (x: number, y: number) => {
    // sampled at pixel centres, as Chrome does; only the alpha channel is used
    const n = noise(3, (x % spec.tile) + 0.5, (y % spec.tile) + 0.5, spec.freq, spec.octaves, spec.tile);
    return { color, alpha: Math.min(Math.max(spec.a * n + spec.b, 0), 1) };
  };
}

const fibre = layer(FIBRE), stains = layer(STAINS);
const rows: Buffer[] = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 3);   // filter byte 0, then RGB
  for (let x = 0; x < SIZE; x++) {
    const top = fibre(x, y), under = stains(x, y);
    // the fibre over the stains (source-over), then the layer at GRAIN_OPACITY multiplied into the parchment
    const alpha = top.alpha + under.alpha * (1 - top.alpha);
    for (let c = 0; c < 3; c++) {
      const grain = alpha ? (top.color[c] * top.alpha + under.color[c] * under.alpha * (1 - top.alpha)) / alpha : 0;
      const paper = PARCHMENT[c] / 255;
      const a = alpha * GRAIN_OPACITY;
      row[1 + x * 3 + c] = Math.round(((1 - a) * paper + a * paper * grain) * 255);
    }
  }
  rows.push(row);
}

// a plain RGB PNG
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;   // bit depth
header[9] = 2;   // RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
const JPEG_QUALITY = 88;
const pngFile = path.join(import.meta.dir, "..", "docs", "rsc", "paper.png");
const out = path.join(import.meta.dir, "..", "docs", "rsc", "paper.jpg");
writeFileSync(pngFile, png);
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(JPEG_QUALITY), pngFile, "--out", out], { stdio: "ignore" });
rmSync(pngFile);
console.log(`${path.relative(process.cwd(), out)}: ${SIZE}×${SIZE}, ${(statSync(out).size / 1024).toFixed(0)} KB`);
