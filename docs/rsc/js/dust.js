(function () {
  var canvas = document.getElementById("dust");
  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CM = 96 / 2.54;            // CSS px in a centimetre (a CSS inch is 96 px)
  var AREA_PER_MOTE = (10 * CM) * (10 * CM); // one mote per 10cm x 10cm
  var MOTE = 96 / 25.4 / 2;      // diameter: half a mm (a CSS inch is 96 px)
  var DRIFT_SPEED = 0.08;        // px per frame the orbit centre wanders
  var TURN = 0.04;               // how quickly the wander direction changes
  var DAMPING = 0.88;           // per-frame decay of pointer pushes, returns motes to wandering
  var REACH = 70;                // how close the pointer must pass to disturb a mote
  var PUSH_ASIDE = 0.2;          // share of pointer speed pushing motes sideways, away from its path
  var PUSH_ALONG = 0.05;         // share of pointer speed pushing motes along its path
  var CURL = 0.035;              // radians per frame a pending push swirls, giving eddies
  var MAX_SPEED = 12;
  var BURST_SPEED = 12;          // px per frame a burst mote is thrown at; the damping coasts it about 100 px
  var BURST_KEEP = 24;           // burst motes that stay among the dust; the oldest go as new ones join

  var w, h, dpr;
  var motes = [];

  // Each mote circles a centre point (cx, cy). The centre wanders in a
  // slowly turning direction and carries any push from the pointer (vx, vy).
  // A push first waits in (px, py), then bleeds into the velocity after a
  // short delay while swirling, so motes react late and curl like eddies.
  // (x, y), if given, is where the mote starts out rather than a random place.
  function makeMote(x, y) {
    var m = {
      cx: x === undefined ? Math.random() * w : x,
      cy: y === undefined ? Math.random() * h : y,
      heading: Math.random() * Math.PI * 2,
      speed: DRIFT_SPEED * (0.5 + Math.random()),
      vx: 0,
      vy: 0,
      px: 0,
      py: 0,
      wait: 0,
      curl: 0,
      lag: 0.03 + Math.random() * 0.05,
      r: 2 + Math.random() * 6,
      angle: Math.random() * Math.PI * 2,
      spin: (0.004 + Math.random() * 0.012) * (Math.random() < 0.5 ? -1 : 1),
      a: 0.7 + Math.random() * 0.2
    };
    if (x !== undefined) {         // start exactly at the spot: the orbit centre is offset to suit
      m.cx -= Math.cos(m.angle) * m.r;
      m.cy -= Math.sin(m.angle) * m.r;
    }
    m.x = m.cx + Math.cos(m.angle) * m.r;
    m.y = m.cy + Math.sin(m.angle) * m.r;
    return m;
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var target = Math.round((w * h) / AREA_PER_MOTE);
    var plain = motes.filter(function (m) { return !m.burst; });
    var kept = motes.filter(function (m) { return m.burst; });
    while (plain.length < target) plain.push(makeMote());
    plain.length = target;
    motes = plain.concat(kept);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgb(255, 245, 190)"; // pale yellow, as if catching the light
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      ctx.globalAlpha = m.a;
      ctx.beginPath();
      ctx.arc(m.x, m.y, MOTE / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function step(k) {
    var damp = Math.pow(DAMPING, k);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.heading += (Math.random() - 0.5) * TURN * k;
      m.vx *= damp;
      m.vy *= damp;
      if (m.wait > 0) {
        m.wait -= k;
      } else if (m.px !== 0 || m.py !== 0) {
        var c = Math.cos(m.curl * k), s = Math.sin(m.curl * k);
        var px = m.px * c - m.py * s;
        var py = m.px * s + m.py * c;
        var f = 1 - Math.pow(1 - m.lag, k);
        m.vx += px * f;
        m.vy += py * f;
        m.px = px * (1 - f);
        m.py = py * (1 - f);
        if (m.px * m.px + m.py * m.py < 1e-4) m.px = m.py = 0;
      }
      m.cx += (Math.cos(m.heading) * m.speed + m.vx) * k;
      m.cy += (Math.sin(m.heading) * m.speed + m.vy) * k;
      if (m.cx < 0) m.cx += w; else if (m.cx >= w) m.cx -= w;
      if (m.cy < 0) m.cy += h; else if (m.cy >= h) m.cy -= h;
      m.angle += m.spin * k;
      m.x = m.cx + Math.cos(m.angle) * m.r;
      m.y = m.cy + Math.sin(m.angle) * m.r;
    }
  }

  // Push motes near the segment a moving point just travelled along: mostly
  // sideways away from its path, a little along it. Each source of movement
  // (the mouse, the flyer) gets its own pusher, called with its latest position.
  function makePusher() {
  var last = null;
  function push(x, y) {
    var now = performance.now();
    if (!last || now - last.t > 100) {
      last = { x: x, y: y, t: now };
      return;
    }
    var dx = x - last.x;
    var dy = y - last.y;
    var dt = Math.max(now - last.t, 1);
    var len2 = dx * dx + dy * dy;
    if (len2 > 0) {
      // pointer speed in px per 60fps frame, and its unit direction
      var len = Math.sqrt(len2);
      var speed = (len / dt) * 16.67;
      var ux = dx / len, uy = dy / len;
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        var t = ((m.x - last.x) * dx + (m.y - last.y) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ox = m.x - (last.x + t * dx);
        var oy = m.y - (last.y + t * dy);
        var d = Math.sqrt(ox * ox + oy * oy);
        if (d >= REACH) continue;
        // which side of the path the mote is on: +1 left, -1 right
        var side = ux * oy - uy * ox >= 0 ? 1 : -1;
        var falloff = 1 - d / REACH;
        var strength = speed * falloff * (0.6 + Math.random() * 0.6);
        var aside = PUSH_ASIDE * strength * side;
        var along = PUSH_ALONG * strength;
        if (m.px === 0 && m.py === 0) m.wait = 4 + Math.random() * 10;
        m.px += -uy * aside + ux * along;
        m.py += ux * aside + uy * along;
        m.curl = CURL * side * (0.5 + Math.random());
        var s = Math.sqrt(m.px * m.px + m.py * m.py);
        if (s > MAX_SPEED) {
          m.px *= MAX_SPEED / s;
          m.py *= MAX_SPEED / s;
        }
      }
    }
    last = { x: x, y: y, t: now };
  }
  push.reset = function () { last = null; };
  return push;
  }

  var mousePush = makePusher();
  function onPointerMove(e) { mousePush(e.clientX, e.clientY); }
  window.dustFlyer = makePusher();

  // Eight motes join the dust at (x, y), each thrown towards a compass point, then they
  // circle and drift like the rest. Only so many are kept; the oldest give way.
  var BURST_DELAY = 333;           // ms after the flyer reaches the "o" that the motes appear
  window.dustBurst = function (x, y) {
    if (reduceMotion) return;
    setTimeout(function () { burst(x, y); }, BURST_DELAY);
  };
  function burst(x, y) {
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var m = makeMote(x, y);
      m.burst = true;
      m.a = 0.9;                   // as visible as any mote gets (they range 0.7 to 0.9)
      m.vx = Math.sin(a) * BURST_SPEED;
      m.vy = -Math.cos(a) * BURST_SPEED;
      motes.push(m);
    }
    var over = motes.filter(function (m) { return m.burst; }).length - BURST_KEEP;
    for (var j = 0; j < motes.length && over > 0; j++) {
      if (motes[j].burst) { motes.splice(j--, 1); over--; }
    }
  }

  var prev = null;
  function frame(now) {
    var k = prev === null ? 1 : Math.min((now - prev) / 16.67, 3);
    prev = now;
    step(k);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", function () {
    resize();
    if (reduceMotion) draw();
  });

  if (reduceMotion) {
    draw();
  } else {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    requestAnimationFrame(frame);
  }
})();
