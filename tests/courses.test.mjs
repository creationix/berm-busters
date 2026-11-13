import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../js/courses.js';
import { buildTrack, EDGE } from '../js/track.js';
import { Race, TICK, MAX_EGGS } from '../js/sim.js';

test('courses have unique identities and genuinely different routes', () => {
  assert.equal(new Set(COURSES.map(c => c.id)).size, COURSES.length);
  assert.equal(new Set(COURSES.map(c => JSON.stringify(c.points))).size, COURSES.length);
  assert.ok(COURSES.some(c => c.difficulty === 'Easy'));
  assert.ok(COURSES.some(c => c.difficulty === 'Hard'));
});

for (const course of COURSES) {
  test(`${course.name}: continuous route, usable features and safe starting grid`, () => {
    const track = buildTrack(course);
    for (const values of [track.X, track.Z, track.Y, track.HW, track.PSI, track.KAPPA]) {
      assert.ok(Array.from(values).every(Number.isFinite));
    }
    assert.ok(Math.min(...track.HW) > 4);
    const start = track.toWorld(0, 0), end = track.toWorld(track.length - 0.1, 0);
    assert.ok(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) < 0.2);
    assert.ok(track.ramps.length >= 2);
    assert.ok(track.boosts.length >= 2);
    for (const boost of track.boosts) {
      assert.ok(Math.abs(boost.d) + boost.half < track.halfWidthAt(boost.s0));
      assert.equal(track.boostAt(boost.s0 + 1, boost.d), true);
    }
    const race = new Race(track, Array.from({ length: 8 }, () => ({})));
    for (const r of race.racers) {
      assert.equal(track.edgeAt(r.s, -1), EDGE.FOREST);
      assert.equal(track.edgeAt(r.s, 1), EDGE.FOREST);
      assert.ok(Math.abs(r.d) < track.halfWidthAt(r.s));
    }
    assert.ok(race.eggs.length >= 8);
    assert.ok(race.eggs.every(e => e.s >= 0 && e.s < track.length));
  });

  test(`${course.name}: computer riders complete a full race and rescue eggs`, () => {
    const race = new Race(buildTrack(course), Array.from({ length: 8 }, (_, i) => ({ skill: 0.84 + i * 0.015 })), { seed: 1234, countdown: 0.01 });
    let scooped = 0, landed = 0;
    for (let i = 0; i < 180 / TICK && race.state !== 'finished'; i++) {
      race.step();
      scooped += race.events.filter(e => e.type === 'egg').length;
      landed += race.events.filter(e => e.type === 'land').length;
    }
    assert.equal(race.state, 'finished');
    assert.ok(race.racers.filter(r => r.finishTime > 0).length >= 3);
    assert.equal(new Set(race.racers.map(r => r.place)).size, 8);
    assert.ok(scooped > 0);
    assert.ok(landed > 0);
    for (const r of race.racers) {
      assert.ok(Number.isFinite(r.progress));
      assert.ok(Array.isArray(r.rescued));
      assert.ok(r.eggs.length <= MAX_EGGS);
    }
  });
}
