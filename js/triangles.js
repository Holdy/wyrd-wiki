"use strict";
/**
 * Browser renderer for triangle genomes.
 *
 * Input is the base64 of the raw .bin file: 8 bytes per triangle,
 * `x1 y1 x2 y2 x3 y3 gray alpha`, drawn in file order on a white background.
 * Coordinates 0..255 map onto 0..size, so 255 is the far edge. Alpha byte b
 * means opacity (b + 1) / 256.
 *
 * Compiled to a plain (non-module) script so the page works from file://.
 * Usage:
 *   renderTriangles("#target", base64, 600);                   // 600px
 *   renderTriangles("#target", base64, 600, { repel: true });  // points flee the cursor
 *   renderTriangles("#target", base64, 600, { animateIn: "from-center" });
 *
 * animateIn "from-center": in triangle order each triangle starts as a dot in the
 * middle of the image and moves out to its position and size. A new triangle sets
 * off every 1/100 second (options.animateGap, seconds) and each takes 3 seconds to
 * arrive (options.animateTime, seconds). Skipped if the visitor prefers reduced motion.
 *
 * animateIn "sweep-right": an imaginary line sweeps from the left edge to the right over
 * options.animateTime seconds (default 2). Each triangle starts flat (every point at its
 * own leftmost x) and stretches out to its real width as the line crosses it, so the
 * picture unfolds from left to right.
 *
 * animateIn "sweep-left": the same, mirrored: the line starts at the right edge, each triangle
 * starts flat at its own rightmost x, and the picture unfolds from right to left.
 *
 * options.ink [r, g, b] tints the picture: black becomes that colour and white stays white.
 *
 * The canvas gets a method morphTo(base64, { shift: [dx, dy] }) that turns the picture into another one with
 * the same number of triangles: the old picture fades out while the new one fades in over it, each triangle
 * drifting a little (outwards from the middle) as it does. The canvas also
 * slides by `shift` CSS pixels over the same time. `since` (a performance.now() time) is when the morph counts as having begun, if that was
 * before the call (it then catches up). Returns a promise that resolves when it has finished
 * (at once if the visitor prefers reduced motion, or the files differ in size). After moving the canvas
 * into a layout that already includes the shift (the next title's letter), call canvas.reseat() so the
 * slide carries on from where it was, ending in the same place.
 *
 * options.onDone is called once the sweep has run options.doneAt of its time (default 1, all of it;
 * at once if nothing animates).
 */
