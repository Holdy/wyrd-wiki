// Quill titles as ordinary words on the page. Each word is an inline-block holding a canvas
// (the pen drawing) and, over it, the real characters in transparent text, each as wide as its
// glyph. So the browser wraps the words, and selecting, copying and finding work on real text.
// The font needs no loading, so layout is known the moment this module is: nothing is shown
// in another face first.
import { animateText, makeDrawing } from "./render.js";
import { layoutText, resolveOptions } from "./layout.js";
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
// Un-writing, paced like the writing: ms each letter takes to vanish, and ms between one letter starting and the next.
const ERASE_TIME = 400;
const ERASE_GAP = 150;

// Titles that are fully written, and so can be bent.
const live = new Set();

function make(tag, cls, css) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) e.style.cssText = css;
  return e;
}

// Where the nib lifts the writing: the strokes are centre lines and the slanted nib hangs below
// them by half its height, so the writing is drawn this far up to put the lowest ink on the baseline.
function nibDropOf(o) { return Math.sin(o.nibAngle * Math.PI / 180) * o.nibWidth / 2; }

// A function giving, in page coordinates, the middle of the ink of letter `k` of a word: the
// middle of the box around that glyph's strokes (the nib spreads ink evenly either side).
function inkCentreOf(cell, word, o, pad, advance) {
  var chars = Array.from(word);
  return function (k) {
    var g = getGlyph(chars[k], o.style), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    g.strokes.forEach(function (s) {
      s.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    });
    var left = 0;
    for (var i = 0; i < k; i++) left += advance(chars[i]);
    var r = cell.getBoundingClientRect();
    // the cell's top is ASCENT above the baseline, less the lift; glyph y points up
    var baseline = r.top + ASCENT * o.size - nibDropOf(o);
    return [r.left + left + (x0 + x1) / 2 * o.size, baseline - (y0 + y1) / 2 * o.size];
  };
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
    cell.dataset.word = word;
    cell.inkCentre = inkCentreOf(cell, word, o, pad, advance);
    box.appendChild(cell);
    var letters = [], lx = pad;
    Array.from(word).forEach(function (ch, j) {
      letters.push({ ch: ch, x: lx, seed: (options.seed || 1) + (words.length) * 7 + j * 3 });
      lx += advance(ch);
    });
    words.push({ text: word, canvas: canvas, pad: pad, cell: cell, letters: letters, bent: false });
  });

  // Pen speed (px/s) that writes this letter in LETTER_TIME: its length of stroke over the time.
  function penSpeed(ch) {
    var len = 0;
    layoutText(ch, 0, 0, options).forEach(function (s) {
      for (var i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    });
    return Math.max(len, 1) / (LETTER_TIME / 1000);
  }

  var control = null;
  var handle = null;
  // Writing: each letter of a word starts LETTER_GAP ms after the one before, so several pens
  // are on the go at once; the next word starts when the last letter of this one does.
  // Every letter takes the same time to write, so the pen moves fast over a "w" and slowly over an "l".
  var LETTER_TIME = 500;    // ms
  var LETTER_GAP = 150;     // letters take about 0.15 to 0.4s to draw, so this overlaps them
  handle = {
    ready: false,
    // Draw every word at once, or write them with the pen.
    draw: function (animate, speed) {
      if (control) control.abort();
      control = new AbortController();
      var signal = control.signal;
      // The strokes are centre lines and the slanted nib hangs below them by half its height;
      // lift the writing by that much so the lowest ink, not the nib's middle, sits on the baseline.
      var nibDrop = nibDropOf(o);
      var base = pad + ASCENT * o.size - nibDrop;
      handle.ready = false;
      live.delete(handle);
      words.forEach(function (w) {
        w.drawings = null;
        w.bent = false;
        var ctx = w.canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
      });
      if (!animate) {
        words.forEach(function (w) { paintWord(w, base, options); });
        handle.ready = true;
        live.add(handle);
        return Promise.resolve();
      }
      var running = [], start = 0, clock = makeClock(signal);
      words.forEach(function (w, i) {
        var ctx = w.canvas.getContext("2d"), x = w.pad, j = 0;
        for (var ch of w.text) {
          var opts = Object.assign({}, options, { seed: (options.seed || 1) + i * 7 + j * 3, speed: speed || penSpeed(ch), signal: signal });
          running.push(clock.at(start + j * LETTER_GAP).then(animateText.bind(null, ctx, ch, x, base, opts)));
          x += advance(ch);
          j++;
        }
        start += (j - 1) * LETTER_GAP;
      });
      return Promise.all(running).then(function () {
        if (signal.aborted) return;
        handle.ready = true;                   // written: from now on it can be bent
        live.add(handle);
      }).catch(function () {});       // aborted: another draw has taken over
    },
    // Un-write the title as if the pen were still writing forwards but drawing the ink back up: the
    // letters go first to last, each from the start of its strokes to the end (and they overlap in
    // time, as when writing), so it vanishes left to right. Resolves when it is gone. A title that is not fully written
    // yet is just cleared, and so is any under reduced motion. Cancelled by the next draw().
    erase: function (within) {
      if (control) control.abort();
      control = new AbortController();
      var signal = control.signal;
      var wasReady = handle.ready;
      handle.ready = false;
      live.delete(handle);
      var base = pad + ASCENT * o.size - nibDropOf(o);
      var clear = function () {
        words.forEach(function (w) {
          var ctx = w.canvas.getContext("2d");
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
        });
      };
      if (!wasReady || reducedMotion) { clear(); return Promise.resolve(); }
      var order = [];
      words.forEach(function (w) { drawingsOf(w, base, options).forEach(function (d) { order.push({ w: w, d: d }); }); });
      // `within` (ms): squeeze the letters' start times so the last one has gone by then
      var gap = within ? Math.min(ERASE_GAP, Math.max(within - ERASE_TIME, 0) / Math.max(order.length - 1, 1)) : ERASE_GAP;
      return new Promise(function (resolve) {
        var start = 0, frame = 0;
        var step = function (now) {
          if (signal.aborted) return resolve();
          if (!start) start = now;
          var t = now - start, done = true;
          words.forEach(function (w) {
            var ctx = w.canvas.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
          });
          order.forEach(function (item, i) {
            var u = Math.min(Math.max((t - i * gap) / ERASE_TIME, 0), 1);
            if (u < 1) done = false;
            if (u < 1) item.d.paint(item.w.canvas.getContext("2d"), 1, u);
          });
          if (done) { clear(); return resolve(); }
          frame = requestAnimationFrame(step);
        };
        signal.addEventListener("abort", function () { cancelAnimationFrame(frame); resolve(); }, { once: true });
        frame = requestAnimationFrame(step);
      });
    },
    cancel: function () { if (control) control.abort(); handle.ready = false; live.delete(handle); }
  };
  var base0 = null;
  handle.base = function () { return pad + ASCENT * o.size - nibDropOf(o); };
  handle.options = options;
  handle.size = o.size;
  handle.words = words;
  return handle;
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

// ---- Bending ----------------------------------------------------------------------------------
// At most two points of influence (slot 0: the mouse, slot 1: the flyer), in window coordinates.
// Each finished word's letters are pushed away from them (the library does the bending: see
// makeDrawing's bend) and repainted while anything is moving.
const influences = [null, null];
var bendFrame = 0, bendLast = 0;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A word's letters as drawings, made when first needed, matching how the pen wrote them.
function drawingsOf(w, base, options) {
  if (!w.drawings) {
    w.drawings = w.letters.map(function (l) {
      return makeDrawing(l.ch, l.x, base, Object.assign({}, options, { seed: l.seed }));
    });
  }
  return w.drawings;
}

// Clear a word's canvas and paint its letters as they are now.
function paintWord(w, base, options) {
  var dpr = window.devicePixelRatio || 1;
  var ctx = w.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w.canvas.width, w.canvas.height);
  drawingsOf(w, base, options).forEach(function (d) { d.paint(ctx); });
}

