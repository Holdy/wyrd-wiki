import { arc } from "./glyphs.js";
import { getGlyph } from "./font.js";
export const DEFAULTS = {
    size: 24,
    nibAngle: 40,
    color: "#1a1a2e",
    letterSpacing: 0.25,
    lineHeight: 2.8,
    slant: 0,
    entryStroke: 0.2,
    exitFlick: 0.25,
    inkFade: 0.7,
    inkFadeRate: 0.03,
    seed: 1,
};
/** Defaults that differ by style; everything else uses DEFAULTS. */
const STYLE_DEFAULTS = {
    round: { nibAngle: DEFAULTS.nibAngle, nibWidth: 0.3, letterSpacing: DEFAULTS.letterSpacing, entryStroke: DEFAULTS.entryStroke },
    // A broad pen held steeper, tight letters, and a short lead-in.
    blackletter: { nibAngle: 45, nibWidth: 0.34, letterSpacing: 0.2, entryStroke: 0.12 },
};
export function resolveOptions(o = {}) {
    const size = o.size ?? DEFAULTS.size;
    const style = o.style ?? "blackletter";
    const sd = STYLE_DEFAULTS[style];
    return {
        size,
        style,
        nibWidth: o.nibWidth ?? size * sd.nibWidth,
        nibAngle: o.nibAngle ?? sd.nibAngle,
        color: o.color ?? DEFAULTS.color,
        letterSpacing: o.letterSpacing ?? sd.letterSpacing,
        lineHeight: o.lineHeight ?? DEFAULTS.lineHeight,
        slant: o.slant ?? DEFAULTS.slant,
        entryStroke: o.entryStroke ?? sd.entryStroke,
        exitFlick: o.exitFlick ?? DEFAULTS.exitFlick,
        inkFade: o.inkFade ?? DEFAULTS.inkFade,
        inkFadeRate: o.inkFadeRate ?? DEFAULTS.inkFadeRate,
        seed: o.seed ?? DEFAULTS.seed,
        maxWidth: o.maxWidth,
    };
}
function wordWidth(word, o) {
    let w = 0;
    for (const ch of word)
        w += getGlyph(ch, o.style).width + o.letterSpacing;
    return w * o.size;
}
/** Strokes shorter than this (glyph units) are dots and get no lead-in. */
const DOT_LENGTH = 0.2;
/**
 * Lead the pen into the stroke's first point. Round style: a hairline from
 * the bottom-left. Blackletter: a short thick wedge from the top-left, down
 * and right into the stroke, and only on strokes that head downward.
 */
