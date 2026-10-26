import { BLACKLETTER } from "./blackletter.js";
import { GLYPHS } from "./glyphs.js";
/**
 * Look up a glyph in the chosen style. Characters blackletter doesn't draw
 * (digits, punctuation) fall back to the round forms, so any text still renders.
 */
export function getGlyph(ch, style = "blackletter") {
    if (style === "blackletter" && BLACKLETTER[ch])
        return BLACKLETTER[ch];
    return GLYPHS[ch] ?? GLYPHS["?"];
}
