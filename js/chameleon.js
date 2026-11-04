// The ink chameleon: a pencil-drawn chameleon seen from above, breathing, swaying, turning its head and swivelling
// each eye on its own, and walking where it is sent. It knows nothing about the page it is on: it is told where it
// may walk, where to go, what to strike at, when to wake, and where any points of interest are.
//
//   const c = createChameleon({ x, y, heading, length, paper, mottled, awake, parent });
//       x, y: the head, in page coordinates (everything is in page coordinates); paper: the colour of the sheet it
//       is drawn on, mottled or plain; awake: start already woken, with no fade-in; parent: the element its canvas
//       goes in (it should cover the page, from its top-left corner)
//   c.setPaper(colour, mottled);    the sheet has changed
//   c.destroy();                    take it off the page for good
//   c.wake();                       the statue comes to life
//   c.see(key, x, y);               a point of interest (any key) is now at x, y: an eye that can see one follows it
//   c.setArea(rects);               it may only walk inside these rectangles, [{ x0, y0, x1, y1 }, ...]
//   c.canReach(x, y);               could it strike at x, y from somewhere inside the area?
//   await c.walkTo(x, y);           walk there, through the area; true when it arrives
//   await c.hunt(x, y, onHit);      walk within reach of x, y, turn to face it and strike; onHit() is called the
//                                   moment the tongue touches it; true once the tongue is back in, false if once in
//                                   position it wasn't lined up (it gives up rather than shuffle round)
//   c.head();                       where its head is now
//   c.pose();                       where its head is and which way it faces: { x, y, heading }
//   c.touches();                    where it touches the page: the middle of each foot, then the tip of its tail
// A new walkTo or hunt replaces the one in hand, whose promise then resolves false.
//
// Once awake, while it has nothing to do, a point of interest that moves within reach in front of its snout draws a
// flick of the tongue, which always falls just short.
//
// Before it wakes everything runs 20x slower (eyes 3x slower) and its shadow sits directly under the body; on
// waking the shadow slides out over 6 seconds while the lines darken in, then movement ramps to full over 30 seconds.
// It sets off on a walk only once its shadow is out.

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = t => t * t * (3 - 2 * t);
const rotAbout = (p, c, a) => { const dx = p.x - c.x, dy = p.y - c.y, co = Math.cos(a), si = Math.sin(a); return { x: c.x + dx * co - dy * si, y: c.y + dx * si + dy * co }; };
// the angle from facing f (a unit vector) round to the direction dx, dy
const offAngle = (f, dx, dy) => Math.atan2(f.x * dy - f.y * dx, f.x * dx + f.y * dy);

const NSEG = 52;
// body shape: half-width along the spine, as a fraction of body length
const PROFILE = [[0, 0.012], [0.03, 0.03], [0.065, 0.043], [0.095, 0.042], [0.115, 0.027], [0.15, 0.035], [0.23, 0.05],
  [0.32, 0.053], [0.4, 0.046], [0.46, 0.03], [0.52, 0.02], [0.75, 0.011], [1, 0.004]];
const PAIRS = [[0, 3], [1, 2]];  // diagonal gait: left-front with right-hind, right-front with left-hind
// gait: one diagonal pair at a time, a slow step, walking in short bursts
const SPEED = 3;                 // overall pace multiplier for stepping and holding
const STEP_TIME = 2.0 / SPEED;   // seconds per step
const SPIN_STEP = 0.45;          // radians turned per step when pivoting on the spot
const CURVE_MAX = 120 * Math.PI / 180;   // a change of direction up to this is walked round in a curve; more is turned on the spot
const SWAY_R = 0.03, SWAY_PERIOD = 12;   // resting sway: circle radius (fraction of body length) and seconds per circle
// each eye swivels on its own: angle 0 looks straight ahead, positive swings out and back on that eye's side
const EYE_IN = 2;                        // px the eyes sit in from their original spot, closer to the head
const EYE_MIN = -0.35, EYE_MAX = 2.7;    // how far each eye can swivel; a point of interest in this range is in sight
// tail pose: every ~10 s the tail sweeps across to the other side and alternately coils right up or unrolls
// cu is signed (which way the coil winds) and interpolated directly, so the coil never flips direction in a jump
// poses: sw = swish to a side, cu = coil (signed), sn = sine wave (an S-shaped ripple that travels slowly down the tail)
const TAIL_POSES = [{ sw: 1, cu: 0.05, sn: 0 }, { sw: -1, cu: -1.6, sn: 0 }, { sw: -1, cu: -0.05, sn: 0 }, { sw: 1, cu: 1.6, sn: 0 },
                    { sw: 0.4, cu: 0, sn: 1 }, { sw: -0.4, cu: 0, sn: 1 }];
const TAIL_MAX_JOINT = 15 * Math.PI / 180;   // per-segment bend limit (the tail has 25 segments)
const TAIL_MAX_TURN = 400 * Math.PI / 180;   // the tail may wind at most 400° in total, so it never spins round itself
const TAIL_FROM = Math.round(0.46 * (NSEG - 1)), BODY_TO = Math.round(0.54 * (NSEG - 1));   // tail and body overlap a little
// hand-drawn wobble: a smooth, slight in-and-out of every outline, tied to position along the part (not to time)
const WOBBLE = 0;   // amplitude as a fraction of body length; 0 turns it off
const LIFT_GROW = 0.15;   // a lifted foot rises toward the viewer, so it is drawn up to this much bigger at the top of a step
const LIFT_SHADOW = 1.6;  // a lifted foot's shadow grows to this many times its size at the top of a step,
const LIFT_SHADOW_FADE = 0.8;   // fades to this much of its strength,
const LIFT_SHADOW_BLUR = 2.2;   // and blurs to this many times as soft
const LOWER_THIN = 2;   // px taken off the lower leg's width
const SHOW_BACK_ZIGZAG = false;   // set to true to draw the zigzag crest down the middle of the back
const INK_PALE = 0.3;   // line strength while a statue; darkens to full as the shadow comes in
const TONGUE = '#3a0b0e';
const TONGUE_REACH = 0.42;    // how far the tongue can shoot, as a fraction of body length
const TONGUE_CONE = 0.35;     // radians either side of straight ahead that it will fire at
const TONGUE_AIM = 0.2;       // seconds it takes aim, eyes locked forward, before firing
const TONGUE_SECS = 0.3;      // seconds from firing to reeled back in
const TONGUE_HIT = 0.18;      // the moment in the strike (0 to 1) the tongue is fully out
const MOVING_MS = 300;        // a point of interest counts as moving this long after it last moved
const AREA_IN = 0.18;         // its head keeps this far (a fraction of body length) inside the edges of the area
const PAPER_SCALE = 1800;     // px the parchment's mottling is sized for (a full window)
const PAPER_TILE = 512;       // px: the parchment repeats at this size, pinned to the page

