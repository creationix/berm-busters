// Race simulation. No graphics in here: it advances in fixed 1/60 s ticks and can be
// stepped by a test script. Racers live in trail coordinates (see track.js):
// s along the trail, d sideways, th = heading relative to the trail direction.

import { EDGE } from './track.js';

export const TICK = 1 / 60;
export const V_MAX = 30;          // m/s top speed on the flat
const W_MAX = 1.9;                // rad/s steering rate at speed
const GRAV = 24;                  // arcade gravity
const G_SLOPE = 6;                // how much hills speed you up / slow you down
const GRIP_GROUND = 7, GRIP_AIR = 1.2;
const TH_MAX = 1.1;               // you cannot turn round: no wrong-way driving
const BOOST_TIME = 1.3, BOOST_GAIN = 1.32;
const FALL_TIME = 1.0, RESPAWN_DELAY = 1.5, INVULN_TIME = 2.0;
const SAFE_MARGIN = 0.9;          // safety field keeps protected riders this far inside the edge
const ROUGH_WIDTH = 5;            // how far Daredevils can stray into the forest

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const ASSIST = { off: 0, some: 0.45, lots: 0.8 };

export class Race {
  // entries: [{ name, character, human, daredevil, assist (0..1), autoGo, skill }]
  constructor(track, entries, opts = {}) {
    this.track = track;
    this.laps = opts.laps || track.laps;
    this.rng = mulberry32(opts.seed || 20261110);
    this.time = 0; this.tick = 0;
    this.state = 'countdown';
    this.countdown = opts.countdown != null ? opts.countdown : 3.6;
    this.lastCount = 4;
    this.events = [];
    this.finishCount = 0;
    this.endTimer = -1;
    const L = track.length;
    // Computer riders take the front rows so people get to overtake.
    const order = entries.map((e, i) => i).sort((a, b) => (entries[a].human ? 1 : 0) - (entries[b].human ? 1 : 0));
    this.racers = entries.map((e, i) => {
      const slot = order.indexOf(i), row = Math.floor(slot / 2), col = slot % 2;
      const s = L - 7 - row * 5.5 - col * 1.6;
      return {
        index: i, name: e.name, character: e.character, human: !!e.human,
        daredevil: !!e.daredevil, assist: e.assist != null ? e.assist : ASSIST.some, autoGo: e.autoGo !== false,
        skill: e.skill || 1, catchup: 1,
        s, d: col ? 2.3 : -2.3, th: 0, va: 0, v: 0, y: track.heightAt(s), vy: 0, air: false, airTime: 0,
        lapsDone: -1, progress: s - L, pos: slot + 1, finished: false, finishTime: 0, place: 0,
        boostT: 0, mode: 'drive', timer: 0, invuln: 0, offroad: false, safeS: s,
        steer: 0, throttle: 0, lane: (this.rng() - 0.5) * 0.9, laneT: 2 + this.rng() * 3,
        scrapeT: 0, bumpT: 0, shieldT: 0, shieldSide: 0, landT: 0,
        wx: 0, wy: 0, wz: 0, wvx: 0, wvy: 0, wvz: 0, wpsi: 0, spin: 0,
      };
    });
    this.rank();
  }

  emit(type, r, extra) { this.events.push(Object.assign({ type, r: r ? r.index : -1 }, extra)); }

  // inputs: array indexed by racer, each { steer, throttle, brake } (missing = no input).
  step(inputs = []) {
    this.events.length = 0;
    this.tick++;
    if (this.state === 'countdown') {
      this.countdown -= TICK;
      const c = Math.ceil(this.countdown);
      if (c < this.lastCount && c >= 1 && c <= 3) this.emit('count', null, { n: c });
      this.lastCount = c;
      if (this.countdown <= 0) { this.state = 'racing'; this.emit('go', null); }
      return;
    }
    if (this.state === 'finished') return;
    this.time += TICK;
    for (const r of this.racers) this.stepRacer(r, inputs[r.index]);
    this.collide();
    this.rank();
    const humans = this.racers.filter(r => r.human);
    const done = humans.length ? humans.every(r => r.finished) : this.finishCount >= Math.min(3, this.racers.length);
    if (done && this.endTimer < 0) this.endTimer = 3;
    if (this.endTimer >= 0) {
      this.endTimer -= TICK;
      if (this.endTimer <= 0) {
        // Everyone still out on the trail is placed in running order.
        for (const r of this.order) if (!r.finished) { r.finished = true; r.place = ++this.finishCount; r.finishTime = 0; }
        this.state = 'finished';
        this.emit('raceover', null);
      }
    }
  }

