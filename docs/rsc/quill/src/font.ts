import { BLACKLETTER } from "./blackletter.js";
import { GLYPHS, arc, line, path } from "./glyphs.js";
import type { Glyph, QuillStyle, Stroke } from "./types.js";

/**
 * A combining mark as pen strokes, drawn about the point (x, y): x is the middle of the letter,
 * y the bottom of an accent above it (or the baseline for marks below).
 */
const MARKS: Record<string, (x: number, y: number) => Stroke[]> = {
  "\u0300": (x, y) => [line([x - 0.15, y + 0.28], [x + 0.08, y])],                          // grave
  "\u0301": (x, y) => [line([x + 0.15, y + 0.28], [x - 0.08, y])],                          // acute
  "\u0302": (x, y) => [path([x - 0.2, y], [x, y + 0.28], [x + 0.2, y])],                    // circumflex
  "\u030C": (x, y) => [path([x - 0.2, y + 0.28], [x, y], [x + 0.2, y + 0.28])],             // caron
  "\u0303": (x, y) => [path([x - 0.28, y + 0.06], [x - 0.1, y + 0.22], [x + 0.1, y + 0.06], [x + 0.28, y + 0.22])], // tilde
  "\u0304": (x, y) => [line([x - 0.24, y + 0.1], [x + 0.24, y])],                           // macron
  "\u0307": (x, y) => [line([x - 0.06, y + 0.1], [x + 0.06, y])],                           // dot above
  "\u0308": (x, y) => [line([x - 0.34, y + 0.16], [x - 0.18, y]), line([x + 0.18, y + 0.16], [x + 0.34, y])], // diaeresis
  "\u030A": (x, y) => [arc(x, y + 0.13, 0.12, 0.13, 90, 450, 60)],                          // ring
  "\u0327": (x) => [path([x, 0], [x + 0.1, -0.12], [x - 0.04, -0.3])],                      // cedilla
};

/** Marks drawn under the letter, from the baseline, not over it. */
const BELOW = new Set(["\u0327"]);

/** Letters whose tops reach above the x-height, so an accent over them sits higher. */
const TALL = /^[A-Zbdfhkl]$/;

/** The letter `g` with the combining `marks` added: a pen stroke each, with no lead-in. */
function withMarks(base: string, g: Glyph, marks: string[]): Glyph {
  // an i or j loses its own dot, which the accent replaces
  const dotted = /^[ij]$/.test(base);
  const keep = g.strokes.flatMap((s, i) => (dotted && s.every(([, y]) => y > 1.3) ? [] : [i]));
  const strokes = keep.map((i) => g.strokes[i]);
  const secondary = (g.secondary ?? []).filter((i) => keep.includes(i)).map((i) => keep.indexOf(i));
  const xs = strokes.flat().map(([x]) => x);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const above = TALL.test(base) ? (base < "a" ? 1.8 : 1.9) : dotted ? 1.3 : 1.2;
  for (const m of marks) {
    for (const s of MARKS[m](x, BELOW.has(m) ? 0 : above)) {
      secondary.push(strokes.length);
      strokes.push(s);
    }
  }
  const exits = Object.fromEntries(Object.entries(g.exits ?? {}).filter(([i]) => keep.includes(+i)).map(([i, v]) => [keep.indexOf(+i), v]));
  return { ...g, strokes, secondary, exits };
}

const direct = (ch: string, style: QuillStyle): Glyph | undefined =>
  (style === "blackletter" && BLACKLETTER[ch]) || GLYPHS[ch] || undefined;

const composed: Record<string, Glyph> = {};

/**
 * Look up a glyph in the chosen style. Characters blackletter doesn't draw
 * (digits, punctuation) fall back to the round forms, so any text still renders.
 * An accented letter (ā, é, ñ, ü...) is its base letter with the accent added above;
 * anything else unknown draws as "?".
 */
export function getGlyph(ch: string, style: QuillStyle = "blackletter"): Glyph {
  const found = direct(ch, style);
  if (found) return found;
  const key = style + ch;
  if (!composed[key]) {
    const [base, ...marks] = ch.normalize("NFD");
    const g = direct(base, style);
    composed[key] = g && marks.length && marks.every((m) => MARKS[m]) ? withMarks(base, g, marks) : GLYPHS["?"];
  }
  return composed[key];
}
