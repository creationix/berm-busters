import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, EDGE } from '../js/track.js';
import { COURSES, FOSSIL_FLATS, PINE_HOLLOW } from '../js/courses.js';
import { Race, TICK, V_MAX, EGG } from '../js/sim.js';
import { PlayerInput } from '../js/input.js';

const tracks = COURSES.map(buildTrack);
function riderOn(track = tracks[0], props = {}) {
  const race = new Race(track, [{ human: true, assist: 0, autoGo: true, daredevil: true }], { eggs: false });
  race.state = 'racing';
  const r = race.racers[0];
  Object.assign(r, { s: 65, d: 0, v: 22, lapsDone: 0, boostCharge: 0 }, props);
  r.y = race.path(r).groundAt(r.s, r.d);
  return { race, r };
}

test('drifting changes grip, charges boost and allows a deliberate burst of speed', () => {
  const { race, r } = riderOn();
  let slip = 0;
  for (let i = 0; i < 90; i++) { race.step([{ steer: 0.7, drift: true }]); if (r.drifting) slip = Math.max(slip, Math.abs(r.th - r.va)); }
  assert.ok(r.boostCharge >= 0.25);
  assert.ok(slip > 0.1);
  race.step([{ boost: true }]);
  assert.equal(r.boostCharge, 0);
  assert.ok(r.boostT > 0);
  assert.ok(r.v > V_MAX);
  assert.ok(race.events.some(e => e.type === 'boost' && e.manual));
});

test('no drift charge from stationary, straight, airborne or off-road button holding', () => {
  for (const props of [{ v: 0 }, {}, { air: true, y: 20 }, { offroad: true }]) {
    const { race, r } = riderOn(tracks[0], props);
    if (props.air) r.y += 20;
    race.step([{ drift: true, steer: Object.keys(props).length ? 0.8 : 0 }]);
    assert.equal(r.boostCharge, 0);
  }
});

test('boost cannot be fired empty or repeatedly by holding the button', () => {
  const { race, r } = riderOn(tracks[0], { v: 0 });
  race.step([{ boost: true }]);
  assert.equal(r.boostT, 0);
  r.boostCharge = 1;
  race.step([{ boost: true }]);
  assert.equal(r.boostT, 0);
  race.step([{ boost: false }]);
  race.step([{ boost: true }]);
  assert.ok(r.boostT > 1);
  assert.equal(r.boostCharge, 0);
});

test('controller boost and drift are separate from egg bash', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { index: 0, connected: true, axes: [0.8, 0], buttons };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  const input = new PlayerInput({ gamepad: 'any' });
  const { race, r } = riderOn(tracks[0], { eggs: [EGG.GOLD], boostCharge: 1 });
  buttons[3].pressed = true;
  race.step([input.read(TICK)]);
  assert.ok(r.boostT > 0);
  assert.deepEqual(r.eggs, [EGG.GOLD]);
  buttons[3].pressed = false; buttons[4].pressed = true;
  const drift = input.read(TICK);
  assert.equal(drift.drift, true); assert.equal(drift.bash, false);
  buttons[4].pressed = false; buttons[2].pressed = true;
  race.step([input.read(TICK)]);
  assert.deepEqual(r.eggs, []);
});

