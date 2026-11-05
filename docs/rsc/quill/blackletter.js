import { arc, line, path, topDown } from "./glyphs.js";
/**
 * Blackletter (textura), lowercase and capitals. Condensed letters built from straight
 * stems, with bowls faceted into angled segments rather than smooth curves.
 * Same glyph space as the round style: baseline 0, x-height 1.
 */
// Faceted bowl: an ellipse sampled every 60 degrees, giving pointed corners.
const bowl = (from, to) => arc(0.4, 0.5, 0.32, 0.5, from, to, 60);
/**
 * A dot is a short stroke moving down-right, across the 45° nib, so the nib
 * sweeps out a diamond about 0.43 units across (at the default nib width).
 */
const dot = (cx, cy) => line([cx - 0.085, cy + 0.085], [cx + 0.085, cy - 0.085]);
const L = 0.12; // left stem x
const R = 0.66; // right stem x
const lower = {
    a: { width: 0.8, secondary: [0, 1], strokes: [bowl(30, 390), line([R, 1], [R, 0])] },
    b: { width: 0.8, secondary: [1], strokes: [line([L, 1.7], [L, 0]), bowl(150, -210)] },
    c: { width: 0.75, strokes: [bowl(30, 330)] },
    d: { width: 0.8, secondary: [0, 1], strokes: [bowl(30, 390), line([R, 1.7], [R, 0])] },
    e: { width: 0.8, strokes: [path([0.14, 0.5], [R, 0.5], bowl(30, 330))] },
    f: {
        width: 0.65,
        secondary: [1],
        strokes: [path([0.65, 1.45], [0.45, 1.65], [0.3, 1.4], [0.3, 0]), line([0.02, 1], [0.62, 1])],
    },
    g: {
        width: 0.8,
        secondary: [0, 1],
        strokes: [bowl(30, 390), path([R, 1], [R, -0.25], [0.5, -0.55], [0.15, -0.6])],
    },
    h: {
        width: 0.8,
        secondary: [1],
        exits: { 1: "cutout" },
        strokes: [line([L, 1.7], [L, 0]), path([L, 0.6], [0.4, 1], [R, 0.65], [R, 0])],
    },
    i: { width: 0.3, secondary: [1], strokes: [line([0.1, 1], [0.1, 0]), dot(0.1, 1.4)] },
    j: {
        width: 0.4,
        secondary: [1],
        strokes: [path([0.2, 1], [0.2, -0.2], [0.05, -0.5]), dot(0.2, 1.4)],
    },
    k: {
        width: 0.8,
        secondary: [2],
        strokes: [line([L, 1.7], [L, 0]), line([0.62, 1], [L, 0.45]), line([0.3, 0.65], [R, 0])],
    },
    l: { width: 0.3, strokes: [line([0.1, 1.7], [0.1, 0])] },
    m: {
        width: 1.15,
        secondary: [1, 2],
        exits: { 2: "cutout" },
        strokes: [
            line([0.1, 1], [0.1, 0]),
            path([0.1, 0.6], [0.3, 1], [0.5, 0.65], [0.5, 0]),
            path([0.5, 0.6], [0.7, 1], [0.9, 0.65], [0.9, 0]),
        ],
    },
    n: {
        width: 0.8,
        secondary: [1],
        exits: { 1: "cutout" },
        strokes: [line([L, 1], [L, 0]), path([L, 0.6], [0.4, 1], [R, 0.65], [R, 0])],
    },
    o: { width: 0.8, strokes: [bowl(90, 450)] },
    p: { width: 0.8, secondary: [1], strokes: [line([L, 1], [L, -0.7]), bowl(150, -210)] },
    q: { width: 0.8, secondary: [0, 1], strokes: [bowl(30, 390), line([R, 1], [R, -0.7])] },
    r: {
        width: 0.58,
        secondary: [1],
        strokes: [line([L, 1], [L, 0]), path([L, 0.6], [0.4, 1], [0.6, 0.9])],
    },
    s: {
        width: 0.7,
        strokes: [
            path([0.58, 0.92], [0.4, 1], [0.15, 0.85], [0.2, 0.65], [0.55, 0.35], [0.6, 0.15], [0.4, 0], [0.1, 0.12]),
        ],
    },
    t: {
        width: 0.7,
        secondary: [1],
        strokes: [
            path([0.3, 1.4], [0.3, 0.15], [0.5, 0], [0.65, 0.05]),
            line([0.05, 1], [0.65, 1]),
        ],
    },
    u: {
        width: 0.8,
        exits: { 1: "cutout" },
        strokes: [path([L, 1], [L, 0.35], [0.3, 0], [R, 0.3]), line([R, 1], [R, 0])],
    },
    // v and w: slanting stems whose feet sweep up and right into the next stem.
    v: {
        width: 0.8,
        strokes: [path([0.02, 1], [0.2, 0.1], [0.3, 0], [R, 0.32]), line([R, 1], [R, 0.2])],
    },
    w: {
        width: 1.2,
        strokes: [
            path([0.02, 1], [0.18, 0.1], [0.28, 0], [0.56, 0.32]),
            path([0.56, 1], [0.7, 0.1], [0.8, 0], [1.08, 0.32]),
            line([1.08, 1], [1.08, 0.2]),
        ],
    },
    // x: a thick diagonal with a foot, a thin crossing diagonal, and a short bar.
    x: {
        width: 0.85,
        secondary: [1, 2],
        strokes: [
            path([0.05, 1], [0.55, 0.08], [0.62, 0], [0.82, 0.05]),
            path([0.45, 1], [0.78, 1], [0.7, 0.9], [0.08, 0.08], [0, 0]),
            line([0.2, 0.5], [0.55, 0.5]),
        ],
    },
    y: {
        width: 0.8,
        strokes: [
            path([0.02, 1], [0.2, 0.1], [0.3, 0], [R, 0.32]),
            path([R, 1], [R, -0.3], [0.5, -0.5], [0.28, -0.62]),
        ],
    },
    z: { width: 0.7, strokes: [line([0, 1], [0.7, 1], [0, 0], [0.7, 0])] },
};
/**
 * Capitals, cap height 1.5. Same grammar as the lowercase: stems with the
 * wedge start, faceted bowls, arches that end in a foot, and thin crossing
 * diagonals that run along the nib.
 */