  rank() {
    const order = this.racers.slice().sort((a, b) => {
      if (a.finished || b.finished) {
        if (a.finished && b.finished) return a.place - b.place;
        return a.finished ? -1 : 1;
      }
      return b.progress - a.progress;
    });
    this.order = order;
    let lead = null;
    for (const r of order) if (r.human && !r.finished) { lead = r; break; }
    order.forEach((r, i) => {
      r.pos = i + 1;
      if (r.human) r.catchup = 1 + 0.012 * i;                       // a quiet helping hand at the back
      else if (lead) r.catchup = clamp(1 - (r.progress - lead.progress) / 900, 0.92, 1.06);
      else r.catchup = 1;
    });
  }

  ai(r) {
    const t = this.track;
    r.laneT -= TICK;
    if (r.laneT <= 0) { r.lane = (this.rng() - 0.5) * 1.1; r.laneT = 3 + this.rng() * 4; }
    const hw = t.halfWidthAt(r.s);
    const k = t.kappaAt(r.s), kAhead = t.kappaAt(r.s + 14);
    let dT = r.lane * (hw - 2) + clamp(kAhead * 60, -1, 1) * (hw - 2.2) * 0.6;   // drift to the inside of the next bend
    for (const o of this.racers) {
      if (o === r || o.mode !== 'drive') continue;
      const ahead = t.deltaS(o.s, r.s);
      if (ahead > 0 && ahead < 13 && Math.abs(o.d - r.d) < 2.3) dT += (r.d >= o.d ? 1 : -1) * 2.6;
    }
    dT = clamp(dT, -(hw - 1.8), hw - 1.8);
    const thT = clamp((dT - r.d) * 0.11, -0.4, 0.4);
    const sdot = r.v * Math.cos(r.va) / Math.max(0.3, 1 - r.d * k);
    const want = k * sdot + (thT - r.th) * 3.2;
    const speedF = clamp(r.v / 8, 0.3, 1);
    const steer = clamp(want / (W_MAX * speedF), -1, 1);
    const vCorner = (W_MAX * 0.85) / Math.max(Math.abs(kAhead), Math.abs(k), 1e-4);
    return { steer, throttle: r.v > vCorner ? 0 : 1, brake: 0 };
  }

