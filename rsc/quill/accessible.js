import { getGlyph } from "./font.js";
import { getLines, resolveOptions } from "./layout.js";
/** Glyph-space extent of a line box: ascender height above the baseline, descender depth below. */
const ASCENT = 1.7;
const DESCENT = 0.7;
const SR_ONLY = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
/**
 * Lay real, selectable text over the canvas so the written words can be
 * highlighted, copied, found with ctrl-F and read by screen readers.
 *
 * - Sighted users get an invisible text layer whose characters are each as
 *   wide as their glyph, so selection highlights follow the drawn ink.
 * - Screen readers skip that layer (aria-hidden) and read a visually hidden
 *   copy of the text instead, as a single clean string.
 *
 * Pass the same text, position and options you pass to drawText/animateText.
 * (x, y) are CSS pixels from the canvas's top-left corner. The canvas's
 * offsetParent should be positioned (e.g. position: relative) for the layer
 * to line up.
 */
export function addTextLayer(canvas, text, x, y, options) {
    const o = resolveOptions(options);
    const lineBox = (ASCENT + DESCENT) * o.size;
    const root = document.createElement("div");
    root.className = "quill-text";
    root.style.cssText = `position:absolute;left:${canvas.offsetLeft + x}px;top:${canvas.offsetTop + y - ASCENT * o.size}px;`;
    const readable = document.createElement("p");
    readable.className = "quill-text-sr";
    readable.style.cssText = SR_ONLY;
    readable.textContent = text;
    const visual = document.createElement("div");
    visual.setAttribute("aria-hidden", "true");
    visual.style.cssText = "position:absolute;left:0;top:0;";
    getLines(text, options).forEach((line, row) => {
        const div = document.createElement("div");
        div.style.cssText =
            `position:absolute;left:0;top:${row * o.lineHeight * o.size}px;height:${lineBox}px;` +
                `line-height:${lineBox}px;font-size:${o.size}px;white-space:pre;color:transparent;` +
                `user-select:text;-webkit-user-select:text;cursor:text;` +
                `transform-origin:0 ${ASCENT * o.size}px;transform:skewX(${-Math.atan(o.slant)}rad);`;
        for (const ch of line) {
            const span = document.createElement("span");
            span.textContent = ch;
            span.style.cssText = `display:inline-block;width:${(getGlyph(ch, o.style).width + o.letterSpacing) * o.size}px;`;
            div.appendChild(span);
        }
        visual.appendChild(div);
    });
    root.append(readable, visual);
    (canvas.offsetParent ?? canvas.parentElement ?? document.body).appendChild(root);
    return { element: root, remove: () => root.remove() };
}