for (const track of tracks) {
  test(`${track.name}: leaving the inside of a bank follows the terrain instead of going underground`, () => {
    let s = 0, bank = 0;
    for (let i = 0; i < track.N; i++) {
      const side = Math.sign(track.BANK[i]);
      if (track.edgeAt(i * track.step, side) === EDGE.FOREST && Math.abs(track.BANK[i]) > Math.abs(bank)) { s = i * track.step; bank = track.BANK[i]; }
    }
    assert.ok(Math.abs(bank) > 0.03);
    const side = Math.sign(bank), { race, r } = riderOn(track, { s, d: side * (track.halfWidthAt(s) + 2), th: side * 0.5, va: side * 0.5 });
    for (let i = 0; i < 90; i++) {
      race.step([{ steer: side * 0.5 }]);
      if (r.mode !== 'drive') continue;
      const w = race.path(r).toWorld(r.s, r.d), land = track.getTerrain().heightAt(w.x, w.z);
      assert.ok(r.y >= land - 1e-6);
      for (const alpha of [0, 0.5, 1]) {
        const p = race.pose(r, {}, alpha);
        assert.ok(p.y >= track.getTerrain().heightAt(p.x, p.z) - 1e-6);
      }
    }
  });
  for (const branch of track.branches) {
    test(`${branch.name}: enter, drive the physical path, rejoin and preserve lap progress`, () => {
      const { race, r } = riderOn(track, { human: false, s: branch.fromS - 0.5, d: branch.side * 3 });
      r.routeChoices[`0:${branch.id}`] = true;
      let entered = false, exited = false, maxDelta = 0, last = r.s;
      for (let i = 0; i < 30 / TICK; i++) {
        race.step();
        maxDelta = Math.max(maxDelta, r.s - last); last = r.s;
        if (r.route === branch.id) entered = true;
        if (entered && !r.route && r.s >= branch.toS) { exited = true; break; }
      }
      assert.ok(entered && exited);
      assert.equal(r.lapsDone, 0);
      assert.equal(r.wipeouts, 0);
      assert.ok(maxDelta < 2);
      if (branch.hidden) assert.ok(branch.geometry.length < branch.toS - branch.fromS);
    });
  }
}

test('figure-eight crossing has separate heights, no collisions and no skipped lap progress', () => {
  const t = tracks.find(t => t.course === PINE_HOLLOW), low = t.sOfU(4), high = t.sOfU(12);
  const a = t.toWorld(low, 0), b = t.toWorld(high, 0);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 2);
  assert.ok(b.y - a.y > 12);
  const { race, r } = riderOn(t, { s: low, v: 0 });
  const original = r.progress;
  race.step([{}]);
  assert.ok(r.s < high - 100);
  assert.equal(r.lapsDone, 0);
  assert.ok(r.y < b.y - 10);
  assert.ok(Number.isFinite(original));
  const pair = new Race(t, [{ human: true }, { human: true }], { eggs: false });
  Object.assign(pair.racers[0], { s: low, d: 0, y: t.groundAt(low, 0), eggs: [EGG.GOLD] });
  Object.assign(pair.racers[1], { s: high, d: 0, y: t.groundAt(high, 0) });
  pair.bash(pair.racers[0]); pair.collide();
  assert.equal(pair.events.find(e => e.type === 'bash').hits, 0);
  assert.ok(!pair.events.some(e => e.type === 'bump'));
});

test('hidden cuts require deliberately choosing the edge; following the normal line does not reveal them', () => {
  const t = tracks[0], b = t.branches.find(b => b.hidden);
  const { race, r } = riderOn(t, { s: b.fromS - 0.5, d: 0 });
  race.step([{ steer: b.side }]);
  assert.equal(r.route, null);
  Object.assign(r, { s: b.fromS - 0.5, d: b.side * (t.halfWidthAt(b.fromS) - 1.5), air: false });
  r.y = t.groundAt(r.s, r.d);
  race.step([{ steer: b.side }]);
  assert.equal(r.route, b.id);
});

test('falling on a branch spills eggs there and respawns on the same branch without gaining a lap', () => {
  const t = tracks.at(-1), b = t.branches[0], s = (b.fromS + b.toS) / 2;
  const { race, r } = riderOn(t, { route: b.id, safeRoute: b.id, s, safeS: s, eggs: [EGG.GOLD, EGG.AIR, EGG.COMMON] });
  race.startFall(r, 1);
  assert.equal(r.eggs.length, 1);
  assert.ok(race.eggs.every(e => e.route === b.id));
  race.respawn(r);
  assert.equal(r.route, b.id);
  assert.equal(r.lapsDone, 0);
  assert.equal(r.y, race.path(r).groundAt(r.s, r.d));
});

test('banking is applied once to the physics height and once to the road, never twice to the racer', () => {
  const t = tracks[0], s = t.sOfU(3.5), d = 3;
  const { race, r } = riderOn(t, { s, d, v: 0 });
  assert.equal(race.pose(r).y, r.y);
  assert.ok(r.y >= t.toWorld(s, d).y);
});
