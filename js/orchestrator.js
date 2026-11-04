// The orchestrator: decides on page load whether the chameleon (js/chameleon.js) comes onto the page, wakes it,
// passes it the things worth looking at, and sends it hunting. The chameleon knows nothing of the page; this file
// knows the page.
//
// It only comes if, as the page loads, the margin to the right of the content is at least MIN_MARGIN wide
// (and the visitor hasn't asked for reduced motion, or ticked "Chameleoff" in the options). On the first visit of the day it starts in the middle of that
// margin, looking up, and fades in; later in the day it carries on, awake, from where it was last saved (KEY). It
// lives on the page, so it scrolls with it. Points of interest, in page coordinates:
//   "flyer"  the flyer, from the "flyermove" events it sends as it moves
//   "mouse"  the mouse pointer, as it moves and as the page scrolls under it
//
// It may walk in either side margin (and off the bottom of the page there) and in a band across the top of the
// page, never along the bottom, where the visitor may be reading. On each page ("pagerendered") it hunts up to
// PER_PAGE characters it eats (PREY: a capital B or an 8) in the menu or the main text that it can reach: for each it walks
// within reach, strikes, and the character is eaten (taken out of the text) the moment the tongue touches it, and
// the flyer is asked ("flyerrespell") to put it back. Then the chameleon walks down its side margin and off the
// bottom of the page, turns round, and comes back up until only its head shows.

const WAKE_AFTER = 5000;   // ms after load before the chameleon wakes (on the first visit of the day)
const KEY = "wyrd-chameleon";   // localStorage: { day, x, y, heading }, where it was last, x from the middle of the page
const SAVE_MS = 10000;     // how often where it is gets saved
const MIN_MARGIN = 300;    // px of margin to the right of the content needed for it to come at all
const PAPER = "#dbc69b";   // the page's parchment as it looks in the margin (--parchment darkened by the grain layer)
const PREY = /[B8]/g;      // the characters it eats
const PER_PAGE = 3;        // how many it eats on a page before going down to the bottom
const BACK_OFF = 0.6;      // how far it walks away after eating one, before coming back for the next, in body lengths
const TOUCH_ID = 100;      // pointer ids from here on are its feet and tail tip on the triangle pictures (well clear
                           // of the mouse's and the flyer's, which are 0 or 1)
const SETTLE_MS = 2000;    // ms after a page is shown before looking for B's, so the new text has settled in
const TOP_BAND = 0.7;      // depth of the band across the top of the page it may walk in, in body lengths
const PEEK = 0.25;         // how far up over the bottom of the page its head heads for, in body lengths
                           // (a walk ends within 0.15 of its goal, so the head comes up between 0.1 and 0.25)