const cap = (cx, cy, rx, ry, from, to) => arc(cx, cy, rx, ry, from, to, 60);
const upper = {
    A: {
        width: 1.1,
        secondary: [1, 2],
        strokes: [line([0.45, 1.5], [0.05, 0]), line([0.45, 1.5], [0.9, 0]), line([0.25, 0.5], [0.7, 0.5])],
    },
    B: {
        width: 1.15,
        secondary: [1, 2],
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1.5], [0.55, 1.5], cap(0.55, 1.125, 0.4, 0.375, 90, -90), [0.1, 0.75]),
            path([0.1, 0.75], [0.6, 0.75], cap(0.6, 0.375, 0.45, 0.375, 90, -90), [0.1, 0]),
        ],
    },
    C: { width: 1.2, strokes: [cap(0.6, 0.75, 0.52, 0.75, 45, 315)] },
    D: {
        width: 1.2,
        secondary: [1],
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1.5], [0.5, 1.5], cap(0.5, 0.75, 0.55, 0.75, 90, -90), [0.1, 0]),
        ],
    },
    E: {
        width: 1,
        secondary: [1, 2, 3],
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1.5], [0.7, 1.5], [0.8, 1.35]),
            line([0.1, 0.75], [0.65, 0.75]),
            path([0.1, 0], [0.7, 0], [0.85, 0.2]),
        ],
    },
    F: {
        width: 0.95,
        secondary: [1, 2],
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1.5], [0.7, 1.5], [0.8, 1.35]),
            line([0.1, 0.75], [0.65, 0.75]),
        ],
    },
    G: {
        width: 1.25,
        secondary: [1],
        strokes: [cap(0.6, 0.75, 0.52, 0.75, 45, 315), line([1.12, 0.85], [1.12, 0])],
    },
    H: {
        width: 1.15,
        secondary: [2],
        strokes: [line([0.1, 1.5], [0.1, 0]), line([1, 1.5], [1, 0]), line([0.1, 0.8], [1, 0.8])],
    },
    I: { width: 0.25, strokes: [line([0.12, 1.5], [0.12, 0])] },
    J: { width: 0.7, strokes: [path([0.5, 1.5], [0.5, 0], [0.3, -0.2], [0.05, -0.15])] },
    K: {
        width: 1.05,
        secondary: [1, 2],
        strokes: [line([0.1, 1.5], [0.1, 0]), line([0.9, 1.5], [0.1, 0.65]), line([0.4, 0.95], [0.95, 0])],
    },
    L: { width: 0.95, strokes: [path([0.1, 1.5], [0.1, 0], [0.8, 0], [0.9, 0.12])] },
    M: {
        width: 1.5,
        secondary: [1, 2],
        exits: { 2: "cutout" },
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1], [0.4, 1.5], [0.7, 1], [0.7, 0]),
            path([0.7, 1], [1, 1.5], [1.3, 1], [1.3, 0]),
        ],
    },
    N: {
        width: 1.15,
        secondary: [1],
        exits: { 1: "cutout" },
        strokes: [line([0.1, 1.5], [0.1, 0]), path([0.1, 0.9], [0.5, 1.5], [0.95, 1], [0.95, 0])],
    },
    O: { width: 1.25, strokes: [cap(0.6, 0.75, 0.52, 0.75, 90, 450)] },
    P: {
        width: 1.05,
        secondary: [1],
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1.5], [0.55, 1.5], cap(0.55, 1.1, 0.42, 0.4, 90, -90), [0.1, 0.7]),
        ],
    },
    Q: {
        width: 1.3,
        secondary: [1],
        strokes: [cap(0.6, 0.75, 0.52, 0.75, 90, 450), line([0.75, 0.35], [1.2, -0.25])],
    },
    R: {
        width: 1.1,
        secondary: [1, 2],
        strokes: [
            line([0.1, 1.5], [0.1, 0]),
            path([0.1, 1.5], [0.55, 1.5], cap(0.55, 1.1, 0.42, 0.4, 90, -90), [0.1, 0.7]),
            line([0.45, 0.7], [1, 0]),
        ],
    },
    S: {
        width: 1,
        strokes: [path([0.8, 1.35], [0.55, 1.5], [0.2, 1.25], [0.2, 1], [0.8, 0.55], [0.85, 0.3], [0.55, 0], [0.1, 0.2])],
    },
    T: {
        width: 1.05,
        secondary: [0],
        strokes: [line([0.05, 1.5], [1, 1.5]), line([0.52, 1.5], [0.52, 0])],
    },
    U: {
        width: 1.2,
        exits: { 1: "cutout" },
        strokes: [path([0.1, 1.5], [0.1, 0.4], [0.4, 0], [1, 0.4]), line([1, 1.5], [1, 0])],
    },
    V: {
        width: 1.2,
        strokes: [path([0.05, 1.5], [0.4, 0.1], [0.5, 0], [1, 0.45]), line([1, 1.5], [1, 0.3])],
    },
    W: {
        width: 1.85,
        strokes: [
            path([0.05, 1.5], [0.3, 0.1], [0.4, 0], [0.85, 0.45]),
            path([0.85, 1.5], [1.1, 0.1], [1.2, 0], [1.65, 0.45]),
            line([1.65, 1.5], [1.65, 0.45]),
        ],
    },
    X: {
        width: 1.2,
        secondary: [1],
        strokes: [
            path([0.05, 1.5], [0.8, 0.1], [0.9, 0], [1.15, 0.08]),
            path([0.7, 1.5], [1.1, 1.5], [1, 1.4], [0.1, 0.1], [0, 0]),
        ],
    },
    Y: {
        width: 1.1,
        secondary: [1],
        strokes: [line([0.05, 1.5], [0.55, 0.7], [1.05, 1.5]), line([0.55, 0.7], [0.55, 0])],
    },
    Z: { width: 1.05, strokes: [path([0.05, 1.5], [0.95, 1.5], [0.2, 0.2], [0.1, 0], [1, 0])] },
};
const punctuation = {
    ".": { width: 0.45, secondary: [0], strokes: [dot(0.2, 0.22)] },
    ":": { width: 0.45, secondary: [0, 1], strokes: [dot(0.2, 0.22), dot(0.2, 0.82)] },
};
export const BLACKLETTER = Object.fromEntries(Object.entries({ ...lower, ...upper, ...punctuation }).map(([ch, g]) => [ch, topDown(g)]));