export function createChameleon({ x, y, heading = -Math.PI / 2, length, paper: paperColour = '#ead9b4', mottled = true, awake = false, parent = document.body }){
  const L = length;
  // the canvas covers only the ground round the chameleon and goes with it, ignoring the pointer
  const C = 1.9 * L;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.width = cv.height = Math.round(C * DPR);
  Object.assign(cv.style, { position: 'absolute', left: 0, top: 0, width: C + 'px', height: C + 'px', pointerEvents: 'none' });
  parent.appendChild(cv);
  const ctx = cv.getContext('2d');
  let bx = 0, by = 0;   // the canvas's top-left corner on the page

  const points = new Map();   // points of interest, in the order they were first seen
  let spine = [], chain = [];   // chain: the follow-the-leader path; spine: chain plus weight-shift sway
  // state: 'pause' (nothing to do, or waiting to wake), 'move' (walking to Z.target), 'face' (turning to face its prey),
  // 'aim' (taking aim at it)
  const Z = { x, y, heading, target: null, state: 'pause', shF: 0, shH: 0, waveK: 0, swayK: 0, tailK: 1, headA: 0, headV: 0, headT: 0, headTimer: 2,
    swayPh: 0, swayV: 1, swayGo: 1, swayT: 5, blink: 0, nextBlink: 2.5, aim: 0, tongue: -1, tongueCD: 0, tongueA: 0, tongueLen: 0, hit: null };
  let time = 0;   // idle-animation clock (breathing, body wave); runs at the waking speed
  const WAKE = { t: 0, k: 0, sh: 0, ink: 0, on: false, slow: 0.05, shadowSecs: 6, inkSecs: 15, secs: 30, eyes: 1 / 3 };
  if (awake) Object.assign(WAKE, { on: true, t: WAKE.shadowSecs + WAKE.secs, k: 1, sh: 1, ink: 1 });   // already woken: no fade-in
  let area = [];      // where it may walk
  let tailTip = null; // where the tip of the tail was last drawn
  let plan = null;    // the walk or hunt in hand: { way: [points to walk through], prey, onHit, resolve, started }

  function widthAt(s){
    for (let i = 0; i < PROFILE.length - 1; i++) if (s <= PROFILE[i + 1][0]) {
      const [s0, w0] = PROFILE[i], [s1, w1] = PROFILE[i + 1]; let t = (s - s0) / (s1 - s0); t = t * t * (3 - 2 * t);
      const w = lerp(w0, w1, t);
      const chest = Math.exp(-Math.pow((s - 0.31) / 0.09, 2));       // ribs rise and fall
      return w * (1 + chest * 0.06 * Math.sin(time * (Z.state === 'move' ? 3.4 : 2.2))) * L;
    }
    return 0;
  }

  // ---------- legs: two fixed-length bones each, feet pinned to the page ----------
  const LEGS = [
    { s: 0.205, side: 1, front: true },
    { s: 0.205, side: -1, front: true },
    { s: 0.44, side: 1, front: false },
    { s: 0.44, side: -1, front: false },
  ].map(l => ({ ...l, pos: null, ang: 0, swing: null, lift: 0, elbow: null, root: null }));
  const legLen = l => l.front ? [0.078 * L, 0.072 * L] : [0.078 * L, 0.082 * L];
  const reachOf = l => { const [a, b] = legLen(l); return a + b; };

  function frameAt(s){
    const f = s * (NSEG - 1), i = clamp(Math.floor(f), 1, NSEG - 2), t = f - i;
    const p = { x: lerp(spine[i].x, spine[i + 1].x, t), y: lerp(spine[i].y, spine[i + 1].y, t) };
    let fx = spine[i - 1].x - spine[i + 1].x, fy = spine[i - 1].y - spine[i + 1].y; const m = Math.hypot(fx, fy) || 1; fx /= m; fy /= m;
    return { p, f: { x: fx, y: fy }, n: { x: fy, y: -fx } };   // n points to the animal's left
  }
  function rootOf(l){ const fr = frameAt(l.s), w = widthAt(l.s) * 0.72; return { x: fr.p.x + fr.n.x * l.side * w, y: fr.p.y + fr.n.y * l.side * w, fr }; }
  function homeOf(l){
    const r = rootOf(l), th = l.front ? 1.05 : 1.85, rr = reachOf(l) * 0.7, fr = r.fr;
    const ox = fr.n.x * l.side, oy = fr.n.y * l.side;
    return { x: r.x + (ox * Math.sin(th) + fr.f.x * Math.cos(th)) * rr, y: r.y + (oy * Math.sin(th) + fr.f.y * Math.cos(th)) * rr, root: r };
  }
  function footAngle(l){ const fr = frameAt(l.s); return Math.atan2(fr.f.y, fr.f.x) - l.side * (l.front ? 0.72 : 1.225); }
  // every planted foot is within k of its leg's full reach
  const allReach = k => LEGS.every(l => l.swing || !l.pos || dist(rootOf(l), l.pos) <= k * reachOf(l));
  const liftScale = l => 1 + LIFT_GROW * l.lift;

  // ---------- gait: one diagonal pair at a time, no hold between steps ----------
  const G = { phase: 'hold', timer: 1.2, pair: 0, t: 0, D: 0, turn: 0, tidy: false };
  const strideMax = () => 1.4 * reachOf(LEGS[0]);   // body travel per step
  function stepTarget(l){
    if (G.spin) {
      // pivoting: aim where the resting spot will be once the turn finishes, plus half a step's turn of lead
      const h = homeOf(l), rem = G.turn * (1 - ease(G.t)), lead = G.turn * 0.5;
      let t = rotAbout(h, G.pivot, rem + lead); const r = rotAbout(h.root, G.pivot, rem);
      const d = Math.hypot(t.x - r.x, t.y - r.y), lim = 0.85 * reachOf(l);
      if (d > lim) t = { x: r.x + (t.x - r.x) * lim / d, y: r.y + (t.y - r.y) * lim / d };
      return t;
    }
    // land half a stride ahead of the resting spot, allowing for the body travel still to come in this step
    const h = homeOf(l), fx = Math.cos(Z.heading), fy = Math.sin(Z.heading);
    const ahead = G.tidy ? 0 : G.D * (1 - ease(G.t)) + G.D * 0.5;
    let tx = h.x + fx * ahead, ty = h.y + fy * ahead;
    const rx = h.root.x + fx * G.D * (1 - ease(G.t)), ry = h.root.y + fy * G.D * (1 - ease(G.t));
    const d = Math.hypot(tx - rx, ty - ry), lim = 0.85 * reachOf(l);
    if (d > lim) { tx = rx + (tx - rx) * lim / d; ty = ry + (ty - ry) * lim / d; }
    return { x: tx, y: ty };
  }
  function pairError(k){ return Math.max(...PAIRS[k].map(i => { const l = LEGS[i]; return dist(l.pos, homeOf(l)) / reachOf(l); })); }
  function startPair(k, D, turn, tidy){
    G.phase = 'step'; G.t = 0; G.pair = k; G.D = D; G.turn = turn; G.tidy = tidy; G.spin = false;
    PAIRS[k].forEach(i => { const l = LEGS[i]; l.swing = { from: { ...l.pos }, a0: l.ang }; });
  }
  // turn on the spot, about the middle of the body, toward p (at most SPIN_STEP a step), measured from the pivot,
  // which the turn swings round, so it always closes in
  function spinToward(p){
    const pv = chain[Math.round(0.32 * (NSEG - 1))];
    startPair(G.pair, 0, clamp(wrap(Math.atan2(p.y - pv.y, p.x - pv.x) - Z.heading), -SPIN_STEP, SPIN_STEP), false);
    G.spin = true; G.pivot = { ...pv };
  }
  function finish(ok){
    const p = plan; plan = null;
    Z.state = 'pause'; Z.target = null; G.turning = false;
    if (p) p.resolve(ok);
  }
  function updateGait(dt){
    if (G.phase === 'hold') {
      G.timer -= dt;
      if (G.timer > 0) return;
      // a walk in hand sets off once it is awake enough
      if (plan && !plan.started && WAKE.sh >= 1) { plan.started = true; Z.state = 'move'; Z.target = plan.way[0]; G.turning = false; }
      if (Z.state === 'move') {
        const dx = Z.target.x - Z.x, dy = Z.target.y - Z.y, d = Math.hypot(dx, dy), diff = wrap(Math.atan2(dy, dx) - Z.heading);
        // arrived, or the target is so close beside the head that turning to face it would just chase it round
        if (d < 0.15 * L || (d < 0.3 * L && Math.abs(diff) > 1.2)) {
          plan.way.shift(); G.turning = false;
          if (plan.way.length) Z.target = plan.way[0];
          else if (plan.prey) { Z.state = 'face'; Z.target = plan.prey; }
          else { finish(true); G.timer = G.holdLen = rand(0.3, 0.8); }
          return;
        }
        // a change of direction up to CURVE_MAX is walked as a curve; anything more is turned on the spot, and once
        // turning it keeps going until the body points at the target.
        // The angle is measured from the pivot in the middle of the body, which the turn swings round, so it always closes in.
        const pv = chain[Math.round(0.32 * (NSEG - 1))], pdiff = wrap(Math.atan2(Z.target.y - pv.y, Z.target.x - pv.x) - Z.heading);
        G.turning = d > 0.3 * L && Math.abs(pdiff) > (G.turning ? 0.1 : CURVE_MAX);
        if (G.turning) spinToward(Z.target);
        else startPair(G.pair, Math.min(d, strideMax() * clamp(Math.cos(diff), 0.5, 1)), clamp(diff, -0.4, 0.4), false);
      } else if (Z.state === 'face') {
        // in position: turn on the spot to face the prey; then, if the snout points at it and it is within reach,
        // take aim, and if not, give it up
        const pv = chain[Math.round(0.32 * (NSEG - 1))], pdiff = wrap(Math.atan2(plan.prey.y - pv.y, plan.prey.x - pv.x) - Z.heading);
        if (Math.abs(pdiff) > 0.1 && ++plan.turns <= 8) spinToward(plan.prey);
        else {
          const s = snout(), dx = plan.prey.x - s.x, dy = plan.prey.y - s.y, d = Math.hypot(dx, dy);
          if (Math.abs(offAngle(frameAt(0.02).f, dx, dy)) <= TONGUE_CONE && d <= TONGUE_REACH * L) { Z.state = 'aim'; Z.aim = TONGUE_AIM; }
          else finish(false);
        }
      } else if (Z.state === 'pause') {
        // standing still with nowhere to go: keep the feet where they are, unless one has been left badly out of place
        const k = pairError(G.pair) >= pairError(1 - G.pair) ? G.pair : 1 - G.pair;
        if (pairError(k) > 0.6) startPair(k, 0, 0, true); else G.timer = 0.5 / SPEED;
      }
      return;
    }
    const t0 = G.t; G.t = Math.min(1, G.t + dt / (G.spin ? STEP_TIME / 6 : STEP_TIME));   // turning on the spot steps 6x quicker
    const de = ease(G.t) - ease(t0);
    // move the body, but never so far that a planted foot would end up out of the leg's reach
    const save = { x: Z.x, y: Z.y, h: Z.heading, sp: chain.map(p => ({ ...p })) };
    for (const k of [1, 0.5, 0.25, 0]) {
      if (G.spin) {
        // rotate the whole body rigidly about the pivot
        const a = G.turn * de * k;
        chain = save.sp.map(p => rotAbout(p, G.pivot, a));
        Z.x = chain[0].x; Z.y = chain[0].y; Z.heading = wrap(save.h + a); solveSpine();
        if (k === 0 || allReach(0.96)) break;
        continue;
      }
      // the head may only angle slightly off the line of the neck, so turns curve smoothly back through the body
      const neck = Math.atan2(save.sp[0].y - save.sp[2].y, save.sp[0].x - save.sp[2].x);
      Z.heading = neck + clamp(wrap(save.h + G.turn * de * k - neck), -0.08, 0.08);
      Z.x = save.x + Math.cos(Z.heading) * G.D * de * k; Z.y = save.y + Math.sin(Z.heading) * G.D * de * k;
      chain = save.sp.map(p => ({ ...p })); solveSpine();
      if (k === 0 || allReach(0.96)) break;
    }
    if (G.t >= 1) {
      G.phase = 'hold'; G.timer = G.holdLen = 0; G.pair = 1 - G.pair;
      // turning on the spot: once all four feet have stepped (both pairs), pause for half a second before the next round
      if (G.spin) { G.spinSteps = (G.spinSteps || 0) + 1; if (G.spinSteps % 2 === 0) G.timer = G.holdLen = 0.5; } else G.spinSteps = 0;
      // walking: go in short bursts of one to three steps, each followed by a short pause
      if (!G.spin && !G.tidy) {
        G.walkSteps = (G.walkSteps || 0) + 1;
        if (G.walkSteps >= (G.burst || 1)) { G.timer = G.holdLen = rand(0.3, 0.8); G.walkSteps = 0; G.burst = 1 + Math.floor(Math.random() * 3); }
      }
    }
  }
  function updateFeet(){
    for (const l of LEGS) if (l.swing) {
      const s = l.swing, to = stepTarget(l), e = ease(G.t);
      l.pos = { x: lerp(s.from.x, to.x, e), y: lerp(s.from.y, to.y, e) };
      // while airborne the foot is kept within the leg's reach so the bones never stretch
      const r = rootOf(l), d = dist(r, l.pos), want = clamp(d, 0.3 * reachOf(l), 0.95 * reachOf(l));
      if (d !== want && d > 1e-6) { l.pos.x = r.x + (l.pos.x - r.x) * want / d; l.pos.y = r.y + (l.pos.y - r.y) * want / d; }
      l.ang = s.a0 + wrap(footAngle(l) - s.a0) * e;
      l.lift = Math.sin(Math.PI * G.t);
      if (G.phase === 'hold' || G.t >= 1) { l.ang = footAngle(l); l.lift = 0; l.swing = null; }
    }
  }

  // two-bone IK: the elbow sits where both fixed-length bones meet
  function solveLeg(l){
    const root = rootOf(l), [a, b] = legLen(l), fr = root.fr;
    const dx = l.pos.x - root.x, dy = l.pos.y - root.y;
    const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 1e-3, a + b - 1e-3), base = Math.atan2(dy, dx);
    const off = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    const prefer = { x: fr.n.x * l.side + fr.f.x * (l.front ? -0.9 : 0.9), y: fr.n.y * l.side + fr.f.y * (l.front ? -0.9 : 0.9) };
    const e1 = { x: root.x + Math.cos(base + off) * a, y: root.y + Math.sin(base + off) * a };
    const e2 = { x: root.x + Math.cos(base - off) * a, y: root.y + Math.sin(base - off) * a };
    const sc = e => (e.x - root.x) * prefer.x + (e.y - root.y) * prefer.y;
    // decide once which way this joint bends (elbows back, knees forward) and keep it, so it can never flip over
    if (!l.bendSign) l.bendSign = sc(e1) >= sc(e2) ? 1 : -1;
    l.root = root; l.elbow = l.bendSign > 0 ? e1 : e2;
  }

  // ---------- spine: follow-the-leader chain with bend limits ----------
  function solveSpine(){
    const seg = L / (NSEG - 1);
    chain[0] = { x: Z.x, y: Z.y };
    for (let i = 1; i < NSEG; i++) {
      let a = Math.atan2(chain[i].y - chain[i - 1].y, chain[i].x - chain[i - 1].x);
      if (i >= 2) {
        const prev = Math.atan2(chain[i - 1].y - chain[i - 2].y, chain[i - 1].x - chain[i - 2].x), s = i / (NSEG - 1);
        const mb = s < 0.13 ? 0.1 : s < 0.5 ? 0.06 : 0.17;
        const lim = prev + clamp(wrap(a - prev), -mb, mb);
        // the tail eases toward its bend limit instead of snapping, so a turn ripples down it smoothly
        a = s < 0.5 ? lim : a + wrap(lim - a) * 0.12;
      }
      chain[i] = { x: chain[i - 1].x + Math.cos(a) * seg, y: chain[i - 1].y + Math.sin(a) * seg };
    }
    // weight shift: shoulders and hips sway sideways toward the feet carrying the load
    const bump = (s, c, w) => Math.exp(-Math.pow((s - c) / w, 2));
    // resting sway: the head and body slowly circle over the planted feet (forward, side, back, side), fading down the tail
    const hx = chain[0].x - chain[8].x, hy = chain[0].y - chain[8].y, hm = Math.hypot(hx, hy) || 1, th = Z.swayPh;
    const swx = Z.swayK * SWAY_R * L * (Math.cos(th) * hx / hm + Math.sin(th) * hy / hm), swy = Z.swayK * SWAY_R * L * (Math.cos(th) * hy / hm - Math.sin(th) * hx / hm);
    spine = chain.map((p, i) => {
      const s = i / (NSEG - 1);
      // travelling wave: starts behind the neck and rolls down the body, fading out along the tail
      const env = clamp((s - 0.1) / 0.1, 0, 1) * Math.exp(-Math.max(0, s - 0.2) * 2.6);
      const wave = Z.waveK * 0.02 * L * env * Math.sin(TAU * (s / 0.55 - time / 20));
      const d = Z.shF * bump(s, 0.2, 0.13) + Z.shH * bump(s, 0.44, 0.11) + wave;
      const a = chain[Math.max(0, i - 1)], b = chain[Math.min(NSEG - 1, i + 1)];
      let fx = a.x - b.x, fy = a.y - b.y; const m = Math.hypot(fx, fy) || 1; fx /= m; fy /= m;
      const e = s < 0.5 ? 1 : Math.exp(-(s - 0.5) * 6);
      return { x: p.x + fy * d + swx * e, y: p.y - fx * d + swy * e };
    });
    // resting head turn: the head swings about the base of the neck, bending smoothly through the last few neck segments
    if (Z.headA) {
      const ip = Math.round(0.16 * (NSEG - 1)), P = spine[ip];
      for (let i = 0; i < ip; i++) spine[i] = rotAbout(spine[i], P, Z.headA * clamp((ip - i) / 4, 0, 1));
    }
  }

  // where the support is: the lateral offset of the load-bearing feet from the shoulders (or hips)
  function supportShift(front){
    let sx = 0, sy = 0, ws = 0;
    const holdP = G.phase === 'hold' && G.holdLen ? clamp(1 - G.timer / G.holdLen, 0, 1) : 0;
    LEGS.forEach((l, i) => {
      if (l.front !== front || !l.pos) return;
      let w = l.swing ? 0 : 1;
      if (G.phase === 'hold' && PAIRS[G.pair].includes(i)) w = lerp(1, 0.15, holdP);   // unload the next pair before it lifts
      sx += l.pos.x * w; sy += l.pos.y * w; ws += w;
    });
    if (!ws) return 0;
    const fr = frameAt(front ? 0.205 : 0.44), lat = (sx / ws - fr.p.x) * fr.n.x + (sy / ws - fr.p.y) * fr.n.y;
    return clamp(lat * 0.45, -0.045 * L, 0.045 * L);
  }

  // ---------- the area it may walk in, and finding a way through it ----------
  // a rectangle shrunk by the distance the head keeps from its edges (or squashed to its middle line if too narrow)
  function inner(r){
    const m = AREA_IN * L, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    return { x0: Math.min(r.x0 + m, cx), x1: Math.max(r.x1 - m, cx), y0: Math.min(r.y0 + m, cy), y1: Math.max(r.y1 - m, cy) };
  }
  // the nearest point to p where its head may be, and which rectangle that is in
  function nearest(p){
    let best = { p, i: -1, d: Infinity };
    area.forEach((r, i) => {
      const q = inner(r), c = { x: clamp(p.x, q.x0, q.x1), y: clamp(p.y, q.y0, q.y1) }, d = dist(p, c);
      if (d < best.d) best = { p: c, i, d };
    });
    return best;
  }
  const inside = p => area.some(r => { const q = inner(r); return p.x >= q.x0 && p.x <= q.x1 && p.y >= q.y0 && p.y <= q.y1; });
  // the way to where its head should stand to strike at p: a spot inside the area, a comfortable tongue's length
  // from p, that is the shortest walk from where it is now (a nearer spot to p is slightly preferred); or null
  function strikeWay(p){
    let best = null;
    for (const k of [0.6, 0.75, 0.9]) for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU, r = k * TONGUE_REACH * L, h = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (!inside(h)) continue;
      const way = route(h);
      let walk = 0, at = Z;
      for (const w of way) { walk += dist(at, w); at = w; }
      const score = walk + k * 0.2 * L;
      if (!best || score < best.score) best = { way, score };
    }
    return best && best.way;
  }
  const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  // the points to walk through to get from its head to `to`: the middle of each overlap between rectangles on the way
  function route(to){
    const end = nearest(to);
    if (end.i < 0) return [to];
    const a = nearest(Z).i, b = end.i, prev = new Map([[a, -1]]), q = [a];
    while (q.length) {
      const i = q.shift(); if (i === b) break;
      area.forEach((r, j) => { if (!prev.has(j) && overlaps(inner(area[i]), inner(r))) { prev.set(j, i); q.push(j); } });
    }
    const way = [end.p];
    if (prev.has(b)) for (let j = b; prev.get(j) !== -1; j = prev.get(j)) {
      const p = inner(area[prev.get(j)]), r = inner(area[j]);
      way.unshift({ x: (Math.max(p.x0, r.x0) + Math.min(p.x1, r.x1)) / 2, y: (Math.max(p.y0, r.y0) + Math.min(p.y1, r.y1)) / 2 });
    }
    return way;
  }

  // ---------- behaviour ----------
  function snout(){ const f = frameAt(0.02).f, w = widthAt(0.02) * 0.75; return { x: spine[0].x + f.x * w, y: spine[0].y + f.y * w }; }
  const EYES = [{ side: 1, a: 0.6, aT: 0.6, timer: 0 }, { side: -1, a: 1.4, aT: 1.4, timer: 0.7 }];
  // the swivel angle at which an eye looks at the first point of interest it can see, or null if it sees none
  function sightOf(e){
    const q = frameAt(0.05), r = widthAt(0.05) * 1.45 - EYE_IN, nx = q.n.x * e.side, ny = q.n.y * e.side;
    const cx = q.p.x + nx * r, cy = q.p.y + ny * r;
    for (const p of points.values()) {
      const dx = p.x - cx, dy = p.y - cy, a = Math.atan2(dx * nx + dy * ny, dx * q.f.x + dy * q.f.y);
      if (a >= EYE_MIN && a <= EYE_MAX) return a;
    }
    return null;
  }
  // the first moving point of interest within the tongue's reach in front of the snout: the angle to it and the
  // tongue's length to fall just short of it; or null
  function inReach(){
    const f = frameAt(0.02).f, s = snout(), now = performance.now();
    for (const p of points.values()) {
      if (now - p.t > MOVING_MS) continue;
      const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy), a = offAngle(f, dx, dy);
      if (d > 0.06 * L && d <= TONGUE_REACH * L && Math.abs(a) <= TONGUE_CONE) return { a, len: d - Math.max(0.15 * d, 0.04 * L) };
    }
    return null;
  }
  function update(dt){
    const rdt = dt;   // real time: a tongue strike is always quick, however sleepy the rest of it is
    if (WAKE.on) {
      WAKE.t += dt;
      WAKE.sh = clamp(WAKE.t / WAKE.shadowSecs, 0, 1);
      WAKE.ink = clamp(WAKE.t / WAKE.inkSecs, 0, 1);   // the lines fade in over their own, slower time
      WAKE.k = clamp((WAKE.t - WAKE.shadowSecs) / WAKE.secs, 0, 1);
    }
    const edt = dt * lerp(WAKE.eyes, 1, WAKE.k);   // eye time step
    dt *= lerp(WAKE.slow, 1, WAKE.k);              // everything else (walking included) runs at the waking speed
    time += dt;
    // ease toward the support, but only as far as every planted foot can still reach
    const k = Math.min(1, dt * 1.3 * SPEED), f0 = Z.shF, h0 = Z.shH, tf = supportShift(true), th = supportShift(false);
    for (const m of [1, 0.5, 0.25, 0]) {
      Z.shF = f0 + (tf - f0) * k * m; Z.shH = h0 + (th - h0) * k * m; solveSpine();
      if (allReach(0.96)) break;
    }
    // the wave fades in gently, and backs off a little if a planted foot is near the end of its reach
    const tight = !allReach(0.93);
    Z.waveK = clamp(Z.waveK + (tight ? -1.5 : 0.4) * dt, 0, 1);
    // the sway grows in slowly while it rests, and backs off quickly when it walks or a planted foot nears full stretch
    const still = Z.state !== 'move' && G.phase === 'hold';
    Z.swayK = clamp(Z.swayK + (still && !tight ? 0.35 : -1.5) * dt, 0, 1);
    // drift round the circle with random pauses: glide for a few seconds, ease to a stop, hold, then ease off again
    Z.swayT -= dt; if (Z.swayT <= 0) { Z.swayGo = 1 - Z.swayGo; Z.swayT = Z.swayGo ? rand(3, 9) : rand(1, 3.5); }
    Z.swayV += (Z.swayGo - Z.swayV) * Math.min(1, dt * 1.5);
    Z.swayPh += TAU * Z.swayV * dt / SWAY_PERIOD;
    // now and then, while resting, turn the head to one side for a few seconds, then back; straight ahead whenever it walks or hunts
    Z.headTimer -= dt;
    if (!still || Z.state !== 'pause') Z.headT = 0;
    else if (Z.headTimer <= 0) { Z.headT = Z.headT !== 0 && Math.random() < 0.6 ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(0.15, 0.4); Z.headTimer = rand(2, 6); }
    Z.headV += (6 * (Z.headT - Z.headA) - 4.9 * Z.headV) * dt; Z.headA += Z.headV * dt;
    solveSpine();
    updateGait(dt);
    updateTail(dt);
    // walking: the tail tends to straighten out behind; it takes up its poses again once it stops
    Z.tailK += ((Z.state === 'move' ? 0.15 : 1) - Z.tailK) * Math.min(1, dt * 1.2);
    solveSpine();
    updateFeet();
    LEGS.forEach(solveLeg);

    // the tongue: struck at its prey when hunting; otherwise a quick aim at a moving point within reach, falling just short
    Z.tongueCD -= rdt;
    if (Z.aim > 0) {
      Z.aim -= rdt;
      if (Z.aim <= 0) {
        if (Z.state === 'aim') {
          const s = snout(), p = plan.prey, dx = p.x - s.x, dy = p.y - s.y;
          Z.tongue = 0; Z.tongueA = offAngle(frameAt(0.02).f, dx, dy); Z.tongueLen = Math.hypot(dx, dy); Z.hit = plan;
        } else {
          const hit = inReach();
          if (hit) { Z.tongue = 0; Z.tongueA = hit.a; Z.tongueLen = hit.len; } else Z.tongueCD = 0.5;
        }
      }
    } else if (Z.state === 'pause' && !plan && Z.tongue < 0 && Z.tongueCD <= 0 && WAKE.k > 0 && inReach()) Z.aim = TONGUE_AIM;
    if (Z.tongue >= 0) {
      Z.tongue += rdt / TONGUE_SECS;
      if (Z.hit && Z.tongue >= TONGUE_HIT && Z.hit.onHit) { const f = Z.hit.onHit; Z.hit.onHit = null; f(); }
      if (Z.tongue >= 1) { Z.tongue = -1; Z.tongueCD = rand(2, 4); if (Z.hit && Z.hit === plan) finish(true); Z.hit = null; }
    }

    // an eye follows a point of interest it can see; otherwise it glances about
    for (const e of EYES) {
      const seen = sightOf(e);
      e.timer -= edt;
      if (Z.aim > 0 || Z.tongue >= 0) e.aT = 0.05;   // both eyes lock forward to aim the tongue
      else if (seen !== null) e.aT = seen;
      else if (e.timer <= 0) { e.aT = rand(EYE_MIN, EYE_MAX); e.timer = rand(0.5, 2.6); }
      e.a += (e.aT - e.a) * Math.min(1, edt * 14);
    }
    Z.nextBlink -= dt; if (Z.nextBlink <= 0) { Z.blink = 0.14; Z.nextBlink = rand(2, 5); }
    Z.blink = Math.max(0, Z.blink - dt);
  }

  // ---------- paper: the body is filled with parchment, so it reads as ink drawn on the sheet ----------
  let PAPER_FILL, INK, INK_LEVELS;
  function buildPaper(colour, mottled){
    if (!mottled) { PAPER_FILL = colour; return; }
    // parchment: the paper colour, soft blotchy mottling, faint fibres and flecks, as a tile that repeats seamlessly
    const T = PAPER_TILE, paper = document.createElement('canvas'); paper.width = paper.height = Math.round(T * DPR);
    const g = paper.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = colour; g.fillRect(0, 0, T, T);
    const tiled = draw => { for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) draw(ox, oy); };
    const blot = (x, y, r, col) => tiled((ox, oy) => { const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); rg.addColorStop(0, col); rg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = rg; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); });
    const S = PAPER_SCALE;
    for (let i = 0; i < Math.round(T * T / 1500); i++) blot(Math.random() * T, Math.random() * T, rand(0.004, 0.02) * S, Math.random() < 0.6 ? 'rgba(140,95,40,.1)' : 'rgba(255,248,225,.12)');
    for (let i = 0; i < Math.round(T * T / 2500); i++) blot(Math.random() * T, Math.random() * T, rand(0.0015, 0.005) * S, 'rgba(120,80,35,.16)');
    for (let i = 0; i < Math.round(T * T / 160); i++) { g.fillStyle = Math.random() < 0.6 ? 'rgba(100,65,30,.14)' : 'rgba(255,250,235,.3)'; g.fillRect(Math.random() * T, Math.random() * T, 1, 1); }
    g.strokeStyle = 'rgba(110,75,35,.16)'; g.lineWidth = 0.7;
    for (let i = 0; i < T * T / 6000; i++) { const x = Math.random() * T, y = Math.random() * T, a = rand(-0.4, 0.4), l = rand(3, 9), mx = rand(-2, 2), my = rand(-2, 2);
      tiled((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + mx, y + oy + Math.sin(a) * l * 0.5 + my, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); }); }
    PAPER_FILL = ctx.createPattern(paper, 'repeat'); PAPER_FILL.setTransform(new DOMMatrix().scale(1 / DPR));
  }
  function buildInk(){
    // pencil: graphite grey with a fine, uneven grain so every line looks drawn with a soft pencil on textured paper
    const gc = document.createElement('canvas'); gc.width = gc.height = 192;
    const gx = gc.getContext('2d'), N = 192;
    gx.fillStyle = 'rgba(52,53,58,0.7)'; gx.fillRect(0, 0, N, N);
    gx.lineCap = 'round';
    const graphite = (n, col, op) => { gx.globalCompositeOperation = op; gx.strokeStyle = col;
      for (let i = 0; i < n; i++) { const x = Math.random() * N, y = Math.random() * N, a = -0.6 + rand(-0.5, 0.5), l = rand(1.5, 6);
        gx.lineWidth = rand(0.4, 1); gx.globalAlpha = rand(0.1, 0.4);
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { gx.beginPath(); gx.moveTo(x + ox, y + oy); gx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); gx.stroke(); } } };
    graphite(5000, 'rgb(38,39,43)', 'source-over');   // darker graphite streaks along the stroke grain
    graphite(1400, '#000', 'destination-out');         // paper tooth showing through
    gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over';
    // the same grain at 16 strengths, from pale (statue) to full, so the lines can darken in as the chameleon wakes
    INK_LEVELS = [];
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('canvas'); c.width = c.height = 192; const cx = c.getContext('2d');
      cx.globalAlpha = lerp(INK_PALE, 1, i / 15); cx.drawImage(gc, 0, 0); INK_LEVELS.push(ctx.createPattern(c, 'repeat'));
    }
    INK = INK_LEVELS[0];
  }

  // ---------- drawing ----------
  const TAIL = { from: { sw: 1, cu: 1.6, sn: 0 }, to: TAIL_POSES[0], t: 0, k: 0 };
  function updateTail(dt){
    TAIL.t += dt / 10;
    if (TAIL.t >= 1) {
      // next pose: often a sine wave as an alternative to curling, otherwise a swish or coil to the other side
      let k; do { k = Math.random() < 0.35 ? 4 + (Math.random() < 0.5 ? 0 : 1) : Math.floor(Math.random() * 4); } while (k === TAIL.k);
      TAIL.k = k; TAIL.from = TAIL.to; TAIL.to = TAIL_POSES[k]; TAIL.t = 0;
    }
  }
  const TS = { t: 0, bends: null, base: 0 };   // smoothed tail state
  function drawnSpine(){
    // cosmetic only (legs and feet ignore this): swish and coil the tail
    const e = ease(TAIL.t), sw = lerp(TAIL.from.sw, TAIL.to.sw, e), cu = lerp(TAIL.from.cu, TAIL.to.cu, e), sn = lerp(TAIL.from.sn, TAIL.to.sn, e);
    const pts = spine.map(p => ({ ...p })), seg = L / (NSEG - 1), is = Math.round(0.5 * (NSEG - 1)), i0 = Math.round(0.62 * (NSEG - 1));
    const ang = i => Math.atan2(spine[i].y - spine[i - 1].y, spine[i].x - spine[i - 1].x);
    const extras = []; let extra = 0, wSpine = 0;
    for (let i = is + 1; i < NSEG; i++) {
      extra += sw * 0.07 * Math.min(1, (i - is) / 6);
      if (i > i0) { const u = (i - i0) / (NSEG - 1 - i0); extra += cu * (0.05 + 0.7 * Math.pow(u, 1.4)); }
      // sine wave: the tail's direction swings back and forth along its length, giving an S that rolls toward the tip
      const us = (i - is) / (NSEG - 1 - is), wave = sn * 0.6 * Math.min(1, us * 4) * Math.sin(TAU * 0.5 * us - time * 1.1);
      extras.push((extra + wave) * Z.tailK);   // the swish, coil and wave relax away while walking
      if (i > is + 1) wSpine += wrap(ang(i) - ang(i - 1));
    }
    // total winding = the body's own bend along the tail + the added swish/coil; scale the added part down if it's too much
    const total = wSpine + extra;
    const k = Math.abs(total) > TAIL_MAX_TURN && Math.abs(extra) > 1e-6 ? clamp((Math.sign(total) * TAIL_MAX_TURN - wSpine) / extra, 0, 1) : 1;
    // and no single joint along the tail may bend more than 15°
    // (each joint's own bend is clamped, rather than the running angle, so the limit never makes the tail flip)
    const want = []; let prevExtra = 0;
    for (let i = is + 1; i < NSEG; i++) {
      const ex = extras[i - is - 1] * k;
      want.push(clamp(wrap(ang(i) - ang(i - 1)) + (ex - prevExtra), -TAIL_MAX_JOINT, TAIL_MAX_JOINT));
      prevExtra = ex;
    }
    // the tail has a little inertia: its root angle and every joint ease toward their targets, so nothing can jump
    const dt = Math.max(0, time - TS.t); TS.t = time;
    const r = TS.bends ? Math.min(1, dt * 4) : 1;
    if (!TS.bends) { TS.bends = want.slice(); TS.base = ang(is); }
    TS.base = ang(is) + clamp(wrap(TS.base + wrap(ang(is) - TS.base) * r - ang(is)), -TAIL_MAX_JOINT, TAIL_MAX_JOINT);
    let a = TS.base;
    for (let j = 0; j < want.length; j++) {
      TS.bends[j] += (want[j] - TS.bends[j]) * r;
      a += TS.bends[j];
      const i = is + 1 + j;
      pts[i] = { x: pts[i - 1].x + Math.cos(a) * seg, y: pts[i - 1].y + Math.sin(a) * seg };
    }
    return pts;
  }

  function tangent(pts, i){ const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let x = a.x - b.x, y = a.y - b.y; const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; }
  const wob = (t, seed) => WOBBLE * L * (0.6 * Math.sin(t * 2.1 + seed) + 0.4 * Math.sin(t * 4.7 + seed * 1.9));
  // a straight edge from P to Q drawn as a gently wobbling line (P is assumed to be the current point)
  function wpts(P, Q, seed){
    const dx = Q.x - P.x, dy = Q.y - P.y, m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m, n = Math.max(2, Math.ceil(m / 5)), u = L / (NSEG - 1), out = [];
    for (let k = 0; k <= n; k++) { const t = k / n, o = k === 0 || k === n ? 0 : wob(t * m / u, seed); out.push({ x: P.x + dx * t + nx * o, y: P.y + dy * t + ny * o }); }
    return out;
  }
  function wline(P, Q, seed){ for (const p of wpts(P, Q, seed).slice(1)) ctx.lineTo(p.x, p.y); }
  function bodyPath(pts, scale, upto = NSEG - 1){
    const left = [], right = [];
    pts.slice(0, upto + 1).forEach((p, i) => { const f = tangent(pts, i), w = widthAt(i / (NSEG - 1)) * scale, wl = w + wob(i, 1), wr = w + wob(i, 5); left.push({ x: p.x + f.y * wl, y: p.y - f.x * wl }); right.push({ x: p.x - f.y * wr, y: p.y + f.x * wr }); });
    const f0 = tangent(pts, 0), w0 = widthAt(0.02) * scale, tip = { x: pts[0].x + f0.x * w0 * 0.75, y: pts[0].y + f0.y * w0 * 0.75 };
    const ring = [...left, ...right.reverse()];
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(lerp(tip.x, ring[0].x, 0.2) + (ring[0].x - pts[0].x) * 0.6, lerp(tip.y, ring[0].y, 0.2) + (ring[0].y - pts[0].y) * 0.6, ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length - 1; i++) { const m = { x: (ring[i].x + ring[i + 1].x) / 2, y: (ring[i].y + ring[i + 1].y) / 2 }; ctx.quadraticCurveTo(ring[i].x, ring[i].y, m.x, m.y); }
    const last = ring[ring.length - 1];
    ctx.quadraticCurveTo(last.x + (last.x - pts[0].x) * 0.6 + (tip.x - last.x) * 0.2, last.y + (last.y - pts[0].y) * 0.6 + (tip.y - last.y) * 0.2, tip.x, tip.y);
    ctx.closePath();
  }

  // ---------- line-drawing helpers: ink strokes with small, fixed gaps ----------
  const dashCache = {};
  function dashes(seed, scale = 1){
    const k = seed + ':' + scale; if (dashCache[k]) return dashCache[k];
    let s = seed * 7919 + 13; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const a = []; for (let i = 0; i < 26; i++) a.push((i % 2 ? 0.006 + r() * 0.012 : 0.05 + r() * 0.2) * L * scale);
    return dashCache[k] = a;
  }
  function ink(build, seed, w, sketch = true, scale = 1){
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK;
    ctx.lineWidth = w; ctx.setLineDash(dashes(seed, scale)); build(); ctx.stroke();
    if (sketch) {   // a lighter second pass, slightly off-register, like a pen going over the line again
      ctx.save(); ctx.globalAlpha = 0.4; ctx.translate(0.0022 * L, 0.0015 * L); ctx.lineWidth = w * 0.5;
      ctx.setLineDash(dashes(seed + 31, scale)); ctx.lineDashOffset = 0.04 * L; build(); ctx.stroke(); ctx.restore();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  // chameleon-style feet: two toes pointing forward, one pointing back
  function toeLayout(ang, side, front, spread){
    const hd = ang + side * (front ? 0.55 : 1.0), fwd = hd - side * 0.35;   // walking direction when the foot was placed
    return [
      { a: fwd - 0.34 * spread, len: 1 },
      { a: fwd + 0.34 * spread, len: 0.92 },
      { a: fwd + Math.PI, len: 0.5 },   // back toe: half length, pointing straight back along the line between the front toes
    ];
  }

  // ---------- shadow: the silhouette, offset down-right away from the light, soft and translucent ----------
  function capsule(A, B, wa, wb, seed = 0){
    const dx = B.x - A.x, dy = B.y - A.y, m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m, a = Math.atan2(ny, nx);
    ctx.moveTo(A.x + nx * wa, A.y + ny * wa); wline({ x: A.x + nx * wa, y: A.y + ny * wa }, { x: B.x + nx * wb, y: B.y + ny * wb }, seed);
    ctx.arc(B.x, B.y, wb, a, a - Math.PI, true); wline({ x: B.x - nx * wb, y: B.y - ny * wb }, { x: A.x - nx * wa, y: A.y - ny * wa }, seed + 3);
    ctx.arc(A.x, A.y, wa, a + Math.PI, a, true); ctx.closePath();
  }
  function drawShadow(pts){
    // one soft, solid shadow (30% ink) for body, head, eyes, tail and legs together.
    // The offset grows with height: body and shoulders high, elbows/knees lower, planted feet touch their shadows.
    const sk = ease(WAKE.sh);   // no offset while asleep; it feathers in as the chameleon wakes
    const ox = 0.028 * L * sk, oy = 0.034 * L * sk, at = (p, h) => ({ x: p.x + ox * h, y: p.y + oy * h });
    const FAR = 20000;   // the shape is drawn off-canvas and only its blurred shadow is cast back onto it
    ctx.save(); ctx.translate(-FAR, 0);
    const sp = pts.map((p, i) => { const s = i / (NSEG - 1); return at(p, s < 0.5 ? 1 : lerp(1, 0.3, (s - 0.5) / 0.5)); });
    bodyPath(sp, 1);
    const q = frameAt(0.05), w = widthAt(0.05);
    for (const side of [-1, 1]) { const c = at({ x: q.p.x + q.n.x * (w * 1.45 - EYE_IN) * side, y: q.p.y + q.n.y * (w * 1.45 - EYE_IN) * side }, 1); ctx.moveTo(c.x + 0.026 * L, c.y); ctx.arc(c.x, c.y, 0.026 * L, 0, TAU); }
    const lowerLeg = l => { const E = at(l.elbow, 0.5), F = at(l.pos, l.lift * 0.7), li = LEGS.indexOf(l);
      capsule(E, F, 0.0135 * L - LOWER_THIN / 2, 0.012 * L * liftScale(l) - LOWER_THIN / 2, li * 7 + 20);
      const fr = 0.022 * L * lerp(1, LIFT_SHADOW, l.lift); ctx.moveTo(F.x + fr, F.y); ctx.arc(F.x, F.y, fr, 0, TAU); };
    for (const l of LEGS) {
      capsule(at(l.root, 1), at(l.elbow, 0.5), 0.016 * L, 0.0135 * L, LEGS.indexOf(l) * 7);
      if (l.lift < 0.01) lowerLeg(l);
    }
    ctx.shadowColor = 'rgba(31,42,34,0.3)'; ctx.shadowBlur = 0.018 * L * DPR; ctx.shadowOffsetX = FAR * DPR; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#000'; ctx.fill('nonzero');
    // a lifted foot and lower leg cast a softer, fainter shadow the higher they rise
    for (const l of LEGS) if (l.lift >= 0.01) {
      ctx.beginPath(); lowerLeg(l);
      ctx.shadowColor = `rgba(31,42,34,${(0.3 * lerp(1, LIFT_SHADOW_FADE, l.lift)).toFixed(3)})`; ctx.shadowBlur = 0.018 * L * DPR * lerp(1, LIFT_SHADOW_BLUR, l.lift);
      ctx.fill('nonzero');
    }
    ctx.restore();
  }

  // ---------- silhouette: one thick outline round every part, then a plain fill, so overlaps merge with no inner lines ----------
  function footShape(l){
    // lifted feet draw the front toes a little closer together
    const F = l.pos, spread = 1 - Math.pow(l.lift, 0.5) * 0.45, lenK = liftScale(l);
    const tl = (l.front ? 0.055 : 0.062) * L * lenK, toes = [];
    toeLayout(l.ang, l.side, l.front, spread).forEach(t => {
      const len = tl * t.len, bend = 0.15 * l.side * (1.4 - spread);
      const m = { x: F.x + Math.cos(t.a - bend) * len * 0.55, y: F.y + Math.sin(t.a - bend) * len * 0.55 };
      const e = { x: F.x + Math.cos(t.a + bend * 0.5) * len, y: F.y + Math.sin(t.a + bend * 0.5) * len };
      toes.push([F, m, e]);
    });
    return { toes };
  }

  // the tail as its own shape: its two edges (open, round the tip) for the outline, closed for the fill
  function tailPath(pts, closed, from = TAIL_FROM){
    const left = [], right = [];
    for (let i = from; i < NSEG; i++) { const f = tangent(pts, i), w = Math.max(widthAt(i / (NSEG - 1)), 0.0035 * L), k = Math.min(1, w / (0.01 * L)), wl = w + wob(i, 1) * k, wr = w + wob(i, 5) * k; left.push({ x: pts[i].x + f.y * wl, y: pts[i].y - f.x * wl }); right.push({ x: pts[i].x - f.y * wr, y: pts[i].y + f.x * wr }); }
    const ring = [...left, ...right.reverse()];
    ctx.beginPath(); ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length - 1; i++) { const m = { x: (ring[i].x + ring[i + 1].x) / 2, y: (ring[i].y + ring[i + 1].y) / 2 }; ctx.quadraticCurveTo(ring[i].x, ring[i].y, m.x, m.y); }
    ctx.lineTo(ring[ring.length - 1].x, ring[ring.length - 1].y);
    if (closed) ctx.closePath();
  }
  function drawTail(pts){
    const OUT = Math.max(1.6, 0.0075 * L);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the edge lines start where the body's own outline still runs, so they join it seamlessly instead of ending in a hook over the hips
    tailPath(pts, false, BODY_TO - 2); ctx.strokeStyle = INK; ctx.lineWidth = OUT * 2; ctx.stroke();
    tailPath(pts, true); ctx.fillStyle = PAPER_FILL; ctx.fill();
  }
  // where each leg meets the body: a circle centred on the body's edge
  function jointCircle(l){ const fr = frameAt(l.s), w = widthAt(l.s); return { x: fr.p.x + fr.n.x * l.side * w, y: fr.p.y + fr.n.y * l.side * w, r: 0.016 * L * 1.2 - 1 }; }
  function drawJointOutlines(){
    // drawn straight after the shadow, before any other stroke, so legs and body cover all but the outer rim
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.6, 0.0075 * L) * 2;
    for (const l of LEGS) { const c = jointCircle(l); ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.stroke(); }
  }
  function drawSilhouette(pts){
    const OUT = Math.max(1.6, 0.0075 * L), toeW = 2 * 0.0075 * L;   // each toe is one round-capped stroke, as thick as its tip
    const w1 = 0.016 * L, w2 = 0.012 * L, wj = 0.0135 * L;
    const feet = LEGS.map(footShape);
    const upperPath = () => { ctx.beginPath(); LEGS.forEach((l, li) => capsule(l.root, l.elbow, w1, wj, li * 7)); };
    // forearm: elbow to foot as a plain quad with open ends, so it caps neither the elbow nor the foot
    const foreSides = l => { const A = l.elbow, B = l.pos, m = Math.hypot(B.x - A.x, B.y - A.y) || 1, nx = -(B.y - A.y) / m, ny = (B.x - A.x) / m, we = wj - LOWER_THIN / 2, wf = w2 * liftScale(l) - LOWER_THIN / 2;
      return [[{ x: A.x + nx * we, y: A.y + ny * we }, { x: B.x + nx * wf, y: B.y + ny * wf }], [{ x: A.x - nx * we, y: A.y - ny * we }, { x: B.x - nx * wf, y: B.y - ny * wf }]]; };
    const foreEdges = () => { ctx.beginPath(); LEGS.forEach((l, li) => foreSides(l).forEach(([a, b], j) => { ctx.moveTo(a.x, a.y); wline(a, b, li * 7 + 20 + j * 3); })); };
    const foreFill = () => { ctx.beginPath(); LEGS.forEach((l, li) => { const [[a, b], [c, d]] = foreSides(l), sd = li * 7 + 20; const pts = [...wpts(a, b, sd), ...wpts(c, d, sd + 3).reverse()]; ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts) ctx.lineTo(p.x, p.y); ctx.closePath(); }); };
    const toePath = f => { ctx.beginPath(); for (const [a, m, e] of f.toes) { ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, e.x, e.y); } };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 1a. upper legs: outline only for now (their fill comes after the forearms)
    ctx.strokeStyle = INK; upperPath(); ctx.lineWidth = OUT * 2; ctx.stroke();
    ctx.fillStyle = PAPER_FILL;
    // 1b. toes: outline, then fill
    feet.forEach((f, i) => { toePath(f); ctx.lineWidth = toeW * liftScale(LEGS[i]) + OUT * 2; ctx.stroke(); });
    feet.forEach((f, i) => { toePath(f); ctx.lineWidth = toeW * liftScale(LEGS[i]);
      ctx.strokeStyle = PAPER_FILL; ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.stroke(); });   // shade: toes darkest
    // 1c. forearms over the toes: edge lines with flat ends, then the fill, neither end capped
    ctx.lineCap = 'butt'; ctx.strokeStyle = INK; foreEdges(); ctx.lineWidth = OUT * 2; ctx.stroke();
    foreFill(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.03)'; ctx.fill(); ctx.fillStyle = PAPER_FILL;   // forearm a little lighter
    ctx.lineCap = 'round';
    // 1d. upper-leg fill last, so the elbow end sits over the top of the forearm
    upperPath(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.01)'; ctx.fill(); ctx.fillStyle = PAPER_FILL;   // upper leg lightest
    // 2. body and head on top, with their own outline showing over the legs (the tail follows later)
    bodyPath(pts, 1, BODY_TO); ctx.strokeStyle = INK; ctx.lineWidth = OUT * 2; ctx.stroke();
    ctx.fill();
    // 3. open the body outline where each leg joins it: a plain filled circle on the shoulder/hip, on the body's edge
    for (const l of LEGS) { const c = jointCircle(l); ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill(); }
  }

  // the chameleon itself (everything but its shadow)
  function drawCreature(pts){
    drawJointOutlines();
    drawSilhouette(pts);

    const lw = Math.max(0.9, 0.0038 * L);
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const at = s => { const i = Math.round(s * (NSEG - 1)), f = tangent(pts, i); return { p: pts[i], f, w: widthAt(s) }; };
    const off = (q, side, k, fwd = 0) => ({ x: q.p.x + q.f.y * q.w * k * side + q.f.x * fwd, y: q.p.y - q.f.x * q.w * k * side + q.f.y * fwd });

    // dorsal crest: a row of small sawtooth spikes down the back, with breaks
    if (SHOW_BACK_ZIGZAG) {
      ctx.lineWidth = lw; ctx.beginPath();
      for (let s = 0.13, k = 0; s < 0.5; s += 0.012, k++) {
        if (k % 9 === 8) continue;
        const q = at(s), z = (k % 2 ? 1 : -1) * 0.14, p = off(q, 1, z);
        if (k % 9 === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // lateral stripe on each flank
    for (const side of [-1, 1]) ink(() => { ctx.beginPath(); for (let s = 0.15; s <= 0.45; s += 0.01) { const p = off(at(s), side, 0.6); s === 0.15 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); } }, side > 0 ? 9 : 11, lw, false, 0.3);
    // tubercles: little open circles scattered over the flanks
    ctx.lineWidth = Math.max(0.7, 0.0028 * L);
    for (let s = 0.16, k = 0; s < 0.46; s += 0.03, k++) for (const side of [-1, 1]) {
      const p = off(at(s), side, k % 2 ? 0.38 : 0.82), r = 0.0045 * L;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, k * 1.3, k * 1.3 + TAU * 0.8); ctx.stroke();
    }
    // the tail goes on last of the body parts, so it can pass over legs and body
    drawTail(pts);
    // tail rings: short strokes that stop shy of the outline
    ctx.lineWidth = lw;
    for (let s = 0.5; s < 0.95; s += 0.04) {
      const i = Math.round(s * (NSEG - 1)), p = pts[i], f = tangent(pts, i), w = widthAt(s) * 0.7;
      ctx.beginPath(); ctx.moveTo(p.x + f.y * w, p.y - f.x * w); ctx.quadraticCurveTo(p.x - f.x * w * 0.6, p.y - f.y * w * 0.6, p.x - f.y * w, p.y + f.x * w); ctx.stroke();
    }

    // head: casque ridge
    const hq = at(0.06), hf = hq.f, ha = Math.atan2(hf.y, hf.x);
    ink(() => { ctx.beginPath(); const a = at(0.012), b = at(0.06), c = at(0.105); ctx.moveTo(a.p.x, a.p.y); ctx.quadraticCurveTo(b.p.x, b.p.y, c.p.x, c.p.y); }, 21, lw, false, 0.4);
    // turret eyes: big scaly cones on each side, each pupil swivelling on its own
    EYES.forEach(e => {
      const q = at(0.05), c = off(q, e.side, 1.45 - EYE_IN / q.w), R = 0.025 * L, base = off(q, e.side, 0.45);
      // the turret: a short cone that carries the eye out from the side of the head
      { const dx = c.x - base.x, dy = c.y - base.y, m = Math.hypot(dx, dy) || 1, px = -dy / m, py = dx / m, wb = R * 1.05, we = R * 0.8;
        ctx.beginPath(); ctx.moveTo(base.x + px * wb, base.y + py * wb); ctx.lineTo(c.x + px * we, c.y + py * we); ctx.lineTo(c.x - px * we, c.y - py * we); ctx.lineTo(base.x - px * wb, base.y - py * wb); ctx.closePath();
        ctx.fillStyle = PAPER_FILL; ctx.fill(); }
      ctx.fillStyle = PAPER_FILL; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
      ink(() => { ctx.beginPath(); ctx.arc(c.x, c.y, R, ha + 0.4, ha + 0.4 + TAU * 0.9); }, 41 + e.side, Math.max(1.2, 0.0055 * L), false, 0.25);
      // gaze direction in the page plane
      const nx = hf.y * e.side, ny = -hf.x * e.side, gx = hf.x * Math.cos(e.a) + nx * Math.sin(e.a), gy = hf.y * Math.cos(e.a) + ny * Math.sin(e.a);
      // concentric scale rings pulled toward where the eye is looking
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.7, 0.0028 * L);
      for (const k of [0.72, 0.46]) { ctx.beginPath(); ctx.arc(c.x + gx * R * (1 - k) * 0.9, c.y + gy * R * (1 - k) * 0.9, R * k, 0, TAU); ctx.stroke(); }
      const px = c.x + gx * R * 0.62, py = c.y + gy * R * 0.62, pr = R * 0.22;
      ctx.fillStyle = INK; ctx.beginPath();
      if (Z.blink > 0) { ctx.moveTo(px - gy * pr, py + gx * pr); ctx.lineTo(px + gy * pr, py - gx * pr); ctx.stroke(); }
      else { ctx.arc(px, py, pr, 0, TAU); ctx.fill(); ctx.fillStyle = PAPER_FILL; ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.35, pr * 0.3, 0, TAU); ctx.fill(); }
    });
    // nostrils
    for (const side of [-1, 1]) { const p = off(at(0.012), side, 0.45); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.8, 0.003 * L), 0, TAU); ctx.fill(); }

    // the tongue: shoots out fast with a sticky ball on the end, then reels back in
    if (Z.tongue >= 0) {
      const t = Z.tongue, ext = (t < TONGUE_HIT ? ease(t / TONGUE_HIT) : 1 - ease((t - TONGUE_HIT) / (1 - TONGUE_HIT))) * Z.tongueLen;
      const tip = pts[0], w0 = widthAt(0.02) * 0.75, f0 = tangent(pts, 0), a = Math.atan2(f0.y, f0.x) + Z.tongueA;
      const sx = tip.x + f0.x * w0, sy = tip.y + f0.y * w0, ex = sx + Math.cos(a) * ext, ey = sy + Math.sin(a) * ext;
      ctx.strokeStyle = TONGUE; ctx.lineWidth = Math.max(1.4, 0.007 * L); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = PAPER_FILL; ctx.beginPath(); ctx.arc(ex, ey, 0.013 * L, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  function render(){
    INK = INK_LEVELS[Math.round(ease(WAKE.ink) * 15)];   // waking: the whole drawing fades from pale to full ink
    // the canvas follows the chameleon, centred a little behind its shoulders; drawing stays in page coordinates
    const c = spine[Math.round(0.35 * (NSEG - 1))], nx = Math.round(c.x - C / 2), ny = Math.round(c.y - C / 2);
    if (nx !== bx || ny !== by) { bx = nx; by = ny; cv.style.transform = `translate(${bx}px,${by}px)`; }
    ctx.setTransform(DPR, 0, 0, DPR, -bx * DPR, -by * DPR);
    ctx.clearRect(bx, by, C, C);
    const pts = drawnSpine();
    tailTip = pts[NSEG - 1];
    drawShadow(pts);
    drawCreature(pts);
  }

  // ---------- setup and loop ----------
  const seg = L / (NSEG - 1);
  for (let i = 0; i < NSEG; i++) chain.push({ x: Z.x - Math.cos(Z.heading) * seg * i, y: Z.y - Math.sin(Z.heading) * seg * i });
  buildPaper(paperColour, mottled); buildInk(); solveSpine();
  for (const l of LEGS) { l.pos = homeOf(l); l.ang = footAngle(l); }
  LEGS.forEach(solveLeg);

  // drawing is skipped while it is scrolled out of view
  let visible = true;
  const seen = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
  seen.observe(cv);
  let last = performance.now(), frame = 0;
  function loop(now){
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    update(dt);
    if (visible) render();
    frame = requestAnimationFrame(loop);
  }
  update(0.001); render();
  frame = requestAnimationFrame(loop);

  // a new walk or hunt: the one in hand is dropped, and it sets off at its next pause between steps
  function command(way, prey, onHit){
    return new Promise(resolve => {
      if (plan) plan.resolve(false);
      Z.aim = 0; Z.state = 'pause'; Z.target = null;
      if (!way) return resolve(false);
      plan = { way, prey, onHit, resolve, started: false, turns: 0 };
    });
  }
  return {
    wake(){ WAKE.on = true; },
    see(key, px, py){
      const p = points.get(key);
      if (!p || p.x !== px || p.y !== py) points.set(key, { x: px, y: py, t: performance.now() });
    },
    setArea(rects){ area = rects.map(r => ({ ...r })); },
    canReach(px, py){ return !!strikeWay({ x: px, y: py }); },
    walkTo(px, py){ return command(route({ x: px, y: py }), null, null); },
    hunt(px, py, onHit){ return command(strikeWay({ x: px, y: py }), { x: px, y: py }, onHit); },
    head(){ return { x: Z.x, y: Z.y }; },
    pose(){ return { x: Z.x, y: Z.y, heading: Z.heading }; },
    setPaper(colour, mottle){ buildPaper(colour, mottle); },
    destroy(){
      cancelAnimationFrame(frame); seen.disconnect(); cv.remove();
      if (plan) { plan.resolve(false); plan = null; }
    },
    touches(){ return [...LEGS.map(l => ({ ...l.pos })), { ...(tailTip || spine[NSEG - 1]) }]; },
  };
}
