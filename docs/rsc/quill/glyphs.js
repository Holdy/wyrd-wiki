/**
 * Glyph space: baseline y = 0, x-height y = 1, cap height 1.5,
 * ascenders 1.7, descenders -0.7. y points up.
 */
/** Points along an elliptical arc. Angles in degrees, counter-clockwise from +x. */
export function arc(cx, cy, rx, ry, from, to, 
/** Degrees per segment; a large value gives a faceted, angular curve. Default 15. */
stepDeg = 15) {
    const steps = Math.max(stepDeg === 15 ? 4 : 1, Math.ceil(Math.abs(to - from) / stepDeg));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
}
/** Join pieces (points or arcs) into one continuous stroke. */
export function path(...parts) {
    const out = [];
    for (const p of parts) {
        if (typeof p[0] === "number")
            out.push(p);
        else
            out.push(...p);
    }
    return out;
}
export const line = (...pts) => pts;
// Lowercase bowl shared by a, b, c, d, e, g, o, p, q.
const bowl = (from, to) => arc(0.5, 0.5, 0.45, 0.5, from, to);
const lower = {
    a: { width: 1, secondary: [0, 1], strokes: [bowl(40, 400), line([0.95, 1], [0.95, 0])] },
    b: { width: 1, secondary: [1], strokes: [line([0.05, 1.7], [0.05, 0]), bowl(160, -200)] },
    c: { width: 0.95, strokes: [bowl(40, 320)] },
    d: { width: 1, secondary: [0, 1], strokes: [bowl(40, 400), line([0.95, 1.7], [0.95, 0])] },
    e: { width: 1, strokes: [path([0.05, 0.5], [0.95, 0.5], bowl(0, 315))] },
    f: {
        width: 0.8, secondary: [1],
        strokes: [
            path(arc(0.65, 1.3, 0.3, 0.3, 60, 180), [0.35, 0]),
            line([0.05, 1], [0.75, 1]),
        ],
    },
    g: {
        width: 1, secondary: [0, 1],
        strokes: [bowl(40, 400), path([0.95, 1], [0.95, -0.2], arc(0.5, -0.2, 0.45, 0.4, 0, -150))],
    },
    h: {
        width: 1, secondary: [1],
        strokes: [line([0.05, 1.7], [0.05, 0]), path(arc(0.5, 0.6, 0.45, 0.4, 180, 0), [0.95, 0])],
    },
    i: { width: 0.3, strokes: [line([0.1, 1], [0.1, 0]), line([0.1, 1.35], [0.1, 1.42])] },
    j: {
        width: 0.45,
        strokes: [
            path([0.25, 1], [0.25, -0.2], arc(0.05, -0.2, 0.2, 0.35, 0, -140)),
            line([0.25, 1.35], [0.25, 1.42]),
        ],
    },
    k: {
        width: 0.95, secondary: [2], exits: { 0: "cutout", 2: "flick" },
        strokes: [
            line([0.05, 1.7], [0.05, 0]),
            line([0.9, 1], [0.05, 0.4]),
            line([0.3, 0.6], [0.95, 0]),
        ],
    },
    l: { width: 0.3, strokes: [line([0.1, 1.7], [0.1, 0])] },
    m: {
        width: 1.5, secondary: [1, 2],
        strokes: [
            line([0.05, 1], [0.05, 0]),
            path(arc(0.3, 0.7, 0.25, 0.3, 180, 0), [0.55, 0]),
            path(arc(0.8, 0.7, 0.25, 0.3, 180, 0), [1.05, 0]),
        ],
    },
    n: {
        width: 1, secondary: [1],
        strokes: [line([0.05, 1], [0.05, 0]), path(arc(0.5, 0.7, 0.45, 0.3, 180, 0), [0.95, 0])],
    },
    o: { width: 1, strokes: [bowl(90, 450)] },
    p: { width: 1, secondary: [1], strokes: [line([0.05, 1], [0.05, -0.7]), bowl(160, -200)] },
    q: { width: 1, secondary: [0, 1], strokes: [bowl(40, 400), line([0.95, 1], [0.95, -0.7])] },
    r: {
        width: 0.8, secondary: [1],
        strokes: [line([0.05, 1], [0.05, 0]), arc(0.45, 0.7, 0.4, 0.3, 180, 55)],
    },
    s: {
        width: 0.8,
        strokes: [path(arc(0.4, 0.75, 0.35, 0.25, 20, 270), arc(0.4, 0.25, 0.35, 0.25, 90, -160))],
    },
    t: {
        width: 0.8, secondary: [1],
        strokes: [
            path([0.3, 1.4], [0.3, 0.2], arc(0.6, 0.2, 0.3, 0.2, 180, 270)),
            line([0, 1], [0.7, 1]),
        ],
    },
    u: {
        width: 1, secondary: [1],
        strokes: [path([0.05, 1], arc(0.5, 0.3, 0.45, 0.3, 180, 360)), line([0.95, 1], [0.95, 0])],
    },
    v: { width: 1, strokes: [line([0, 1], [0.5, 0], [1, 1])] },
    w: { width: 1.5, strokes: [line([0, 1], [0.35, 0], [0.7, 0.8], [1.05, 0], [1.4, 1])] },
    x: { width: 0.95, strokes: [line([0, 1], [0.9, 0]), line([0.9, 1], [0, 0])] },
    y: { width: 1, strokes: [line([0, 1], [0.45, 0]), line([0.95, 1], [0.3, -0.7])] },
    z: { width: 0.95, strokes: [line([0, 1], [0.9, 1], [0, 0], [0.9, 0])] },
};
const upper = {
    A: { width: 1.1, secondary: [1], strokes: [line([0, 0], [0.55, 1.5], [1.1, 0]), line([0.2, 0.5], [0.9, 0.5])] },
    B: {
        width: 1.1, secondary: [1, 2],
        strokes: [
            line([0, 0], [0, 1.5]),
            path([0, 1.5], [0.5, 1.5], arc(0.5, 1.125, 0.4, 0.375, 90, -90), [0, 0.75]),
            path([0, 0.75], [0.55, 0.75], arc(0.55, 0.375, 0.45, 0.375, 90, -90), [0, 0]),
        ],
    },
    C: { width: 1.2, strokes: [arc(0.6, 0.75, 0.55, 0.75, 45, 315)] },
    D: {
        width: 1.2, secondary: [1],
        strokes: [
            line([0, 0], [0, 1.5]),
            path([0, 1.5], [0.45, 1.5], arc(0.45, 0.75, 0.6, 0.75, 90, -90), [0, 0]),
        ],
    },
    E: {
        width: 0.95, secondary: [1, 2, 3], exits: { 0: "none" },
        strokes: [
            line([0, 1.5], [0, 0]),
            line([0, 1.5], [0.9, 1.5]),
            line([0, 0.75], [0.7, 0.75]),
            line([0, 0], [0.9, 0]),
        ],
    },
    F: {
        width: 0.95, secondary: [1, 2],
        strokes: [line([0, 1.5], [0, 0]), line([0, 1.5], [0.9, 1.5]), line([0, 0.75], [0.7, 0.75])],
    },
    G: { width: 1.2, strokes: [path(arc(0.6, 0.75, 0.55, 0.75, 45, 360), [0.65, 0.75])] },
    H: {
        width: 1.1, secondary: [2],
        strokes: [line([0, 0], [0, 1.5]), line([1, 0], [1, 1.5]), line([0, 0.75], [1, 0.75])],
    },
    I: { width: 0.3, strokes: [line([0.1, 0], [0.1, 1.5])] },
    J: {
        width: 0.9,
        strokes: [path([0.7, 1.5], [0.7, 0.4], arc(0.35, 0.4, 0.35, 0.4, 0, -160))],
    },
    K: {
        width: 1.1, secondary: [2],
        strokes: [
            line([0, 0], [0, 1.5]),
            line([0.95, 1.5], [0, 0.55]),
            line([0.3, 0.85], [1, 0]),
        ],
    },
    L: { width: 0.9, strokes: [line([0, 1.5], [0, 0], [0.8, 0])] },
    M: {
        width: 1.4,
        secondary: [1],
        strokes: [
            line([0, 1.5], [0, 0]),
            line([0, 1.5], [0.65, 0.2], [1.3, 1.5]),
            line([1.3, 1.5], [1.3, 0]),
        ],
    },
    N: {
        width: 1.1,
        secondary: [1],
        strokes: [line([0, 1.5], [0, 0]), line([0, 1.5], [1, 0]), line([1, 1.5], [1, 0])],
    },
    O: { width: 1.2, strokes: [arc(0.6, 0.75, 0.55, 0.75, 90, 450)] },
    P: {
        width: 1, secondary: [1],
        strokes: [
            line([0, 0], [0, 1.5]),
            path([0, 1.5], [0.5, 1.5], arc(0.5, 1.1, 0.45, 0.4, 90, -90), [0, 0.7]),
        ],
    },
    Q: {
        width: 1.3, secondary: [1],
        strokes: [arc(0.6, 0.75, 0.55, 0.75, 90, 450), line([0.7, 0.3], [1.15, -0.2])],
    },
    R: {
        width: 1.1, secondary: [1, 2],
        strokes: [
            line([0, 0], [0, 1.5]),
            path([0, 1.5], [0.5, 1.5], arc(0.5, 1.1, 0.45, 0.4, 90, -90), [0, 0.7]),
            line([0.4, 0.7], [1, 0]),
        ],
    },
    S: {
        width: 1,
        strokes: [path(arc(0.5, 1.1, 0.42, 0.4, 30, 270), arc(0.5, 0.35, 0.47, 0.35, 90, -150))],
    },
    T: { width: 1, strokes: [line([0, 1.5], [1, 1.5]), line([0.5, 1.5], [0.5, 0])] },
    U: {
        width: 1.2,
        strokes: [path([0, 1.5], [0, 0.5], arc(0.55, 0.5, 0.55, 0.5, 180, 360)), line([1.1, 1.5], [1.1, 0])],
    },
    V: { width: 1.1, strokes: [line([0, 1.5], [0.55, 0], [1.1, 1.5])] },
    W: { width: 1.6, strokes: [line([0, 1.5], [0.35, 0], [0.8, 1.2], [1.25, 0], [1.6, 1.5])] },
    X: { width: 1.1, strokes: [line([0, 1.5], [1, 0]), line([1, 1.5], [0, 0])] },
    Y: {
        width: 1.1, secondary: [1],
        strokes: [line([0, 1.5], [0.55, 0.7], [1.1, 1.5]), line([0.55, 0.7], [0.55, 0])],
    },
    Z: { width: 1, secondary: [0], strokes: [line([0, 1.5], [1, 1.5], [0, 0], [1, 0])] },
};
const misc = {
    " ": { width: 0.6, strokes: [] },
    ".": { width: 0.3, strokes: [line([0.1, 0], [0.1, 0.07])] },
    ",": { width: 0.3, strokes: [line([0.15, 0.05], [0.05, -0.25])] },
    "-": { width: 0.6, strokes: [line([0.05, 0.55], [0.5, 0.55])] },
    "!": { width: 0.3, strokes: [line([0.1, 1.5], [0.1, 0.4]), line([0.1, 0], [0.1, 0.07])] },
    "?": {
        width: 0.9,
        strokes: [
            path(arc(0.45, 1.1, 0.4, 0.4, 160, -60), [0.45, 0.4]),
            line([0.45, 0], [0.45, 0.07]),
        ],
    },
    "'": { width: 0.3, strokes: [line([0.1, 1.5], [0.05, 1.1])] },
    ":": { width: 0.3, strokes: [line([0.1, 0], [0.1, 0.07]), line([0.1, 0.8], [0.1, 0.87])] },
    // Round digits, cap height (1.5) like the capitals. Blackletter falls back to these.
    "0": { width: 0.9, strokes: [arc(0.45, 0.75, 0.4, 0.75, 90, 450)] },
    "1": { width: 0.6, strokes: [line([0.15, 1.2], [0.5, 1.5], [0.5, 0])] },
    "2": { width: 0.9, strokes: [path(arc(0.45, 1.1, 0.4, 0.4, 160, -60), [0.02, 0], [0.9, 0])] },
    "3": { width: 0.9, strokes: [arc(0.42, 1.1, 0.38, 0.4, 150, -90), arc(0.42, 0.4, 0.42, 0.4, 90, -150)] },
    "4": { width: 0.9, strokes: [line([0.7, 0], [0.7, 1.5], [0, 0.45], [0.9, 0.45])] },
    "5": { width: 0.9, strokes: [path(line([0.85, 1.5], [0.12, 1.5], [0.1, 0.85]), arc(0.45, 0.5, 0.45, 0.5, 135, -225))] },
    "6": { width: 0.9, strokes: [arc(0.45, 0.5, 0.42, 0.5, 90, 450), line([0.05, 0.5], [0.25, 1.2], [0.75, 1.5])] },
    "7": { width: 0.9, strokes: [line([0, 1.5], [0.9, 1.5], [0.3, 0])] },
    "8": { width: 0.9, strokes: [arc(0.45, 1.1, 0.36, 0.4, 90, 450), arc(0.45, 0.4, 0.42, 0.4, 90, 450)] },
    "9": { width: 0.9, strokes: [arc(0.45, 1.0, 0.42, 0.5, 270, 630), line([0.85, 1.0], [0.65, 0.3], [0.15, 0])] },
};
/**
 * Long, near-vertical straight strokes are written top to bottom. Reverse any
 * that were authored upward so the lead-in and exit flick land at the right ends.
 */
export function topDown(g) {
    return {
        ...g,
        strokes: g.strokes.map((s) => {
            if (s.length !== 2)
                return s;
            const [[x0, y0], [x1, y1]] = s;
            const long = Math.abs(y1 - y0) >= 0.5;
            const vertical = Math.abs(x1 - x0) < 0.3 * Math.abs(y1 - y0);
            return long && vertical && y1 > y0 ? [s[1], s[0]] : s;
        }),
    };
}
export const GLYPHS = Object.fromEntries(Object.entries({ ...lower, ...upper, ...misc }).map(([ch, g]) => [ch, topDown(g)]));
