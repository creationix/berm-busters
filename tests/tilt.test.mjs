import test from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Android', platform: 'Linux', maxTouchPoints: 1 } });
globalThis.screen = { orientation: { angle: 0 } };
globalThis.window = { orientation: 0 };
const { Tilt, gravityToSteer } = await import('../js/tilt.js');

// Generate a device's gravity reading for a screen-space tilt. iOS uses the opposite sign.
function gravity(degrees, angle, sign = 1) {
  const tilt = degrees * Math.PI / 180, screen = angle * Math.PI / 180;
  const right = -9.81 * Math.sin(tilt), up = 9.81 * Math.cos(tilt);
  return { x: (right * Math.cos(screen) + up * Math.sin(screen)) * sign,
    y: (-right * Math.sin(screen) + up * Math.cos(screen)) * sign, z: 0 };
}
function motion(tilt, degrees) {
  tilt._motion({ accelerationIncludingGravity: gravity(degrees, screen.orientation.angle) });
}

test('small tilts steer strongly in either direction in every screen orientation', () => {
  for (const angle of [0, 90, 180, 270]) for (const sign of [-1, 1]) {
    for (const degrees of [-15, -7.5, 0, 7.5, 15]) {
      const g = gravity(degrees, angle, sign);
      const result = gravityToSteer(g.x, g.y, angle, { sign });
      const magnitude = Math.abs(result.steer);
      if (!degrees) assert.ok(magnitude < 1e-12);
      else {
        assert.equal(Math.sign(result.steer), Math.sign(degrees));
        if (Math.abs(degrees) === 15) assert.ok(magnitude > 0.99);
        else assert.ok(magnitude > 0.5 && magnitude < 0.55);
      }
    }
  }
});

test('full steering responds in one or two sensor updates, including direction changes', () => {
  const tilt = new Tilt();
  motion(tilt, 15);
  assert.ok(tilt.steer >= 0.7);
  motion(tilt, 15);
  assert.ok(tilt.steer > 0.9);
  motion(tilt, -15);
  assert.ok(tilt.steer < -0.5);
  motion(tilt, -15);
  assert.ok(tilt.steer < -0.9);
  motion(tilt, 0);
  motion(tilt, 0);
  assert.ok(Math.abs(tilt.steer) < 0.1);
});

test('neutral hand shake stays in the dead zone and extreme tilt is clamped', () => {
  const tilt = new Tilt();
  for (const degrees of [0, 0.5, -0.5, 0.1]) {
    motion(tilt, degrees);
    assert.equal(tilt.steer, 0);
    assert.equal(tilt.rawSteer, 0);
  }
  for (const degrees of [-60, 60]) {
    const g = gravity(degrees, 0);
    assert.equal(Math.abs(gravityToSteer(g.x, g.y, 0, { sign: 1 }).steer), 1);
  }
});

test('inversion still works and missing sensor readings are ignored', () => {
  const tilt = new Tilt();
  tilt.invert = true;
  motion(tilt, 15);
  assert.ok(tilt.steer < -0.7);
  const previous = tilt.steer;
  tilt._motion({ accelerationIncludingGravity: null });
  assert.equal(tilt.steer, previous);
  assert.equal(tilt.events, 1);
});