function withEntry(s, entry, style) {
    if (entry <= 0)
        return s;
    let len = 0;
    for (let i = 1; i < s.length; i++)
        len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    if (len < DOT_LENGTH)
        return s;
    const [x, y] = s[0];
    if (style === "blackletter") {
        if (s[1][1] >= y)
            return s; // only downward strokes
        return [[x - entry, y + entry], ...s];
    }
    return [[x - entry, y - entry], ...s];
}
/** A final straight run at least this long (glyph units) counts as a long downward stroke. */
const LONG_DOWN = 0.5;
/** True when the end of the stroke is a long, straight, downward run. */
function endsLongDown(s) {
    if (s.length < 2)
        return false;
    const [px, py] = s[s.length - 1];
    const [qx, qy] = s[s.length - 2];
    const dx = px - qx;
    const dy = py - qy;
    return Math.hypot(dx, dy) >= LONG_DOWN && dy < 0 && Math.abs(dx) <= 0.35 * -dy;
}
/** Lowercase exit: curve the end of a long downward stroke round towards the up-right. */
function withFlick(s, r, force = false) {
    if (r <= 0 || s.length < 2)
        return s;
    if (!endsLongDown(s))
        return force ? withBezierFlick(s, r) : s;
    const [px, py] = s[s.length - 1];
    const [qx, qy] = s[s.length - 2];
    const len = Math.hypot(px - qx, py - qy);
    const rr = Math.min(r, len / 2);
    // Pull the end back up the stem by rr, then sweep round from heading down to heading up-right.
    const ex = px - ((px - qx) / len) * rr;
    const ey = py - ((py - qy) / len) * rr;
    return [...s.slice(0, -1), ...arc(ex + rr, ey, rr, rr, 180, 330)];
}
/** Flick off the end of a stroke heading in any downward direction: a curve that turns up and to the right. */
function withBezierFlick(s, r) {
    const [px, py] = s[s.length - 1];
    const [qx, qy] = s[s.length - 2];
    const len = Math.hypot(px - qx, py - qy);
    const rr = Math.min(r, len / 2);
    const sx = px - ((px - qx) / len) * rr;
    const sy = py - ((py - qy) / len) * rr;
    const ex = px + rr * 0.9;
    const ey = py + rr * 0.4;
    const out = s.slice(0, -1);
    out.push([sx, sy]);
    // Quadratic curve from the pulled-back point, via the stroke's end, to the up-right tip.
    for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        out.push([
            (1 - t) * (1 - t) * sx + 2 * t * (1 - t) * px + t * t * ex,
            (1 - t) * (1 - t) * sy + 2 * t * (1 - t) * py + t * t * ey,
        ]);
    }
    return out;
}
/** Capital exit: a short straight cut-out, up and to the right, off the end of the stem. */
function withCutOut(s, len) {
    if (len <= 0 || !endsLongDown(s))
        return s;
    const [px, py] = s[s.length - 1];
    return [...s, [px + len * 0.85, py + len * 0.5]];
}
const isUpper = (ch) => ch !== ch.toLowerCase();
/** Split text into lines, honouring "\n" and (optionally) maxWidth. */
function breakLines(text, o) {
    const lines = [];
    for (const para of text.split("\n")) {
        if (o.maxWidth === undefined) {
            lines.push(para);
            continue;
        }
        let cur = "";
        for (const word of para.split(" ")) {
            const candidate = cur ? `${cur} ${word}` : word;
            if (cur && wordWidth(candidate, o) > o.maxWidth) {
                lines.push(cur);
                cur = word;
            }
            else {
                cur = candidate;
            }
        }
        lines.push(cur);
    }
    return lines;
}
/** The lines the text breaks into (after "\n" and any maxWidth wrapping). */
export function getLines(text, options) {
    return breakLines(text, resolveOptions(options));
}
/** Pixel size of the text block (width of the widest line, total line height). */
export function measureText(text, options) {
    const o = resolveOptions(options);
    const lines = breakLines(text, o);
    const width = Math.max(0, ...lines.map((l) => wordWidth(l, o)));
    return { width, height: lines.length * o.lineHeight * o.size, lines: lines.length };
}
/**
 * Lay text out as pixel-space strokes. (x, y) is the baseline origin of the
 * first line; canvas y grows downward.
 */
export function layoutText(text, x, y, options) {
    const o = resolveOptions(options);
    const strokes = [];
    breakLines(text, o).forEach((line, row) => {
        let cursor = 0;
        const baseY = y + row * o.lineHeight * o.size;
        for (const ch of line) {
            const g = getGlyph(ch, o.style);
            g.strokes.forEach((glyphStroke, idx) => {
                const entry = g.secondary?.includes(idx) ? 0 : o.entryStroke;
                const kind = g.exits?.[idx] ?? (o.style === "blackletter" ? "none" : isUpper(ch) ? "cutout" : "flick");
                const exited = kind === "cutout"
                    ? withCutOut(glyphStroke, o.exitFlick)
                    : kind === "flick"
                        ? withFlick(glyphStroke, o.exitFlick, g.exits?.[idx] === "flick")
                        : glyphStroke;
                const s = withEntry(exited, entry, o.style);
                strokes.push(s.map(([gx, gy]) => [
                    x + (cursor + gx + o.slant * gy) * o.size,
                    baseY - gy * o.size,
                ]));
            });
            cursor += g.width + o.letterSpacing;
        }
    });
    return strokes;
}