  stepRacer(r, inp) {
    const t = this.track, L = t.length, dt = TICK;
    if (r.mode === 'dead') {
      r.timer -= dt;
      if (r.timer <= 0) this.respawn(r);
      return;
    }
    if (r.mode === 'fall') {
      r.wvy -= GRAV * dt;
      r.wx += r.wvx * dt; r.wy += r.wvy * dt; r.wz += r.wvz * dt;
      r.wvx *= 0.985; r.wvz *= 0.985; r.spin += dt * 7;
      r.timer -= dt;
      if (r.timer <= 0 || r.wy < r.fallFloor) {
        r.mode = 'dead'; r.timer = RESPAWN_DELAY; r.v = 0;
        this.emit('explode', r, { x: r.wx, y: r.wy, z: r.wz });
      }
      return;
    }
    r.invuln = Math.max(0, r.invuln - dt);
    r.scrapeT = Math.max(0, r.scrapeT - dt); r.bumpT = Math.max(0, r.bumpT - dt);
    r.shieldT = Math.max(0, r.shieldT - dt); r.landT = Math.max(0, r.landT - dt);

    let steer = 0, throttle = 0, brake = 0;
    if (!r.human || r.finished) ({ steer, throttle, brake } = this.ai(r));
    else if (inp) {
      steer = clamp(inp.steer || 0, -1, 1);
      brake = clamp(inp.brake || 0, 0, 1);
      throttle = r.autoGo ? 1 : clamp(inp.throttle || 0, 0, 1);
      if (brake > 0.1) throttle = 0;
    } else if (r.autoGo) throttle = 1;
    r.steer += (steer - r.steer) * 0.3;
    r.throttle = throttle;

    const k = t.kappaAt(r.s), hw = t.halfWidthAt(r.s);

    // --- speed ---
    let vmax = V_MAX * r.skill * r.catchup;
    if (r.finished) vmax *= 0.6;
    const boosting = r.boostT > 0;
    if (boosting) { r.boostT -= dt; vmax *= BOOST_GAIN; }
    if (r.offroad) vmax *= 0.5;
    if (brake > 0.1) r.v = Math.max(0, r.v - 34 * brake * dt);
    else if (!r.air) {
      const target = throttle * vmax;
      const rate = r.v < target ? (boosting ? 3.2 : 0.95) : (r.offroad ? 2.5 : 0.8);
      r.v += (target - r.v) * (1 - Math.exp(-rate * dt));
      const slope = (t.baseHeightAt(r.s + 1.5) - t.baseHeightAt(r.s - 1.5)) / 3;
      r.v -= G_SLOPE * slope * dt;
      if (throttle > 0.5 && r.v < 5) r.v = Math.min(5, r.v + 12 * dt);   // nobody stalls on a climb
    }
    r.v = Math.max(0, r.v);

    // --- steering ---
    const speedF = clamp(r.v / 8, 0.3, 1);
    let w = steer * W_MAX * speedF * (r.air ? 0.3 : 1);
    const sdot0 = r.v * Math.cos(r.va) / Math.max(0.3, 1 - r.d * k);
    if (r.human && !r.finished && r.assist > 0 && !r.air) {
      // Steering help: take part of each bend for the rider and ease back toward the middle when they let go.
      w += r.assist * k * sdot0;
      const free = 1 - Math.min(1, Math.abs(steer) * 1.5);
      const thT = clamp(-(r.d / hw) * 0.3, -0.3, 0.3);
      w += (thT - r.th) * 2.2 * r.assist * free;
    }
    r.th += w * dt - k * sdot0 * dt;
    r.th = clamp(r.th, -TH_MAX, TH_MAX);
    r.va -= k * sdot0 * dt;
    r.va += (r.th - r.va) * (1 - Math.exp(-(r.air ? GRIP_AIR : GRIP_GROUND) * dt));
    r.va = clamp(r.va, -TH_MAX, TH_MAX);

    // --- move ---
    const groundBefore = t.heightAt(r.s);
    const sdot = r.v * Math.cos(r.va) / Math.max(0.3, 1 - r.d * k);
    r.s += sdot * dt;
    r.d += r.v * Math.sin(r.va) * dt;
    if (r.s >= L) {
      r.s -= L; r.lapsDone++;
      if (r.lapsDone >= this.laps && !r.finished) {
        r.finished = true; r.finishTime = this.time; r.place = ++this.finishCount;
        this.emit('finish', r, { place: r.place });
      } else if (r.lapsDone > 0) this.emit('lap', r, { lap: r.lapsDone + 1 });
    }
    r.progress = r.lapsDone * L + r.s;

    // --- hills, ramps and air ---
    const ground = t.heightAt(r.s);
    const vyGround = (ground - groundBefore) / dt;
    if (!r.air) {
      // If the ground drops away faster than gravity can follow, we are flying.
      if (vyGround < r.vy - GRAV * dt - 1.2 && r.v > 6) {
        r.air = true; r.airTime = 0;
        r.y = groundBefore + r.vy * dt;
        if (r.y < ground) { r.air = false; r.y = ground; r.vy = vyGround; }
      } else { r.vy = vyGround; r.y = ground; }
    } else {
      r.airTime += dt;
      r.vy -= GRAV * dt;
      r.y += r.vy * dt;
      if (r.y <= ground) {
        r.air = false; r.y = ground;
        if (r.airTime > 0.25) { r.landT = 0.35; this.emit('land', r, { airTime: r.airTime }); }
        r.vy = vyGround;
      }
    }

    // --- edges ---
    r.offroad = false;
    const side = r.d < 0 ? -1 : 1;
    const edge = t.edgeAt(r.s, side);
    const ad = Math.abs(r.d);
    if (!r.daredevil) {
      if (ad > hw - SAFE_MARGIN) this.slide(r, side, hw - SAFE_MARGIN, 0.994, edge !== EDGE.WALL);
    } else if (edge === EDGE.WALL) {
      if (ad > hw - 0.7) this.slide(r, side, hw - 0.7, 0.985, false);
    } else if (edge === EDGE.CLIFF) {
      if (ad > hw + 0.3) { this.startFall(r, side); return; }
    } else {
      if (ad > hw + 0.2 && !r.air) r.offroad = true;
      if (ad > hw + ROUGH_WIDTH) this.slide(r, side, hw + ROUGH_WIDTH, 0.97, false);
    }
    if (!r.air && ad <= hw) r.safeS = r.s;

    // --- boost pads ---
    if (!r.air && r.boostT < 0.5 && t.boostAt(r.s, r.d)) { r.boostT = BOOST_TIME; this.emit('boost', r); }
  }

