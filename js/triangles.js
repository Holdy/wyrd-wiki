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
 */
const BYTES_PER_TRIANGLE = 8;
/** Seconds for a point to move most of the way when pushed / when drifting home. */
const PUSH_TIME = 0.08;
const RETURN_TIME = 0.8;
/** animateIn: seconds between one triangle setting off and the next, and each one's travel time. */
const ANIMATE_GAP = 1 / 100;
const ANIMATE_TIME = 3;
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
    for (let t = 0; t < n; t++) {
        const o = t * BYTES_PER_TRIANGLE;
        for (let i = 0; i < 6; i++)
            home[t * 6 + i] = (bytes[o + i] / 255) * size;
        const g = bytes[o + 6];
        grays[t] = `rgba(${g},${g},${g},${(bytes[o + 7] + 1) / 256})`;
    }
    const pos = new Float32Array(home);
    // animateIn: triangles that have not set off yet are not drawn.
    const animateIn = options.animateIn;
    if (animateIn !== undefined && animateIn !== "from-center") {
        throw new Error(`renderTriangles: unknown animateIn "${String(animateIn)}" (expected "from-center")`);
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animating = animateIn === "from-center" && !reduceMotion;
    const final = new Float32Array(home);
    const shown = new Uint8Array(n).fill(animating ? 0 : 1);
    const stops = [];
    if (animating) {
        for (let i = 0; i < home.length; i += 2) {
            home[i] = pos[i] = size / 2;
            home[i + 1] = pos[i + 1] = size / 2;
        }
    }
    const draw = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        for (let t = 0; t < n; t++) {
            if (!shown[t])
                continue;
            const p = t * 6;
            ctx.fillStyle = grays[t];
            ctx.beginPath();
            ctx.moveTo(pos[p], pos[p + 1]);
            ctx.lineTo(pos[p + 2], pos[p + 3]);
            ctx.lineTo(pos[p + 4], pos[p + 5]);
            ctx.closePath();
            ctx.fill();
        }
    };
    draw();
    if (animating) {
        stops.push(startAnimateIn(final, home, pos, shown, size, options.animateGap ?? ANIMATE_GAP, options.animateTime ?? ANIMATE_TIME, draw));
    }
    if (options.repel) {
        const r = options.repel === true ? {} : options.repel;
        stops.push(startRepel(canvas, home, pos, size * (r.radius ?? 0.15), size * (r.strength ?? 0.18), draw));
    }
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
