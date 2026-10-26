/** A point in glyph space: x to the right, y up, baseline at 0, x-height at 1. */
export type Point = [number, number];

/** One pen stroke: a polyline the nib travels along from first point to last. */
export type Stroke = Point[];

export interface Glyph {
  /** Advance width in glyph units (x-height = 1). */
  width: number;
  strokes: Stroke[];
  /** Indices into `strokes` of secondary strokes (bowls, bars, joins) that get no lead-in. */
  secondary?: number[];
  /**
   * Per-stroke override of the exit off the end of a stroke, by index into
   * `strokes`. By default long downward strokes get a rounded flick (lowercase)
   * or a straight cut-out (capitals); "flick" also forces one onto a diagonal.
   */
  exits?: Record<number, "flick" | "cutout" | "none">;
}

/** Letterform style: the default blackletter (a–z, A–Z), or the round variant. Characters blackletter lacks use round forms. */
export type QuillStyle = "round" | "blackletter";

export interface QuillOptions {
  /** Letterform style. Default "blackletter", which also defaults to a 45° nib, tight spacing and a short wedge lead-in; "round" is the variant. */
  style?: QuillStyle;
  /** Pixel height of the x-height (one glyph unit). Default 24. */
  size?: number;
  /** Nib edge length in pixels. Default size * 0.3. */
  nibWidth?: number;
  /** Nib angle in degrees, measured counter-clockwise from horizontal. Default 40. */
  nibAngle?: number;
  /** Ink colour. Default "#1a1a2e". */
  color?: string;
  /** Extra space between letters, in glyph units. Default 0.25. */
  letterSpacing?: number;
  /** Line pitch in glyph units. Default 2.8. */
  lineHeight?: number;
  /** Horizontal shear for italic writing (dx per unit of height). Default 0. */
  slant?: number;
  /** Length (glyph units) of the lead-in into each stroke's start: a hairline from the bottom-left (round), or a thick wedge from the top-left on downward strokes (blackletter). 0 disables. Default 0.2. */
  entryStroke?: number;
  /** Size (glyph units) of the exit off long downward strokes: a rounded flick up and to the right on lowercase, a short straight cut-out on capitals. 0 disables. Default 0.25. */
  exitFlick?: number;
  /** Strength (0-1) of ink dropouts: at one edge of the nib the ink fades out over a pixel or two, then back in. 0 disables. Default 0.7. */
  inkFade?: number;
  /** Chance per pixel step that a dropout begins. Default 0.03. */
  inkFadeRate?: number;
  /** Seed for the dropout pattern, so a given text always draws identically. Default 1. */
  seed?: number;
  /** Wrap words onto new lines when a line would exceed this many pixels. */
  maxWidth?: number;
}

export interface AnimateOptions extends QuillOptions {
  /** Pen speed in pixels per second. Default 300. */
  speed?: number;
  signal?: AbortSignal;
}
