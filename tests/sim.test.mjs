import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, EGG } from '../js/sim.js';
import { buildTrack, EDGE } from '../js/track.js';
import { FOSSIL_FLATS } from '../js/courses.js';

const track = buildTrack(FOSSIL_FLATS);
function setup(opts = {}) {
  const race = new Race(track, [
    { name: 'Basher', human: true, autoGo: false },
    { name: 'Rival', human: true, autoGo: false },
  ], { eggs: false, ...opts });
  race.state = 'racing';
  race.racers.forEach((r, i) => Object.assign(r, { s: 30, safeS: 30, d: i ? 2 : -2, y: track.heightAt(30) }));
  return { race, rider: race.racers[0], rival: race.racers[1] };
}

test('bash requires an egg and consumes exactly one of the best tier, even on a miss', () => {
  const { race, rider, rival } = setup();
  race.bash(rider);
  assert.deepEqual(race.events, []);
  assert.equal(rival.kv, 0);

  rider.eggs = [EGG.COMMON, EGG.EDGE, EGG.AIR, EGG.GOLD, EGG.GOLD];
  rival.s += 50;
  race.bash(rider);
  assert.deepEqual(rider.eggs, [EGG.COMMON, EGG.EDGE, EGG.AIR, EGG.GOLD]);
  assert.equal(rider.eggsLost, 0);
  assert.equal(race.eggs.length, 0);
  assert.equal(race.events.length, 1);
  assert.equal(race.events[0].type, 'bash');
  assert.equal(race.events[0].tier, EGG.GOLD);
  assert.equal(race.events[0].hits, 0);
});

test('every higher egg tier increases knockback and reports its explosion power', () => {
  let previous = 0;
  for (const tier of [EGG.COMMON, EGG.AIR, EGG.EDGE, EGG.GOLD]) {
    const { race, rider, rival } = setup();
    rider.eggs = [tier];
    race.bash(rider);
    assert.ok(rival.kv > previous);
    assert.equal(rival.knockedBy, rider.index);
    assert.equal(rider.knockedBy, -1);
    assert.equal(race.events.at(-1).tier, tier);
    assert.ok(race.events.at(-1).power >= 1);
    assert.deepEqual(rider.eggs, []);
    previous = rival.kv;
  }
});

test('better eggs reach rivals farther along, across and above the trail', () => {
  for (const offset of [{ s: 5 }, { d: 5 }, { y: 3 }]) {
    for (const tier of [EGG.COMMON, EGG.AIR]) {
      const { race, rider, rival } = setup();
      Object.assign(rider, { d: 0, eggs: [tier] });
      Object.assign(rival, { s: rider.s, d: 2, y: rider.y });
      for (const key in offset) rival[key] = rider[key] + offset[key];
      race.bash(rider);
      assert.equal(race.events.at(-1).hits, tier === EGG.COMMON ? 0 : 1);
    }
  }
});

test('one egg per press, with no cooldown between presses', () => {
  const { race, rider, rival } = setup();
  rival.s += 50;
  rider.eggs = [EGG.COMMON, EGG.AIR, EGG.EDGE];
  for (let i = 0; i < 10; i++) race.step([{ bash: true }]);
  assert.deepEqual(rider.eggs, [EGG.COMMON, EGG.AIR]);
  race.step([{ bash: false }]);
  race.step([{ bash: true }]);
  assert.deepEqual(rider.eggs, [EGG.COMMON]);
  race.step([{ bash: false }]);
  race.step([{ bash: true }]);
  assert.deepEqual(rider.eggs, []);
});

test('picking up an egg while holding bash waits for another press', () => {
  const { race, rider, rival } = setup();
  rival.s += 50;
  race.step([{ bash: true }]);
  race.eggs.push({ s: rider.s, d: rider.d, h: 0.9, tier: EGG.AIR, alive: true, loose: true, timer: 12, from: rider.index });
  race.step([{ bash: true }]);
  race.step([{ bash: true }]);
  assert.deepEqual(rider.eggs, [EGG.AIR]);
  race.step([{ bash: false }]);
  race.step([{ bash: true }]);
  assert.deepEqual(rider.eggs, []);
});

test('falling, dead, invulnerable and finished riders keep their eggs', () => {
  for (const state of [{ mode: 'fall' }, { mode: 'dead' }, { invuln: 1 }, { finished: true }]) {
    const { race, rider, rival } = setup();
    Object.assign(rider, { eggs: [EGG.GOLD] }, state);
    race.bash(rider);
    assert.deepEqual(rider.eggs, [EGG.GOLD]);
    assert.equal(rival.kv, 0);
    assert.deepEqual(race.events, []);
  }
});

test('holding through respawn protection does not trigger a delayed explosion', () => {
  const { race, rider, rival } = setup();
  Object.assign(rider, { invuln: 0.03, eggs: [EGG.COMMON] });
  rival.s += 50;
  for (let i = 0; i < 5; i++) race.step([{ bash: true }]);
  assert.equal(rider.invuln, 0);
  assert.deepEqual(rider.eggs, [EGG.COMMON]);
  race.step([{ bash: false }]);
  race.step([{ bash: true }]);
  assert.deepEqual(rider.eggs, []);
});

test('explosions preserve target protection and wrap across the start line', () => {
  for (const state of [{ invuln: 1 }, { mode: 'fall' }, { finished: true }]) {
    const { race, rider, rival } = setup();
    rider.eggs = [EGG.GOLD];
    Object.assign(rival, state);
    race.bash(rider);
    assert.equal(rival.kv, 0);
    assert.equal(race.events.at(-1).hits, 0);
  }
  const { race, rider, rival } = setup();
  Object.assign(rider, { s: track.length - 1, eggs: [EGG.COMMON], y: 0 });
  Object.assign(rival, { s: 1, y: 0 });
  race.bash(rider);
  assert.equal(race.events.at(-1).hits, 1);
});

test('AI needs ammunition and Easy still protects human riders', () => {
  const { race, rider, rival } = setup({ aiBashHumans: 1 });
  Object.assign(rider, { human: false, d: 1 });
  rival.d = 4;
  race.time = 10;
  race.rng = () => 0;
  assert.equal(track.edgeAt(rival.s, 1), EDGE.FOREST);
  assert.equal(race.aiWantsBash(rider, track.halfWidthAt(rider.s)), false);
  rider.eggs = [EGG.AIR];
  assert.equal(race.aiWantsBash(rider, track.halfWidthAt(rider.s)), true);
  race.aiBashHumans = 0;
  assert.equal(race.aiWantsBash(rider, track.halfWidthAt(rider.s)), false);
  race.bash(rider);
  assert.deepEqual(rider.eggs, []);
  assert.equal(rival.kv, 0);
});
