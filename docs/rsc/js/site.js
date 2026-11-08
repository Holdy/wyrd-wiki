// Every page is a real file (written by tools/import-stories.ts) holding its own text and links, and the
// page redraws that content. A click fetches the next file and draws it in place, so the title can change over.
(function () {
  // The home title and the flyer's row of diamonds, on every page: the home page can be reached from any of them.
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    '<section id="home">' +
    '<h1 class="pending" aria-label="Wyrd Wiki"><span id="initial" class="initial" style="--size: 200px"><span class="glyph">W</span></span><span id="home-rest" class="rest" data-text="yrd Wiki"></span></h1>' +
    '<div class="ending" id="pips" aria-hidden="true"><span class="gem" style="transform: translateX(0)"></span><span class="gem" style="transform: translateX(32px)"></span><span class="gem" style="transform: translateX(64px)"></span></div>' +
    '</section>');
  // the diamonds that end every page, and the options button
  document.querySelector("main").insertAdjacentHTML("beforeend",
    '<div class="ending" aria-hidden="true"><span class="gem" style="transform: translateX(0)"></span><span class="gem" style="transform: translateX(32px)"></span><span class="gem" style="transform: translateX(64px)"></span></div>');
  document.body.insertAdjacentHTML("beforeend",
    '<button id="options-button" type="button" aria-label="Options" title="Options">&#9881;&#xFE0E;</button>');
  var breadcrumbPanelEl = document.getElementById("breadcrumb-panel-list");
  var optionsEl = document.getElementById("options");
  var tagImageEl = document.getElementById("tag-image");
  var homeEl = document.getElementById("home");
  var viewEl = document.getElementById("view");
  var token = 0;

  // The place and story path of a URL ("/europe/wales/" gives ["europe", "wales"]).
  function segmentsOf(pathname) {
    var rest = pathname.slice(1);
    try { rest = decodeURIComponent(rest); } catch (e) {}
    return rest.split("/").filter(Boolean);
  }

  async function fetchText(url) {
    var res = await fetch(url);
    if (!res.ok) throw new Error(url + " (" + res.status + ")");
    return res.text();
  }

  // What a page file holds, as the data render() draws. See the page template in tools/import-stories.ts.
  function readPage(doc) {
    var view = doc.getElementById("view");
    var listOf = function (box) {
      return box ? [].map.call(box.querySelectorAll("a"), function (a) { return { title: a.textContent, href: a.getAttribute("href") }; }) : [];
    };
    // the text of a paragraph, with its italics back in *asterisks*
    var source = function (p) {
      return [].map.call(p.childNodes, function (n) { return n.nodeName === "EM" ? "*" + n.textContent + "*" : n.textContent; }).join("");
    };
    var texts = function (sel) { return [].map.call(view.querySelectorAll(sel), source); };
    var page = view.dataset.page, title = view.querySelector("h1").textContent;
    var state = {
      page: page, path: segmentsOf(location.pathname),
      crumbs: listOf(doc.getElementById("breadcrumb-panel-list")), items: listOf(doc.getElementById("options")),
      levelTitle: title, levelStories: listOf(view.querySelector(".realms")), story: null,
      hints: [].map.call(view.querySelectorAll(".hint"), function (p) { return p.textContent; })
    };
    if (page === "home") {
      state.tagline = view.querySelector(".subtitle").textContent;
      state.homeText = texts(".summary p");
    } else if (page === "missing") {
      state.message = title;
    } else if (page === "story") {
      state.story = {
        title: title, paragraphs: texts(".summary p"), details: texts(".details p"),
        tags: (view.dataset.tags || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean)
      };
    }
    return state;
  }

  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function link(text, href) {
    var a = el("a", text);
    a.href = href;
    a.setAttribute("data-nav", "");
    return a;
  }

  // Illuminated letters are triangle genomes served from rsc/letters/<A-Z>.bin.
  // The span keeps a real (invisible) letter, so copying still gives the text.
  // The rest of a title is written in quill (rsc/quill): one canvas per word, with the real
  // text laid over it. The first line starts beside the letter; any later lines are
  // right-aligned. Lines are found by where each word lands, then each is wrapped in a
  // full-width inline-block, so the text still copies as one line.
  var quill = import("/rsc/quill/word.js");
  // Debugging: boxes every quill glyph. Off by default; quillDebug() in the console, or #quill-debug in the address, turns it on (quillDebug(false) off).
  window.quillDebug = function (on) {
    document.documentElement.classList.toggle("quill-debug", on === undefined ? undefined : !!on);
  };
  if (location.hash === "#quill-debug") window.quillDebug(true);
  var quillMod = null;
  quill.then(function (m) { quillMod = m; }, function () {});
  var QUILL = { color: "#3e2b19", inkFadeRate: 0.06 };     // --ink-faded (the colour of the tagline) made a tenth darker, then a fifth darker twice; the library's default fade rate is 0.03

  function alignLines(rest) {
    var lines = rest.querySelector(".lines") || rest;
    var words = [].slice.call(lines.querySelectorAll(".qw"));
    if (!words.length) return;
    lines.textContent = "";                              // flatten any earlier grouping first
    words.forEach(function (w, i) {
      if (i) lines.appendChild(document.createTextNode(" "));
      lines.appendChild(w);
    });
    var groups = [], top = null;
    words.forEach(function (w) {
      var t = w.offsetTop;
      if (top === null || t > top + 4) { groups.push([]); top = t; }
      groups[groups.length - 1].push(w);
    });
    if (groups.length < 2 || !rest.classList.contains("rest") || !rest.closest(".story-title")) return;
    lines.textContent = "";
    groups.forEach(function (g, i) {
      if (i) lines.appendChild(document.createTextNode(" "));
      var line = el("span", null, i ? "line later" : "line");
      g.forEach(function (w, k) {
        if (k) line.appendChild(document.createTextNode(" "));
        line.appendChild(w);
      });
      lines.appendChild(line);
    });
  }

  // Write the rest of a title in quill. The h1 stays hidden until its words are laid out
  // (there is no other face to flash up first), then the pen writes them.
  // `after` (a promise) holds the writing back, for the letter to finish arriving first.
  function writeTitle(h1, rest, text, animate, after) {
    rest.dataset.text = text;
    var size = parseFloat(getComputedStyle(h1).fontSize) * 0.62;
    quill.then(function (q) {
      if (!rest.isConnected) return;
      if (rest.quill) rest.quill.cancel();
      var box = rest.querySelector(".lines") || rest;
      rest.quillSize = size;
      rest.quill = q.layoutQuill(box, text, Object.assign({ size: size }, QUILL));
      alignLines(rest);
      h1.classList.remove("pending");
      var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var write = function () { if (rest.isConnected) rest.quill.draw(animate !== false && !still); };
      if (after) after.then(write); else write();
    }).catch(function () {
      (rest.querySelector(".lines") || rest).textContent = text;     // the module could not load
      rest.noPen = true;
      h1.classList.remove("pending");
    });
  }

  // Each letter has its own empty margin inside its square canvas. Find where
  // the dark ink starts and ends and pull the neighbours in to meet it.
  // Where the dark ink of a drawn letter lies in its canvas (device pixels): leftmost and rightmost
  // columns and lowest row (max is -1 if there is none), with the pixels themselves.
  function inkBounds(canvas) {
    var w = canvas.width, h = canvas.height;
    var d = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    var min = w, max = -1, last = -1, top = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (d[(y * w + x) * 4] < 160) {
          if (x < min) min = x;
          if (x > max) max = x;
          last = y;
          if (top < 0) top = y;
        }
      }
    }
    return { w: w, h: h, d: d, min: min, max: max, last: last, top: top };
  }

  // Reading a letter's pixels back is slow, so each letter is measured once per size (a morph measures the
  // next page's letter as the click is made, so the page swap itself doesn't stall on it).
  var inkCache = {};
  function letterInk(letter, genome, size) {
    var key = letter + size;
    if (!inkCache[key]) inkCache[key] = inkBounds(renderTriangles(document.createElement("div"), genome, size));
    return inkCache[key];
  }

  function trimInitial(span, ink, size) {
    try {
      var w = ink.w, h = ink.h, d = ink.d, min = ink.min, max = ink.max, last = ink.last;
      if (max < 0) return;
      var scale = w / size;
      span.ink = { min: min, last: last, scale: scale };
      var fontSize = parseFloat(getComputedStyle(span).fontSize);
      var rest = span.nextElementSibling;
      var right = max, pad = fontSize * 0.14;
      if (rest && rest.classList.contains("rest")) {
        // The title only sits beside the lowest part of the letter, so only that
        // band decides how close it can come (a T's arm can overhang its foot).
        var band = Math.round(fontSize * 0.8 * scale);
        right = min;
        for (var y2 = Math.max(0, last - band); y2 <= last; y2++) {
          for (var x2 = w - 1; x2 > right; x2--) {
            if (d[(y2 * w + x2) * 4] < 160) { right = x2; break; }
          }
        }
        pad = fontSize * 0.08;
        var drop = (h - 1 - last) / scale;
        span.style.marginBottom = -drop + "px";
        // Letters end at different heights (an E sits higher than an O), which would change the
        // title's height and shift the page when moving between pages: give back the difference
        // from a typical letter, so everything below stays put.
        if (span.parentNode && span.parentNode.classList.contains("story-title")) {
          span.parentNode.style.marginBottom = "calc(0.6em + " + (drop - size * 0.138) + "px)";
        }
        rest.style.maxWidth = "calc(100% - " + ((right - min + 1) / scale + pad) + "px)";
      }
      span.style.marginLeft = -(min / scale) + "px";
      span.style.marginRight = -((w - 1 - right) / scale) + pad + "px";
      if (rest && rest.classList.contains("rest")) {
        alignLines(rest);
        tuckIn(span, rest, d, w, h, min, last, scale);
      }
    } catch (e) {}
  }

  // Once the quill's geometry is known, replace that rough gap with a measured one: slide the
  // title left until the first letter's ink (its strokes, spread by the nib) comes within
  // CLEARANCE of the W's ink at every height where both have any, and no closer.
  var CLEARANCE = 0.1;          // as a share of the quill size
  var quillLayout = import("/rsc/quill/layout.js");
  async function tuckIn(span, rest, d, w, h, min, last, scale) {
    try {
      var lay = await quillLayout;
      var first = (rest.dataset.text || "").charAt(0);
      if (!first || first === " ") return;
      var size = parseFloat(getComputedStyle(span.parentNode).fontSize) * 0.62;
      var o = lay.resolveOptions(Object.assign({ size: size }, QUILL));
      var nibR = o.nibWidth / 2, drop = Math.sin(o.nibAngle * Math.PI / 180) * nibR;
      // the W's right edge on each row (px from its left ink edge), rows counted up from its foot
      var edge = [];
      for (var r = 0; r <= last; r++) {
        var e = -Infinity;
        for (var x = w - 1; x >= min; x--) {
          if (d[(r * w + x) * 4] < 160) { e = (x - min + 1) / scale; break; }
        }
        edge[last - r] = e;                      // index = rows above the foot
      }
      var rowsPerPx = scale, shift = -Infinity;
      lay.layoutText(first, 0, 0, Object.assign({ size: size }, QUILL)).forEach(function (stroke) {
        for (var i = 1; i < stroke.length; i++) {
          var a = stroke[i - 1], b = stroke[i];
          var steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
          for (var k = 0; k <= steps; k++) {
            var px = a[0] + (b[0] - a[0]) * k / steps, up = -(a[1] + (b[1] - a[1]) * k / steps) + drop;
            var lo = Math.max(0, Math.floor((up - nibR) * rowsPerPx)), hi = Math.min(edge.length - 1, Math.ceil((up + nibR) * rowsPerPx));
            for (var q = lo; q <= hi; q++) shift = Math.max(shift, edge[q] - (px - nibR));
          }
        }
      });
      if (shift === -Infinity) return;           // the letters never share a height
      var X = shift + CLEARANCE * size;
      span.style.marginRight = (X - (w - min) / scale) + "px";
      rest.style.maxWidth = "calc(100% - " + X + "px)";
      alignLines(rest);
    } catch (e) {}
  }

  // A drawing file as the base64 text the renderer takes.
  var genomes = {};
  function genomeBase64(url) {
    if (!genomes[url]) {
      genomes[url] = (async function () {
        var res = await fetch(url);
        if (!res.ok) throw new Error(url + " (" + res.status + ")");
        var bytes = new Uint8Array(await res.arrayBuffer());
        var binary = "";
        for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      })();
      genomes[url].catch(function () { delete genomes[url]; });
    }
    return genomes[url];
  }

  // Is the visitor in the United States, going by their time zone? They get American spellings.
  function inUS() {
    try {
      var zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      return /^US\//.test(zone) || zone === "Pacific/Honolulu" ||
        /^America\/(New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)/.test(zone);
    } catch (e) {
      return false;
    }
  }
  // The spelling changes (rsc/spelling.txt, lines "american -> british"), fetched once, in the background.
  // The stories are mostly in British spelling: visitors in the US get the list the other way round
  // (British to American), everyone else gets it as written.
  var spellingPromise = null;
  var spelling = {};
  function spellingList() {
    if (!spellingPromise) {
      var american = inUS();
      spellingPromise = fetchText("/rsc/spelling.txt").then(function (text) {
        text.split(/\r?\n/).forEach(function (line) {
          var m = line.match(/^\s*([^#\s][^\s]*)\s*->\s*(\S+)\s*$/);
          if (!m) return;
          if (!american) spelling[m[1].toLowerCase()] = m[2];
          else if (!spelling[m[2].toLowerCase()]) spelling[m[2].toLowerCase()] = m[1];
        });
      }).catch(function () {});
    }
    return spellingPromise;
  }

  // The tags that have a drawing (rsc/tags/index.txt), fetched once, in the background.
  var tagIndexPromise = null;
  function tagIndex() {
    if (!tagIndexPromise) {
      tagIndexPromise = fetchText("/rsc/tags/index.txt").then(function (text) {
        return text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      }).catch(function () { return []; });
    }
    return tagIndexPromise;
  }

  // The first of a story's tags that has a drawing, or null.
  async function firstTagWithImage(tags) {
    var have = await tagIndex();
    return tags.filter(function (t) { return have.indexOf(t) >= 0; })[0] || (have.indexOf("book") >= 0 ? "book" : null);   // a story with no drawing of its own gets the book
  }

  async function drawTag(box, tag) {
    try {
      var canvas = renderTriangles(box, await genomeBase64("/rsc/tags/" + tag + ".bin"), 200, { repel: true, animateIn: "sweep-left", ink: RUBRIC });
      canvas.setAttribute("aria-hidden", "true");
    } catch (e) {}
  }

  // `done` is called when the letter is a third of the way in (so the quill can start), or could not be drawn.
  var RUBRIC = [110, 28, 18];   // a darker take on --rubric, the red of the illustrated letters

  // Set when a morph has just turned the old title's letter into the one the next title starts with:
  // that letter is then drawn finished, at once, instead of sweeping in.
  var settledLetter = null;
  // A letter still morphing as the next page is built: { letter, canvas, started }. The next title
  // takes the canvas over and the morph carries on there.
  var pending = null;

  async function drawInitial(span, letter, size, done) {
    var settled = settledLetter === letter.toUpperCase();
    settledLetter = null;
    var adopt = pending && pending.started && pending.letter === letter.toUpperCase() && pending.canvas.style.width === size + "px" ? pending : null;
    pending = null;
    try {
      var genome = await genomeBase64("/rsc/letters/" + letter.toUpperCase() + ".bin");
      span.dataset.letter = letter.toUpperCase();
      // trim from a finished copy drawn off the page: the real one starts out flat
      trimInitial(span, letterInk(letter.toUpperCase(), genome, size), size);
      var canvas;
      if (adopt) {
        canvas = adopt.canvas;
        span.appendChild(canvas);
        canvas.reseat();
        if (done) done();
      } else {
        canvas = renderTriangles(span, genome, size, settled
          ? { repel: true, onDone: done, ink: RUBRIC }
          : { repel: true, animateIn: "sweep-right", onDone: done, doneAt: 1 / 3, ink: RUBRIC });
      }
      canvas.setAttribute("aria-hidden", "true");
    } catch (e) {
      var next = span.nextElementSibling;
      if (next && next.classList.contains("rest")) next.style.maxWidth = "";
      span.replaceWith(document.createTextNode(letter));
      if (done) done();
    }
  }

  function addInitial(h1, text) {
    var first = text.charAt(0);
    h1.setAttribute("aria-label", text);          // the drawn parts below are hidden from readers
    h1.classList.add("pending");
    if (!/[a-z]/i.test(first)) {
      var whole = el("span", null, "rest");
      whole.setAttribute("aria-hidden", "true");
      whole.appendChild(el("span", null, "lines"));
      h1.appendChild(whole);
      writeTitle(h1, whole, text, true, null);
      return;
    }
    var span = el("span", null, "initial");
    span.appendChild(el("span", first.toUpperCase(), "glyph"));
    h1.appendChild(span);
    var rest = el("span", null, "rest");
    rest.setAttribute("aria-hidden", "true");
    rest.dataset.text = text.slice(1);
    rest.appendChild(el("span", null, "lines"));
    h1.appendChild(rest);
    var arrive, arrived = new Promise(function (resolve) { arrive = resolve; });
    writeTitle(h1, rest, text.slice(1), true, arrived);
    // Same proportion to the title text as the big W on the home page
    var size = Math.round(parseFloat(getComputedStyle(h1).fontSize) * 2.75);
    span.style.setProperty("--size", size + "px");
    rest.style.maxWidth = "calc(100% - " + size + "px)";
    drawInitial(span, first, size, arrive);
  }

  // A paragraph in which "witch" / "witchcraft" / "magic" are wrapped, ready to be circled.
  // Add `text` to `box`, wrapping the words to circle and the words to respell.
  function fillText(box, text) {
    var last = 0, m;
    var words = Object.keys(spelling).sort(function (x, y) { return y.length - x.length; });
    var re = new RegExp("\\b(witch(?:craft)?|magic|wizard|devils?|ghosts?|curse)\\b" + (words.length ? "|\\b(" + words.join("|") + ")\\b" : ""), "gi");
    while ((m = re.exec(text))) {
      box.appendChild(document.createTextNode(text.slice(last, m.index)));
      var mark = el("span", m[0], m[1] ? "pencil" : "respell");
      if (!m[1]) {
        // the corrected word, with a capital kept if the original had one
        var to = spelling[m[0].toLowerCase()];
        mark.dataset.to = m[0].charAt(0) === m[0].charAt(0).toUpperCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to;
      }
      box.appendChild(mark);
      last = m.index + m[0].length;
    }
    box.appendChild(document.createTextNode(text.slice(last)));
  }

  // The large first letter of a section, as one of the illustrated letters (rsc/letters) used for titles.
  // It starts as a plain letter in the old drop cap's style, which the drawing replaces once the genome has
  // loaded (the real letter stays over the drawing, invisible, so copying gives the text).
  // `trail` is a space that follows a one-letter first word ("A story"): at the start of the line beside the
  // letter it would collapse and vanish from a selection, so it travels with the letter instead.
  function dropCap(letter, trail) {
    var span = el("span", letter + trail, "dropcap");
    span.style.whiteSpace = "pre";
    genomeBase64("/rsc/letters/" + letter.toUpperCase() + ".bin").then(function (genome) {
      // the paragraph may not be on the page yet: wait for it (a few frames), then give up
      return new Promise(function (resolve) {
        var tries = 0;
        (function check() { if (span.isConnected || ++tries > 120) resolve(genome); else requestAnimationFrame(check); })();
      });
    }).then(function (genome) {
      if (!span.isConnected) return;
      var size = Math.round(parseFloat(getComputedStyle(span.parentNode).fontSize) * 3.84);
      var ink = letterInk(letter.toUpperCase(), genome, size), scale = ink.w / size;
      span.textContent = "";
      span.classList.add("drawn", "illustrated");
      span.style.width = size + "px";
      span.style.height = size + "px";
      if (ink.max >= 0) {
        span.style.marginLeft = -(ink.min / scale) + "px";
        span.style.marginRight = -((ink.w - 1 - ink.max) / scale) + size * 0.06 + "px";
        span.style.marginBottom = -((ink.h - 1 - ink.last) / scale) + "px";
        // the top of the ink starts level with the tops of the first line's capitals, then is raised by an eighth of the letter's height
        span.style.marginTop = -(ink.top / scale) + parseFloat(getComputedStyle(span.parentNode).fontSize) * 0.3 - (ink.last - ink.top) / scale / 8 + "px";
      }
      span.appendChild(el("span", letter, "glyph")).style.fontSize = size + "px";
      if (trail) span.appendChild(el("span", trail)).style.cssText = "position:absolute;left:100%;white-space:pre;color:transparent;font-size:1px";
      renderTriangles(span, genome, size, { repel: true, ink: RUBRIC }).setAttribute("aria-hidden", "true");
    }).catch(function (e) { console.error("drop cap", e); });
    return span;
  }

  // A paragraph; text between *asterisks* is shown in italics.
  // `opening`: the first of a section, which gets the large red first letter.
  function paragraph(text, opening) {
    var p = document.createElement("p");
    if (opening) {
      p.className = "opening";
      if (/^[a-z]/i.test(text)) {
        p.classList.add("capped");
        var trail = text.charAt(1) === " " ? " " : "";
        p.appendChild(dropCap(text.charAt(0), trail));
        text = text.slice(1 + trail.length);
      }
    }
    text.split(/\*([^*]+)\*/).forEach(function (part, i) {
      if (i % 2) {
        var em = document.createElement("em");
        fillText(em, part);
        p.appendChild(em);
      } else {
        fillText(p, part);
      }
    });
    return p;
  }

  // One loose pencil loop: it starts inside, comes round past where it began and
  // finishes outside, so the two ends miss each other instead of closing. The
  // radius drifts and wobbles, and the centre slips, like a quick hand-drawn ring.
  // ovalShape picks the random character of the loop once; ovalPath draws it going
  // round either way (dir 1 = clockwise, -1 = anticlockwise) from the same start.
  function ovalShape(w, h, mx, my) {
    return {
      cx: w / 2 + mx, cy: h / 2 + my,
      rx: w / 2 + mx * 0.8, ry: h / 2 + my * 0.3,
      tilt: (Math.random() * 8 - 5) * Math.PI / 180,
      start: (0.9 + Math.random() * 0.5) * Math.PI,      // somewhere on the left
      sweep: Math.PI * 2 * (1.12 + Math.random() * 0.14),
      inward: 0.1 + Math.random() * 0.06,                  // how far inside the start is
      outward: 0.1 + Math.random() * 0.08,                 // how far outside the end is
      wob: [Math.random() * 6.28, Math.random() * 6.28],
      driftX: (Math.random() - 0.5) * 7, driftY: (Math.random() - 0.5) * 4
    };
  }

  // The direction the pencil is moving as the loop begins (clockwise), in page pixels.
  function startTangent(P) {
    var dx = -P.rx * Math.sin(P.start), dy = P.ry * Math.cos(P.start);
    return [dx * Math.cos(P.tilt) - dy * Math.sin(P.tilt), dx * Math.sin(P.tilt) + dy * Math.cos(P.tilt)];
  }

  function ovalPath(P, dir) {
    var n = 40, pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = P.start + dir * P.sweep * t;
      var r = 1 - P.inward + t * (P.inward + P.outward)
        + 0.045 * Math.sin(a * 2 + P.wob[0]) + 0.03 * Math.sin(a * 3 + P.wob[1])
        + (Math.random() - 0.5) * 0.025;
      var x = P.rx * r * Math.cos(a), y = P.ry * r * Math.sin(a);
      pts.push([
        P.cx + t * P.driftX + x * Math.cos(P.tilt) - y * Math.sin(P.tilt),
        P.cy + t * P.driftY + x * Math.sin(P.tilt) + y * Math.cos(P.tilt)
      ]);
    }
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var j = 0; j < n; j++) {
      var p0 = pts[Math.max(j - 1, 0)], p1 = pts[j], p2 = pts[j + 1], p3 = pts[Math.min(j + 2, n)];
      d += "C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
        " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
        " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }

  // A small see-through grey diamond that flies about the window along rails. A rail is a
  // smooth path (arcs and straight lines, never a sharp corner) worked out in advance
  // from where the diamond is and which way it is heading, and the diamond follows it at
  // an even speed. When the thing it is heading for moves (the mouse, a scrolled word),
  // the rail is rewritten from where the diamond now is, so it still turns smoothly.
  var sprite = {
    el: null, x: 0, y: 0, heading: 0, angle: 0, last: 0, clock: 0,
    mode: "rest", t0: 0, restSlot: 2, restFor: 4000, edit: null, trace: null,
    rail: null, spec: null, wpNext: null, task: null,
    actsLeft: 0, nextAct: 0, slideEnd: 0, homeAt: 0, away: null, launchAt: 0, returning: false,
    mouse: null, lastMouse: [0, 0], queue: [], drawTimer: 0, click: null, clickTimer: 0, press: null
  };

  function smooth(u) { return u * u * (3 - 2 * u); }

  // How many times slower than the original pace the diamond moves.
  var PACE = 5;
  var CRUISE = 0.28 / PACE;         // px per ms while wandering (about 56 px a second)
  var TURN_RADIUS = 110;            // px: the tightest curve a rail ever makes
  var CM = 96 / 2.54;               // CSS px in a centimetre (a CSS inch is 96 px)

  // ---- rails: Dubins paths (the shortest path of arcs and straights, for a given turning
  // radius, from one position and heading to another), as points a few px apart.
  function mod2pi(a) {
    a = a % (2 * Math.PI);
    return a < 0 ? a + 2 * Math.PI : a;
  }

  function dubins(x0, y0, h0, x1, y1, h1) {
    var R = TURN_RADIUS, dx = x1 - x0, dy = y1 - y0, D = Math.hypot(dx, dy);
    if (D < 1) return { pts: [[x0, y0], [x1, y1]], len: D };
    var d = D / R, th = Math.atan2(dy, dx), a = mod2pi(h0 - th), b = mod2pi(h1 - th);
    var sa = Math.sin(a), sb = Math.sin(b), ca = Math.cos(a), cb = Math.cos(b), cab = Math.cos(a - b);
    var best = null, p, t, q, tmp, psq;
    function consider(type, t, p, q) {
      var len = t + p + q;
      if (!best || len < best.len) best = { type: type, t: t, p: p, q: q, len: len };
    }
    psq = 2 + d * d - 2 * cab + 2 * d * (sa - sb);                                   // left, straight, left
    if (psq >= 0) { tmp = Math.atan2(cb - ca, d + sa - sb); consider("LSL", mod2pi(-a + tmp), Math.sqrt(psq), mod2pi(b - tmp)); }
    psq = 2 + d * d - 2 * cab + 2 * d * (sb - sa);                                   // right, straight, right
    if (psq >= 0) { tmp = Math.atan2(ca - cb, d - sa + sb); consider("RSR", mod2pi(a - tmp), Math.sqrt(psq), mod2pi(-b + tmp)); }
    psq = -2 + d * d + 2 * cab + 2 * d * (sa + sb);                                  // left, straight, right
    if (psq >= 0) {
      p = Math.sqrt(psq);
      tmp = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
      consider("LSR", mod2pi(-a + tmp), p, mod2pi(-mod2pi(b) + tmp));
    }
    psq = d * d - 2 + 2 * cab - 2 * d * (sa + sb);                                   // right, straight, left
    if (psq >= 0) {
      p = Math.sqrt(psq);
      tmp = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
      consider("RSL", mod2pi(a - tmp), p, mod2pi(b - tmp));
    }
    tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;                             // right, left, right
    if (Math.abs(tmp) <= 1) {
      p = mod2pi(2 * Math.PI - Math.acos(tmp));
      t = mod2pi(a - Math.atan2(ca - cb, d - sa + sb) + p / 2);
      consider("RLR", t, p, mod2pi(a - b - t + p));
    }
    tmp = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8;                             // left, right, left
    if (Math.abs(tmp) <= 1) {
      p = mod2pi(2 * Math.PI - Math.acos(tmp));
      t = mod2pi(-a - Math.atan2(ca - cb, d + sa - sb) + p / 2);
      consider("LRL", t, p, mod2pi(mod2pi(b) - a - t + p));
    }
    var pts = [[x0, y0]], x = x0, y = y0, h = h0, lens = [best.t, best.p, best.q];
    for (var s = 0; s < 3; s++) {
      var kind = best.type.charAt(s), total = lens[s], steps = Math.max(1, Math.ceil(total * R / 4));
      for (var k = 1; k <= steps; k++) {
        var part = total / steps, nx, ny;
        if (kind === "S") { nx = x + Math.cos(h) * part * R; ny = y + Math.sin(h) * part * R; }
        else if (kind === "L") { nx = x + R * (Math.sin(h + part) - Math.sin(h)); ny = y + R * (Math.cos(h) - Math.cos(h + part)); h += part; }
        else { nx = x + R * (Math.sin(h) - Math.sin(h - part)); ny = y + R * (Math.cos(h - part) - Math.cos(h)); h -= part; }
        x = nx; y = ny;
        pts.push([x, y]);
      }
    }
    return { pts: pts, len: best.len * R };
  }

  function line(a, b, pts) {
    var n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    for (var i = 1; i <= n; i++) pts.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  }

  function makeRail(pts, speed, slowStart, slowEnd) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts: pts, cum: cum, len: cum[cum.length - 1], s: 0, i: 0, speed: speed, slowStart: slowStart, slowEnd: slowEnd };
  }

  // Move along a rail for dt ms, easing off at its ends if it asks to.
  function moveRail(r, dt) {
    var v = r.speed;
    if (r.slowStart) v *= Math.min(1, 0.12 + r.s / 220);
    if (r.slowEnd) v *= Math.min(1, 0.12 + (r.len - r.s) / 220);
    r.s = Math.min(r.len, r.s + v * dt);
    while (r.i < r.pts.length - 2 && r.cum[r.i + 1] < r.s) r.i++;
    var a = r.pts[r.i], b = r.pts[r.i + 1], seg = r.cum[r.i + 1] - r.cum[r.i] || 1, f = Math.min(1, (r.s - r.cum[r.i]) / seg);
    sprite.x = a[0] + (b[0] - a[0]) * f;
    sprite.y = a[1] + (b[1] - a[1]) * f;
    if (b[0] !== a[0] || b[1] !== a[1]) sprite.heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }

  // Lay a rail for a job (spec). spec.build() gives { pts, fixAt? }; spec.key() (optional) is the
  // point the rail is aimed at, so it can be rewritten if that point moves.
  function startRail(spec, first) {
    var built = spec.build();
    spec.fixAt = built.fixAt;
    spec.planned = spec.key ? spec.key() : null;
    sprite.spec = spec;
    sprite.rail = makeRail(built.pts, spec.speed, first && !!spec.slowStart, !!spec.slowEnd);
    sprite.mode = "rail";
  }

  function pathLength(pts) { return makeRail(pts, 1, false, false).len; }

  // The closing row has three places, 0 (left) to 2 (right), 32px apart.
  function slotCentre(i) {
    var r = document.getElementById("pips").getBoundingClientRect();
    return [r.left + i * 32 + 10, r.top + r.height / 2];
  }

  function slotInViewport(i) {
    var c = slotCentre(i);
    return c[1] > 0 && c[1] < window.innerHeight && c[0] > 0 && c[0] < window.innerWidth;
  }

  function gems() { return [].slice.call(document.querySelectorAll("#pips .gem")); }

  function placeGem(g, slot, slide) {
    g.spot = slot;
    g.style.transition = slide ? "transform 40s linear" : "none";
    g.style.transform = "translateX(" + slot * 32 + "px)";
    if (!slide) void g.offsetWidth;
  }

  // The rightmost diamond becomes the flyer (the others slide one place right over
  // 40 seconds, leaving the left place free to land in). A diamond that has just
  // landed is first shown in its place, so the row is whole again for an instant.
  function launch() {
    var landed = sprite.away;
    if (landed && landed.spot === null) {
      placeGem(landed, 0, false);
      landed.style.visibility = "visible";
    }
    var out = gems().filter(function (g) { return g.spot === 2; })[0];
    out.style.visibility = "hidden";
    out.spot = null;
    sprite.away = out;
    var home = slotCentre(2);
    sprite.x = home[0];
    sprite.y = home[1];
    sprite.heading = 0;                              // facing right, the way it will go
    sprite.angle = Math.PI / 2;
    if (window.dustFlyer) window.dustFlyer.reset();    // that jump is not movement
    gems().forEach(function (g) { if (g.spot !== null) placeGem(g, g.spot + 1, true); });
    sprite.launchAt = sprite.clock;
    sprite.returning = false;
    sprite.actsLeft = 1 + Math.floor(Math.random() * 2);        // one or two activities per flight
    sprite.wpNext = null;
    // back after the others have finished sliding (40s); if that is missed, stepSprite brings it home at 75s
    sprite.homeAt = sprite.clock + 65000 + Math.random() * 5000;
    console.log("flyer: taking off, plans " + sprite.actsLeft + " activit" + (sprite.actsLeft === 1 ? "y" : "ies") +
      ", home in about " + Math.round((sprite.homeAt - sprite.clock) / 1000) + "s");
  }

  function randomPoint() {
    var w = window.innerWidth, h = window.innerHeight, to;
    do {
      to = [60 + Math.random() * (w - 120), 60 + Math.random() * (h - 120)];
    } while (Math.hypot(to[0] - sprite.x, to[1] - sprite.y) < Math.min(w, h) * 0.4);
    return to;
  }

  // Wandering: a rail to a random point, arriving already heading for the next one,
  // so the legs join without a turn.
  function wander() {
    var to = sprite.wpNext || randomPoint();
    sprite.wpNext = randomPoint();
    var after = Math.atan2(sprite.wpNext[1] - to[1], sprite.wpNext[0] - to[0]);
    startRail({
      kind: "wander", speed: CRUISE, onDone: pickNext,
      build: function () { return dubins(sprite.x, sprite.y, sprite.heading, to[0], to[1], after); }
    }, true);
  }

  // Setting off from the closing row: straight out to the right of the three diamonds first.
  function leaveRow() {
    var c = slotCentre(2), to = [Math.min(c[0] + 150, window.innerWidth - 30), c[1]];
    startRail({
      kind: "wander", speed: CRUISE, slowStart: true, onDone: pickNext,
      build: function () { return dubins(sprite.x, sprite.y, sprite.heading, to[0], to[1], 0); }
    }, true);
  }

  function hurrySlide() {
    var left = 40000 - (sprite.clock - sprite.launchAt);
    sprite.slideEnd = sprite.launchAt + 40000;
    if (left <= 7000) return;
    var secs = 6;
    gems().forEach(function (g) {
      if (g.spot === null) return;
      var from = new DOMMatrix(getComputedStyle(g).transform).m41;
      g.style.transition = "none";
      g.style.transform = "translateX(" + from + "px)";
      void g.offsetWidth;
      g.style.transition = "transform " + secs + "s ease-in-out";
      g.style.transform = "translateX(" + g.spot * 32 + "px)";
    });
    sprite.slideEnd = sprite.clock + secs * 1000;
  }

  // Back to the free place at the left of the closing row, arriving heading right, and rest there.
  function goHome() {
    hurrySlide();     // coming back early: the other two diamonds finish sliding over so the place is free
    sprite.returning = true;
    startRail({
      kind: "home", speed: CRUISE * 2.5, slowEnd: true,
      tol: 1,     // tight: the row may be gliding to a new height, and it must not land off its place and then snap
      key: function () { return slotCentre(0); },
      build: function () { var c = slotCentre(0); return dubins(sprite.x, sprite.y, sprite.heading, c[0], c[1], 0); },
      onDone: function () { sprite.mode = "hold"; }
    }, true);
  }

  // Go for the mouse, rewriting the rail whenever it moves, until within 3 cm; close is enough.
  function visitMouse() {
    startRail({
      kind: "mouse", speed: CRUISE * 1.6, tol: 35, until: sprite.clock + 40000,
      key: function () { return sprite.lastMouse; },
      build: function () {
        var m = sprite.lastMouse;
        return dubins(sprite.x, sprite.y, sprite.heading, m[0], m[1], Math.atan2(m[1] - sprite.y, m[0] - sprite.x));
      },
      onDone: pickNext
    }, true);
  }

  // The things a flight can do, taken in turn (one or two per flight): correct a spelling,
  // circle a word, fly to the mouse, fly through an illustrated letter or the tag drawing,
  // fly through an "o" in the title. An activity the page can't offer just now is passed over.
  // Between activities it wanders; when its allowance is used up it goes home.
  var ACTIVITIES = ["edit", "circle", "mouse", "letter", "o"];
  function pickNext() {
    sprite.queue = sprite.queue.filter(taskAlive);
    var repair = sprite.queue.filter(function (t) { return t.repair; })[0];
    if (repair) {                   // a word someone asked to have put right (flyerrespell) comes first
      sprite.queue.splice(sprite.queue.indexOf(repair), 1);
      return approach(repair);
    }
    if (sprite.click && sprite.click.isConnected) return goClick();     // then the page's only way on
    var first = sprite.queue.filter(function (t) { return t.first; })[0];
    if (first) {                    // then the way towards the visitor's part of the world (see timezones.json)
      sprite.queue.splice(sprite.queue.indexOf(first), 1);
      return approach(first);
    }
    if (sprite.clock >= sprite.homeAt) return goHome();
    if (sprite.actsLeft <= 0) return goHome();      // all its activities are done: back to the pips, seen or not
    var circle = sprite.queue.filter(function (t) { return t.kind !== "respell"; })[0];
    var edit = sprite.queue.filter(function (t) { return t.kind === "respell"; })[0];
    var through = flyThroughTargets();
    var offered = {
      edit: !!edit, circle: !!circle, mouse: !!sprite.mouse,
      letter: through.letters.length > 0, o: through.os.length > 0
    };
    for (var i = 0; i < ACTIVITIES.length; i++) {
      var at = (sprite.nextAct + i) % ACTIVITIES.length, name = ACTIVITIES[at];
      if (!offered[name]) continue;
      sprite.nextAct = (at + 1) % ACTIVITIES.length;
      sprite.actsLeft--;
      console.log("flyer: next activity \"" + name + "\" (" + sprite.actsLeft + " more after this)");
      if (name === "circle" || name === "edit") {
        var task = name === "circle" ? circle : edit;
        sprite.queue.splice(sprite.queue.indexOf(task), 1);
        return approach(task);
      }
      if (name === "mouse") return visitMouse();
      var list = name === "letter" ? through.letters : through.os;
      return flyThrough(list[Math.floor(Math.random() * list.length)]);
    }
    console.log("flyer: nothing on offer, wandering");
    wander();
  }

  // Things it can fly through: each is { c: () => centre or null, r: rough radius }.
  function flyThroughTargets() {
    var out = { letters: [], os: [] };
    var onScreen = function (x, y) { return x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight; };
    [].forEach.call(document.querySelectorAll("canvas[data-triangles]"), function (cv) {
      var r = cv.getBoundingClientRect();
      if (r.width > 0 && onScreen(r.left + r.width / 2, r.top + r.height / 2)) {
        out.letters.push({
          el: cv,
          c: function () {
            if (!cv.isConnected) return null;
            var q = cv.getBoundingClientRect();
            return [q.left + q.width / 2, q.top + q.height / 2];
          },
          r: Math.max(r.width, r.height) / 2
        });
      }
    });
    var title = document.querySelector("h1.story-title");
    if (title) {
      // the quill words know where each letter's ink is (their text over it is only a rough box)
      [].forEach.call(title.querySelectorAll(".qw"), function (cell) {
        if (!cell.inkCentre) return;
        for (var j = 0; j < cell.dataset.word.length; j++) {
          if (!/[oO]/.test(cell.dataset.word.charAt(j))) continue;
          (function (k) {
            var centre = function () { return cell.isConnected ? cell.inkCentre(k) : null; };
            var c = centre();
            if (c && onScreen(c[0], c[1])) out.os.push({ c: centre, r: 12, burst: true });
          })(j);
        }
      });
      var walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentNode.closest && node.parentNode.closest(".glyph, .qw")) continue;     // the hidden copy of the first letter; the quill words (above)
        for (var i = 0; i < node.data.length; i++) {
          if (!/[oO]/.test(node.data.charAt(i))) continue;
          (function (n, k) {
            var centre = function () {
              if (!n.isConnected || k >= n.data.length) return null;
              var range = document.createRange();
              range.setStart(n, k);
              range.setEnd(n, k + 1);
              var q = range.getBoundingClientRect();
              return [q.left + q.width / 2, q.top + q.height / 2];
            };
            var c = centre();
            if (c && onScreen(c[0], c[1])) out.os.push({ c: centre, r: 12, burst: true });
          })(node, i);
        }
      }
    }
    return out;
  }

  // Fly straight through the middle of a target: a rail that curves in to line up with it,
  // then runs straight through the middle and out the other side. Through an "o", eight
  // dust motes fly out as it passes.
  function flyThrough(target) {
    var c = target.c(), dir = [1, 0], reach = target.r + 70;      // in and out a little past the edge of it
    // keep clear of the other drawings: of many directions, take one whose rail crosses none of them
    var others = [].filter.call(document.querySelectorAll("canvas[data-triangles]"), function (cv) {
      return cv !== target.el && cv.getBoundingClientRect().width > 0;
    }).map(function (cv) {
      var q = cv.getBoundingClientRect();
      return { l: q.left - 12, t: q.top - 12, r: q.right + 12, b: q.bottom + 12 };
    });
    var inside = function (q) { return q[0] > -40 && q[0] < window.innerWidth + 40 && q[1] > -40 && q[1] < window.innerHeight + 40; };
    var best = null;
    for (var tries = 0; tries < 120; tries++) {
      var a = Math.random() * Math.PI * 2, u = [Math.cos(a), Math.sin(a)];
      var e = [c[0] - u[0] * reach, c[1] - u[1] * reach], f = [c[0] + u[0] * reach, c[1] + u[1] * reach];
      if (!inside(e) || !inside(f)) continue;
      var trial = dubins(sprite.x, sprite.y, sprite.heading, e[0], e[1], a).pts.slice();
      line(e, f, trial);
      var hits = 0;
      trial.forEach(function (q) {
        if (others.some(function (o) { return q[0] >= o.l && q[0] <= o.r && q[1] >= o.t && q[1] <= o.b; })) hits++;
      });
      if (!best || hits < best.hits) best = { u: u, hits: hits };
      if (hits === 0) break;
    }
    if (best) dir = best.u;
    var spec = {
      kind: "through", speed: CRUISE * 1.3, tol: 30, burst: !!target.burst, fired: false,
      centre: target.c, key: target.c,
      build: function () {
        var m = target.c();
        var enter = [m[0] - dir[0] * reach, m[1] - dir[1] * reach], leave = [m[0] + dir[0] * reach, m[1] + dir[1] * reach];
        var d = dubins(sprite.x, sprite.y, sprite.heading, enter[0], enter[1], Math.atan2(dir[1], dir[0]));
        var pts = d.pts.slice();
        line(enter, leave, pts);
        return { pts: pts, fixAt: d.len };
      },
      onDone: function () {
        var m = target.c();
        if (spec.burst && !spec.fired && m && window.dustBurst) window.dustBurst(m[0], m[1]);
        pickNext();
      }
    };
    startRail(spec, true);
  }

  // Where on a link to press: the middle of its first line.
  function linkPoint(a) {
    var q = a.isConnected && a.getClientRects()[0];
    return q ? [q.left + Math.min(q.width / 2, 40), q.top + q.height / 2] : null;
  }

  // When a page offers only one way on, the flyer goes to that link and presses it.
  function goClick() {
    var a = sprite.click;
    sprite.click = null;
    console.log("flyer: only one way on, going to press \"" + a.textContent + "\"");
    startRail({
      kind: "click", speed: CRUISE * 1.8, slowEnd: true, tol: 20,
      alive: function () { return a.isConnected; },
      key: function () { return linkPoint(a); },
      build: function () {
        var m = linkPoint(a);
        return dubins(sprite.x, sprite.y, sprite.heading, m[0], m[1], 0);     // arriving heading right, in from the left of the text
      },
      onDone: function () {
        sprite.press = { a: a, t0: sprite.clock, done: false };
        sprite.el.classList.add("press");
        sprite.mode = "press";
      }
    }, true);
  }

  function taskAlive(task) {
    return task.kind === "respell" ? task.span.isConnected : task.path.isConnected;
  }

  // Where in the window the caret sits after `index` letters of a word.
  function caretPoint(span, index) {
    var node = span.firstChild;
    if (!node) return [sprite.x, sprite.y];
    var range = document.createRange();
    var before = index > 0;
    range.setStart(node, before ? index - 1 : 0);
    range.setEnd(node, before ? index : 1);
    var r = range.getBoundingClientRect();
    return [before ? r.right : r.left, r.top + r.height / 2];
  }

  function circleStart(task) {
    var r = task.svg.getBoundingClientRect(), pt = task.path.getPointAtLength(0);
    return [r.left + pt.x, r.top + pt.y];
  }

  var EDIT_STEP = 260;              // ms per letter deleted or typed
  var BELOW = 34;                   // px below the line it flies to first, before sliding up as the cursor

  // Go to a job (a word to circle, or a word to correct): a rail that ends at the right
  // spot, heading the right way for what comes next.
  function approach(task) {
    sprite.task = task;
    var alive = function () { return taskAlive(task); };
    if (task.kind === "respell") {
      // to a point just below the place in the word, arriving heading up
      var below = function () {
        var c = caretPoint(task.span, task.prefix.length + task.oldMid.length);
        return [c[0], c[1] + BELOW];
      };
      startRail({
        kind: "approach", speed: CRUISE * 1.5, slowEnd: true, tol: 20, key: below, alive: alive,
        build: function () { var q = below(); return dubins(sprite.x, sprite.y, sprite.heading, q[0], q[1], -Math.PI / 2); },
        onDone: function () { beginEdit(task); }
      }, true);
      return;
    }
    // to the start of the circle, arriving along the oval, going round whichever way is the shorter way in
    var spec = {
      kind: "approach", speed: CRUISE * 1.5, tol: 20, dir: 1, alive: alive,
      follow: !!task.first,           // the visitor's menu link may be off the window: the page scrolls after the flyer
      key: function () { return circleStart(task); },
      build: function () {
        var st = circleStart(task), tan = startTangent(task.shape), h = Math.atan2(tan[1], tan[0]);
        var cw = dubins(sprite.x, sprite.y, sprite.heading, st[0], st[1], h);
        var ccw = dubins(sprite.x, sprite.y, sprite.heading, st[0], st[1], h + Math.PI);
        spec.dir = cw.len <= ccw.len ? 1 : -1;
        return spec.dir === 1 ? cw : ccw;
      },
      onDone: function () { beginTrace(task, spec.dir); }
    };
    startRail(spec, true);
  }

  // The diamond is at the start of the circle: it goes round the oval, the stroke drawn behind it.
  function beginTrace(task, dir) {
    task.path.setAttribute("d", ovalPath(task.shape, dir));
    // at the same speed the flyer arrived at, so it goes round without slowing and leaves at the end heading on
    sprite.trace = { task: task, t0: sprite.clock, dur: task.path.getTotalLength() / (CRUISE * 1.5) };
    sprite.mode = "trace";
  }

  // It has reached the spot just below the word: narrow to a cursor, slide up into the
  // gap between the letters, then backspace the letters that are wrong and type the right ones.
  function beginEdit(task) {
    var ops = [];
    for (var i = 0; i < task.oldMid.length; i++) ops.push("");
    for (var j = 0; j < task.newMid.length; j++) ops.push(task.newMid.charAt(j));
    sprite.edit = { task: task, ops: ops, i: 0, mid: task.oldMid, stage: "thin", t0: sprite.clock, next: 0, doneAt: 0 };
    sprite.heading = -Math.PI / 2;
    sprite.el.classList.add("cursor");
    sprite.mode = "edit";
  }

  function endEdit(complete) {
    var e = sprite.edit;
    if (complete) e.task.span.textContent = e.task.to;
    sprite.el.classList.remove("cursor");
    sprite.edit = null;
  }

  // a circle, once drawn (or cut short), fades away over 255 seconds
  function finishCircle(t) {
    t.path.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 255000, easing: "linear", fill: "forwards" });
  }

  // Following a rail: if the thing it is aimed at has moved, rewrite the rail from here.
  function stepRail(dt, now) {
    var sp = sprite.spec, r = sprite.rail;
    if (sp.alive && !sp.alive()) { pickNext(); return; }
    if (sp.key) {
      var k = sp.key();
      if (!k) { pickNext(); return; }
      if (sp.planned && Math.hypot(k[0] - sp.planned[0], k[1] - sp.planned[1]) > sp.tol && (sp.fixAt === undefined || r.s < sp.fixAt - 30)) {
        startRail(sp, false);
        r = sprite.rail;
      }
    }
    // the mouse: getting within 3 cm is enough
    if (sp.kind === "mouse" && (Math.hypot(sprite.x - sprite.lastMouse[0], sprite.y - sprite.lastMouse[1]) < 3 * CM || now > sp.until)) { pickNext(); return; }
    moveRail(r, dt);
    if (sp.follow) followFlyer(sp.key());
    // passing through an "o": eight motes fly out from it, one to each compass point
    if (sp.kind === "through" && sp.burst && !sp.fired && r.s >= (sp.fixAt || 0) - 5) {
      var c = sp.centre();
      if (c && Math.hypot(sprite.x - c[0], sprite.y - c[1]) < 25) {
        sp.fired = true;
        if (window.dustBurst) window.dustBurst(c[0], c[1]);
      }
    }
    if (r.s >= r.len) { sprite.rail = null; sp.onDone(); }
  }

  // On its way to a link above or below the window, the page scrolls as the flyer reaches the edge it
  // is heading for, keeping it that far in, until the link comes into view.
  var EDGE = 80;                    // px from the top or bottom of the window
  function followFlyer(to) {
    if (!to) return;
    var h = window.innerHeight, by = 0;
    if (to[1] > h - EDGE && sprite.y > h - EDGE) by = sprite.y - (h - EDGE);
    else if (to[1] < EDGE && sprite.y < EDGE) by = sprite.y - EDGE;
    if (by) window.scrollBy(0, by);     // the next frame moves the flyer and its rail with the page
  }

  // The tip leads: turn smoothly to face the way it is heading.
  function faceHeading(rate) {
    var want = sprite.heading + Math.PI / 2;
    var diff = Math.atan2(Math.sin(want - sprite.angle), Math.cos(want - sprite.angle));
    sprite.angle += diff * rate;
  }

  function stepSprite(now) {
    var dt = Math.min(Math.max(now - (sprite.last || now), 0), 50);   // ms, capped so a stalled tab doesn't jump
    sprite.last = now;
    sprite.clock = now;

    // no flight lasts more than 90s: by 75s, whatever it is doing, it turns for home
    var clicking = sprite.mode === "press" || (sprite.mode === "rail" && sprite.spec.kind === "click");
    if (sprite.away && !sprite.returning && !clicking && sprite.mode !== "rest" && sprite.mode !== "hold" && now - sprite.launchAt >= 75000) {
      if (sprite.mode === "trace") finishCircle(sprite.trace.task);
      if (sprite.mode === "edit") endEdit(true);
      goHome();
    }

    var mode = sprite.mode;
    if (mode === "gone") return;
    if (mode === "exit") {
      sprite.y -= CRUISE * dt;
      sprite.heading = -Math.PI / 2;
      faceHeading(0.2);
      if (sprite.y < -40) { sprite.mode = "gone"; sprite.onGone(); }
      return;
    }
    if (mode === "rest" || mode === "hold") {
      // sit in its place (following it if the page scrolls), on its side like the others
      var slot = slotCentre(mode === "rest" ? sprite.restSlot : 0);
      sprite.x = slot[0];
      sprite.y = slot[1];
      faceHeading(0.08);
      if (mode === "hold") {
        if (now >= sprite.slideEnd) {      // the others are in place: now it rests as the left diamond
          sprite.mode = "rest";
          sprite.restSlot = 0;
          sprite.restFor = 10000;
          sprite.t0 = 0;
        }
        return;
      }
      if (!sprite.t0) sprite.t0 = now;
      if (!titleWritten() || !crawlersUp) return;     // it never sets off until the page's title is finished (and the nightcrawlers are up)
      if (sprite.click && sprite.click.isConnected) {     // a link to press: straight off to it
        sprite.t0 = 0;
        launch();
        goClick();
        return;
      }
      if (now - sprite.t0 >= sprite.restFor) {
        sprite.t0 = 0;
        launch();
        leaveRow();
      }
      return;
    }

    if (mode === "rail") {
      stepRail(dt, now);
    } else if (mode === "press") {
      // sit on the link, shrunk, then let go: that is the click; a moment later fly on
      var pr = sprite.press, at = linkPoint(pr.a);
      if (at) { sprite.x = at[0]; sprite.y = at[1]; }
      if (!pr.done && now - pr.t0 >= 220) {
        pr.done = true;
        sprite.el.classList.remove("press");
        if (pr.a.isConnected) pr.a.click();
      }
      if (pr.done && now - pr.t0 >= 600) { sprite.press = null; pickNext(); return; }
    } else if (mode === "trace") {
      var tr = sprite.trace, t = tr.task;
      if (!t.path.isConnected) { pickNext(); return; }
      var u = Math.min((now - tr.t0) / tr.dur, 1), e = u;
      var rect = t.svg.getBoundingClientRect(), len = t.path.getTotalLength(), at = e * len;
      var pt = t.path.getPointAtLength(at), ahead = t.path.getPointAtLength(Math.min(len, at + 2));
      sprite.x = rect.left + pt.x;
      sprite.y = rect.top + pt.y;
      if (ahead.x !== pt.x || ahead.y !== pt.y) sprite.heading = Math.atan2(ahead.y - pt.y, ahead.x - pt.x);
      t.path.setAttribute("stroke-dashoffset", String(1 - e));
      if (u >= 1) {
        finishCircle(t);
        pickNext();
      }
    } else if (mode === "edit") {
      var ed = sprite.edit, tk = ed.task;
      if (!tk.span.isConnected) { endEdit(false); pickNext(); return; }
      if (ed.stage === "thin" && now - ed.t0 >= 700) { ed.stage = "slide"; ed.t0 = now; }
      if (ed.stage === "slide" && now - ed.t0 >= 800) { ed.stage = "ops"; ed.next = now + 150; }
      if (ed.stage === "ops" && now >= ed.next) {
        if (ed.i < ed.ops.length) {
          var op = ed.ops[ed.i++];
          ed.mid = op === "" ? ed.mid.slice(0, -1) : ed.mid + op;
          tk.span.textContent = tk.prefix + ed.mid + tk.suffix;
          ed.next = now + EDIT_STEP;
        } else {
          ed.stage = "done";
          ed.doneAt = now;
        }
      }
      // finished: a moment's pause, then slide up out of the line, still thin
      if (ed.stage === "done" && now - ed.doneAt >= 300) { ed.stage = "lift"; ed.doneAt = now; }
      if (ed.stage === "lift" && now - ed.doneAt >= 800) { endEdit(false); pickNext(); return; }   // widens again as it flies off
      // the cursor sits where the next letter goes, upright; first it waits below and slides up, and at the end slides up out of the line
      var cp = caretPoint(tk.span, tk.prefix.length + ed.mid.length);
      var off = ed.stage === "thin" ? BELOW
        : ed.stage === "slide" ? BELOW * (1 - smooth((now - ed.t0) / 800))
        : ed.stage === "lift" ? -BELOW * smooth((now - ed.doneAt) / 800) : 0;
      sprite.x = cp[0];
      sprite.y = cp[1] + off;
    }
    faceHeading(0.2);
  }

  // The renderer reacts to pointermove / pointerleave on its canvas, so the diamond
  // sends it those same events while it is over (and as it leaves) a letter.
  function nudgeTriangleDrawing() {
    [].forEach.call(document.querySelectorAll("canvas[data-triangles]"), function (c) {
      var r = c.getBoundingClientRect();
      var inside = sprite.x >= r.left && sprite.x <= r.right && sprite.y >= r.top && sprite.y <= r.bottom;
      if (inside) {
        c.dispatchEvent(new PointerEvent("pointermove", { clientX: sprite.x, clientY: sprite.y }));
        c.dataset.diamond = "1";
      } else if (c.dataset.diamond) {
        delete c.dataset.diamond;
        c.dispatchEvent(new PointerEvent("pointerleave"));
      }
    });
  }

  // Has the pen finished the title of the page showing?
  function titleWritten() {
    var rest = (viewEl.hidden ? homeEl : viewEl).querySelector("h1 .rest");
    return !!rest && (rest.noPen || !!(rest.quill && rest.quill.ready));
  }

  function startSprite() {
    sprite.nextAct = Math.floor(Math.random() * ACTIVITIES.length);     // begin anywhere in the round, then go round in order
    gems().forEach(function (g, i) { g.spot = i; });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sprite.clock = performance.now();
    sprite.homeAt = sprite.clock + 65000;
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      sprite.mouse = sprite.lastMouse = [e.clientX, e.clientY];
      if (quillMod) quillMod.influence(0, e.clientX, e.clientY);       // the title's letters bend away from it
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () {
      sprite.mouse = null;
      if (quillMod) quillMod.influence(0, null);
    });
    sprite.el = el("div", null, "sprite");
    sprite.el.setAttribute("aria-hidden", "true");
    document.body.appendChild(sprite.el);
    // it starts in its own place in the closing diamonds, and sets off after a few seconds
    var home = slotCentre(2);
    sprite.x = home[0];
    sprite.y = home[1];
    sprite.angle = Math.PI / 2;
    sprite.heading = 0;
    gems()[2].style.visibility = "hidden";     // the flyer takes the place of the third diamond
    sprite.mode = "rest";
    sprite.restSlot = 2;
    sprite.restFor = 4000;
    // The flyer lives in page coordinates: it is drawn at its position plus the scroll, and when the page
    // scrolls, its (viewport-measured) position and flight path move with it, as the targets do.
    var lastScroll = [window.scrollX, window.scrollY];
    var lastAt = null;      // where it was last announced, in page coordinates
    (function tick(now) {
      var sdx = window.scrollX - lastScroll[0], sdy = window.scrollY - lastScroll[1];
      if (sdx || sdy) {
        lastScroll = [window.scrollX, window.scrollY];
        sprite.x -= sdx;
        sprite.y -= sdy;
        if (sprite.rail) sprite.rail.pts.forEach(function (p) { p[0] -= sdx; p[1] -= sdy; });
        if (sprite.spec && sprite.spec.planned) { sprite.spec.planned[0] -= sdx; sprite.spec.planned[1] -= sdy; }
      }
      stepSprite(now);
      nudgeTriangleDrawing();
      if (window.dustFlyer) window.dustFlyer(sprite.x, sprite.y);
      // anyone may listen for "flyermove" to know where it has moved to, in page coordinates
      var at = [sprite.x + window.scrollX, sprite.y + window.scrollY];
      if (!lastAt || at[0] !== lastAt[0] || at[1] !== lastAt[1]) {
        lastAt = at;
        window.dispatchEvent(new CustomEvent("flyermove", { detail: { x: at[0], y: at[1] } }));
      }
      // the quill letters bend away from it, except when it sits at rest among the diamonds under the title
      if (quillMod) {
        var resting = sprite.mode === "rest" || sprite.mode === "hold";
        quillMod.influence(1, resting ? null : sprite.x, sprite.y);
      }
      sprite.el.style.transform = "translate(" + (sprite.x + window.scrollX).toFixed(1) + "px," + (sprite.y + window.scrollY).toFixed(1) + "px) rotate(" + sprite.angle.toFixed(3) + "rad)";
      requestAnimationFrame(tick);
    })(performance.now());
  }

  // A missing address the flyer can put right: one with the words "hat" and "man" in it (a little test), or an old
  // one with a story's settlement in it (/<region>/<place>/<story>, where a story is now beside its region's). It flies
  // straight up off the page and turns up in the browser's address bar as a diamond, at the part that is wrong (the
  // hostname can't be touched), deletes it a character at a time, types the right part and swaps the page in, as a link does.
  var HAT_MAN = "/mirabilia/apparitions/hat-man";
  var HAT_MAN_TITLE = "The Hat Man";
  var EXIT_AFTER = 1500;            // ms after the title is finished before the flyer leaves
  var ADDRESS_STEP = 70;            // ms per character deleted or typed in the address bar
  var ADDRESS_PAUSE = 500;          // ms it waits before deleting, between deleting and typing, and before going there
  function meansHatMan(address) {
    var words = address.toLowerCase().split(/[^a-z]+/);
    return words.indexOf("hatman") >= 0 || (words.indexOf("hat") >= 0 && words.indexOf("man") >= 0);
  }
  // The address without its settlement, and that page's title, if there is such a page; or null.
  function withoutPlace(address) {
    var parts = address.split("/").filter(Boolean);
    if (parts.length < 3) return Promise.resolve(null);
    var to = "/" + parts.slice(0, -2).concat(parts.slice(-1)).join("/");
    return fetch(to).then(function (res) { return res.ok ? res.text() : null; }).then(function (text) {
      var h1 = text && new DOMParser().parseFromString(text, "text/html").querySelector("h1");
      return h1 ? { to: to, title: h1.textContent.trim() } : null;
    }).catch(function () { return null; });
  }
  function fixAddress() {
    var from = location.pathname;
    var found = meansHatMan(from) ? Promise.resolve({ to: HAT_MAN, title: HAT_MAN_TITLE }) : withoutPlace(from);
    found.then(function (fix) {
      if (!fix || location.pathname !== from) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return location.replace(fix.to);
      whenTitleWritten(function () { whenCrawlersUp(function () {
        setTimeout(function () {
          if (location.pathname !== from) return;
          if (!sprite.el) return location.replace(fix.to);
          clearTimeout(sprite.drawTimer);
          sprite.queue = [];
          if (sprite.mode === "edit") endEdit(false);
          sprite.flying = sprite.mode !== "rest" && sprite.mode !== "hold";
          sprite.onGone = function () { retypeAddress(fix.to, fix.title); };
          sprite.mode = "exit";
        }, EXIT_AFTER);
      }); });
    });
  }
  // The flyer doesn't set off to put an address right until the nightcrawlers are all up (if there are any).
  function whenCrawlersUp(fn) {
    if (!crawlers) return fn();
    crawlers.then(function (c) {
      if (!c || c.allStarted()) fn();
      else window.addEventListener("all-nightcrawlers-started", fn, { once: true });
    });
  }
  function whenTitleWritten(fn) {
    if (titleWritten()) fn();
    else setTimeout(function () { whenTitleWritten(fn); }, 100);
  }
  // The page stays, so once the title is finished the flyer comes back down from the top to its place in the row.
  function comeBack() {
    whenTitleWritten(function () {
      var x = sprite.x;
      if (!sprite.flying) launch();    // it left from the row: that took a place there, as any flight does
      sprite.x = x;
      sprite.y = -40;
      sprite.heading = Math.PI / 2;
      if (window.dustFlyer) window.dustFlyer.reset();    // that jump is not movement
      goHome();
    });
  }
  // Only the part of the address that differs is deleted and retyped: what it shares with the right one at the start
  // and the end stays, with the diamond between them.
  function retypeAddress(to, title) {
    var from = location.pathname, p = 0, q = 0, shown;
    while (p < from.length && p < to.length && from.charAt(p) === to.charAt(p)) p++;
    while (q < from.length - p && q < to.length - p && from.charAt(from.length - 1 - q) === to.charAt(to.length - 1 - q)) q++;
    var prefix = from.slice(0, p), suffix = from.slice(from.length - q), mid = from.slice(p, from.length - q), want = to.slice(p, to.length - q);
    function show() {                 // false if the visitor has gone somewhere else, or the browser won't have it
      if (shown && location.pathname !== shown) { comeBack(); return false; }
      try { history.replaceState(history.state, "", prefix + mid + "\u25C6" + suffix); } catch (e) { location.replace(to); return false; }
      shown = location.pathname;
      return true;
    }
    function step(fn, ms) { setTimeout(function () { fn(); }, ms); }
    function arrive() {               // as following a link: the content is swapped
      nightcrawlers(false, true);
      leave(title);
      history.replaceState(history.state, "", to);
      route().then(comeBack);
      window.scrollTo(0, 0);
    }
    function erase() {
      if (!mid.length) return step(type, ADDRESS_PAUSE);
      mid = mid.slice(0, -1);
      if (show()) step(erase, ADDRESS_STEP);
    }
    function type() {
      if (mid === want) return step(function () { if (show()) arrive(); }, ADDRESS_PAUSE);
      mid = want.slice(0, mid.length + 1);
      if (show()) step(type, ADDRESS_STEP);
    }
    if (show()) step(erase, ADDRESS_PAUSE);
  }

  // Marked words get a pencil oval (drawn by the diamond above) that then fades out.
  // `root` is a block to look for .pencil marks in, or a list of the marks themselves.
  var graphite = 0;
  var circled = {};                 // the words already circled on this page: each is circled once
  function circleWords(root) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return [];
    var ns = "http://www.w3.org/2000/svg";
    var items = [];
    [].forEach.call(root.querySelectorAll ? root.querySelectorAll(".pencil") : root, function (mark) {
      var word = mark.textContent.toLowerCase();
      if (circled[word]) { mark.classList.remove("pencil"); return; }
      circled[word] = true;
      var i = graphite++;
      var box = mark.getBoundingClientRect();
      var mx = 12, my = 9;
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", box.width + mx * 2);
      svg.setAttribute("height", box.height + my * 2);
      svg.style.left = -mx + "px";
      svg.style.top = -my + "px";
      svg.setAttribute("aria-hidden", "true");
      var filter = document.createElementNS(ns, "filter");
      filter.id = "graphite" + i;
      filter.innerHTML = '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/>';
      var path = document.createElementNS(ns, "path");
      var shape = ovalShape(box.width, box.height, mx, my);
      path.setAttribute("d", ovalPath(shape, 1));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(60, 50, 42, 0.75)");
      path.setAttribute("stroke-width", "1.6");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("pathLength", "1");
      path.setAttribute("stroke-dasharray", "1 2");
      path.setAttribute("stroke-dashoffset", "1");
      path.setAttribute("filter", "url(#graphite" + i + ")");
      svg.appendChild(filter);
      svg.appendChild(path);
      mark.appendChild(svg);

      items.push({ svg: svg, path: path, shape: shape });
    });
    return items;
  }

  // Words to correct. Without the flyer (reduced motion) they are simply corrected.
  function respellTasks(root) {
    return [].map.call(root.querySelectorAll(".respell"), respellTask).filter(Boolean);
  }
  // The job of turning a .respell span's text into its data-to, or null if there is nothing to do (or no flyer to do it).
  function respellTask(span) {
    var from = span.textContent, to = span.dataset.to;
    if (!to || from === to) return null;
    if (!sprite.el) { span.textContent = to; return null; }
    var p = 0;
    while (p < from.length && p < to.length && from.charAt(p) === to.charAt(p)) p++;
    var q = 0;
    while (q < from.length - p && q < to.length - p && from.charAt(from.length - 1 - q) === to.charAt(to.length - 1 - q)) q++;
    return {
      kind: "respell", span: span, from: from, to: to,
      prefix: from.slice(0, p), oldMid: from.slice(p, from.length - q),
      newMid: to.slice(p, to.length - q), suffix: from.slice(from.length - q)
    };
  }
  // Anyone may ask for a word to be put right: a "flyerrespell" event with a .respell span in its detail. It is
  // done before any other job, as soon as the flyer is next free (at the latest, first thing on its next flight).
  window.addEventListener("flyerrespell", function (e) {
    var task = respellTask(e.detail.span);
    if (!task) return;
    task.repair = true;
    sprite.queue.push(task);
    if (sprite.mode === "rail" && sprite.spec.kind === "wander") pickNext();      // break off a sweep to go and do it
  });

  // A few seconds after a story opens, hand its jobs (circles, corrections) to the diamond.
  function handOff(items) {
    clearTimeout(sprite.drawTimer);
    sprite.queue = [];
    if (!items.length) return;
    sprite.drawTimer = setTimeout(function () {
      sprite.queue = sprite.queue.filter(taskAlive).concat(items);     // keeping any word put right since (flyerrespell)
      if (sprite.mode === "rail" && sprite.spec.kind === "wander") pickNext();      // break off a sweep to go and work
    }, 3000);
  }

  // The visitor's part of the world, from their time zone: a path in the hierarchy, such as
  // ["europe", "england", "greater-london"] (rsc/timezones.json). Null until it is known, or if it is not.
  var homePath = null;
  fetch("/rsc/timezones.json").then(function (res) { return res.json(); }).then(function (zones) {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone, path = zones[zone];
    if (path) homePath = path.split("/");
    console.log("flyer: time zone " + zone + (path ? " is " + path : " is not in timezones.json"));
  }).catch(function () {});

  // On the way down to the visitor's part of the world, the menu link that goes one step nearer to it
  // (the continent at home, then the country, then the region...).
  function homeward(state) {
    if (!homePath || state.story || state.message || state.path.length >= homePath.length) return null;
    var same = function (x, y) { return x.normalize("NFC") === y.normalize("NFC"); };     // accented names may be spelt either way
    for (var i = 0; i < state.path.length; i++) if (!same(state.path[i], homePath[i])) return null;
    var next = homePath[state.path.length];
    return [].filter.call(optionsEl.querySelectorAll("a[data-nav]"), function (a) {
      var segs = segmentsOf(a.pathname);
      return segs.length === state.path.length + 1 && same(segs[segs.length - 1], next);
    })[0] || null;
  }

  // When a country, region or place offers only one way on (one place and no tales, or one tale and
  // no places), the flyer goes and presses that link a moment after the page arrives.
  function handClick(link) {
    clearTimeout(sprite.clickTimer);
    sprite.click = null;
    if (!link || !sprite.el) return;
    sprite.clickTimer = setTimeout(function () {
      if (!link.isConnected) return;
      sprite.click = link;
      if (sprite.mode === "rail" && (sprite.spec.kind === "wander" || sprite.spec.kind === "mouse")) pickNext();
    }, 2500);
  }

  // The menu side: the breadcrumb-panel, the story's drawing and the list. It changes as soon as the
  // page's data is in, while the title (see render) may still be changing over.
  function renderSide(state) {
    breadcrumbPanelEl.textContent = "";
    state.crumbs.forEach(function (c) {
      var li = document.createElement("li");
      li.appendChild(link(c.title, c.href));
      breadcrumbPanelEl.appendChild(li);
    });

    // the open story is not listed again: its first tag's drawing sits at the top instead
    tagImageEl.textContent = "";
    if (state.tagImage) drawTag(tagImageEl, state.tagImage);
    optionsEl.textContent = "";
    state.items.forEach(function (item) {
      var li = document.createElement("li");
      li.appendChild(link(item.title, item.href));
      optionsEl.appendChild(li);
    });
    if (!state.items.length && !state.story && !(state.levelStories && state.levelStories.length)) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Nothing filed here yet.";
      optionsEl.appendChild(li);
    }
  }

  // Wipe a block of page content in or out, top to bottom (see .wipe-in in the styles).
  var WIPE_MS = 1100;          // how long the wipe takes to cross the page
  var WIPE_OUT_AFTER = 500;    // ms after the click that the old content starts to go: it is half gone when the new page arrives, which then follows close behind
  // The closing diamonds fade out as the old page goes and back in as the new one finishes arriving, so they don't jump.
  function fadeClosing(show) {
    var end = document.querySelector("main > .ending");
    if (!end) return;
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.style.transition = still ? "none" : show ? "opacity 700ms ease " + Math.round(WIPE_MS * 0.7) + "ms" : "opacity 400ms ease";
    end.style.opacity = show ? "1" : "0";
  }

  function wipe(block, how, delay) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (how === "wipe-out" && block.parentNode) block.parentNode.removeChild(block);
      return;
    }
    block.style.setProperty("--wipe-end", block.offsetHeight + 48 + 40 + "px");
    block.style.setProperty("--wipe-ms", WIPE_MS + "ms");
    block.style.animationDelay = delay + "ms";
    block.classList.add(how);
    block.addEventListener("animationend", function done(e) {
      if (e.target !== block) return;
      block.removeEventListener("animationend", done);
      if (how === "wipe-out") { if (block.parentNode) block.parentNode.removeChild(block); }
      else block.classList.remove(how);
    });
  }

  // When the title changes height (a longer title wraps, a different letter sits lower) the diamonds
  // under it and the content below them drift to their new place instead of jumping there.
  var GLIDE_MS = 1400;
  var glideTop = null, glideParent = null, glideWatch = null;
  var frames = 0, glideFrame = -1, glideFrom = 0;
  (function tick() { frames++; requestAnimationFrame(tick); })();
  function watchTitle(title) {
    if (!window.ResizeObserver) return;
    if (!glideWatch) glideWatch = new ResizeObserver(function () { followTitle(); });
    glideWatch.disconnect();
    if (title) glideWatch.observe(title);
  }
  function followTitle() {
    var pips = document.getElementById("pips");
    if (!pips.getBoundingClientRect().height) return;
    var movers = [pips].concat([].slice.call(document.querySelectorAll("#view .body:not(.wipe-out)")));
    var ty = new DOMMatrix(getComputedStyle(pips).transform).m42;
    var natural = pips.getBoundingClientRect().top + window.scrollY - ty;
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The title may change height more than once before a frame is drawn (the empty h1, then its words laid out):
    // the glide starts from where the diamonds were last seen, which is not where an unseen layout put them.
    if (glideFrame !== frames) { glideFrame = frames; glideFrom = glideTop === null ? natural : glideTop + ty; }
    if (glideTop !== null && !still && glideParent === pips.parentNode && Math.abs(natural - glideTop) > 0.5) {
      var from = glideFrom - natural;
      movers.forEach(function (m) { m.style.transition = "none"; m.style.transform = "translateY(" + from + "px)"; });
      pips.offsetHeight;                          // let the start position take
      movers.forEach(function (m) {
        m.style.transition = "transform " + GLIDE_MS + "ms ease-in-out";
        m.style.transform = "translateY(0)";
        // once there, drop the transform: even a do-nothing one isolates the content, so the drawn letters'
        // multiply stops at it and their white shows instead of the parchment
        if (!m.glideEnd) {
          m.glideEnd = function (e) {
            if (e.target !== m || e.propertyName !== "transform" || !/^translateY\(0(px)?\)$/.test(m.style.transform)) return;
            m.style.transition = "";
            m.style.transform = "";
          };
          m.addEventListener("transitionend", m.glideEnd);
        }
      });
    }
    glideTop = natural;
    glideParent = pips.parentNode;
  }

  // The home page's text, the first time the home page is shown.
  function fillHome(state) {
    if (homeEl.querySelector(".subtitle")) return;
    homeEl.appendChild(el("p", state.tagline, "subtitle"));
    state.homeText.forEach(function (text, i) { homeEl.appendChild(paragraph(text, i === 0)); });
  }

  // The nightcrawlers (rsc/js/nightcrawlers.js) walk on the 404 page only. When another page is shown they go at once,
  // except after the flyer puts the address right (`walkOff`), when they walk off the window first.
  var crawlers = null;
  var crawlersUp = true;     // false while there are nightcrawlers still to get up: the flyer doesn't set off until then
  window.addEventListener("all-nightcrawlers-started", function () { crawlersUp = true; });
  function nightcrawlers(on, walkOff) {
    if (!on) {
      crawlersUp = true;
      if (crawlers) crawlers.then(function (c) { if (c) { if (walkOff) c.leave(); else c.stop(); } });
      crawlers = null;
      return;
    }
    if (crawlers || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    crawlersUp = false;
    var mine = crawlers = import("/rsc/js/nightcrawlers.js").then(function (m) {
      var c = m.startNightcrawlers({ centreX: function () {     // centred under the diamonds (not on main, which in
        var r = document.getElementById("pips").getBoundingClientRect();     // portrait has no box of its own)
        return r.width ? r.left + r.width / 2 : window.innerWidth / 2;
      } });
      if (crawlers !== mine) { c.stop(); return null; }     // another page was shown while it loaded
      return c;
    }, function () { crawlersUp = true; return null; });
  }

  var counted = 0;
  function render(state) {
    document.documentElement.classList.remove("deep", "loading");     // from here the hidden attributes decide
    nightcrawlers(state.page === "missing");
    // the old content may still be wiping out: it stays, lifted out of the flow, until it has gone
    var old = viewEl.querySelector(".body.wipe-out");
    if (old) {
      old.style.cssText += ";position:absolute;left:0;right:0;top:" + old.offsetTop + "px;pointer-events:none";
      old.setAttribute("aria-hidden", "true");
    }
    var pips = document.getElementById("pips");
    document.querySelector("main").appendChild(pips);      // out of harm's way while the story is rebuilt
    var atHome = state.page === "home";
    if (atHome) fillHome(state);
    homeEl.hidden = !atHome;
    viewEl.hidden = atHome;
    [].slice.call(viewEl.childNodes).forEach(function (n) { if (n !== old) viewEl.removeChild(n); });
    var body = el("div", null, "body");
    if (!atHome) {
      if (state.story) {
        var h1 = el("h1", null, "story-title");
        viewEl.appendChild(h1);
        addInitial(h1, state.story.title);
        body.appendChild(el("h2", "Summary"));
        state.story.paragraphs.forEach(function (p, i) { body.appendChild(paragraph(p, i === 0)); });
        if (state.story.details.length) {
          body.appendChild(el("h2", "Details", "later-heading"));
          state.story.details.forEach(function (p, i) { body.appendChild(paragraph(p, i === 0)); });
        }
      } else {
        var h1 = el("h1", null, "story-title");
        viewEl.appendChild(h1);
        addInitial(h1, state.message || state.levelTitle);
        state.hints.forEach(function (h) { body.appendChild(el("p", h, "hint")); });
        if (state.levelStories && state.levelStories.length) {
          body.appendChild(el("h2", "Tales of " + state.levelTitle));
          var tales = el("ul", null, "realms");
          state.levelStories.forEach(function (item) {
            var li = document.createElement("li");
            var a = li.appendChild(link(null, item.href));
            fillText(a, item.title);         // so the flyer can circle and correct words in the titles too
            tales.appendChild(li);
          });
          body.appendChild(tales);
        }
      }
      viewEl.appendChild(body);
    }
    var title = (atHome ? homeEl : viewEl).querySelector("h1");
    if (title) title.after(pips);
    if (!atHome) wipe(body, "wipe-in", 0);
    fadeClosing(true);
    watchTitle(title);
    followTitle();
    circled = {};                                           // a new page: its words may be circled again
    var near = homeward(state), tasks = [];
    if (near) {
      near.classList.add("pencil");
      tasks = circleWords([near]);
      tasks.forEach(function (t) { t.first = true; });
    }
    handOff(tasks.concat(circleWords(body), respellTasks(body)));
    var ways = atHome || state.story || state.message ? [] : [].slice.call(optionsEl.querySelectorAll("a[data-nav]")).concat([].slice.call(body.querySelectorAll(".realms a[data-nav]")));
    handClick(ways.length === 1 ? ways[0] : null);
    settledLetter = null;
    pending = null;
    document.title = (state.story ? state.story.title + " — " : atHome ? "" : state.levelTitle + " — ") + "Wyrd Wiki";
    window.dispatchEvent(new Event("pagerendered"));     // anyone may listen to know a new page is showing
    // GoatCounter (rsc/js/bootstrap.js) counted the first page as it loaded; each one swapped in after it is counted here
    if (counted++ && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: location.pathname, title: document.title });
    if (state.message) fixAddress();
  }

  // Leaving a title for another page: the old title un-writes while its letter morphs into the next
  // one's (the destination's title is taken from the link's text), and the new page is not shown
  // until a second after the click, when its title starts writing while the letter is still morphing. `leaving` is that wait, or null.
  var leaving = null;

  var SWAP_AFTER = 1000;       // ms from the click to the new page: its title starts writing then, while the letter is still morphing

  async function morphInitial(span, canvas, letter, since, job) {
    try {
      var size = parseFloat(span.style.getPropertyValue("--size"));
      var genome = await genomeBase64("/rsc/letters/" + letter + ".bin");
      // the two letters have different margins in their squares: slide the canvas so the new letter's ink lands where the next title will put it.
      // Only sideways: the letter's square always sits at the top of the title (it is the tallest thing on the first
      // line), and a lower or higher letter moves the title's baseline instead, so the square itself never moves up or down.
      var shift = [0, 0];
      if (span.ink) {
        var ink = letterInk(letter, genome, size);
        if (ink.max >= 0) shift = [(span.ink.min - ink.min) / span.ink.scale, 0];
      }
      job.started = true;
      await canvas.morphTo(genome, { shift: shift, since: since });
    } catch (e) {}
  }

  // Measuring the next page's letter is slow: do it as the pointer reaches the link, so the click doesn't stall.
  document.addEventListener("pointerover", function (e) {
    var a = e.target.closest && e.target.closest("a[data-nav]"), h1 = viewEl.querySelector("h1.story-title");
    var letter = a && a.textContent.trim().charAt(0).toUpperCase();
    if (!h1 || !/^[A-Z]$/.test(letter)) return;
    var size = Math.round(parseFloat(getComputedStyle(h1).fontSize) * 2.75);
    genomeBase64("/rsc/letters/" + letter + ".bin").then(function (genome) {
      setTimeout(function () { try { letterInk(letter, genome, size); } catch (err) {} }, 50);
    }, function () {});
  });

  function leave(destTitle) {
    if (leaving || viewEl.hidden) return;
    var h1 = viewEl.querySelector("h1.story-title");
    if (!h1) return;
    var span = h1.querySelector(".initial"), canvas = span && span.querySelector("canvas"), rest = h1.querySelector(".rest");
    var letter = (destTitle || "").trim().charAt(0).toUpperCase();
    var oldBody = viewEl.querySelector(".body");
    if (oldBody) wipe(oldBody, "wipe-out", WIPE_OUT_AFTER);
    fadeClosing(false);
    var jobs = [new Promise(function (resolve) { setTimeout(resolve, SWAP_AFTER); })];
    if (rest && rest.quill && rest.quill.erase) jobs.push(rest.quill.erase(SWAP_AFTER));
    if (span && canvas && canvas.morphTo && /^[A-Z]$/.test(letter) && span.dataset.letter) {
      if (span.dataset.letter === letter) settledLetter = letter;
      else {
        pending = { letter: letter, canvas: canvas, started: false };
        morphInitial(span, canvas, letter, performance.now(), pending);
      }
    }
    leaving = Promise.all(jobs).catch(function () {}).then(function () { leaving = null; });
  }

  var firstRoute = true;
  async function route() {
    var mine = ++token, doc = document;
    await spellingList();
    if (firstRoute) firstRoute = false;
    else {
      // a missing page still gives a page to read: 404.html
      try {
        var res = await fetch(location.pathname);
        doc = new DOMParser().parseFromString(await res.text(), "text/html");
      } catch (e) {
        location.reload();
        return;
      }
    }
    var state = readPage(doc);
    if (state.story) state.tagImage = await firstTagWithImage(state.story.tags);
    if (mine === token) renderSide(state);
    if (mine === token && leaving) await leaving;
    if (mine === token) render(state);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-nav]");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (a.href !== location.href) {
      if (segmentsOf(a.pathname).length) leave(a.textContent);      // not for the home page, which has its own title
      history.pushState(null, "", a.href);
    }
    route();
    window.scrollTo(0, 0);
  });
  window.addEventListener("popstate", route);
  var resizing = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizing);
    resizing = setTimeout(function () {
      [].forEach.call(document.querySelectorAll("h1 .rest"), function (rest) {
        var h1 = rest.parentNode, size = parseFloat(getComputedStyle(h1).fontSize) * 0.62;
        if (rest.quill && Math.abs(size - rest.quillSize) > 0.5) writeTitle(h1, rest, rest.dataset.text, false);
        else alignLines(rest);
      });
    }, 100);
  });
  tagIndex();                       // start loading the tag index in the background
  spellingList();                   // and the spelling changes
  (function () {
    var rest = document.getElementById("home-rest"), arrive;
    var arrived = new Promise(function (resolve) { arrive = resolve; });
    drawInitial(document.getElementById("initial"), "W", 200, arrive);
    writeTitle(rest.parentNode, rest, rest.dataset.text, true, arrived);
  })();
  startSprite();
  route();
})();

document.getElementById("options-button").addEventListener("click", function () {
  import("./options.js").then(function (m) { m.openOptions(); });
});
