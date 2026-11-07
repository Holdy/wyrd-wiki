// The nightcrawlers: walking creature skeletons, drawn on a canvas of their own over the whole window. Taken from
// experiments/Creature skeleton.html (a build of toolkit2's src/creature), without its on-screen frame rate readout.
// The frame monitor stays: how many walk, and when they start, depends on how well the frames keep up.
// rsc/js/site.js starts them on the 404 page (startNightcrawlers), and stops them when another page is shown.
// src/frame-monitor/monitor.ts
var PAUSE_MS = 1000;
var EMPTY_STATS = {
  fps: 0,
  refreshRate: 0,
  workMs: 0,
  load: 0,
  spare: 0,
  longestGapMs: 0,
  struggling: false,
  healthy: false,
  cpuPressure: null
};
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
function watchCpuPressure(sampleMs, onChange) {
  const { PressureObserver } = globalThis;
  if (!PressureObserver)
    return () => {};
  try {
    const observer = new PressureObserver((records) => {
      const latest = records.at(-1);
      if (latest)
        onChange(latest.state);
    });
    observer.observe("cpu", { sampleInterval: sampleMs }).catch(() => {});
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}
function createFrameMonitor({
  windowMs = 1000,
  minRateShare = 0.85,
  maxLoad = 0.8,
  healthyLoad = 1 / 3,
  cpuSampleMs = 1000,
  now = () => performance.now()
} = {}) {
  let frames = [];
  let lastTime = null;
  let startedAt = 0;
  let current = null;
  let bestGap = Infinity;
  let cpuPressure = null;
  const stopCpuWatch = watchCpuPressure(cpuSampleMs, (state) => {
    cpuPressure = state;
  });
  return {
    frameStart(time) {
      const gap = lastTime === null ? 0 : time - lastTime;
      lastTime = time;
      startedAt = now();
      if (gap === 0 || gap >= PAUSE_MS) {
        frames = [];
        current = null;
        return;
      }
      current = { at: time, gap, work: 0 };
    },
    frameEnd() {
      if (!current)
        return;
      current.work = now() - startedAt;
      frames.push(current);
      const oldest = current.at - windowMs;
      while (frames[0] && frames[0].at <= oldest)
        frames.shift();
      const coversWindow = current.at - frames[0].at >= windowMs * 0.9;
      if (coversWindow) {
        bestGap = Math.min(bestGap, median(frames.map((frame) => frame.gap)));
      }
      current = null;
    },
    stats() {
      if (frames.length === 0)
        return { ...EMPTY_STATS, cpuPressure };
      const totalGap = frames.reduce((sum, frame) => sum + frame.gap, 0);
      const totalWork = frames.reduce((sum, frame) => sum + frame.work, 0);
      const fps = frames.length / totalGap * 1000;
      const workMs = totalWork / frames.length;
      const budget = Number.isFinite(bestGap) ? bestGap : totalGap / frames.length;
      const refreshRate = 1000 / budget;
      const load = workMs / budget;
      const onTime = fps >= refreshRate * minRateShare;
      return {
        fps,
        refreshRate,
        workMs,
        load,
        spare: Math.max(0, 1 - load),
        longestGapMs: Math.max(...frames.map((frame) => frame.gap)),
        struggling: !onTime || load > maxLoad,
        healthy: onTime && load <= healthyLoad,
        cpuPressure
      };
    },
    stop() {
      stopCpuWatch();
    }
  };
}

// src/creature/skeleton.ts
var HIP_WIDTH = 0.4125;
var LEG_SEGMENT = 5 / 6;
var NECK = 2 / 9;
var LOWER_MID = LEG_SEGMENT / 2;
var HEAD_SIZE = 0.6;
var HEAD_SWAY = 0.1;
var HIP_SWAY = 0.05;
var BODY_STROKE = 0.25;
var BONE_WIDTH = 0.05;
var JOINT_RADIUS = 0.1;
var TRIP_REACH = 0.5;
var SHADOW_COLOR = "#000";
var SHADOW_ALPHA = 1 / 5;     // the shadows are drawn solid on a layer of their own, which is laid down this strong
var STRIDE = 5 / 3;
var STRIDE_GROWTH = 0.15;
var LONGEST_STRIDE = 1.3;
var LEG_REACH = 0.985;
var CORNERING = 1.13;
var STANCE = 0.6;
var FOOT_LIFT = 0.4;
var FORWARD = { x: 0, y: 1, z: 0 };
var BONES = [
  ["leftHip", "mid"],
  ["mid", "rightHip"],
  ["mid", "neck"],
  ["mid", "lowerMid"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftFoot"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightFoot"]
];
function createSkeleton({
  kneeWidth = 60
} = {}) {
  const hip = kneeWidth * HIP_WIDTH / 2;
  const knee = kneeWidth / 2;
  const leg = kneeWidth * LEG_SEGMENT;
  const midZ = leg * 2;
  return {
    mid: { x: 0, y: 0, z: midZ },
    neck: { x: 0, y: 0, z: midZ + kneeWidth * NECK },
    lowerMid: { x: 0, y: 0, z: midZ - kneeWidth * LOWER_MID },
    leftHip: { x: -hip, y: 0, z: midZ },
    leftKnee: { x: -knee, y: 0, z: leg },
    leftFoot: { x: -knee, y: 0, z: 0 },
    rightHip: { x: hip, y: 0, z: midZ },
    rightKnee: { x: knee, y: 0, z: leg },
    rightFoot: { x: knee, y: 0, z: 0 }
  };
}
function kneeWidthOf({ leftHip, rightHip }) {
  const hipWidth = Math.hypot(rightHip.x - leftHip.x, rightHip.y - leftHip.y, rightHip.z - leftHip.z);
  return hipWidth / HIP_WIDTH;
}
function strideLength(skeleton, speed = 1) {
  const growth = Math.min(1 + STRIDE_GROWTH * (speed - 1), LONGEST_STRIDE);
  return kneeWidthOf(skeleton) * STRIDE * growth;
}
function hipHeight(kneeWidth, stride) {
  const reach = kneeWidth * LEG_SEGMENT * 2 * LEG_REACH;
  const along = stride * STANCE * CORNERING / 2;
  const across = kneeWidth * (1 - HIP_WIDTH) / 2;
  return Math.sqrt(reach ** 2 - along ** 2 - across ** 2);
}
function figureEightPath(radius, facing = 0, start = { x: 0, y: 0 }, firstTurn = 1) {
  const loop = 2 * Math.PI * radius;
  const offsetX = radius * Math.cos(facing);
  const offsetY = radius * Math.sin(facing);
  return (distance) => {
    const along = (distance % (2 * loop) + 2 * loop) % (2 * loop);
    const firstLoop = along < loop;
    const side = firstLoop ? firstTurn : -firstTurn;
    const heading = facing + side * (firstLoop ? along : along - loop) / radius;
    return {
      x: start.x + side * (radius * Math.cos(heading) - offsetX),
      y: start.y + side * (radius * Math.sin(heading) - offsetY),
      heading
    };
  };
}
function chainPath(start, facing, legs, then) {
  const parts = [];
  let point = { ...start, heading: facing };
  let from = 0;
  for (const leg of legs) {
    const begin = point;
    if ("straight" in leg) {
      const forwardX = -Math.sin(begin.heading);
      const forwardY = Math.cos(begin.heading);
      parts.push({
        from,
        length: leg.straight,
        at: (along) => ({
          x: begin.x + forwardX * along,
          y: begin.y + forwardY * along,
          heading: begin.heading
        })
      });
      from += leg.straight;
    } else {
      const turn = Math.sign(leg.angle);
      const centreX = begin.x - turn * leg.radius * Math.cos(begin.heading);
      const centreY = begin.y - turn * leg.radius * Math.sin(begin.heading);
      const length = Math.abs(leg.angle) * leg.radius;
      parts.push({
        from,
        length,
        at: (along) => {
          const heading = begin.heading + turn * along / leg.radius;
          return {
            x: centreX + turn * leg.radius * Math.cos(heading),
            y: centreY + turn * leg.radius * Math.sin(heading),
            heading
          };
        }
      });
      from += length;
    }
    point = parts.at(-1).at(parts.at(-1).length);
  }
  const after = then(point, point.heading);
  const backX = -Math.sin(facing);
  const backY = Math.cos(facing);
  return (distance) => {
    if (distance < 0) {
      return {
        x: start.x + backX * distance,
        y: start.y + backY * distance,
        heading: facing
      };
    }
    for (const part of parts) {
      if (distance < part.from + part.length)
        return part.at(distance - part.from);
    }
    return after(distance - from);
  };
}
function solveKnee(hip, foot, segment, forward) {
  const reach = Math.hypot(foot.x - hip.x, foot.y - hip.y, foot.z - hip.z);
  const along = {
    x: (foot.x - hip.x) / reach,
    y: (foot.y - hip.y) / reach,
    z: (foot.z - hip.z) / reach
  };
  const facing = forward.x * along.x + forward.y * along.y + forward.z * along.z;
  const bend = {
    x: forward.x - facing * along.x,
    y: forward.y - facing * along.y,
    z: forward.z - facing * along.z
  };
  const bendLength = Math.hypot(bend.x, bend.y, bend.z) || 1;
  const offset = Math.sqrt(Math.max(0, segment ** 2 - (reach / 2) ** 2));
  return {
    x: (hip.x + foot.x) / 2 + bend.x / bendLength * offset,
    y: (hip.y + foot.y) / 2 + bend.y / bendLength * offset,
    z: (hip.z + foot.z) / 2 + bend.z / bendLength * offset
  };
}
function walkPose(skeleton, path, distance, stride = strideLength(skeleton)) {
  const kneeWidth = kneeWidthOf(skeleton);
  const segment = kneeWidth * LEG_SEGMENT;
  const lower = hipHeight(kneeWidth, stride) - skeleton.mid.z;
  const toWorld = (joint, at) => {
    const point = path(at);
    const { x, y } = rotate(joint, point.heading);
    return { x: point.x + x, y: point.y + y, z: joint.z + lower };
  };
  const placeFoot = (restFoot, offset) => {
    const cycle = distance / stride + offset;
    const step = Math.floor(cycle);
    const progress = cycle - step;
    const landing = (index) => ({
      ...toWorld(restFoot, (index - offset + STANCE / 2) * stride),
      z: 0
    });
    const from = landing(step);
    if (progress < STANCE)
      return from;
    const to = landing(step + 1);
    const swing = (progress - STANCE) / (1 - STANCE);
    const eased = swing * swing * (3 - 2 * swing);
    return {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      z: kneeWidth * FOOT_LIFT * Math.sin(Math.PI * swing)
    };
  };
  const sideways = -Math.cos(2 * Math.PI * (distance / stride - STANCE / 2));
  const shift = HIP_SWAY * kneeWidth * sideways;
  const sway = HEAD_SWAY * kneeWidth * sideways;
  const onBody = (joint, extra = 0) => toWorld({ ...joint, x: joint.x + shift + extra }, distance);
  const leftHip = onBody(skeleton.leftHip);
  const rightHip = onBody(skeleton.rightHip);
  const leftFoot = placeFoot(skeleton.leftFoot, 0);
  const rightFoot = placeFoot(skeleton.rightFoot, 0.5);
  const forward = rotate(FORWARD, path(distance).heading);
  return {
    mid: onBody(skeleton.mid),
    neck: onBody(skeleton.neck, sway),
    lowerMid: onBody(skeleton.lowerMid),
    leftHip,
    leftKnee: solveKnee(leftHip, leftFoot, segment, forward),
    leftFoot,
    rightHip,
    rightKnee: solveKnee(rightHip, rightFoot, segment, forward),
    rightFoot
  };
}
var ISO_X = Math.cos(Math.PI / 6);
var ISO_Y = Math.sin(Math.PI / 6);
function rotate({ x, y, z }, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos, z };
}
function project({ x, y, z }) {
  return { x: (x - y) * ISO_X, y: (x + y) * ISO_Y - z };
}
function screenOffset(joint) {
  return project(joint);
}
function groundAt(screenX, screenY) {
  const across = screenX / ISO_X;
  const along = screenY / ISO_Y;
  return { x: (along + across) / 2, y: (along - across) / 2 };
}
function headsTouching(a, b) {
  const gap = Math.hypot(a.neck.x - b.neck.x, a.neck.y - b.neck.y, a.neck.z - b.neck.z);
  return gap < HEAD_SIZE * kneeWidthOf(a);
}
function footCatches(walker, lying) {
  const reach = kneeWidthOf(lying) * TRIP_REACH;
  const headX = lying.neck.x;
  const headY = lying.neck.y;
  const alongX = (lying.leftFoot.x + lying.rightFoot.x) / 2 - headX;
  const alongY = (lying.leftFoot.y + lying.rightFoot.y) / 2 - headY;
  const lengthSquared = alongX ** 2 + alongY ** 2;
  return [walker.leftFoot, walker.rightFoot].some(({ x, y }) => {
    const share = ((x - headX) * alongX + (y - headY) * alongY) / lengthSquared;
    const nearest = Math.min(1, Math.max(0, share));
    const gap = Math.hypot(x - (headX + alongX * nearest), y - (headY + alongY * nearest));
    return gap < reach;
  });
}
function placer({ x, y }) {
  return (joint) => {
    const point = project(joint);
    return { x: x + point.x, y: y + point.y };
  };
}
function outline(points) {
  const path = new Path2D;
  for (const point of points)
    path.lineTo(point.x, point.y);
  path.closePath();
  return path;
}
function drawShadow(ctx, skeleton, { color = SHADOW_COLOR, ...position }) {
  const kneeWidth = kneeWidthOf(skeleton);
  const place = placer(position);
  const mirrored = (name) => {
    const joint = skeleton[name];
    return place({ ...joint, z: -joint.z });
  };
  const body = outline(["leftFoot", "leftHip", "rightHip", "rightFoot", "lowerMid"].map(mirrored));
  const head = mirrored("neck");
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineWidth = kneeWidth * BODY_STROKE;
  ctx.fill(body);
  ctx.stroke(body);
  ctx.beginPath();
  ctx.arc(head.x, head.y, HEAD_SIZE * kneeWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawSkeleton(ctx, skeleton, {
  showSkeleton = true,
  color = "#222",
  triangleColor = "#f4efe2",     // off white
  ...position
}) {
  const kneeWidth = kneeWidthOf(skeleton);
  const place = placer(position);
  const toCanvas = (name) => place(skeleton[name]);
  const shape = (...names) => outline(names.map(toCanvas));
  ctx.save();
  ctx.fillStyle = triangleColor;
  ctx.strokeStyle = triangleColor;
  ctx.lineJoin = "round";
  ctx.lineWidth = kneeWidth * BODY_STROKE;
  for (const path of [
    shape("leftFoot", "leftKnee", "leftHip", "mid", "lowerMid"),
    shape("rightFoot", "rightKnee", "rightHip", "mid", "lowerMid"),
    shape("neck", "leftHip", "rightHip")
  ]) {
    ctx.fill(path);
    ctx.stroke(path);
  }
  const head = toCanvas("neck");
  ctx.beginPath();
  ctx.arc(head.x, head.y, HEAD_SIZE * kneeWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (!showSkeleton)
    return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = kneeWidth * BONE_WIDTH;
  ctx.beginPath();
  for (const [from, to] of BONES) {
    const start = toCanvas(from);
    const end = toCanvas(to);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  }
  ctx.stroke();
  for (const name of Object.keys(skeleton)) {
    const joint = toCanvas(name);
    ctx.beginPath();
    ctx.arc(joint.x, joint.y, kneeWidth * JOINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// src/creature/setpieces.ts
var accelerate = (t) => t * t;
var decelerate = (t) => 1 - (1 - t) * (1 - t);
var smooth = (t) => t * t * (3 - 2 * t);
var FORWARD_POLE = { y: 1, z: 0 };
var UP_POLE = { y: 0.3, z: 1 };
var DOWN_POLE = { y: 0.3, z: -1 };
var LYING_HEIGHT = 0.25;
var LYING_PITCH = 1.5;
var LYING_REACH = 1.58;
var STRAIGHT_LEG = 1.6;
var KNEELING_HEIGHT = 0.82;
var KNEELING_PITCH = 0.3;
var TUCK_PITCH = 2.6;
var SWEEP_TIME = 0.7;
var SWEEP_LIFT = 0.05;
var STEP_AHEAD = 0.3;
var RISING_HEIGHT = 1.25;
var PLANTED_REACH = 1.5;
var TRIP_FOOT_LIFT = 0.25;
var TRIP_AIRBORNE = 0.7;
var TRIP_SLIDE = 2 / 3;
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpAngle(a, b, t) {
  const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + turn * t;
}
function lerpJoint(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
function lerpPole(a, b, t) {
  return { x: lerp(a.x ?? 0, b.x ?? 0, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
function lerpKey(a, b, t) {
  return {
    mid: lerpJoint(a.mid, b.mid, t),
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    sway: lerp(a.sway, b.sway, t),
    leftFoot: lerpJoint(a.leftFoot, b.leftFoot, t),
    rightFoot: lerpJoint(a.rightFoot, b.rightFoot, t),
    leftPole: lerpPole(a.leftPole, b.leftPole, t),
    rightPole: lerpPole(a.rightPole, b.rightPole, t)
  };
}
function keyFromPose(pose) {
  const { mid, neck, leftHip, rightHip, leftFoot, rightFoot } = pose;
  const yaw = Math.atan2(rightHip.y - leftHip.y, rightHip.x - leftHip.x);
  const head = rotate({ x: neck.x - mid.x, y: neck.y - mid.y, z: 0 }, -yaw);
  return {
    mid,
    yaw,
    pitch: 0,
    sway: head.x,
    leftFoot,
    rightFoot,
    leftPole: FORWARD_POLE,
    rightPole: FORWARD_POLE
  };
}
function buildPose(rest, key) {
  const segment = rest.leftKnee.z;
  const onBody = ({ x, z }, sway = 0) => {
    const height = z - rest.mid.z;
    const turned = rotate({
      x: x + sway,
      y: height * Math.sin(key.pitch),
      z: height * Math.cos(key.pitch)
    }, key.yaw);
    return {
      x: key.mid.x + turned.x,
      y: key.mid.y + turned.y,
      z: key.mid.z + turned.z
    };
  };
  const toWorld = ({ x = 0, y, z }) => rotate({ x, y, z }, key.yaw);
  const leftHip = onBody(rest.leftHip);
  const rightHip = onBody(rest.rightHip);
  return {
    mid: key.mid,
    neck: onBody(rest.neck, key.sway),
    lowerMid: onBody(rest.lowerMid),
    leftHip,
    leftKnee: key.leftKnee ?? solveKnee(leftHip, key.leftFoot, segment, toWorld(key.leftPole)),
    leftFoot: key.leftFoot,
    rightHip,
    rightKnee: key.rightKnee ?? solveKnee(rightHip, key.rightFoot, segment, toWorld(key.rightPole)),
    rightFoot: key.rightFoot
  };
}
function play(rest, start, steps, adjust = (key) => key) {
  const duration = steps.reduce((total, step) => total + step.duration, 0);
  return {
    duration,
    pose(time) {
      let from = start;
      let elapsed = Math.max(0, time);
      for (const step of steps) {
        if (elapsed < step.duration) {
          const t = step.ease(elapsed / step.duration);
          return buildPose(rest, adjust(lerpKey(from, step.key, t), time));
        }
        elapsed -= step.duration;
        from = step.key;
      }
      return buildPose(rest, adjust(from, time));
    }
  };
}
function frameAt(rest, path, distance) {
  const kneeWidth = kneeWidthOf(rest);
  const { x, y, heading } = path(distance);
  return {
    at(side, forward, up) {
      const turned = rotate({ x: side * kneeWidth, y: forward * kneeWidth, z: 0 }, heading);
      return { x: x + turned.x, y: y + turned.y, z: up * kneeWidth };
    },
    forwardOf(joint) {
      const turned = rotate({ x: joint.x - x, y: joint.y - y, z: 0 }, -heading);
      return turned.y / kneeWidth;
    }
  };
}
function fallForwardSteps(rest, path, distance, stride) {
  const start = keyFromPose(walkPose(rest, path, distance, stride));
  const { at, forwardOf } = frameAt(rest, path, distance);
  const frontIsLeft = forwardOf(start.leftFoot) > forwardOf(start.rightFoot);
  const pinLeft = start.rightFoot.z > 0 || start.leftFoot.z === 0 && frontIsLeft;
  const front = forwardOf(pinLeft ? start.leftFoot : start.rightFoot);
  const freeSide = pinLeft ? 0.5 : -0.5;
  const freeFoot = (forward, up) => ({
    [pinLeft ? "rightFoot" : "leftFoot"]: at(freeSide, forward, up)
  });
  const pivot = (angle, height) => at(0, front + STRAIGHT_LEG * Math.sin(angle), height);
  const stumble = {
    ...start,
    sway: 0,
    mid: at(0, Math.max(front + 0.35, Math.min(0.15, front + 0.55)), 1.5),
    pitch: 0.35,
    ...freeFoot(front - 0.55, 0.35)
  };
  const toppling = {
    ...stumble,
    mid: pivot(0.7, 1.22),
    pitch: 0.95,
    ...freeFoot(front - 0.3, 0.55)
  };
  const impact = {
    ...toppling,
    mid: pivot(1.43, LYING_HEIGHT),
    pitch: LYING_PITCH,
    ...freeFoot(front + 0.1, 0.7),
    leftPole: DOWN_POLE,
    rightPole: DOWN_POLE
  };
  const hips = impact.mid;
  const hipsForward = forwardOf(hips);
  const shinsRising = {
    ...impact,
    leftFoot: at(-0.5, hipsForward - 1.42, 0.59),
    rightFoot: at(0.5, hipsForward - 1.42, 0.59),
    leftPole: { y: -0.7, z: -0.7 },
    rightPole: { y: -0.7, z: -0.7 }
  };
  const feetUp = {
    ...shinsRising,
    mid: { ...hips, z: hips.z * 1.2 },
    pitch: LYING_PITCH - 0.1,
    leftFoot: at(-0.5, hipsForward - 0.85, 0.85),
    rightFoot: at(0.5, hipsForward - 0.85, 0.85)
  };
  const lying = {
    ...impact,
    leftFoot: at(-0.5, hipsForward - LYING_REACH, 0),
    rightFoot: at(0.5, hipsForward - LYING_REACH, 0),
    leftPole: DOWN_POLE,
    rightPole: DOWN_POLE
  };
  const steps = [
    { key: stumble, duration: 0.22, ease: decelerate },
    { key: toppling, duration: 0.28, ease: accelerate },
    { key: impact, duration: 0.2, ease: accelerate },
    { key: shinsRising, duration: 0.14, ease: smooth },
    { key: feetUp, duration: 0.18, ease: decelerate },
    { key: shinsRising, duration: 0.18, ease: accelerate },
    { key: lying, duration: 0.12, ease: accelerate }
  ];
  return { start, steps, lying };
}
function fallBackwardSteps(rest, path, distance, stride) {
  const start = keyFromPose(walkPose(rest, path, distance, stride));
  const { at, forwardOf } = frameAt(rest, path, distance);
  const rearIsLeft = forwardOf(start.leftFoot) < forwardOf(start.rightFoot);
  const pinLeft = start.rightFoot.z > 0 || start.leftFoot.z === 0 && rearIsLeft;
  const back = forwardOf(pinLeft ? start.leftFoot : start.rightFoot);
  const freeSide = pinLeft ? 0.5 : -0.5;
  const freeFoot = (forward, up) => ({
    [pinLeft ? "rightFoot" : "leftFoot"]: at(freeSide, forward, up)
  });
  const pivot = (angle, height) => at(0, back - STRAIGHT_LEG * Math.sin(angle), height);
  const recoil = {
    ...start,
    sway: 0,
    mid: at(0, back + 0.23, 1.55),
    pitch: -0.35,
    ...freeFoot(back + 0.45, 0.2)
  };
  const toppling = {
    ...recoil,
    mid: pivot(0.6, 1.35),
    pitch: -0.9,
    ...freeFoot(back + 0.12, 0.12)
  };
  const impact = {
    ...toppling,
    mid: at(0, back - LYING_REACH, LYING_HEIGHT),
    pitch: -LYING_PITCH,
    ...freeFoot(back, 0),
    leftPole: UP_POLE,
    rightPole: UP_POLE
  };
  const bounce = {
    ...impact,
    mid: { ...impact.mid, z: impact.mid.z * 1.3 },
    pitch: -LYING_PITCH + 0.12,
    ...freeFoot(back, 0.12)
  };
  const steps = [
    { key: recoil, duration: 0.18, ease: decelerate },
    { key: toppling, duration: 0.32, ease: accelerate },
    { key: impact, duration: 0.22, ease: accelerate },
    { key: bounce, duration: 0.12, ease: decelerate },
    { key: impact, duration: 0.14, ease: accelerate }
  ];
  return { start, steps, lying: impact };
}
function kneeling(from, mid, leftFoot, rightFoot) {
  return {
    ...from,
    mid,
    pitch: KNEELING_PITCH,
    leftFoot,
    rightFoot,
    leftPole: FORWARD_POLE,
    rightPole: FORWARD_POLE
  };
}
function standUpSteps(rest, prepared, stand) {
  const kneeWidth = kneeWidthOf(rest);
  const halfway = (a, b, up) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: up * kneeWidth
  });
  const between = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2
  });
  const reachOf = (foot, hip, yaw) => (mid) => {
    const hipOffset = rotate(hip, yaw);
    const anchorX = foot.x - hipOffset.x;
    const anchorY = foot.y - hipOffset.y;
    const across = Math.hypot(mid.x - anchorX, mid.y - anchorY);
    const allowed = Math.sqrt(Math.max(0, (PLANTED_REACH * kneeWidth) ** 2 - mid.z ** 2));
    if (across <= allowed)
      return mid;
    const share = allowed / across;
    return {
      x: anchorX + (mid.x - anchorX) * share,
      y: anchorY + (mid.y - anchorY) * share,
      z: mid.z
    };
  };
  const kneel = buildPose(rest, prepared);
  const ahead = rotate({ x: 0, y: 1, z: 0 }, prepared.yaw);
  const toKnee = (kneel.rightKnee.x - prepared.leftFoot.x) * ahead.x + (kneel.rightKnee.y - prepared.leftFoot.y) * ahead.y;
  const lead = toKnee + (STEP_AHEAD + 0.2) * kneeWidth;
  const firstStep = {
    x: prepared.leftFoot.x + ahead.x * lead,
    y: prepared.leftFoot.y + ahead.y * lead,
    z: 0
  };
  const onFirstFoot = reachOf(firstStep, rest.leftHip, prepared.yaw);
  const kneeStillDown = reachOf(prepared.rightFoot, rest.rightHip, prepared.yaw);
  const onOtherFoot = reachOf(stand.rightFoot, rest.rightHip, stand.yaw);
  const raised = (mid, up) => ({
    ...mid,
    z: mid.z + up * kneeWidth
  });
  const liftFoot = {
    ...prepared,
    mid: raised(prepared.mid, 0.03),
    pitch: KNEELING_PITCH - 0.05,
    leftFoot: halfway(prepared.leftFoot, firstStep, 0.4)
  };
  const placeFoot = {
    ...liftFoot,
    mid: onFirstFoot(kneeStillDown(raised(prepared.mid, 0.05))),
    leftFoot: firstStep
  };
  const rise = {
    ...placeFoot,
    mid: onFirstFoot(halfway(placeFoot.mid, stand.mid, RISING_HEIGHT)),
    pitch: 0.15,
    rightFoot: halfway(prepared.rightFoot, stand.rightFoot, 0.3)
  };
  const otherFootDown = {
    ...rise,
    mid: onFirstFoot(onOtherFoot(between(rise.mid, stand.mid))),
    pitch: 0.08,
    rightFoot: stand.rightFoot,
    yaw: stand.yaw
  };
  const settling = {
    ...otherFootDown,
    mid: onOtherFoot(between(otherFootDown.mid, stand.mid)),
    leftFoot: halfway(firstStep, stand.leftFoot, 0.3)
  };
  return [
    { key: liftFoot, duration: 0.3, ease: smooth },
    { key: placeFoot, duration: 0.25, ease: decelerate },
    { key: rise, duration: 0.45, ease: smooth },
    { key: otherFootDown, duration: 0.25, ease: decelerate },
    { key: settling, duration: 0.2, ease: smooth },
    { key: stand, duration: 0.2, ease: smooth }
  ];
}
function fallForward(rest, path, distance, stride = strideLength(rest), speed = 0) {
  const { start, steps } = fallForwardSteps(rest, path, distance, stride);
  const heading = rotate(FORWARD, path(distance).heading);
  const duration = steps.reduce((total2, step) => total2 + step.duration, 0);
  const slideFor = duration * TRIP_SLIDE;
  const slideAt = (time) => {
    const t = Math.min(time, slideFor);
    return speed * (t - t * t / (2 * slideFor));
  };
  const slid = (joint, by, up = 0) => ({
    x: joint.x + heading.x * by,
    y: joint.y + heading.y * by,
    z: joint.z + up
  });
  const carry = (key, time) => {
    if (speed === 0)
      return key;
    const by = slideAt(time);
    const air = Math.min(time / TRIP_AIRBORNE, 1);
    const up = TRIP_FOOT_LIFT * kneeWidthOf(rest) * Math.sin(Math.PI * air);
    return {
      ...key,
      mid: slid(key.mid, by),
      leftFoot: slid(key.leftFoot, by, up),
      rightFoot: slid(key.rightFoot, by, up)
    };
  };
  const total = slideAt(duration);
  return {
    ...play(rest, start, steps, carry),
    slidPath(at) {
      const point = path(at);
      return {
        ...point,
        x: point.x + heading.x * total,
        y: point.y + heading.y * total
      };
    }
  };
}
function fallBackward(rest, path, distance, stride = strideLength(rest)) {
  const { start, steps } = fallBackwardSteps(rest, path, distance, stride);
  return play(rest, start, steps);
}
function getUpFromFront(rest, path, distance, stride = strideLength(rest)) {
  const { lying } = fallForwardSteps(rest, path, distance, stride);
  const { at, forwardOf } = frameAt(rest, path, distance);
  const kneeWidth = kneeWidthOf(rest);
  const segment = rest.leftKnee.z;
  const torso = rest.neck.z - rest.mid.z;
  const head = buildPose(rest, lying).neck;
  const ahead = rotate({ x: 0, y: 1, z: 0 }, lying.yaw);
  const hipsUnderHead = (pitch) => ({
    x: head.x - ahead.x * torso * Math.sin(pitch),
    y: head.y - ahead.y * torso * Math.sin(pitch),
    z: head.z - torso * Math.cos(pitch)
  });
  const feetBehind = (hips) => {
    const thighReach = Math.sqrt(Math.max(0, segment ** 2 - hips.z ** 2));
    const back = forwardOf(hips) - (thighReach + segment) / kneeWidth;
    return { left: at(-0.5, back, 0), right: at(0.5, back, 0) };
  };
  const tuckedHips = hipsUnderHead(TUCK_PITCH);
  const tuckedFeet = feetBehind(tuckedHips);
  const liftedFoot = (from, to) => ({
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: 0.12 * kneeWidth
  });
  const tucking = {
    ...lying,
    mid: hipsUnderHead((LYING_PITCH + TUCK_PITCH) / 2),
    pitch: (LYING_PITCH + TUCK_PITCH) / 2,
    leftFoot: liftedFoot(lying.leftFoot, tuckedFeet.left),
    rightFoot: liftedFoot(lying.rightFoot, tuckedFeet.right),
    leftPole: DOWN_POLE,
    rightPole: DOWN_POLE
  };
  const tucked = {
    ...tucking,
    mid: tuckedHips,
    pitch: TUCK_PITCH,
    leftFoot: tuckedFeet.left,
    rightFoot: tuckedFeet.right
  };
  const kneelingAt = forwardOf(tuckedFeet.left) + (segment + Math.sqrt(Math.max(0, segment ** 2 - (KNEELING_HEIGHT * kneeWidth) ** 2))) / kneeWidth;
  const prepared = kneeling(tucked, at(0, kneelingAt, KNEELING_HEIGHT), tuckedFeet.left, tuckedFeet.right);
  const standingAt = (resumeDistance) => {
    const stand = keyFromPose(walkPose(rest, path, resumeDistance, stride));
    const steps = [
      { key: tucking, duration: 0.35, ease: smooth },
      { key: tucked, duration: 0.35, ease: smooth },
      { key: prepared, duration: 0.6, ease: smooth },
      ...standUpSteps(rest, prepared, stand)
    ];
    return { ...play(rest, lying, steps), resumeDistance };
  };
  return standForward(rest, path, distance, stride, prepared, (distance + kneelingAt * kneeWidth) / stride, standingAt);
}
function standForward(rest, path, distance, stride, prepared, around, build) {
  const { forwardOf } = frameAt(rest, path, distance);
  const kneel = buildPose(rest, prepared);
  const segment = rest.leftKnee.z;
  const options = [-1, 0, 1, 2, 3].map((step) => {
    const piece = build((Math.round(around) + step) * stride);
    const stand = walkPose(rest, path, piece.resumeDistance, stride);
    const lead = forwardOf(stand.leftFoot) - forwardOf(kneel.rightKnee);
    const forward = forwardOf(stand.mid) >= forwardOf(kneel.mid);
    return { piece, lead, ok: lead >= STEP_AHEAD && forward, stretch: longestLeg(piece) / (2 * segment) };
  });
  const forwardOnes = options.filter((option) => option.ok);
  if (forwardOnes.length > 0) {
    return forwardOnes.sort((a, b) => a.stretch - b.stretch)[0].piece;
  }
  return options.sort((a, b) => b.lead - a.lead)[0].piece;
}
function longestLeg(piece) {
  let longest = 0;
  for (let time = 0;time <= piece.duration; time += 1 / 30) {
    const pose = piece.pose(time);
    longest = Math.max(longest, Math.hypot(pose.leftHip.x - pose.leftFoot.x, pose.leftHip.y - pose.leftFoot.y, pose.leftHip.z - pose.leftFoot.z), Math.hypot(pose.rightHip.x - pose.rightFoot.x, pose.rightHip.y - pose.rightFoot.y, pose.rightHip.z - pose.rightFoot.z));
  }
  return longest;
}
function getUpFromBack(rest, path, distance, stride = strideLength(rest)) {
  const { lying } = fallBackwardSteps(rest, path, distance, stride);
  const { at, forwardOf } = frameAt(rest, path, distance);
  const kneeWidth = kneeWidthOf(rest);
  const segment = rest.leftKnee.z;
  const lyingPose = buildPose(rest, lying);
  const between = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2
  });
  const swing = (foot, knee, side) => {
    const outX = foot.x - knee.x;
    const outY = foot.y - knee.y;
    const along = Math.hypot(outX, outY) || 1;
    const ahead = { x: outX / along, y: outY / along };
    const ownSide = rotate({ x: side, y: 0, z: 0 }, lying.yaw);
    const across = { x: ahead.y, y: -ahead.x };
    const sign = across.x * ownSide.x + across.y * ownSide.y >= 0 ? 1 : -1;
    const sideways = { x: across.x * sign, y: across.y * sign };
    return (turned) => {
      const lift = SWEEP_LIFT * kneeWidth * Math.sin(turned);
      const round = Math.sqrt(Math.max(0, segment ** 2 - (knee.z - lift) ** 2));
      return {
        x: knee.x + round * (Math.cos(turned) * ahead.x + Math.sin(turned) * sideways.x),
        y: knee.y + round * (Math.cos(turned) * ahead.y + Math.sin(turned) * sideways.y),
        z: lift
      };
    };
  };
  const leftKnee = lyingPose.leftKnee;
  const rightKnee = lyingPose.rightKnee;
  const leftSwing = swing(lying.leftFoot, leftKnee, -1);
  const rightSwing = swing(lying.rightFoot, rightKnee, 1);
  const towardsKnee = (hip, foot, knee) => {
    const toward = rotate({
      x: knee.x - (hip.x + foot.x) / 2,
      y: knee.y - (hip.y + foot.y) / 2,
      z: knee.z - (hip.z + foot.z) / 2
    }, -lying.yaw);
    return { x: toward.x, y: toward.y, z: toward.z };
  };
  const leftStartsAfter = SWEEP_TIME / 2;
  const sweepTime = SWEEP_TIME + leftStartsAfter;
  const turnedBy = (time) => Math.PI * smooth(Math.min(1, Math.max(0, time / SWEEP_TIME)));
  const folded = {
    ...lying,
    leftFoot: leftSwing(Math.PI),
    rightFoot: rightSwing(Math.PI),
    leftPole: towardsKnee(lyingPose.leftHip, leftSwing(Math.PI), leftKnee),
    rightPole: towardsKnee(lyingPose.rightHip, rightSwing(Math.PI), rightKnee)
  };
  const legSteps = [{ key: folded, duration: sweepTime, ease: (t) => t }];
  const sweeping = (key, time) => time >= sweepTime ? key : {
    ...key,
    rightFoot: rightSwing(turnedBy(time)),
    leftFoot: leftSwing(turnedBy(time - leftStartsAfter)),
    rightKnee,
    leftKnee
  };
  const knees = {
    x: (leftKnee.x + rightKnee.x) / 2,
    y: (leftKnee.y + rightKnee.y) / 2
  };
  const backFromKnees = {
    x: lying.mid.x - knees.x,
    y: lying.mid.y - knees.y
  };
  const backLength = Math.hypot(backFromKnees.x, backFromKnees.y) || 1;
  const kneelingAngle = Math.asin(Math.min(1, KNEELING_HEIGHT * kneeWidth / segment));
  const hipsAt = (angle) => ({
    x: knees.x + backFromKnees.x / backLength * segment * Math.cos(angle),
    y: knees.y + backFromKnees.y / backLength * segment * Math.cos(angle),
    z: Math.max(lying.mid.z, segment * Math.sin(angle))
  });
  const sitSteps = [0.35, 0.7].map((share) => ({
    key: {
      ...folded,
      mid: hipsAt(kneelingAngle * share),
      pitch: lying.pitch + (KNEELING_PITCH - lying.pitch) * share,
      leftPole: FORWARD_POLE,
      rightPole: FORWARD_POLE
    },
    duration: 0.25,
    ease: smooth
  }));
  const prepared = kneeling(folded, hipsAt(kneelingAngle), folded.leftFoot, folded.rightFoot);
  const kneelingAt = forwardOf(prepared.mid);
  const standingAt = (resumeDistance) => {
    const stand = keyFromPose(walkPose(rest, path, resumeDistance, stride));
    const steps = [
      ...legSteps,
      ...sitSteps,
      { key: prepared, duration: 0.25, ease: smooth },
      ...standUpSteps(rest, prepared, stand)
    ];
    return { ...play(rest, lying, steps, sweeping), resumeDistance };
  };
  return standForward(rest, path, distance, stride, prepared, (distance + kneelingAt * kneeWidth) / stride, standingAt);
}

// src/creature/demo.ts
var KNEE_WIDTH = 10.8;
var BASE_SPEED = 1.1;
var SLOWEST = 2;
var FASTEST = 4.05;
var SMALLEST_LOOP = 4;
var SHOW_SKELETON = false;
var TRIP_INTERVAL = 60;
var STEADY_TIME = 1.5;
var HICCUP = 0.5;
var START_GRACE = 10;
var SHORTEST_LIE = 1;
var LONGEST_LIE = 5;
var SPAWN_INTERVAL = 0.1;
var MAX_WALKERS = 50;
var DRAW_BUDGET = 1 / 3;
var MIN_FPS = 59.5;
var LAUNCH_FPS = 49.5;
var SLOW_PATIENCE = 1.5;
var SPAWN_CIRCLE = 80;
var START_LAYOUT = "rows";
var START_IN_PATTERN = START_LAYOUT !== "spawn";
var PATTERN = "404";
var PATTERN_COLUMN = 22;
var PATTERN_ROW = 34;
var ROWS = 2;
var START_LYING = true;
var RISE_INTERVAL = 0.5;
var ROW_GAP = START_LYING ? 9 : PATTERN_ROW;
var ROW_SPACING = PATTERN_COLUMN - 4;
var ROW_LENGTH = 20;
var FACING_LEFT = Math.PI / 4;
var PAGE_MARGIN = 30;
var ROUTE_TRIES = 150;
var SMALLEST_EIGHT = 0.5;
var EIGHT_SHIFT = 0.08;
var FACING_RIGHT = Math.PI / 4 + Math.PI;
var RUN_LEFT = 2 * 96 / 2.54;
var SHORTEST_RUN = 0.5;
var ISO_STRETCH = Math.SQRT2 * Math.cos(Math.PI / 6);
var CPU_SETTLE = 1;
var PATTERN_HOLD = 0;
var PATTERN_START_INTERVAL = 0.5;
var GLYPH_WIDTH = 5;
var GLYPH_HEIGHT = 7;
var GLYPHS = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"]
};
var PATTERN_COLUMNS = PATTERN.length * (GLYPH_WIDTH + 1) - 1;
// Starts them, and sends "all-nightcrawlers-started" (on window) once they are all up off the starting lines.
// Returns { stop, leave, allStarted }: stop() takes them and their canvas away at once, leave() has them walk off first.
// `centreX()` (optional) is where across the window the middle of their ground is, in px: by default the window's middle.
export function startNightcrawlers({ centreX } = {}) {
  const stopping = new AbortController(), signal = stopping.signal;
  var canvas = document.body.appendChild(document.createElement("canvas"));
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;left:0;top:0;pointer-events:none";
  var ctx = canvas.getContext("2d");
  var shadows = document.createElement("canvas"), shadowCtx = shadows.getContext("2d");
  var skeleton = createSkeleton({ kneeWidth: KNEE_WIDTH });
  var monitor = createFrameMonitor();
  var width = 0;
  var height = 0;
  var originX = 0;     // where across the window the middle of their ground is: what is said to be the middle in the
                       // comments here (the rows are centred on it), so the room each side of it may differ
  function fitCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    originX = centreX ? centreX() : width / 2;
    const pixelRatio = window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = shadows.width = width * pixelRatio;
    canvas.height = shadows.height = height * pixelRatio;
    ctx.scale(pixelRatio, pixelRatio);
    shadowCtx.scale(pixelRatio, pixelRatio);
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas, { signal });
  function startingSpots() {
    if (START_LAYOUT === "rows")
      return rowSpots();
    if (START_LAYOUT === "404")
      return patternSpots();
    return [];
  }
  function rowSpots() {
    const spots = [];
    for (let column = 0;column < ROW_LENGTH; column += 1) {
      for (let row = 0;row < ROWS; row += 1) {
        spots.push({
          at: groundAt((column - (ROW_LENGTH - 1) / 2) * ROW_SPACING, (row - (ROWS - 1) / 2) * ROW_GAP),
          facing: FACING_LEFT,
          lying: START_LYING,
          turn: row < ROWS / 2 ? 1 : -1
        });
      }
    }
    return spots;
  }
  function patternSpots() {
    const spots = [];
    for (const [index, character] of [...PATTERN].entries()) {
      for (const [row, line] of GLYPHS[character].entries()) {
        for (const [column, cell] of [...line].entries()) {
          if (cell !== "1")
            continue;
          spots.push({
            at: groundAt((index * (GLYPH_WIDTH + 1) + column - (PATTERN_COLUMNS - 1) / 2) * PATTERN_COLUMN, (row - (GLYPH_HEIGHT - 1) / 2) * PATTERN_ROW),
            facing: Math.random() * Math.PI * 2
          });
        }
      }
    }
    return spots.sort(() => Math.random() - 0.5);
  }
  function randomRadius() {
    const smallest = SMALLEST_LOOP * KNEE_WIDTH;
    const stretch = 1.23;
    const startsWithin = {
      spawn: SPAWN_CIRCLE * stretch,
      "404": PATTERN_COLUMNS * PATTERN_COLUMN / 2,
      rows: ROW_LENGTH * ROW_SPACING / 2
    }[START_LAYOUT];
    const room = Math.min(originX, width - originX, height / 2) - startsWithin;
    const largest = room / (2 * stretch);
    return smallest + Math.random() * Math.max(0, largest - smallest);
  }
  function pathFromSpawnCircle() {
    const angle = Math.random() * Math.PI * 2;
    const start = {
      x: SPAWN_CIRCLE * Math.cos(angle),
      y: SPAWN_CIRCLE * Math.sin(angle)
    };
    return figureEightPath(randomRadius(), angle - Math.PI / 2, start);
  }
  function pathFrom(spot) {
    if (spot.turn)
      return routeOntoEight(spot, spot.turn);
    return figureEightPath(randomRadius(), spot.facing, spot.at);
  }
  function between(low, high) {
    return low + Math.random() * (high - low);
  }
  function staysOnPage(path, length, from = 0) {
    const left = PAGE_MARGIN - originX, right = width - PAGE_MARGIN - originX;
    const halfHeight = height / 2 - PAGE_MARGIN;
    for (let along = from;along <= length; along += KNEE_WIDTH / 2) {
      const { x, y } = screenOffset({ ...path(along), z: 0 });
      if (x < left || x > right || Math.abs(y) > halfHeight)
        return false;
    }
    return true;
  }
  function randomEight() {
    const smallest = SMALLEST_LOOP * KNEE_WIDTH;
    const biggest = Math.max(smallest, Math.min((height / 2 - PAGE_MARGIN) / Math.SQRT2, (Math.min(originX, width - originX) - PAGE_MARGIN) / ISO_STRETCH));
    const facing = FACING_RIGHT + Math.random() * 2 * Math.PI;
    const crossing = groundAt(between(-1, 1) * EIGHT_SHIFT * width, between(-1, 1) * EIGHT_SHIFT * height);
    let radius = biggest * between(SMALLEST_EIGHT, 1);
    for (;; ) {
      const forward = figureEightPath(radius, facing, crossing, 1);
      const length = 4 * Math.PI * radius;
      if (radius <= smallest || staysOnPage(forward, length)) {
        const backward = figureEightPath(radius, facing + Math.PI, crossing, -1);
        return { forward, backward, length };
      }
      radius = Math.max(smallest, radius * 0.9);
    }
  }
  function aroundOnce(angle) {
    const turn = 2 * Math.PI;
    return (angle % turn + turn) % turn;
  }
  function joinOnto(from, to, radius, first, last) {
    const centre = (point, turn) => ({
      x: point.x - turn * radius * Math.cos(point.heading),
      y: point.y - turn * radius * Math.sin(point.heading)
    });
    const start = centre(from, first);
    const end = centre(to, last);
    const apartX = end.x - start.x;
    const apartY = end.y - start.y;
    const apart = Math.hypot(apartX, apartY);
    const across = Math.atan2(-apartX, apartY);
    const options = [];
    if (first === last) {
      options.push({ heading: across, straight: apart });
    } else {
      if (apart < 2 * radius)
        return null;
      const offset = Math.asin(2 * radius / apart);
      const straight = Math.sqrt(apart ** 2 - 4 * radius ** 2);
      options.push({ heading: across + offset, straight }, { heading: across - offset, straight });
    }
    for (const { heading, straight } of options) {
      const legs = [
        { radius, angle: first * aroundOnce(first * (heading - from.heading)) },
        { straight },
        { radius, angle: last * aroundOnce(last * (to.heading - heading)) }
      ];
      const length = legs.reduce((total, leg) => total + ("straight" in leg ? leg.straight : Math.abs(leg.angle) * leg.radius), 0);
      const arrived = chainPath(from, from.heading, legs, () => () => from)(length - 0.000000001);
      const off = Math.hypot(arrived.x - to.x, arrived.y - to.y);
      const turnedTo = Math.abs(Math.atan2(Math.sin(arrived.heading - to.heading), Math.cos(arrived.heading - to.heading)));
      if (off < 0.001 && turnedTo < 0.001)
        return legs;
    }
    return null;
  }
  function routeOntoEight({ at, facing }, turn) {
    const page = Math.min(width, height);
    const smallestLoop = SMALLEST_LOOP * KNEE_WIDTH;
    const eight = randomEight();
    const ahead = { x: -Math.sin(facing), y: Math.cos(facing) };
    for (let attempt = 0;attempt < ROUTE_TRIES; attempt += 1) {
      const shrink = attempt / ROUTE_TRIES;
      const run = RUN_LEFT * (1 - (1 - SHORTEST_RUN) * shrink) / ISO_STRETCH;
      const radius = Math.max(smallestLoop, between(0.06, 0.15) * page);
      const runEnd = { x: at.x + ahead.x * run, y: at.y + ahead.y * run, heading: facing };
      const way = Math.random() < 0.5 ? eight.forward : eight.backward;
      const joinAt = Math.random() * eight.length;
      const target = way(joinAt);
      for (const last of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        const join = joinOnto(runEnd, target, radius, turn, last);
        if (!join || join.some((leg) => ("angle" in leg) && Math.abs(leg.angle) > 1.5 * Math.PI)) {
          continue;
        }
        const legs = [{ straight: run }, ...join];
        const joined = legs.reduce((total, leg) => total + ("straight" in leg ? leg.straight : Math.abs(leg.angle) * leg.radius), 0);
        const path = chainPath(at, facing, legs, () => (along) => way(joinAt + along));
        if (staysOnPage(path, joined))
          return path;
      }
    }
    return figureEightPath(randomRadius(), facing, at);
  }
  function shiftedPath(path, byX, byY) {
    return (along) => {
      const point = path(along);
      return { ...point, x: point.x + byX, y: point.y + byY };
    };
  }
  var lyingReach = null;
  function lyingAhead() {
    if (lyingReach === null) {
      const line = (along) => ({ x: 0, y: along, heading: 0 });
      const { mid } = fallForward(skeleton, line, 0).pose(Infinity);
      lyingReach = Math.hypot(mid.x, mid.y);
    }
    return lyingReach;
  }
  // A walker leaving: from where it has walked to, it turns to face directly away from the middle of their ground and
  // walks straight on. Its path so far is kept, so its stride carries on as it was.
  function awayFrom(path, distance) {
    const here = path(distance);
    const heading = Math.atan2(here.y, here.x) - Math.PI / 2;     // a heading of h walks towards (-sin h, cos h)
    const turn = Math.atan2(Math.sin(heading - here.heading), Math.cos(heading - here.heading));
    const away = chainPath(here, here.heading, [{ radius: SMALLEST_LOOP * KNEE_WIDTH, angle: turn }, { straight: 1e6 }], () => () => here);
    return (along) => along < distance ? path(along) : away(along - distance);
  }
  // How far past the edge of the canvas a leaving walker's middle must be before it has gone.
  function offCanvas(pose) {
    const { x, y } = screenOffset(pose.mid), past = 2 * lyingAhead();
    return x + originX < -past || x + originX > width + past || Math.abs(y) > height / 2 + past;
  }
  function createWalker(standAt) {
    const speed = SLOWEST + Math.random() * (FASTEST - SLOWEST);
    let path = standAt ? pathFrom(standAt) : pathFromSpawnCircle();
    let started = !standAt;
    const stride = strideLength(skeleton, speed);
    let distance = 0;
    let queue = [];
    let pieceTime = 0;
    let steadyFor = STEADY_TIME;
    let inStartGrace = false;
    let pose = walkPose(skeleton, path, distance, stride);
    let rising = null;
    let leaving = false, turnedAway = false;
    let gettingUp = false;     // up from where it started lying, but not yet on its feet
    if (standAt?.lying) {
      const trippedAt = -lyingAhead();
      const { mid } = getUpFromFront(skeleton, path, trippedAt, stride).pose(0);
      path = shiftedPath(path, standAt.at.x - mid.x, standAt.at.y - mid.y);
      rising = getUpFromFront(skeleton, path, trippedAt, stride);
      distance = trippedAt;
      pose = rising.pose(0);
    }
    function fall(fallen, rising2) {
      started = true;
      const lieFor = SHORTEST_LIE + Math.random() * (LONGEST_LIE - SHORTEST_LIE);
      queue = [
        { piece: fallen, endsAfter: fallen.duration + lieFor },
        { piece: rising2, endsAfter: rising2.duration }
      ];
      pieceTime = 0;
    }
    function trip() {
      const pace = BASE_SPEED * speed * KNEE_WIDTH;
      const fallen = fallForward(skeleton, path, distance, stride, pace);
      path = fallen.slidPath;
      fall(fallen, getUpFromFront(skeleton, path, distance, stride));
    }
    function advance(seconds) {
      if (!started)
        return;
      const current = queue[0];
      if (current) {
        pieceTime += seconds;
        if (pieceTime < current.endsAfter) {
          pose = current.piece.pose(pieceTime);
          return;
        }
        pose = current.piece.pose(current.endsAfter);
        pieceTime -= current.endsAfter;
        queue.shift();
        if (queue.length === 0) {
          distance = current.piece.resumeDistance ?? distance;
          steadyFor = STEADY_TIME;
          gettingUp = false;
        }
        return;
      }
      if (leaving && !turnedAway) {
        path = awayFrom(path, distance);
        turnedAway = true;
      }
      distance += seconds * BASE_SPEED * speed * KNEE_WIDTH;
      steadyFor -= seconds;
      if (steadyFor <= 0)
        inStartGrace = false;
      pose = walkPose(skeleton, path, distance, stride);
      if (!leaving && steadyFor <= 0 && Math.random() < seconds / TRIP_INTERVAL)
        trip();
    }
    const self = {
      advance,
      pose: () => pose,
      canCollide: () => queue.length === 0 && !inStartGrace && !rising && !leaving,
      canTrip: () => started && queue.length === 0 && steadyFor <= 0 && !leaving,
      isLying: () => {
        if (rising)
          return true;
        const falling = queue[0];
        return queue.length === 2 && pieceTime >= falling.piece.duration;
      },
      trip,
      knockOver() {
        if (started && queue.length === 0 && !rising && !leaving)
          trip();
      },
      // gets up if it is lying down, then walks away off the canvas
      leave() {
        leaving = true;
        if (!started)
          self.start();
      },
      isGone: () => turnedAway && offCanvas(pose),
      isStarted: () => started,
      isUp: () => started && !rising && !gettingUp,
      start() {
        started = true;
        inStartGrace = true;
        steadyFor = START_GRACE;
        if (rising) {
          queue = [{ piece: rising, endsAfter: rising.duration }];
          pieceTime = 0;
          rising = null;
          gettingUp = true;
        }
      },
      bump() {
        fall(fallBackward(skeleton, path, distance, stride), getUpFromBack(skeleton, path, distance, stride));
      }
    };
    return self;
  }
  function collide(walkers) {
    const { struggling } = monitor.stats();
    const removed = new Set;
    for (const [index, a] of walkers.entries()) {
      for (const b of walkers.slice(index + 1)) {
        if (removed.has(a) || removed.has(b))
          continue;
        if (!a.canCollide() || !b.canCollide())
          continue;
        if (!headsTouching(a.pose(), b.pose()))
          continue;
        if (struggling) {
          removed.add(b);
        } else {
          a.bump();
          b.bump();
        }
      }
    }
    for (const walker of removed)
      walkers.splice(walkers.indexOf(walker), 1);
    for (const walker of walkers) {
      if (!walker.canTrip())
        continue;
      const obstacle = walkers.find((other) => other.isLying() && footCatches(walker.pose(), other.pose()));
      if (obstacle)
        walker.trip();
    }
  }
  function createLayout() {
    return startingSpots().map((spot) => createWalker(spot));
  }
  var walkers = createLayout();
  var lastPressure = null;
  var pressureSteadyFor = 0;
  var holdFor = START_IN_PATTERN ? PATTERN_HOLD : 0;
  var startInterval = !START_IN_PATTERN ? SPAWN_INTERVAL : START_LAYOUT === "rows" && START_LYING ? RISE_INTERVAL : PATTERN_START_INTERVAL;
  var sinceSpawn = startInterval;
  var spawningStopped = false;
  var slowFor = 0;
  var previousTime = null;
  var hiddenSinceLastFrame = document.hidden;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      hiddenSinceLastFrame = true;
  }, { signal });
  function frame(time) {
    monitor.frameStart(time);
    const gap = (time - (previousTime ?? time)) / 1000;
    const seconds = Math.min(gap, 0.1);
    previousTime = time;
    if (gap > HICCUP && !hiddenSinceLastFrame) {
      for (const walker of walkers)
        walker.knockOver();
    }
    hiddenSinceLastFrame = document.hidden;
    holdFor -= seconds;
    if (holdFor <= 0)
      sinceSpawn += seconds;
    const stats = monitor.stats();
    slowFor = stats.fps > 0 && stats.fps < MIN_FPS ? slowFor + seconds : 0;
    if (!START_IN_PATTERN && (stats.load > DRAW_BUDGET || slowFor >= SLOW_PATIENCE)) {
      spawningStopped = true;
    }
    const { cpuPressure } = stats;
    pressureSteadyFor = cpuPressure === lastPressure ? pressureSteadyFor + seconds : 0;
    lastPressure = cpuPressure;
    const cpuStable = cpuPressure === null || (cpuPressure === "nominal" || cpuPressure === "fair") && pressureSteadyFor >= CPU_SETTLE;
    const framesOk = !START_IN_PATTERN || stats.fps >= LAUNCH_FPS;
    const holding = holdFor > 0;
    // Getting up the ones already lying there doesn't wait on the CPU or the frame rate (on the site, with everything
    // else it draws, the CPU pressure is often reported as "serious", and they would never get up); adding more does.
    if (!left && !holding && sinceSpawn >= startInterval && !spawningStopped) {
      const waiting = walkers.find((walker) => !walker.isStarted());
      if (waiting) {
        waiting.start();
        sinceSpawn = 0;
      } else if (cpuStable && framesOk && !START_IN_PATTERN && walkers.length < MAX_WALKERS) {
        walkers.push(createWalker());
        sinceSpawn -= startInterval;
      }
    }
    ctx.clearRect(0, 0, width, height);
    for (const walker of walkers)
      walker.advance(seconds);
    collide(walkers);
    // once every one is up off the starting lines, anyone may know (the flyer waits for this before putting an address right)
    if (!allUp && walkers.every((w) => w.isUp())) {
      allUp = true;
      window.dispatchEvent(new Event("all-nightcrawlers-started"));
    }
    if (left) {
      for (const walker of walkers.filter((w) => w.isGone()))
        walkers.splice(walkers.indexOf(walker), 1);
      if (!walkers.length) {
        stop();
        left();
        return;
      }
    }
    const origin = { x: originX, y: height / 2 };
    const poses = walkers.map((walker) => walker.pose());
    poses.sort((a, b) => a.mid.x + a.mid.y - (b.mid.x + b.mid.y));
    shadowCtx.clearRect(0, 0, width, height);
    for (const pose of poses)
      drawShadow(shadowCtx, pose, origin);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.drawImage(shadows, 0, 0);
    ctx.restore();
    for (const pose of poses) {
      drawSkeleton(ctx, pose, { ...origin, showSkeleton: SHOW_SKELETON });
    }
    monitor.frameEnd();
    frameId = requestAnimationFrame(frame);
  }
  var frameId = requestAnimationFrame(frame);
  var left = null, leftAll = null;     // once they are leaving: called when the last has gone
  var allUp = false;
  function stop() {
    cancelAnimationFrame(frameId);
    stopping.abort();
    canvas.remove();
  }
  return {
    stop,
    allStarted: () => allUp,     // as "all-nightcrawlers-started" says, for anyone who missed it
    // they all walk off the canvas, and then it is taken away; resolves when they have gone
    leave() {
      if (!leftAll) {
        leftAll = new Promise((resolve) => { left = resolve; });
        for (const walker of walkers)
          walker.leave();
      }
      return leftAll;
    }
  };
}