const BYTES_PER_TRIANGLE = 8;
/** Seconds for a point to move most of the way when pushed / when drifting home. */
const PUSH_TIME = 0.08;
const RETURN_TIME = 0.8;
/** animateIn: seconds between one triangle setting off and the next, and each one's travel time. */
const ANIMATE_GAP = 1 / 100;
const ANIMATE_TIME = 3;
/** morphTo: seconds the whole morph takes, and how far each triangle drifts meanwhile (a share of the picture). */
const MORPH_TIME = 3;
const MORPH_DRIFT = 0.05;
/** morphTo: "layers" (each triangle in turn, lowest first, moves to its new place, grey and opacity), "blow" (the old letter is blown out to the right as the new one unfolds from the left, which starts a third of a second earlier), "outline" (fills fade to outlines, the outlines move, then the new fills cascade in) or "crossfade" (the old picture fades into the new, each triangle drifting a little). */
const MORPH_STYLE = "blow";
/** morphTo "blow": seconds for the old letter to blow out to the right and for the new one to unfold from the left (the new one first, by MORPH_HEAD), and how much of the first the leftmost-to-rightmost start times take up. */
const MORPH_COLLAPSE = 1.3;
const MORPH_UNFOLD = 2.6;
/** morphTo "blow": seconds the new letter has been coming in before the old one starts to move. */
const MORPH_HEAD = 1 / 3;
const MORPH_BLOW_STAGGER = 0.5;
/** morphTo "outline": the shares of the time for the fills to fade to outlines, for the outlines to move, and for the new fills to come in; the share of that last part each fill takes to come in; and the outlines' opacity. */
const MORPH_PARTS = [0.2, 0.4];
const MORPH_FILL = 0.4;
const MORPH_OUTLINE = 0.5;
/** morphTo "layers": the share of the time over which the triangles set off (the last sets off then). */
const MORPH_SPREAD = 0.5;
/** animateIn "sweep-right": seconds for the line to cross the image, and the least width (as a fraction of the image) a triangle takes to stretch. */
const SWEEP_TIME = 2;
const SWEEP_MIN_SPAN = 0.08;
/** Stops the animation and listeners from a previous render into the same canvas. */
const cleanups = new WeakMap();
function decodeBase64(base64) {
    const binary = atob(base64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
/**
 * Render into `target` (an element or CSS selector) as a size x size CSS-pixel
 * canvas, replacing any canvas a previous call put there. Returns the canvas.
 */
function renderTriangles(target, base64, size, options = {}) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el)
        throw new Error(`renderTriangles: no element matches ${String(target)}`);
    if (!(size > 0))
        throw new Error("renderTriangles: size must be a positive number of pixels");
    const bytes = decodeBase64(base64);
    if (bytes.length === 0 || bytes.length % BYTES_PER_TRIANGLE !== 0) {
        throw new Error(`renderTriangles: decoded ${bytes.length} bytes, expected a multiple of ${BYTES_PER_TRIANGLE}` +
            ` (old 7-byte-per-triangle files are no longer supported)`);
    }
    let canvas = el.querySelector("canvas[data-triangles]");
    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.dataset.triangles = "";
        el.appendChild(canvas);
    }
    cleanups.get(canvas)?.();
    cleanups.delete(canvas);
    // Back the canvas with device pixels so it stays sharp on high-DPI screens.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d");
    // Vertex positions in CSS pixels: home positions and current (possibly displaced) ones.
    const n = bytes.length / BYTES_PER_TRIANGLE;
    const home = new Float32Array(n * 6);
    const grays = new Array(n);
    const grayV = new Float32Array(n);
    const alphaV = new Float32Array(n);
    const ink = options.ink;
    const fillOf = (g, a) => {
        const c = (k) => (ink ? Math.round(255 - ((255 - g) * (255 - ink[k])) / 255) : Math.round(g));
        return `rgba(${c(0)},${c(1)},${c(2)},${a})`;
    };
    for (let t = 0; t < n; t++) {
        const o = t * BYTES_PER_TRIANGLE;
        for (let i = 0; i < 6; i++)
            home[t * 6 + i] = (bytes[o + i] / 255) * size;
        grayV[t] = bytes[o + 6];
        alphaV[t] = (bytes[o + 7] + 1) / 256;
        grays[t] = fillOf(grayV[t], alphaV[t]);
    }
    const pos = new Float32Array(home);
    // animateIn: triangles that have not set off yet are not drawn.
    const animateIn = options.animateIn;
    if (animateIn !== undefined && animateIn !== "from-center" && animateIn !== "sweep-right" && animateIn !== "sweep-left") {
        throw new Error(`renderTriangles: unknown animateIn "${String(animateIn)}" (expected "from-center", "sweep-right" or "sweep-left")`);
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animating = animateIn !== undefined && !reduceMotion;
    const final = new Float32Array(home);
    const shown = new Uint8Array(n).fill(animating && animateIn === "from-center" ? 0 : 1);
    const stops = [];
    const animStops = [];
    if (animating && animateIn === "from-center") {
        for (let i = 0; i < home.length; i += 2) {
            home[i] = pos[i] = size / 2;
            home[i + 1] = pos[i + 1] = size / 2;
        }
    }
    const sweeping = animateIn === "sweep-right" || animateIn === "sweep-left";
    const leftward = animateIn === "sweep-left";
    if (animating && sweeping) {
        // flat: every point at its triangle's leading x (leftmost, or rightmost for sweep-left); a triangle with no width draws nothing
        for (let t = 0; t < n; t++) {
            const xs3 = [final[t * 6], final[t * 6 + 2], final[t * 6 + 4]];
            const left = leftward ? Math.max(...xs3) : Math.min(...xs3);
            for (let k = 0; k < 6; k += 2)
                home[t * 6 + k] = pos[t * 6 + k] = left;
        }
    }
    const paintOrder = new Uint16Array(n);
    const paintOrder0 = new Uint16Array(n);
    for (let t = 0; t < n; t++)
        paintOrder[t] = paintOrder0[t] = t;
    // Paint one set of triangles (`at` their vertices, `fills` their colours, in `order`) on a white ground.
    const paintSet = (c, at, fills, order) => {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = "#fff";
        c.fillRect(0, 0, size, size);
        for (let k = 0; k < n; k++) {
            const t = order[k];
            if (!shown[t])
                continue;
            const p = t * 6;
            c.fillStyle = fills[t];
            c.beginPath();
            c.moveTo(at[p], at[p + 1]);
            c.lineTo(at[p + 2], at[p + 3]);
            c.lineTo(at[p + 4], at[p + 5]);
            c.closePath();
            c.fill();
        }
    };
    const draw = () => paintSet(ctx, pos, grays, paintOrder);
    draw();
    if (animating && animateIn === "from-center") {
        animStops.push(startAnimateIn(final, home, pos, shown, size, options.animateGap ?? ANIMATE_GAP, options.animateTime ?? ANIMATE_TIME, draw));
    }
    if (animating && sweeping) {
        animStops.push(startSweep(final, home, pos, size, options.animateTime ?? SWEEP_TIME, draw, options.onDone, options.doneAt ?? 1, leftward));
    }
    else
        options.onDone?.();
    if (options.repel) {
        const r = options.repel === true ? {} : options.repel;
        stops.push(startRepel(canvas, home, pos, size * (r.radius ?? 0.15), size * (r.strength ?? 0.18), draw));
    }
    stops.push(() => animStops.forEach((stop) => stop()));
    let slide = null;
    canvas.reseat = () => {
        if (!slide || !canvas.animate)
            return;
        const at = slide.anim.currentTime;
        slide.anim.cancel();
        slide.anim = canvas.animate([{ transform: `translate(${-slide.dx}px, ${-slide.dy}px)` }, { transform: "translate(0px, 0px)" }], { duration: slide.total * 1000, easing: "ease-in-out", fill: "forwards" });
        slide.anim.currentTime = at;
    };
    canvas.morphTo = (otherBase64, morph = {}) => {
        animStops.forEach((stop) => stop());
        animStops.length = 0;
        let other;
        try {
            other = decodeBase64(otherBase64);
        }
        catch {
            return Promise.resolve();
        }
        if (other.length !== bytes.length)
            return Promise.resolve();
        shown.fill(1);
        // The new picture is a second set of triangles, painted on a layer of its own and faded in
        // over the old one, which fades out on a layer of its own. Each triangle drifts a little as
        // it does: the old ones outwards from the middle, the new ones arriving from inside.
        const goal = new Float32Array(n * 6);
        const goalGray = new Float32Array(n);
        const goalAlpha = new Float32Array(n);
        const goalFills = new Array(n);
        for (let t = 0; t < n; t++) {
            const o = t * BYTES_PER_TRIANGLE;
            for (let i = 0; i < 6; i++)
                goal[t * 6 + i] = (other[o + i] / 255) * size;
            goalGray[t] = other[o + 6];
            goalAlpha[t] = (other[o + 7] + 1) / 256;
            goalFills[t] = fillOf(goalGray[t], goalAlpha[t]);
        }
        const install = () => {
            for (let k = 0; k < home.length; k++) {
                pos[k] += goal[k] - home[k];
                home[k] = goal[k];
            }
            for (let t = 0; t < n; t++) {
                grayV[t] = goalGray[t];
                alphaV[t] = goalAlpha[t];
                grays[t] = goalFills[t];
                paintOrder[t] = t;
            }
            draw();
        };
        const total = morph.time ?? MORPH_TIME;
        if (reduceMotion) {
            install();
            return Promise.resolve();
        }
        // For each triangle, the vertices of its partner in the other picture (the one at the same position in the
        // file) in the order in which it travels least, so it does not turn inside out on the way.
        const pairVertices = (from, goal) => {
            const to = new Float32Array(n * 6);
            const orders = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0], [0, 2, 1], [1, 0, 2]];
            for (let t = 0; t < n; t++) {
                let best = orders[0];
                let bestCost = Infinity;
                for (const order of orders) {
                    let cost = 0;
                    for (let i = 0; i < 3; i++)
                        cost += Math.hypot(goal[t * 6 + order[i] * 2] - from[t * 6 + i * 2], goal[t * 6 + order[i] * 2 + 1] - from[t * 6 + i * 2 + 1]);
                    if (cost < bestCost) {
                        bestCost = cost;
                        best = order;
                    }
                }
                for (let i = 0; i < 3; i++) {
                    to[t * 6 + i * 2] = goal[t * 6 + best[i] * 2];
                    to[t * 6 + i * 2 + 1] = goal[t * 6 + best[i] * 2 + 1];
                }
            }
            return to;
        };
        const slideBy = (shift, since, duration = total) => {
            const [sx, sy] = shift ?? [0, 0];
            if ((sx || sy) && canvas.animate) {
                slide?.anim.cancel();
                const anim = canvas.animate([{ transform: "translate(0px, 0px)" }, { transform: `translate(${sx}px, ${sy}px)` }], { duration: duration * 1000, easing: "ease-in-out", fill: "forwards" });
                if (since !== undefined)
                    anim.currentTime = Math.max(0, performance.now() - since);
                slide = { anim, dx: sx, dy: sy, total: duration };
            }
        };
        if (MORPH_STYLE === "blow") {
            // At the same time: the old letter is blown out to the right, the leftmost triangles first, each
            // speeding up as it goes; and the new one unfolds from the left edge (the way a letter does when
            // a page first opens). Each is painted on a layer of its own and the two are laid over each
            // other, so a letter's white triangles hide only that letter's own ink.
            slideBy(morph.shift, morph.since, MORPH_HEAD + MORPH_COLLAPSE);
            const from = new Float32Array(home);
            const delay = new Float32Array(n);
            const anchor = new Float32Array(n);
            const span = new Float32Array(n);
            for (let t = 0; t < n; t++) {
                delay[t] = (Math.min(from[t * 6], from[t * 6 + 2], from[t * 6 + 4]) / size) * MORPH_COLLAPSE * MORPH_BLOW_STAGGER;
                const xs = [goal[t * 6], goal[t * 6 + 2], goal[t * 6 + 4]];
                anchor[t] = Math.min(...xs);
                span[t] = Math.max(Math.max(...xs) - anchor[t], size * SWEEP_MIN_SPAN);
            }
            const flight = MORPH_COLLAPSE * (1 - MORPH_BLOW_STAGGER);
            const makeLayer = () => {
                const c = document.createElement("canvas");
                c.width = canvas.width;
                c.height = canvas.height;
                return c;
            };
            const oldLayer = makeLayer();
            const newLayer = makeLayer();
            const oldAt = new Float32Array(n * 6);
            const newAt = new Float32Array(n * 6);
            const duration = Math.max(MORPH_HEAD + MORPH_COLLAPSE, MORPH_UNFOLD);
            return new Promise((resolve) => {
                let frame = 0;
                let start = 0;
                const step = (now) => {
                    if (!start)
                        start = morph.since ?? now;
                    const elapsed = (now - start) / 1000;
                    const p = Math.min(Math.max(elapsed / MORPH_UNFOLD, 0), 1);
                    const line = (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) ** 2) * (size + size * SWEEP_MIN_SPAN);
                    for (let t = 0; t < n; t++) {
                        const u = Math.min(Math.max((elapsed - MORPH_HEAD - delay[t]) / flight, 0), 1);
                        const away = u * u * u * size * 1.3;
                        const stretch = Math.min(Math.max((line - anchor[t]) / span[t], 0), 1);
                        const e = 1 - (1 - stretch) ** 2;
                        for (let k = t * 6; k < t * 6 + 6; k++) {
                            oldAt[k] = from[k] + ((k & 1) === 0 ? away : 0);
                            newAt[k] = (k & 1) === 0 ? anchor[t] + (goal[k] - anchor[t]) * e : goal[k];
                        }
                    }
                    paintSet(oldLayer.getContext("2d"), oldAt, grays, paintOrder);
                    paintSet(newLayer.getContext("2d"), newAt, goalFills, paintOrder0);
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalCompositeOperation = "source-over";
                    ctx.drawImage(oldLayer, 0, 0);
                    ctx.globalCompositeOperation = "multiply";
                    ctx.drawImage(newLayer, 0, 0);
                    ctx.globalCompositeOperation = "source-over";
                    if (elapsed < duration)
                        frame = requestAnimationFrame(step);
                    else {
                        install();
                        resolve();
                    }
                };
                frame = requestAnimationFrame(step);
                animStops.push(() => {
                    cancelAnimationFrame(frame);
                    resolve();
                });
            });
        }
        if (MORPH_STYLE === "outline") {
            // Three parts: every triangle's fill fades away to a faint outline; the outlines all move to their
            // new places; then the new fills come in one after another from the lowest, the outlines fading as they do.
            const from = new Float32Array(home);
            const fromGray = new Float32Array(grayV);
            const fromAlpha = new Float32Array(alphaV);
            const to = pairVertices(from, goal);
            slideBy(morph.shift, morph.since);
            const lineWidth = 1;
            const outline = fillOf(0, MORPH_OUTLINE);
            const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
            const part = (elapsed, from, length) => Math.min(Math.max((elapsed - from * total) / (length * total), 0), 1);
            return new Promise((resolve) => {
                let frame = 0;
                let start = 0;
                const step = (now) => {
                    if (!start)
                        start = morph.since ?? now;
                    const elapsed = (now - start) / 1000;
                    const fade = part(elapsed, 0, MORPH_PARTS[0]);
                    const move = ease(part(elapsed, MORPH_PARTS[0], MORPH_PARTS[1]));
                    const castFrom = MORPH_PARTS[0] + MORPH_PARTS[1];
                    const fill = new Float32Array(n);
                    for (let t = 0; t < n; t++) {
                        const u = Math.min(Math.max((elapsed - castFrom * total - ((t / n) * (1 - MORPH_FILL) * (1 - castFrom) * total)) / (MORPH_FILL * (1 - castFrom) * total), 0), 1);
                        fill[t] = u;
                        for (let k = t * 6; k < t * 6 + 6; k++) {
                            const next = from[k] + (to[k] - from[k]) * move;
                            pos[k] += next - home[k];
                            home[k] = next;
                        }
                    }
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    ctx.fillStyle = "#fff";
                    ctx.fillRect(0, 0, size, size);
                    const trace = (t) => {
                        const p = t * 6;
                        ctx.beginPath();
                        ctx.moveTo(pos[p], pos[p + 1]);
                        ctx.lineTo(pos[p + 2], pos[p + 3]);
                        ctx.lineTo(pos[p + 4], pos[p + 5]);
                        ctx.closePath();
                    };
                    for (let t = 0; t < n; t++) {
                        // the old fill fades out in the first part; the new one comes in in the last
                        const coming = fill[t] > 0 || elapsed >= castFrom * total;
                        const alpha = coming ? goalAlpha[t] * fill[t] : fromAlpha[t] * (1 - fade);
                        if (alpha <= 0)
                            continue;
                        ctx.fillStyle = fillOf(coming ? goalGray[t] : fromGray[t], alpha);
                        trace(t);
                        ctx.fill();
                    }
                    ctx.lineWidth = lineWidth;
                    ctx.lineJoin = "round";
                    for (let t = 0; t < n; t++) {
                        const strength = fade * (1 - fill[t]);
                        if (strength <= 0)
                            continue;
                        ctx.strokeStyle = fillOf(0, MORPH_OUTLINE * strength);
                        trace(t);
                        ctx.stroke();
                    }
                    if (elapsed < total)
                        frame = requestAnimationFrame(step);
                    else {
                        install();
                        resolve();
                    }
                };
                frame = requestAnimationFrame(step);
                animStops.push(() => {
                    cancelAnimationFrame(frame);
                    resolve();
                });
            });
        }
        if (MORPH_STYLE === "layers") {
            // Triangle by triangle from the lowest layer up: each in turn moves to the place, grey and
            // opacity of the one at the same position in the other file, the lowest first.
            const from = new Float32Array(home);
            const fromGray = new Float32Array(grayV);
            const fromAlpha = new Float32Array(alphaV);
            const to = pairVertices(from, goal);
            // the last one sets off half way through, and each takes the other half
            const gap = (total * MORPH_SPREAD) / n;
            const travel = total - n * gap;
            slideBy(morph.shift, morph.since);
            return new Promise((resolve) => {
                let frame = 0;
                let start = 0;
                const step = (now) => {
                    if (!start)
                        start = morph.since ?? now;
                    const elapsed = (now - start) / 1000;
                    for (let t = 0; t < n; t++) {
                        const u = Math.min(Math.max((elapsed - t * gap) / travel, 0), 1);
                        const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
                        for (let k = t * 6; k < t * 6 + 6; k++) {
                            const next = from[k] + (to[k] - from[k]) * e;
                            pos[k] += next - home[k];
                            home[k] = next;
                        }
                        grayV[t] = fromGray[t] + (goalGray[t] - fromGray[t]) * e;
                        alphaV[t] = fromAlpha[t] + (goalAlpha[t] - fromAlpha[t]) * e;
                        grays[t] = fillOf(grayV[t], alphaV[t]);
                    }
                    draw();
                    if (elapsed < total)
                        frame = requestAnimationFrame(step);
                    else {
                        install();
                        resolve();
                    }
                };
                frame = requestAnimationFrame(step);
                animStops.push(() => {
                    cancelAnimationFrame(frame);
                    resolve();
                });
            });
        }
        const drift = (set) => {
            const out = new Float32Array(n * 2);
            for (let t = 0; t < n; t++) {
                let x = 0;
                let y = 0;
                for (let i = 0; i < 3; i++) {
                    x += set[t * 6 + i * 2] / 3 - size / 2;
                    y += set[t * 6 + i * 2 + 1] / 3 - size / 2;
                }
                const d = Math.hypot(x, y) || 1;
                out[t * 2] = (x / d) * size * MORPH_DRIFT;
                out[t * 2 + 1] = (y / d) * size * MORPH_DRIFT;
            }
            return out;
        };
        const driftOld = drift(home);
        const driftNew = drift(goal);
        const layer = () => {
            const c = document.createElement("canvas");
            c.width = canvas.width;
            c.height = canvas.height;
            return c;
        };
        const oldLayer = layer();
        const newLayer = layer();
        const oldAt = new Float32Array(n * 6);
        const newAt = new Float32Array(n * 6);
        const [dx, dy] = morph.shift ?? [0, 0];
        if ((dx || dy) && canvas.animate) {
            slide?.anim.cancel();
            const anim = canvas.animate([{ transform: "translate(0px, 0px)" }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: total * 1000, easing: "ease-in-out", fill: "forwards" });
            if (morph.since !== undefined)
                anim.currentTime = Math.max(0, performance.now() - morph.since);
            slide = { anim, dx, dy, total };
        }
        return new Promise((resolve) => {
            let frame = 0;
            let start = 0;
            const step = (now) => {
                if (!start)
                    start = morph.since ?? now;
                const u = Math.min(Math.max((now - start) / 1000 / total, 0), 1);
                const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
                for (let k = 0; k < n * 6; k++) {
                    const d = Math.floor(k / 6) * 2 + (k & 1);
                    oldAt[k] = pos[k] + driftOld[d] * e;
                    newAt[k] = goal[k] - driftNew[d] * (1 - e);
                }
                paintSet(oldLayer.getContext("2d"), oldAt, grays, paintOrder);
                paintSet(newLayer.getContext("2d"), newAt, goalFills, paintOrder0);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalAlpha = 1;
                ctx.drawImage(oldLayer, 0, 0);
                ctx.globalAlpha = e;
                ctx.drawImage(newLayer, 0, 0);
                ctx.globalAlpha = 1;
                if (u < 1)
                    frame = requestAnimationFrame(step);
                else {
                    install();
                    resolve();
                }
            };
            frame = requestAnimationFrame(step);
            animStops.push(() => {
                cancelAnimationFrame(frame);
                resolve();
            });
        });
    };
    cleanups.set(canvas, () => stops.forEach((stop) => stop()));
    return canvas;
}
/**
 * Each triangle in turn (every `gap` seconds) starts as a dot in the middle and
 * eases out to its real position and size over `travel` seconds. Home positions
 * are updated as it goes, and any push from the cursor is carried along with them.
 */