// Set (x, y) as point of influence `slot`, or clear it with x = null.
export function influence(slot, x, y) {
  if (reducedMotion) return;
  influences[slot] = x === null ? null : [x, y];
  if (!bendFrame && live.size) bendFrame = requestAnimationFrame(bendStep);
}

function bendStep(now) {
  var dt = Math.min(bendLast ? (now - bendLast) / 1000 : 1 / 60, 0.05);
  bendLast = now;
  var busy = influences.some(Boolean);
  live.forEach(function (handle) {
    if (!handle.words.length || !handle.words[0].cell.isConnected) { live.delete(handle); return; }
    var base = handle.base(), reach = handle.size * 2.2 + 4;
    handle.words.forEach(function (w) {
      var r = w.canvas.getBoundingClientRect();
      var local = influences.map(function (p) { return p && [p[0] - r.left, p[1] - r.top]; });
      var near = local.some(function (p) { return p && p[0] > -reach && p[0] < r.width + reach && p[1] > -reach && p[1] < r.height + reach; });
      if (!near && !w.bent) return;
      var moving = false;
      drawingsOf(w, base, handle.options).forEach(function (d) { if (d.bend(local, dt)) moving = true; });
      if (moving || w.bent) paintWord(w, base, handle.options);
      w.bent = moving;
      if (moving) busy = true;
    });
  });
  bendFrame = busy ? requestAnimationFrame(bendStep) : 0;
  if (!bendFrame) bendLast = 0;
}
