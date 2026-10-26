// Quill titles as ordinary words on the page. Each word is an inline-block holding a canvas
// (the pen drawing) and, over it, the real characters in transparent text, each as wide as its
// glyph. So the browser wraps the words, and selecting, copying and finding work on real text.
// The font needs no loading, so layout is known the moment this module is: nothing is shown
// in another face first.
import { animateText, drawText } from "./render.js";
import { resolveOptions } from "./layout.js";
import { getGlyph } from "./font.js";

// Glyph-space extent of a word box above and below the baseline (as in the quill-font library).
const ASCENT = 1.7;
const DESCENT = 0.7;
// How much of the box's height above and below is taken back from the line height (it is mostly
// empty space). The baseline offset below allows for it, so the written baseline stays on the
// line's baseline whatever this is.
const TRIM = 0.15;
// The longest stretch of time one frame may advance the writing (the same cap the pens use).
const MAX_FRAME_MS = 1000 / 60;

function make(tag, cls, css) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) e.style.cssText = css;
  return e;
}

// Fill `box` with the words of `text`, laid out but not yet drawn. Returns { draw(animate), cancel() }.
// The box gets font-size 0 so the spaces between words take only the word-spacing set here.
export function layoutQuill(box, text, options) {
  options = options || {};
  var o = resolveOptions(options);
  var dpr = window.devicePixelRatio || 1;
  var boxH = (ASCENT + DESCENT) * o.size;
  var pad = Math.ceil(o.size * 0.5);          // room for the nib's edge, the lead-in wedge and ink spread
  var advance = function (ch) { return (getGlyph(ch, o.style).width + o.letterSpacing) * o.size; };

  box.textContent = "";
  box.style.fontSize = "0";
  box.style.wordSpacing = advance(" ") + "px";

  var words = [];
  text.split(/ +/).filter(Boolean).forEach(function (word, i) {
    if (i) box.appendChild(document.createTextNode(" "));
    var width = 0;
    for (var ch of word) width += advance(ch);

    var cell = make("span", "qw",
      "display:inline-block;position:relative;width:" + width + "px;height:" + boxH + "px;" +
      "vertical-align:" + (-(DESCENT - TRIM) * o.size) + "px;margin-block:" + (-TRIM * o.size) + "px");
    var canvas = make("canvas", null,
      "position:absolute;left:" + -pad + "px;top:" + -pad + "px;pointer-events:none;" +
      "width:" + (width + 2 * pad) + "px;height:" + (boxH + 2 * pad) + "px");
    canvas.width = Math.ceil((width + 2 * pad) * dpr);
    canvas.height = Math.ceil((boxH + 2 * pad) * dpr);
    var real = make("span", "qt",
      "position:absolute;left:0;top:0;white-space:pre;color:transparent;cursor:text;" +
      "font-size:" + o.size + "px;line-height:" + boxH + "px");
    for (var c of word) {
      var s = make("span", null, "display:inline-block;width:" + advance(c) + "px");
      s.textContent = c;
      real.appendChild(s);
    }
    cell.append(canvas, real);
    box.appendChild(cell);
    words.push({ text: word, canvas: canvas, pad: pad });
  });

  var control = null;
  // Writing: each letter of a word starts LETTER_GAP ms after the one before, so several pens
  // are on the go at once; the next word starts when the last letter of this one does.
  var LETTER_GAP = 150;     // letters take about 0.15 to 0.4s to draw, so this overlaps them
  return {
    // Draw every word at once, or write them with the pen.
    draw: function (animate, speed) {
      if (control) control.abort();
      control = new AbortController();
      var signal = control.signal;
      // The strokes are centre lines and the slanted nib hangs below them by half its height;
      // lift the writing by that much so the lowest ink, not the nib's middle, sits on the baseline.
      var nibDrop = Math.sin(o.nibAngle * Math.PI / 180) * o.nibWidth / 2;
      var base = pad + ASCENT * o.size - nibDrop;
      words.forEach(function (w) {
        var ctx = w.canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
      });
      if (!animate) {
        words.forEach(function (w, i) {
          drawText(w.canvas.getContext("2d"), w.text, w.pad, base, Object.assign({}, options, { seed: (options.seed || 1) + i * 7 }));
        });
        return Promise.resolve();
      }
      var running = [], start = 0, clock = makeClock(signal);
      words.forEach(function (w, i) {
        var ctx = w.canvas.getContext("2d"), x = w.pad, j = 0;
        for (var ch of w.text) {
          var opts = Object.assign({}, options, { seed: (options.seed || 1) + i * 7 + j * 3, speed: speed || 300, signal: signal });
          running.push(clock.at(start + j * LETTER_GAP).then(animateText.bind(null, ctx, ch, x, base, opts)));
          x += advance(ch);
          j++;
        }
        start += (j - 1) * LETTER_GAP;
      });
      return Promise.all(running).catch(function () {});       // aborted: another draw has taken over
    },
    cancel: function () { if (control) control.abort(); }
  };
}

// A clock for the writing: it advances by the real time between frames, but never more than one
// frame's worth (as the pens do), and not at all while frames aren't being drawn. So when the
// machine is busy the pens slow down and the letters' start times slow with them: nothing
// catches up afterwards. at(ms) resolves when the clock reaches ms, or rejects if aborted.
function makeClock(signal) {
  var now = 0, last = null, waiting = [], frame = 0;
  function tick(t) {
    now += last === null ? 0 : Math.min(t - last, MAX_FRAME_MS);
    last = t;
    waiting = waiting.filter(function (w) {
      if (w.ms > now) return true;
      w.resolve();
      return false;
    });
    frame = waiting.length ? requestAnimationFrame(tick) : 0;
  }
  signal.addEventListener("abort", function () {
    cancelAnimationFrame(frame);
    waiting.forEach(function (w) { w.reject(signal.reason); });
    waiting = [];
  }, { once: true });
  return {
    at: function (ms) {
      return new Promise(function (resolve, reject) {
        if (signal.aborted) return reject(signal.reason);
        waiting.push({ ms: ms, resolve: resolve, reject: reject });
        if (!frame) { last = null; frame = requestAnimationFrame(tick); }
      });
    }
  };
}