function startAnimateIn(final, home, pos, shown, size, gap, travel, draw) {
    const n = shown.length;
    const mid = size / 2;
    let frame = 0;
    let start = 0;
    const step = (now) => {
        if (!start)
            start = now;
        const elapsed = (now - start) / 1000;
        let done = true;
        for (let t = 0; t < n; t++) {
            const u = Math.min(Math.max((elapsed - t * gap) / travel, 0), 1);
            if (u < 1)
                done = false;
            if (u <= 0)
                continue;
            shown[t] = 1;
            const e = 1 - (1 - u) ** 3;
            for (let k = t * 6; k < t * 6 + 6; k++) {
                const next = mid + (final[k] - mid) * e;
                pos[k] += next - home[k];
                home[k] = next;
            }
        }
        draw();
        frame = done ? 0 : requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
}
/**
 * A line crosses the image from left to right (right to left if `leftward`) in `travel` seconds (easing in and out).
 * A triangle starts to stretch when the line reaches its leftmost point and is full size
 * once the line has passed its rightmost (or SWEEP_MIN_SPAN of the image further on, for
 * very narrow ones). Home positions are updated as it goes, so a push from the cursor is
 * carried along.
 */
function startSweep(final, home, pos, size, travel, draw, onDone, doneAt, leftward) {
    const n = final.length / 6;
    // anchor: the x a triangle stretches from; lead: the same measured along the sweep (from the edge it starts at)
    const anchor = new Float32Array(n);
    const lead = new Float32Array(n);
    const span = new Float32Array(n);
    for (let t = 0; t < n; t++) {
        const xs = [final[t * 6], final[t * 6 + 2], final[t * 6 + 4]];
        anchor[t] = leftward ? Math.max(...xs) : Math.min(...xs);
        lead[t] = leftward ? size - anchor[t] : anchor[t];
        span[t] = Math.max(Math.max(...xs) - Math.min(...xs), size * SWEEP_MIN_SPAN);
    }
    let frame = 0;
    let start = 0;
    const step = (now) => {
        if (!start)
            start = now;
        const p = Math.min((now - start) / 1000 / travel, 1);
        const line = (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) ** 2) * (size + size * SWEEP_MIN_SPAN);
        for (let t = 0; t < n; t++) {
            const u = Math.min(Math.max((line - lead[t]) / span[t], 0), 1);
            const e = 1 - (1 - u) ** 2;
            for (let k = 0; k < 6; k += 2) {
                const next = anchor[t] + (final[t * 6 + k] - anchor[t]) * e;
                pos[t * 6 + k] += next - home[t * 6 + k];
                home[t * 6 + k] = next;
            }
        }
        draw();
        frame = p < 1 ? requestAnimationFrame(step) : 0;
        if (p >= doneAt && onDone) {
            const call = onDone;
            onDone = undefined;
            call();
        }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
}
/**
 * Each frame, every vertex within `radius` of the cursor gets a goal offset
 * pointing away from it, largest under the cursor and fading smoothly to zero
 * at the edge of the radius. Vertices ease quickly towards a stronger push and
 * slowly back home, so they spring away and then drift back. The animation
 * only runs while the cursor is over the canvas or points are still settling.
 */
function startRepel(canvas, home, pos, radius, strength, draw) {
    let mouse = null;
    let frame = 0;
    let last = 0;
    const step = (now) => {
        // Exponential easing is stable for any dt, so slow or dropped frames just catch up.
        const dt = last ? (now - last) / 1000 : 1 / 60;
        last = now;
        const pushK = 1 - Math.exp(-dt / PUSH_TIME);
        const returnK = 1 - Math.exp(-dt / RETURN_TIME);
        let moving = false;
        for (let i = 0; i < home.length; i += 2) {
            let goalX = home[i];
            let goalY = home[i + 1];
            if (mouse) {
                const dx = home[i] - mouse.x;
                const dy = home[i + 1] - mouse.y;
                const d = Math.hypot(dx, dy);
                if (d < radius) {
                    const falloff = (1 - d / radius) ** 2;
                    // Directly under the cursor there is no direction; push straight up.
                    const ux = d > 0.001 ? dx / d : 0;
                    const uy = d > 0.001 ? dy / d : -1;
                    goalX += ux * strength * falloff;
                    goalY += uy * strength * falloff;
                }
            }
            // Moving further from home than now = being pushed (fast); otherwise drifting back (slow).
            const curOff = Math.hypot(pos[i] - home[i], pos[i + 1] - home[i + 1]);
            const goalOff = Math.hypot(goalX - home[i], goalY - home[i + 1]);
            const k = goalOff > curOff ? pushK : returnK;
            pos[i] += (goalX - pos[i]) * k;
            pos[i + 1] += (goalY - pos[i + 1]) * k;
            if (Math.abs(goalX - pos[i]) > 0.05 || Math.abs(goalY - pos[i + 1]) > 0.05)
                moving = true;
            else {
                pos[i] = goalX;
                pos[i + 1] = goalY;
            }
        }
        draw();
        frame = moving || mouse ? requestAnimationFrame(step) : 0;
        if (!frame)
            last = 0;
    };
    const wake = () => {
        if (!frame)
            frame = requestAnimationFrame(step);
    };
    const onMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        wake();
    };
    const onLeave = () => {
        mouse = null;
        wake();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        cancelAnimationFrame(frame);
    };
}
globalThis.renderTriangles = renderTriangles;