  // Keep a racer inside a sideways limit, turning them back along the trail instead of stopping them.
  slide(r, side, limit, keep, shield) {
    r.d = side * limit;
    if (r.th * side > -0.06) r.th = -side * 0.06;
    if (r.va * side > -0.03) r.va = -side * 0.03;
    r.v *= keep;
    if (shield) { r.shieldT = 0.3; r.shieldSide = side; }
    if (r.scrapeT <= 0) { r.scrapeT = 0.25; this.emit(shield ? 'shield' : 'scrape', r, { side }); }
  }

  startFall(r, side) {
    const t = this.track;
    const w = t.toWorld(r.s, r.d);
    const h = w.psi + r.va;
    r.wx = w.x; r.wz = w.z; r.wy = Math.max(r.y, w.y);
    r.wvx = Math.cos(h) * r.v - Math.sin(w.psi) * side * 3;
    r.wvz = Math.sin(h) * r.v + Math.cos(w.psi) * side * 3;
    r.wvy = Math.min(r.vy, 2);
    r.wpsi = w.psi + r.th; r.spin = 0;
    r.fallFloor = r.wy - 14;
    r.mode = 'fall'; r.timer = FALL_TIME; r.air = false; r.boostT = 0;
    this.emit('fall', r);
  }

  respawn(r) {
    const t = this.track;
    r.s = r.safeS > 6.5 ? r.safeS - 6 : r.safeS;     // never back across the start line
    r.d = 0; r.th = 0; r.va = 0; r.v = 6; r.vy = 0; r.air = false;
    r.y = t.heightAt(r.s);
    r.progress = r.lapsDone * t.length + r.s;
    r.mode = 'drive'; r.invuln = INVULN_TIME; r.offroad = false;
    this.emit('respawn', r);
  }

  collide() {
    const t = this.track, rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.mode !== 'drive' || a.invuln > 0) continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.mode !== 'drive' || b.invuln > 0) continue;
        const ds = t.deltaS(a.s, b.s), dd = a.d - b.d;
        if (Math.abs(ds) > 2.8 || Math.abs(dd) > 1.8 || Math.abs(a.y - b.y) > 1.5) continue;
        const push = (1.8 - Math.abs(dd)) * 0.5 + 0.02;
        const dir = dd >= 0 ? 1 : -1;
        a.d += dir * push; b.d -= dir * push;
        a.th += dir * 0.04; b.th -= dir * 0.04;
        const front = ds > 0 ? a : b, back = ds > 0 ? b : a;
        if (back.v > front.v) { const dv = (back.v - front.v) * 0.5; back.v -= dv * 0.6; front.v += dv * 0.4; }
        if (a.bumpT <= 0 && b.bumpT <= 0) { a.bumpT = b.bumpT = 0.4; this.emit('bump', a, { other: b.index }); }
      }
    }
  }

  // Where to draw a racer: world position, heading, pitch and roll.
  pose(r, out = {}) {
    const t = this.track;
    if (r.mode === 'fall' || r.mode === 'dead') {
      out.x = r.wx; out.y = r.wy; out.z = r.wz; out.heading = r.wpsi + r.spin * 0.6; out.pitch = -r.spin * 0.8; out.roll = r.spin;
      out.visible = r.mode === 'fall';
      return out;
    }
    const w = t.toWorld(r.s, r.d, out);
    const bank = t.bankAt(r.s);
    out.y = r.y - r.d * Math.sin(bank);
    out.heading = w.psi + r.th;
    out.psi = w.psi;
    const slope = (t.heightAt(r.s + 1.2) - t.heightAt(r.s - 1.2)) / 2.4;
    out.pitch = r.air ? Math.atan2(r.vy, Math.max(8, r.v)) * 0.7 : Math.atan(slope);
    out.roll = (r.air ? 0 : bank) + r.steer * 0.32;
    out.visible = true;
    return out;
  }
}
