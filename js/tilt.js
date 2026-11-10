// Tilt steering: hold the device like a steering wheel (or flat, rolling it left/right).
// Works from the direction of gravity in screen space, so it does not care which
// landscape way round the device is, and copes with iOS reporting gravity with the
// opposite sign to Android.

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function screenAngle() {
  let a = 0;
  if (screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle;
  else if (typeof window.orientation === 'number') a = window.orientation;
  return ((a % 360) + 360) % 360;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ax, ay: accelerationIncludingGravity in device axes. angleDeg: screen rotation.
// state.sign remembers which sign convention the device uses. Returns steer in -1..1
// (positive = steer right) plus the screen-space components for diagnostics.
export function gravityToSteer(ax, ay, angleDeg, state, maxDeg = 30) {
  const t = angleDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  let right = ax * c - ay * s;
  let up = ax * s + ay * c;
  // Held anywhere near upright, "up" must point to the top of the screen: learn the sign from that.
  if (Math.abs(up) > 2.5) state.sign = up > 0 ? 1 : -1;
  right *= state.sign; up *= state.sign;
  const steer = clamp(-right / (9.81 * Math.sin(maxDeg * Math.PI / 180)), -1, 1);
  return { steer, right, up };
}

export class Tilt {
  constructor() {
    this.state = { sign: isIOS ? -1 : 1 };
    this.steer = 0;        // smoothed, -1..1
    this.rawSteer = 0;
    this.right = 0; this.up = 0;
    this.raw = null;       // last raw accelerationIncludingGravity
    this.events = 0;
    this.active = false;
    this.invert = false;
    this.maxDeg = 30;
    this._on = e => this._motion(e);
  }
  static get supported() { return typeof DeviceMotionEvent !== 'undefined'; }
  static get needsPermission() {
    return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
  }
  // Call from inside a tap handler: iOS only shows its permission prompt then.
  async enable() {
    if (!Tilt.supported) return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    if (Tilt.needsPermission) {
      let res;
      try { res = await DeviceMotionEvent.requestPermission(); } catch (err) { return 'denied'; }
      if (res !== 'granted') return 'denied';
    }
    if (!this.active) { window.addEventListener('devicemotion', this._on); this.active = true; }
    return 'ok';
  }
  disable() {
    window.removeEventListener('devicemotion', this._on);
    this.active = false; this.steer = 0;
  }
  _motion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    this.events++;
    this.raw = { x: g.x, y: g.y, z: g.z };
    const r = gravityToSteer(g.x, g.y, screenAngle(), this.state, this.maxDeg);
    this.right = r.right; this.up = r.up;
    let s = this.invert ? -r.steer : r.steer;
    if (Math.abs(s) < 0.06) s = 0;           // small dead zone so "straight" is easy to hold
    this.rawSteer = s;
    this.steer += (s - this.steer) * 0.35;   // light smoothing against hand shake
  }
}