// Brings the chameleon onto the page, if it may come; returns a function that takes it away again, or null.
async function start(){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const content = document.querySelector(".layout").getBoundingClientRect();
  const margin = document.documentElement.clientWidth - content.right;
  if (margin < MIN_MARGIN) return null;

  const { createChameleon } = await import("./chameleon.js");
  const ac = new AbortController(), signal = ac.signal;   // aborted when it is taken away: every listener goes with it
  const length = Math.max(230, Math.min(560, innerHeight * 0.62, margin));
  // a layer over the whole page for it to live in, so it can walk off the bottom without making the page longer.
  // At z-index 0 and after the page's content, it is above the text and pictures but under the darkened edges
  // (body::after, painted after everything at that level), the dust, the flyer and the options button.
  const layer = document.body.appendChild(document.createElement("div"));
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:absolute;inset:0;overflow:clip;pointer-events:none;z-index:0";
  // its body is filled with the page's paper: the grained colour, mottled, or (with the grain switched off in the
  // options) the plain parchment
  const html = document.documentElement, grain = () => !html.classList.contains("no-grain");
  const paper = () => grain() ? PAPER : getComputedStyle(html).getPropertyValue("--parchment").trim();
  // It only fades in on the first visit of the day. After that it carries on from where it was last saved, already
  // awake, if that spot is somewhere it may walk and its head would be in the window as the page opens (the page may
  // be a different one, and is still short while its text is fetched, so a spot further down could leave it out of
  // sight, or below the end of the page); if not, it starts from its usual spot.
  const today = new Date().toLocaleDateString("en-CA"), centre = () => document.documentElement.clientWidth / 2;
  const saved = load();
  const again = saved && saved.day === today;
  const there = again && { x: saved.x + centre(), y: saved.y };
  const at = there && there.y >= scrollY && there.y <= scrollY + innerHeight
      && layout().area.some(r => there.x >= r.x0 && there.x <= r.x1 && there.y >= r.y0 && there.y <= r.y1)
    ? there
    : { x: scrollX + content.right + margin / 2, y: scrollY + (innerHeight - length) / 2 };   // its whole length centred in the window
  const chameleon = createChameleon({
    ...at,
    heading: again ? saved.heading : -Math.PI / 2,
    length,
    paper: paper(),
    mottled: grain(),
    awake: again,
    parent: layer,
  });
  let grained = grain();
  const regrain = new MutationObserver(() => { if (grain() !== grained) { grained = grain(); chameleon.setPaper(paper(), grained); } });
  regrain.observe(html, { attributes: true, attributeFilter: ["class"] });
  const waking = again ? 0 : setTimeout(chameleon.wake, WAKE_AFTER);
  // where it is, saved every SAVE_MS (and as the page is left), with x measured from the middle of the page so
  // it is in the same margin whatever the window's width
  const save = () => {
    const p = chameleon.pose();
    try { localStorage.setItem(KEY, JSON.stringify({ day: today, x: p.x - centre(), y: p.y, heading: p.heading })); } catch (e) {}
  };
  const saving = setInterval(save, SAVE_MS);
  addEventListener("pagehide", save, { signal });

  addEventListener("flyermove", e => chameleon.see("flyer", e.detail.x, e.detail.y), { signal });
  let mouse = null;   // the pointer's last position in the window
  addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    mouse = [e.clientX, e.clientY];
    chameleon.see("mouse", scrollX + mouse[0], scrollY + mouse[1]);
  }, { passive: true, signal });
  addEventListener("scroll", () => { if (mouse) chameleon.see("mouse", scrollX + mouse[0], scrollY + mouse[1]); }, { passive: true, signal });

  // its feet and the tip of its tail push the triangles of any picture they are on, as the mouse and the flyer do,
  // each as a pointer of its own; it leaves the quill-written titles alone
  const within = new Map();   // picture canvas -> the pointer ids now on it
  (function touch(){
    if (signal.aborted) return;
    const pts = chameleon.touches();
    for (const c of document.querySelectorAll("canvas[data-triangles]")) {
      const r = c.getBoundingClientRect(), was = within.get(c) || new Set(), on = new Set();
      pts.forEach((p, i) => {
        const x = p.x - scrollX, y = p.y - scrollY, pointerId = TOUCH_ID + i;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          on.add(pointerId);
          c.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerId }));
        } else if (was.has(pointerId)) c.dispatchEvent(new PointerEvent("pointerleave", { pointerId }));
      });
      if (on.size) within.set(c, on); else within.delete(c);
    }
    requestAnimationFrame(touch);
  })();

  // where it may walk: both side margins, down past the bottom of the page, and a band across the top
  function layout(){
    const r = document.querySelector(".layout").getBoundingClientRect();
    const left = r.left + scrollX, right = r.right + scrollX, width = document.documentElement.clientWidth;
    const bottom = document.documentElement.scrollHeight, below = bottom + 1.5 * length;
    return {
      left, right, bottom,
      area: [
        { x0: 0, y0: 0, x1: left, y1: below },
        { x0: right, y0: 0, x1: width, y1: below },
        { x0: 0, y0: 0, x1: width, y1: TOP_BAND * length },
      ],
    };
  }

  // every character it eats in the menu and the main text, with where it is on the page
  function findPrey(){
    const out = [];
    for (const root of document.querySelectorAll("#options, #home, #view .body:not(.wipe-out)")) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        if (n.parentElement.closest("h1, [aria-hidden=true], .respell")) continue;
        for (const m of n.data.matchAll(PREY)) {
          const range = document.createRange();
          range.setStart(n, m.index); range.setEnd(n, m.index + 1);
          const r = range.getBoundingClientRect();
          if (r.width) out.push({ node: n, at: m.index, char: m[0], x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY });
        }
      }
    }
    return out;
  }

  // Eaten: the character is taken out of the text, and the flyer is asked to put it back. What is left of its word
  // goes in a .respell span saying what it should be (a character on its own takes a neighbour with it, so the
  // flyer has a letter to put its cursor against).
  function eat(prey){
    const text = prey.node.data, i = prey.at, isWord = c => /[\p{L}\p{N}]/u.test(c);
    if (text[i] !== prey.char) return;     // the text has changed since
    let a = i, b = i + 1;
    while (a > 0 && isWord(text[a - 1])) a--;
    while (b < text.length && isWord(text[b])) b++;
    if (b - a === 1) { if (b < text.length) b++; else if (a > 0) a--; }
    const span = document.createElement("span");
    span.className = "respell";
    span.dataset.to = text.slice(a, b);
    span.textContent = text.slice(a, i) + text.slice(i + 1, b);
    const range = document.createRange();
    range.setStart(prey.node, a); range.setEnd(prey.node, b);
    range.deleteContents(); range.insertNode(span);
    dispatchEvent(new CustomEvent("flyerrespell", { detail: { span } }));
  }

  // one hunt per page; a new page calls off the hunt in hand
  let hunting = 0;
  async function hunt(){
    const mine = ++hunting;
    await new Promise(r => setTimeout(r, SETTLE_MS));
    if (mine !== hunting) return;
    let page;
    const missed = new Set();   // characters it went for and couldn't strike at, not to be tried again
    // up to PER_PAGE characters, each time the nearest it can reach from where it is now (re-measured, as eating
    // one closes up the text)
    for (let eaten = 0; eaten < PER_PAGE;) {
      page = layout();
      chameleon.setArea(page.area);
      const head = chameleon.head(), near = b => Math.hypot(b.x - head.x, b.y - head.y);
      const prey = findPrey().filter(b => !missed.has(b.node.data + b.at) && chameleon.canReach(b.x, b.y)).sort((a, b) => near(a) - near(b))[0];
      if (!prey) break;
      const ate = await chameleon.hunt(prey.x, prey.y, () => eat(prey));     // eaten the moment the tongue touches it
      if (mine !== hunting) return;
      if (!ate) { missed.add(prey.node.data + prey.at); continue; }     // each is only tried once, so this ends
      eaten++;
      // having eaten, it backs off a little way before coming back for the next
      const h = chameleon.head(), dx = h.x - prey.x, dy = h.y - prey.y, m = Math.hypot(dx, dy) || 1;
      await chameleon.walkTo(h.x + dx / m * BACK_OFF * length, h.y + dy / m * BACK_OFF * length);
      if (mine !== hunting) return;
    }
    // down its side margin and off the bottom of the page, then round and back up until only its head shows
    page = layout();
    chameleon.setArea(page.area);
    const at = chameleon.head(), x = at.x < (page.left + page.right) / 2 ? page.left / 2 : (page.right + document.documentElement.clientWidth) / 2;
    if (!await chameleon.walkTo(x, page.bottom + 1.2 * length) || mine !== hunting) return;
    await chameleon.walkTo(x, page.bottom - PEEK * length);
  }
  addEventListener("pagerendered", hunt, { signal });
  hunt();   // the page it arrived on may already be shown

  return () => {
    save();
    ac.abort();
    clearTimeout(waking);
    clearInterval(saving);
    regrain.disconnect();
    hunting++;   // calls off the hunt in hand
    within.forEach((ids, c) => ids.forEach(pointerId => c.dispatchEvent(new PointerEvent("pointerleave", { pointerId }))));
    chameleon.destroy();
    layer.remove();
  };
}

// where it was last saved, or null
function load(){
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && typeof s.day === "string" && [s.x, s.y, s.heading].every(Number.isFinite) ? s : null;
  } catch (e) { return null; }
}

// The visitor can keep it away (the "Chameleoff" option, js/options.js, which puts "chameleoff" on <html>): it is
// taken off the page as the option is ticked, and brought back as it is unticked (if there is room for it then).
let stop = null, wasOff = null, busy = Promise.resolve();
function follow(){
  const off = document.documentElement.classList.contains("chameleoff");
  if (off === wasOff) return;   // some other class changed
  wasOff = off;
  busy = busy.then(async () => {
    if (off) { if (stop) stop(); stop = null; }
    else stop = await start();
  });
}
new MutationObserver(follow).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
follow();
