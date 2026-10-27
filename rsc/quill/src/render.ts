import { layoutText, resolveOptions, type ResolvedOptions } from "./layout.js";
import type { AnimateOptions, Point, QuillOptions, Stroke } from "./types.js";

/** Subdivide a polyline so consecutive points are at most `step` px apart. */
function resample(stroke: Stroke, step: number): Stroke {
  const out: Stroke = [stroke[0]];
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1];
    const [x1, y1] = stroke[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** A nib step from a to b, with the ink level (0-1) at each edge of the nib. */
interface Seg {
  a: Point;
  b: Point;
  left: number;
  right: number;
}

/** Fraction of the nib (per side) that can drop out; the rest always inks. */
const EDGE_BAND = 0.2;
/** Edge alphas at or above this are treated as solid ink. */
const SOLID = 0.97;

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ink level per sample for one edge of the nib. Mostly 1; now and then a
 * dropout starts, fading out and back in over a few samples (triangle profile).
 */
function edgeInk(n: number, o: ResolvedOptions, rand: () => number): number[] {
  const ink = new Array<number>(n).fill(1);
  if (o.inkFade <= 0) return ink;
  for (let i = 0; i < n; i++) {
    if (rand() >= o.inkFadeRate) continue;
    const len = 2 + Math.floor(rand() * 3); // 2-4 samples
    const depth = o.inkFade * (0.5 + 0.5 * rand());
    for (let k = 0; k < len && i + k < n; k++) {
      const profile = 1 - Math.abs(((k + 0.5) / len) * 2 - 1);
      ink[i + k] = Math.min(ink[i + k], 1 - depth * profile);
    }
    i += len;
  }
  return ink;
}

function toSegments(samples: Stroke[], o: ResolvedOptions): Seg[] {
  const rand = mulberry32(o.seed);
  const segs: Seg[] = [];
  for (const s of samples) {
    const left = edgeInk(s.length, o, rand);
    const right = edgeInk(s.length, o, rand);
    // A single-point stroke (never produced by built-in glyphs) still leaves a nib mark.
    if (s.length === 1) segs.push({ a: s[0], b: s[0], left: left[0], right: right[0] });
    for (let i = 1; i < s.length; i++) {
      segs.push({ a: s[i - 1], b: s[i], left: left[i], right: right[i] });
    }
  }
  return segs;
}

/**
 * Add the part of the swept parallelogram between t0 and t1 (-1 and 1 are the
 * nib's two ends) to the current path. The nib is a fixed-angle line segment,
 * so the swept area is thick when travelling across the nib and hairline-thin
 * when travelling along it.
 *
 * All quads are wound the same way so that, filled together with the nonzero
 * rule, overlaps merge into one solid shape instead of cancelling out.
 */
function addQuad(ctx: CanvasRenderingContext2D, seg: Seg, t0: number, t1: number, o: ResolvedOptions) {
  const rad = (o.nibAngle * Math.PI) / 180;
  // Canvas y points down, so a counter-clockwise angle flips the sine.
  const hx = (Math.cos(rad) * o.nibWidth) / 2;
  const hy = (-Math.sin(rad) * o.nibWidth) / 2;
  const { a, b } = seg;
  const q: Point[] = [
    [a[0] + t0 * hx, a[1] + t0 * hy],
    [a[0] + t1 * hx, a[1] + t1 * hy],
    [b[0] + t1 * hx, b[1] + t1 * hy],
    [b[0] + t0 * hx, b[1] + t0 * hy],
  ];
  const cross = (q[1][0] - q[0][0]) * (q[2][1] - q[1][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[1][0]);
  if (cross < 0) q.reverse();
  ctx.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
  ctx.closePath();
}

/**
 * Paint segments. The nib's core and every solidly-inked edge go into one
 * fill and one stroke (per-segment fills would composite each antialiased
 * edge many times, leaving seams). Only the edge pieces where ink is
 * dropping out are filled separately, at partial alpha.
 *
 * The first `overlap` segments repaint ink a previous batch already laid down
 * (core only), so the join between batches sits inside solid ink.
 */
function paintSegments(ctx: CanvasRenderingContext2D, segs: Seg[], o: ResolvedOptions, overlap = 0, scale = 1) {
  prepare(ctx, o);
  ctx.globalAlpha = scale;
  const lo = -1 + 2 * EDGE_BAND;
  const hi = 1 - 2 * EDGE_BAND;
  const faded: { seg: Seg; t0: number; t1: number; alpha: number }[] = [];

  ctx.beginPath();
  for (const [i, seg] of segs.entries()) {
    addQuad(ctx, seg, lo, hi, o);
    if (i < overlap) continue; // already inked in full by the previous batch
    if (seg.left >= SOLID) addQuad(ctx, seg, -1, lo, o);
    else faded.push({ seg, t0: -1, t1: lo, alpha: seg.left });
    if (seg.right >= SOLID) addQuad(ctx, seg, hi, 1, o);
    else faded.push({ seg, t0: hi, t1: 1, alpha: seg.right });
  }
  ctx.fill("nonzero");
  ctx.stroke(); // gives hairline strokes a minimum thickness

  for (const f of faded) {
    ctx.globalAlpha = f.alpha * scale;
    ctx.beginPath();
    addQuad(ctx, f.seg, f.t0, f.t1, o);
    ctx.fill("nonzero");
  }
  ctx.globalAlpha = 1;
}

function prepare(ctx: CanvasRenderingContext2D, o: ResolvedOptions) {
  ctx.fillStyle = o.color;
  ctx.strokeStyle = o.color;
  ctx.lineWidth = Math.max(1, o.nibWidth * 0.07);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

/** Pixel spacing between nib positions; kept near 1px so dropouts last a pixel or two. */
function sampleStep(o: ResolvedOptions): number {
  return Math.min(1, Math.max(0.5, o.nibWidth / 4));
}

function buildSamples(text: string, x: number, y: number, o: ResolvedOptions): Stroke[] {
  const step = sampleStep(o);
  return layoutText(text, x, y, o).map((s) => resample(s, step));
}

/** Draw text with its baseline origin at (x, y). */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: QuillOptions,
): void {
  const o = resolveOptions(options);
  ctx.save();
  paintSegments(ctx, toSegments(buildSamples(text, x, y, o), o), o);
  ctx.restore();
}

/** Seconds for a point to move most of the way when pushed, and when drifting back (as the triangle drawings do). */
const PUSH_TIME = 0.08;
const RETURN_TIME = 0.8;
/** How far from a point of influence the text is disturbed, and how far it is pushed at most, in sizes. */
const BEND_REACH = 2.2;
/** How strong the undistorted copy under a bent letter is, against the letter itself. */
const FOOTPRINT = 1 / 6;
const BEND_PUSH = 0.325;

/**
 * Text kept as strokes, so it can be bent and repainted. Give `bend` up to two points of influence
 * (a pointer, a flying thing). The two ends of each stroke stay pinned; only its middle point (or, for a loop such as an o, the
 * middles of its two halves, which are also pinned at their lowest point) is
 * pulled towards them (most strongly when close, never past one), so the stroke behaves as two
 * shorter lines meeting at that point, and bows. The middle moves over fast and eases back slowly.
 * The ink dropouts belong to the points, so a bent drawing keeps them where they were. Made with
 * the same text, position and options as animateText, it looks the same.
 */
export interface Drawing {
  /**
   * Advance the bend by `dt` seconds. `influences` are up to two points in the same pixel space
   * the drawing was laid out in, or null for none. Returns true while anything is still displaced
   * or moving: repaint, and call again next frame; false means it is at rest.
   */
  bend(influences: (Point | null)[], dt: number): boolean;
  /**
   * Paint the drawing as it is now (it does not clear the canvas first). `to` and `from` (0-1; default
   * the whole drawing) paint only the part of the pen's path between those shares of it: `to` alone is
   * the drawing part-way through being written, `from` alone is it part-way through being drawn back
   * up, the ink gone from the start of the path.
   */
  paint(ctx: CanvasRenderingContext2D, to?: number, from?: number): void;
}

export function makeDrawing(text: string, x: number, y: number, options?: QuillOptions): Drawing {
  const o = resolveOptions(options);
  const samples = buildSamples(text, x, y, o);
  const rand = mulberry32(o.seed);
  const inks = samples.map((s) => ({ left: edgeInk(s.length, o, rand), right: edgeInk(s.length, o, rand) }));
  const reach = o.size * BEND_REACH;
  const push = o.size * BEND_PUSH;

  // Per stroke: where each point lies along it (0 at the start, 1 at the end, by length), where its
  // middle point is, and how far that is currently pushed from home (dx, dy). The ends never move.
  const along = samples.map((s) => {
    const t = new Float32Array(s.length);
    let len = 0;
    for (let i = 1; i < s.length; i++) t[i] = len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    if (len > 0) for (let i = 0; i < s.length; i++) t[i] /= len;
    return t;
  });
  // Each stroke is cut at its pinned points into pieces; a piece's middle is the point that moves, and
  // `weight` is how much of that push each point takes (1 at the middle, 0 at the pins). A stroke
  // that closes on itself (an o) is pinned at its lowest point too, so the loop sits on the baseline.
  const pieceOf = samples.map((s) => new Uint8Array(s.length));
  const weight = samples.map((s) => new Float32Array(s.length));
  const mids: Point[][] = samples.map((s, si) => {
    const t = along[si];
    const cuts = [0, 1];
    if (s.length > 3 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < o.size * 0.1) {
      let low = 0;
      for (let i = 1; i < s.length; i++) if (s[i][1] > s[low][1]) low = i;
      if (t[low] > 0.1 && t[low] < 0.9) cuts.splice(1, 0, t[low]);
    }
    const mid: Point[] = [];
    for (let c = 0; c + 1 < cuts.length; c++) {
      const a = cuts[c], b = cuts[c + 1], centre = (a + b) / 2;
      let best = 0;
      for (let i = 0; i < s.length; i++) {
        if (t[i] >= a && t[i] <= b) {
          pieceOf[si][i] = c;
          weight[si][i] = 1 - Math.abs(2 * (t[i] - a) / (b - a) - 1);
        }
        if (Math.abs(t[i] - centre) < Math.abs(t[best] - centre)) best = i;
      }
      mid.push(s[best]);
    }
    return mid;
  });
  const ends = mids.map((m) => new Float32Array(m.length * 2));
  // a box round all the points, to skip the work when nothing is near
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of samples) for (const [px, py] of s) {
    x0 = Math.min(x0, px); x1 = Math.max(x1, px);
    y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  let displaced = false;
  let footprint: { key: string; layer: HTMLCanvasElement } | null = null;

  /** Where an end of a stroke would be pulled to, as an offset from home. */
  function goal(px: number, py: number, near: Point[]): Point {
    let gx = 0, gy = 0;
    for (const p of near) {
      const dx = p[0] - px, dy = p[1] - py;      // towards it
      const d = Math.hypot(dx, dy);
      if (d >= reach || d < 0.001) continue;
      // pulled hardest when near (but never past it)
      const pull = Math.min(push * (1 - d / reach) ** 2, d);
      gx += (dx / d) * pull;
      gy += (dy / d) * pull;
    }
    return [gx, gy];
  }

  return {
    bend(influences, dt) {
      const near = influences.filter((p): p is Point =>
        !!p && p[0] > x0 - reach && p[0] < x1 + reach && p[1] > y0 - reach && p[1] < y1 + reach);
      if (!near.length && !displaced) return false;
      const pushK = 1 - Math.exp(-dt / PUSH_TIME);
      const returnK = 1 - Math.exp(-dt / RETURN_TIME);
      let moving = false;
      samples.forEach((s, si) => {
        const e = ends[si];
        mids[si].forEach((home, m) => {
          const [gx, gy] = goal(home[0], home[1], near);
          // moving further from home than now = being pulled (fast); otherwise drifting back (slow)
          const k = Math.hypot(gx, gy) > Math.hypot(e[m * 2], e[m * 2 + 1]) ? pushK : returnK;
          e[m * 2] += (gx - e[m * 2]) * k;
          e[m * 2 + 1] += (gy - e[m * 2 + 1]) * k;
          if (Math.abs(gx - e[m * 2]) > 0.05 || Math.abs(gy - e[m * 2 + 1]) > 0.05) moving = true;
          else { e[m * 2] = gx; e[m * 2 + 1] = gy; }
        });
      });
      displaced = moving || near.length > 0;
      return displaced;
    },
    paint(ctx, to = 1, from = 0) {
      const build = (bent: boolean) => {
        const segs: Seg[] = [];
        samples.forEach((s, si) => {
          const { left, right } = inks[si];
          const e = ends[si], pc = pieceOf[si], wt = weight[si];
          // each point sits at its home place plus the push of its piece's middle, fading linearly to nothing at the pins
          const pt = (i: number): Point => bent ? [s[i][0] + e[pc[i] * 2] * wt[i], s[i][1] + e[pc[i] * 2 + 1] * wt[i]] : s[i];
          // as toSegments: a single-point stroke still leaves a nib mark
          if (s.length === 1) segs.push({ a: pt(0), b: pt(0), left: left[0], right: right[0] });
          for (let i = 1; i < s.length; i++) segs.push({ a: pt(i - 1), b: pt(i), left: left[i], right: right[i] });
        });
        return segs;
      };
      const cut = (segs: Seg[]) => to >= 1 && from <= 0 ? segs : segs.slice(Math.floor(segs.length * Math.max(from, 0)), Math.floor(segs.length * Math.min(to, 1)));
      const shown = cut(build(true));
      if (!shown.length) return;
      ctx.save();
      const m0 = ctx.getTransform();
      // the letter's footprint: a sixth-strength copy at home, under the bent one, as strong as the push
      let pushed = 0;
      for (const e of ends) for (let m = 0; m < e.length; m += 2) pushed = Math.max(pushed, Math.hypot(e[m], e[m + 1]));
      const strength = Math.min(1, pushed / (push * 0.25));
      if (strength > 0.01) {
        // the footprint never changes, so it is painted once (on a layer the size of the canvas) and laid down at the push's strength
        const m = ctx.getTransform(), c = ctx.canvas;
        const key = [c.width, c.height, m.a, m.d, m.e, m.f, to, from].join();
        if (!footprint || footprint.key !== key) {
          const layer = document.createElement("canvas");
          layer.width = c.width;
          layer.height = c.height;
          const lctx = layer.getContext("2d")!;
          lctx.setTransform(m);
          paintSegments(lctx, cut(build(false)), o, 0, FOOTPRINT);
          footprint = { key, layer };
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = strength;
        ctx.drawImage(footprint.layer, 0, 0);
      }
      ctx.setTransform(m0);
      ctx.globalAlpha = 1;
      paintSegments(ctx, shown, o);
      ctx.restore();
    },
  };
}

/** Steps of the previous batch repainted at the start of each animation batch. */
const JOIN_OVERLAP = 4;

/** Longest stretch of time one animation frame may advance the pen: a laggy frame slows the pen, never skips it ahead. */
const MAX_FRAME_MS = 1000 / 60;

/**
 * Write text progressively, as if by hand. Resolves when finished, or
 * rejects with the abort reason if `signal` is aborted.
 */
export function animateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: AnimateOptions,
): Promise<void> {
  const o = resolveOptions(options);
  const speed = options?.speed ?? 300;
  const signal = options?.signal;
  const step = sampleStep(o);
  const segments = toSegments(buildSamples(text, x, y, o), o);
  const total = segments.length;

  return new Promise((resolve, reject) => {
    let progress = 0;
    let drawn = 0;
    let last = performance.now();
    const frame = (now: number) => {
      if (signal?.aborted) return reject(signal.reason);
      const dt = Math.min(now - last, MAX_FRAME_MS);
      progress = Math.min(total, progress + (dt / 1000) * (speed / step));
      last = now;
      const upTo = Math.floor(progress);
      if (upTo > drawn) {
        // Only the new steps are painted, plus a few back so the batches join without a seam.
        const from = Math.max(0, drawn - JOIN_OVERLAP);
        ctx.save();
        paintSegments(ctx, segments.slice(from, upTo), o, drawn - from);
        ctx.restore();
        drawn = upTo;
      }
      if (progress >= total) return resolve();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
