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
const BASH_REACH_S = 3.6, BASH_REACH_D = 4.4;   // how close (along / across the trail) a ship must be to get shoved
const KNOCK_SPEED = 11;           // sideways shove, m/s, fading over about half a second
const KNOCK_TIME = 0.9;           // while shoved, nothing holds you on the trail: not even the safety field

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

// ---------- eggs ----------
// A storm has washed eggs out of their nests along the trail. Riders scoop them up by driving
// through them and carry them home; the ones still on board at the finish get to hatch.
export const EGG = { COMMON: 0, AIR: 1, EDGE: 2, GOLD: 3 };
export const MAX_EGGS = 6;         // how many a ship can carry
const EGG_RESPAWN = 25;           // seconds before a scooped egg is replaced
const LOOSE_EGG_TIME = 12;        // dropped eggs lie on the trail this long
const eggPower = tier => 1 + tier * 0.4;  // trail < sky < cliff < golden: more reach and knockback

function layEggs(track, rng) {
  const eggs = [], L = track.length;
  const add = (s, d, h, tier) => eggs.push({ s: track.wrapS(s), d, h, tier, alive: true, timer: 0, loose: false });
  // Ordinary eggs: one every 85 m or so, wandering from side to side.
  const n = Math.round(L / 85);
  for (let k = 0; k < n; k++) {
    const s = 26 + (k + rng() * 0.5) * (L - 30) / n, hw = track.halfWidthAt(s);
    add(s, (rng() * 2 - 1) * (hw - 2.6), 0.9, EGG.COMMON);
  }
  // Sky eggs: hanging in the air after each ramp, for anyone who takes it at speed.
  for (const rp of track.ramps) {
    if (rp.type === 'kicker') {
      // placed along the arc a ship flies at a good speed
      const v = 27, slope = 2 * rp.h / rp.len;
      for (const [x, d] of [[8, -1.2], [15, 1.2]]) { const tt = x / v; add(rp.s + x, d, Math.max(1.8, rp.h + slope * v * tt - GRAV / 2 * tt * tt + 0.9), EGG.AIR); }
    } else add(rp.s + 5, 0, 2.4, EGG.AIR);
  }
  // Cliff eggs: just beyond an open edge, out of reach of the safety field. Daredevils only.
  let since = 99;
  for (let i = 0; i < track.N; i += 2) {
    const s = i * track.step; since += 2 * track.step;
    for (const side of [-1, 1]) {
      if (track.edgeAt(s, side) !== EDGE.CLIFF || since < 48) continue;
      if (track.edgeAt(s - 12, side) !== EDGE.CLIFF || track.edgeAt(s + 12, side) !== EDGE.CLIFF) continue;
      add(s, side * (track.halfWidthAt(s) + 0.6), 0.9, EGG.EDGE); since = 0;
    }
  }
  return eggs;
}

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
    // How often computer riders bash people (per second of opportunity). They always scrap among themselves.
    this.aiBashHumans = opts.aiBashHumans != null ? opts.aiBashHumans : 0.5;
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
        s, d: col ? 2.3 : -2.3, th: 0, va: 0, v: 0, y: track.groundAt(s, col ? 2.3 : -2.3), vy: 0, air: false, airTime: 0,
        lapsDone: -1, progress: s - L, pos: slot + 1, finished: false, finishTime: 0, place: 0,
        boostT: 0, mode: 'drive', timer: 0, invuln: 0, offroad: false, safeS: s,
        route: null, safeRoute: null, routeChoices: {}, boostHeld: false, boostCharge: 0.35, drifting: false, driftT: 0,
        steer: 0, throttle: 0, lane: (this.rng() - 0.5) * 0.9, laneT: 2 + this.rng() * 3,
        scrapeT: 0, bumpT: 0, shieldT: 0, shieldSide: 0, landT: 0,
        bashHeld: false, kv: 0, knockT: 0, knockedBy: -1, kos: 0, koBy: {}, wipeouts: 0,
        eggs: [], rescued: null, eggsLost: 0, eggsStolen: 0,
        wx: 0, wy: 0, wz: 0, wvx: 0, wvy: 0, wvz: 0, wpsi: 0, spin: 0,
      };
    });
    this.eggs = opts.eggs === false ? [] : layEggs(track, this.rng);
    if (opts.eggs !== false) for (const b of track.branches) for (const f of [0.3, 0.65]) {
      this.eggs.push({ s: b.fromS + (b.toS - b.fromS) * f, d: 0, h: 0.9, tier: b.hidden ? EGG.GOLD : EGG.AIR,
        route: b.id, hidden: !!b.hidden, alive: true, timer: 0, loose: false });
    }
    this.rank();
  }

  path(r) { return this.track.path(r.route); }

  separation(a, b) {
    const p = this.path(a).toWorld(a.s, a.d), q = this.path(b).toWorld(b.s, b.d);
    const x = q.x - p.x, z = q.z - p.z;
    return { ds: x * Math.cos(p.psi) + z * Math.sin(p.psi), dd: x * -Math.sin(p.psi) + z * Math.cos(p.psi) };
  }

  // Keep the main lap coordinate for ranking, but travel each branch at its physical length.
  syncRoute(r, steer = 0, enter = true) {
    const old = this.path(r);
    if (r.route) {
      if (r.s < old.toS) return;
      r.route = null;
    } else if (enter && !r.finished && !r.air) {
      const b = this.track.branches.find(b => {
        const ahead = b.fromS - r.s;
        return ahead >= 0 && ahead <= Math.max(1, r.v * TICK * 1.5) &&
          (r.human ? b.hidden ? r.d * b.side > this.track.halfWidthAt(r.s) - 1.8 : steer * b.side > 0.2 || r.d * b.side > 1.3 : r.routeChoices[`${r.lapsDone}:${b.id}`]);
      });
      if (!b) return;
      r.route = b.id; r.s = b.fromS;
      this.emit('route', r, { name: b.name, hidden: !!b.hidden });
    } else return;
    const angle = old.psiAt(r.s) - this.path(r).psiAt(r.s);
    const delta = Math.atan2(Math.sin(angle), Math.cos(angle));
    r.th = clamp(r.th + delta, -TH_MAX, TH_MAX); r.va = clamp(r.va + delta, -TH_MAX, TH_MAX);
  }

  // ----- eggs -----
  stepEggs() {
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      if (e.loose) { e.timer -= TICK; if (e.timer <= 0) this.eggs.splice(i, 1); }
      else if (!e.alive) { e.timer -= TICK; if (e.timer <= 0) e.alive = true; }
    }
  }
  // Scoop up any egg the ship is passing through.
  scoop(r) {
    if (r.eggs.length >= MAX_EGGS) return;
    const t = this.path(r), w = t.toWorld(r.s, r.d);
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      if (!e.alive) continue;
      const p = this.track.path(e.route).toWorld(e.s, e.d);
      if (Math.hypot(p.x - w.x, p.z - w.z) > 2.1 || Math.abs(r.y + 0.9 - p.y - e.h) > 1.3) continue;
      r.eggs.push(e.tier);
      const stolen = e.loose && e.from !== r.index;
      if (stolen) r.eggsStolen++;
      if (e.loose) this.eggs.splice(i, 1); else { e.alive = false; e.timer = EGG_RESPAWN; }
      this.emit('egg', r, { tier: e.tier, count: r.eggs.length, stolen });
      if (r.eggs.length >= MAX_EGGS) return;
    }
  }
  // Knocked off or fallen: some of the eggs spill onto the trail for anyone to grab.
  dropEggs(r, n) {
    n = Math.min(n, r.eggs.length);
    if (!n) return;
    const t = this.track.path(r.safeRoute);
    for (let i = 0; i < n; i++) {
      const s = t.wrapS(r.safeS + 5 + i * 3.5), route = r.safeRoute && s <= t.toS ? r.safeRoute : null;
      const hw = this.track.path(route).halfWidthAt(s);
      this.eggs.push({ s, route, d: (i % 2 ? 1 : -1) * (0.8 + this.rng() * Math.max(0, hw - 3.6)), h: 0.9, tier: r.eggs.pop(), alive: true, loose: true, timer: LOOSE_EGG_TIME, from: r.index });
    }
    r.eggsLost += n;
    this.emit('eggdrop', r, { n });
  }

  emit(type, r, extra) { this.events.push(Object.assign({ type, r: r ? r.index : -1 }, extra)); }

  // inputs: array indexed by racer, each { steer, throttle, brake, bash } (missing = no input).
  step(inputs = []) {
    this.events.length = 0;
    this.tick++;
    // Remember where everyone was, so the display can blend between steps (see pose).
    for (const r of this.racers) { r.proute = r.route; r.ps = r.s; r.pd = r.d; r.pth = r.th; r.py = r.y; r.psteer = r.steer; r.pmode = r.mode; r.pwx = r.wx; r.pwy = r.wy; r.pwz = r.wz; r.pspin = r.spin; }
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
    this.stepEggs();
    for (const r of this.racers) this.stepRacer(r, inputs[r.index]);
    this.collide();
    for (const r of this.racers) if (r.mode === 'drive') r.y = Math.max(r.y, this.path(r).groundAt(r.s, r.d));
    this.rank();
    const humans = this.racers.filter(r => r.human);
    const done = humans.length ? humans.every(r => r.finished) : this.finishCount >= Math.min(3, this.racers.length);
    if (done && this.endTimer < 0) this.endTimer = 3;
    if (this.endTimer >= 0) {
      this.endTimer -= TICK;
      if (this.endTimer <= 0) {
        // Everyone still out on the trail is placed in running order.
        for (const r of this.order) if (!r.finished) { r.finished = true; r.place = ++this.finishCount; r.finishTime = 0; r.rescued = r.eggs.slice(); }
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
    const t = this.path(r), scale = t.speedScale(r.s);
    r.laneT -= TICK;
    if (r.laneT <= 0) { r.lane = (this.rng() - 0.5) * 1.1; r.laneT = 3 + this.rng() * 4; }
    const hw = t.halfWidthAt(r.s);
    const k = t.kappaAt(r.s), kAhead = t.kappaAt(r.s + 14 * scale);
    let dT = r.lane * (hw - 2) + clamp(kAhead * 60, -1, 1) * (hw - 2.2) * 0.6;   // drift to the inside of the next bend
    for (const o of this.racers) {
      if (o === r || o.mode !== 'drive') continue;
      const { ds, dd } = this.separation(r, o);
      if (ds > 0 && ds < 13 && Math.abs(dd) < 2.3) dT += (dd <= 0 ? 1 : -1) * 2.6;
    }
    if (!r.route) for (const b of this.track.branches) if (b.fromS - r.s > 0 && b.fromS - r.s < 24) {
      const key = `${r.lapsDone}:${b.id}`;
      if (!(key in r.routeChoices)) r.routeChoices[key] = this.rng() < (b.hidden ? 0.08 : 0.45);
      if (r.routeChoices[key]) dT = b.side * (hw - 1.5);
    }
    dT = clamp(dT, -(hw - 1.8), hw - 1.8);
    const thT = clamp((dT - r.d) * 0.11, -0.4, 0.4);
    const sdot = r.v * Math.cos(r.va) / Math.max(0.3, 1 - r.d * k);
    const want = k * sdot + (thT - r.th) * 3.2;
    const speedF = clamp(r.v / 8, 0.3, 1);
    const steer = clamp(want / (W_MAX * speedF), -1, 1);
    const vCorner = (W_MAX * 0.85) / Math.max(Math.abs(kAhead), Math.abs(k), 1e-4);
    return { steer, throttle: r.v > vCorner ? 0 : 1, brake: 0, bash: this.aiWantsBash(r, hw),
      drift: !r.route && Math.abs(steer) > 0.35 && Math.abs(k) > 0.008, boost: Math.abs(kAhead) < 0.006 && r.boostCharge > 0.65 };
  }

  // Computer riders bash when someone is alongside and close enough to an open edge to go over it.
  aiWantsBash(r, hw) {
    if (!r.eggs.length || r.finished || r.invuln > 0 || this.time < 4) return false;
    const t = this.track;
    const power = eggPower(Math.max(...r.eggs));
    for (const o of this.racers) {
      if (o === r || o.mode !== 'drive' || o.invuln > 0 || o.finished) continue;
      const { ds, dd } = this.separation(r, o);
      if (Math.abs(ds) > 2.8 * power || Math.abs(dd) < 0.6 || Math.abs(dd) > 3.6 * power || Math.abs(o.y - r.y) > 2.2 * power) continue;
      const dir = dd > 0 ? 1 : -1;
      if (this.path(o).edgeAt(o.s, dir) === EDGE.WALL || this.path(o).halfWidthAt(o.s) - dir * o.d > 3.4) continue;      // would not go over: save it
      const rate = o.human ? this.aiBashHumans : 0.9;
      if (this.rng() < rate * TICK) return true;
    }
    return false;
  }

  // Explode the best egg on board, shoving nearby ships away. No egg means no bash.
  bash(r) {
    if (!r.eggs.length || r.mode !== 'drive' || r.finished || r.invuln > 0) return;
    const t = this.track;
    const tier = Math.max(...r.eggs), power = eggPower(tier);
    r.eggs.splice(r.eggs.indexOf(tier), 1);
    let hits = 0;
    for (const o of this.racers) {
      if (o === r || o.mode !== 'drive' || o.invuln > 0 || o.finished) continue;
      if (!r.human && o.human && this.aiBashHumans <= 0) continue;    // on Easy, people are never caught in a computer rider's bash
      const { ds, dd } = this.separation(r, o);
      if (Math.abs(ds) > BASH_REACH_S * power || Math.abs(dd) > BASH_REACH_D * power || Math.abs(o.y - r.y) > 2.2 * power) continue;
      const dir = dd > 0 ? 1 : dd < 0 ? -1 : (o.index > r.index ? 1 : -1);
      o.kv = dir * KNOCK_SPEED * power; o.knockT = KNOCK_TIME; o.knockedBy = r.index;
      o.th = clamp(o.th + dir * 0.22, -TH_MAX, TH_MAX); o.v *= 0.92;
      r.kv -= dir * 2.5;                                                        // a little recoil
      hits++;
      this.emit('knocked', o, { by: r.index, side: dir });
    }
    this.emit('bash', r, { hits, tier, power });
  }

  stepRacer(r, inp) {
    let t = this.path(r);
    const L = this.track.length, dt = TICK;
    // Track presses even while falling or respawning: holding bash never spends more eggs.
    const bashDown = !!(inp && inp.bash), bashPress = bashDown && !r.bashHeld;
    r.bashHeld = bashDown;
    const boostDown = !!(inp && inp.boost), boostPress = boostDown && !r.boostHeld;
    r.boostHeld = boostDown;
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
      const land = this.track.getTerrain().heightAt(r.wx, r.wz);
      if (r.timer <= 0 || r.wy < r.fallFloor || r.wy <= land + 0.2) {
        r.wy = Math.max(r.wy, land + 0.2);
        r.mode = 'dead'; r.timer = RESPAWN_DELAY; r.v = 0;
        this.emit('explode', r, { x: r.wx, y: r.wy, z: r.wz });
      }
      return;
    }
    r.invuln = Math.max(0, r.invuln - dt);
    r.scrapeT = Math.max(0, r.scrapeT - dt); r.bumpT = Math.max(0, r.bumpT - dt);
    r.shieldT = Math.max(0, r.shieldT - dt); r.landT = Math.max(0, r.landT - dt);
    r.knockT = Math.max(0, r.knockT - dt);
    if (r.knockT <= 0) r.knockedBy = -1;

    let steer = 0, throttle = 0, brake = 0, bash = false, drift = false, boost = false;
    if (!r.human || r.finished) ({ steer, throttle, brake, bash, drift, boost } = this.ai(r));
    else if (inp) {
      bash = bashPress; drift = !!inp.drift; boost = boostPress;
      steer = clamp(inp.steer || 0, -1, 1);
      brake = clamp(inp.brake || 0, 0, 1);
      throttle = r.autoGo ? 1 : clamp(inp.throttle || 0, 0, 1);
      if (brake > 0.1) throttle = 0;
    } else if (r.autoGo) throttle = 1;
    if (r.knockT > 0) steer *= 0.35;                 // hard to steer while reeling from a shove
    r.steer += (steer - r.steer) * 0.3;
    r.throttle = throttle;
    if (bash) this.bash(r);

    this.syncRoute(r, steer); t = this.path(r);
    const scale = t.speedScale(r.s), k = t.kappaAt(r.s), hw = t.halfWidthAt(r.s);
    r.drifting = drift && Math.abs(steer) > 0.2 && r.v > 12 && !r.air && !r.offroad && r.invuln <= 0 && !r.finished;
    if (r.drifting) {
      r.driftT += dt;
      r.boostCharge = Math.min(1, r.boostCharge + dt * 0.42 * Math.abs(steer));
    } else r.driftT = 0;
    if (boost && r.boostCharge >= 0.25 && r.boostT <= 0 && !r.finished && r.invuln <= 0) {
      r.boostT = 0.6 + r.boostCharge * 1.4; r.boostCharge = 0;
      r.v = Math.max(r.v, V_MAX * 1.12); this.emit('boost', r, { manual: true });
    }

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
    r.va += (r.th - (r.drifting ? Math.sign(steer) * 0.28 : 0) - r.va) * (1 - Math.exp(-(r.air ? GRIP_AIR : r.drifting ? 3.2 : GRIP_GROUND) * dt));
    r.va = clamp(r.va, -TH_MAX, TH_MAX);

    // --- move ---
    const groundBefore = t.groundAt(r.s, r.d);
    const sdot = r.v * Math.cos(r.va) / Math.max(0.3, 1 - r.d * k);
    r.s += sdot * dt * scale;
    r.d += r.v * Math.sin(r.va) * dt + r.kv * dt;
    r.kv *= Math.exp(-4 * dt);
    if (r.s >= L) {
      r.s -= L; r.lapsDone++;
      if (r.lapsDone >= this.laps && !r.finished) {
        r.finished = true; r.finishTime = this.time; r.place = ++this.finishCount;
        r.rescued = r.eggs.slice();                  // every egg still on board at the line is safe
        this.emit('finish', r, { place: r.place });
      } else if (r.lapsDone > 0) this.emit('lap', r, { lap: r.lapsDone + 1 });
    }
    r.progress = r.lapsDone * L + r.s;

    // --- hills, ramps and air: y is always a physical world height, including the bank. ---
    this.syncRoute(r, 0, false); t = this.path(r);
    const ground = t.groundAt(r.s, r.d);
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
    if (r.knockT > 0 && edge !== EDGE.WALL && r.kv * side > 0.5) {
      // Shoved toward an open edge: nothing holds you. Over the edge means a wipeout for anyone.
      if (ad > hw + 0.2) { this.knockout(r, side, edge); return; }
    } else if (!r.daredevil) {
      if (ad > hw - SAFE_MARGIN) this.slide(r, side, hw - SAFE_MARGIN, 0.994, edge !== EDGE.WALL);
    } else if (edge === EDGE.WALL) {
      if (ad > hw - 0.7) this.slide(r, side, hw - 0.7, 0.985, false);
    } else if (edge === EDGE.CLIFF) {
      if (ad > hw + 0.3) { this.startFall(r, side); return; }
    } else {
      if (ad > hw + 0.2 && !r.air) r.offroad = true;
      if (ad > hw + ROUGH_WIDTH) this.slide(r, side, hw + ROUGH_WIDTH, 0.97, false);
    }
    if (!r.air && ad <= hw) { r.safeS = r.s; r.safeRoute = r.route; }
    r.y = Math.max(r.y, t.groundAt(r.s, r.d));
    // Landing cleanly and collecting boost pads also refill the reserve a little.
    if (!r.air && r.landT > 0.34) r.boostCharge = Math.min(1, r.boostCharge + 0.08);

    // --- boost pads ---
    if (!r.air && r.boostT < 0.5 && t.boostAt(r.s, r.d)) { r.boostT = BOOST_TIME; r.boostCharge = Math.min(1, r.boostCharge + 0.2); this.emit('boost', r); }

    if (!r.finished) this.scoop(r);
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

  // punted: knocked off by a bash, so they are flung up and out rather than just dropping.
  startFall(r, side, punted = false, cliff = true) {
    const t = this.path(r);
    r.drifting = false; r.driftT = 0;
    const w = t.toWorld(r.s, r.d);
    const h = w.psi + r.va;
    r.wx = w.x; r.wz = w.z; r.wy = Math.max(r.y, w.y);
    const out = punted ? 9 : 3;
    r.wvx = Math.cos(h) * r.v * (punted ? 0.7 : 1) - Math.sin(w.psi) * side * out;
    r.wvz = Math.sin(h) * r.v * (punted ? 0.7 : 1) + Math.cos(w.psi) * side * out;
    r.wvy = punted ? 8 : Math.min(r.vy, 2);
    r.wpsi = w.psi + r.th; r.spin = 0;
    r.fallFloor = r.wy - 14;
    r.mode = 'fall'; r.timer = punted && !cliff ? 0.72 : punted ? 1.25 : FALL_TIME; r.air = false; r.boostT = 0; r.kv = 0; r.knockT = 0;
    this.emit('fall', r, { by: punted ? r.knockedBy : -1 });
    if (!r.finished) this.dropEggs(r, punted ? 3 : 2);
  }

  // Knocked clean off the trail by another rider.
  knockout(r, side, edge) {
    const by = this.racers[r.knockedBy];
    if (by) { by.kos++; r.koBy[by.index] = (r.koBy[by.index] || 0) + 1; this.emit('knockout', by, { victim: r.index }); }
    r.wipeouts++; r.revenge = true;
    this.startFall(r, side, true, edge === EDGE.CLIFF);
  }

  respawn(r) {
    r.route = r.safeRoute;
    const t = this.path(r);
    r.s = r.safeS > 6.5 ? r.safeS - 6 : r.safeS;     // never back across the start line
    r.d = 0; r.th = 0; r.va = 0; r.v = 6; r.vy = 0; r.air = false;
    r.y = t.groundAt(r.s, r.d);
    r.progress = r.lapsDone * t.length + r.s;
    r.mode = 'drive'; r.invuln = INVULN_TIME; r.offroad = false;
    r.kv = 0; r.knockT = 0; r.knockedBy = -1;
    if (r.revenge) { r.revenge = false; r.v = 14; r.boostT = 1.6; }   // knocked off: come back with a boost
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
        const rel = this.separation(b, a), ds = rel.ds, dd = rel.dd;
        if (Math.abs(ds) > 2.8 || Math.abs(dd) > 1.8 || Math.abs(a.y - b.y) > 1.5) continue;
        // Ease ships apart over a few steps instead of snapping them sideways in one.
        const push = Math.min(0.11, (1.8 - Math.abs(dd)) * 0.5 + 0.02);
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
  // alpha (0..1) blends from the previous step to the current one: the screen redraws on its
  // own clock (60, 90 or 120 times a second), so drawing raw step positions makes ships judder.
  pose(r, out = {}, alpha = 1) {
    const t = this.path(r);
    // No blending across a teleport (falling off, respawning) or before the first step.
    const a = r.pmode === r.mode && r.proute === r.route && r.ps != null ? alpha : 1;
    if (r.mode === 'fall' || r.mode === 'dead') {
      const spin = r.pspin + (r.spin - r.pspin) * a;
      out.x = r.pwx + (r.wx - r.pwx) * a; out.y = r.pwy + (r.wy - r.pwy) * a; out.z = r.pwz + (r.wz - r.pwz) * a;
      out.heading = r.wpsi + spin * 0.6; out.pitch = -spin * 0.8; out.roll = spin;
      out.visible = r.mode === 'fall';
      return out;
    }
    let s = r.s, d = r.d, th = r.th, y = r.y, steer = r.steer;
    if (a < 1) {
      s = t.wrapS(r.ps + t.deltaS(r.s, r.ps) * a);
      d = r.pd + (r.d - r.pd) * a; th = r.pth + (r.th - r.pth) * a; y = r.py + (r.y - r.py) * a; steer = r.psteer + (r.steer - r.psteer) * a;
    }
    const w = t.toWorld(s, d, out);
    const bank = t.bankAt(s);
    out.s = s; out.d = d; out.th = th; out.steer = steer;
    out.ground = t.groundAt(s, d);                       // trail surface height under the ship
    out.y = Math.max(y, out.ground);
    out.heading = w.psi + th;
    out.psi = w.psi;
    const ds = 1.2 * t.speedScale(s);
    const slope = (t.groundAt(s + ds, d) - t.groundAt(s - ds, d)) / 2.4;
    out.pitch = r.air ? Math.atan2(r.vy, Math.max(8, r.v)) * 0.7 : Math.atan(slope);
    out.roll = (r.air ? 0 : bank) + steer * 0.32;
    if (r.knockT > 0) out.roll += Math.sin(r.knockT * 22) * 0.55 * r.knockT;   // wobble while reeling from a shove
    out.visible = true;
    return out;
  }
}
