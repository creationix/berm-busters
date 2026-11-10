// One input shape for every way of playing: { steer -1..1, throttle 0..1, brake 0..1 }.
// Sources: keyboard, gamepads, on-screen touch buttons and tilt. A PlayerInput merges
// whichever sources it has been given, so one player can use several at once and
// several players can each have their own.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- keyboard ----------
const SCHEMES = {
  arrows: { left: ['ArrowLeft'], right: ['ArrowRight'], go: ['ArrowUp'], brake: ['ArrowDown', 'Space'] },
  wasd: { left: ['KeyA'], right: ['KeyD'], go: ['KeyW'], brake: ['KeyS', 'ShiftLeft'] },
};
SCHEMES.both = {
  left: [...SCHEMES.arrows.left, ...SCHEMES.wasd.left], right: [...SCHEMES.arrows.right, ...SCHEMES.wasd.right],
  go: [...SCHEMES.arrows.go, ...SCHEMES.wasd.go], brake: [...SCHEMES.arrows.brake, ...SCHEMES.wasd.brake],
};

export class Keyboard {
  constructor() {
    this.down = new Set();
    this.used = false;
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.down.add(e.code); this.used = true;
      if (this.onKey) this.onKey(e);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  any(codes) { for (const c of codes) if (this.down.has(c)) return true; return false; }
  read(scheme) {
    const s = SCHEMES[scheme] || SCHEMES.both;
    return { left: this.any(s.left), right: this.any(s.right), go: this.any(s.go), brake: this.any(s.brake) };
  }
}

// ---------- gamepads ----------
const DEAD = 0.16;
export function listGamepads() {
  if (!navigator.getGamepads) return [];
  let pads; try { pads = navigator.getGamepads(); } catch (e) { return []; }
  return Array.from(pads || []).filter(p => p && p.connected !== false);
}
const btn = (p, i) => { const b = p.buttons[i]; return b ? (typeof b === 'object' ? Math.max(b.value || 0, b.pressed ? 1 : 0) : b) : 0; };
export function readGamepad(p) {
  if (!p) return null;
  let x = p.axes && p.axes.length ? p.axes[0] : 0;
  x = Math.abs(x) < DEAD ? 0 : (x - Math.sign(x) * DEAD) / (1 - DEAD);
  x = Math.sign(x) * Math.pow(Math.abs(x), 1.4);                 // gentle near the centre
  if (btn(p, 14) > 0.5) x = -1; else if (btn(p, 15) > 0.5) x = 1;
  const go = Math.max(btn(p, 7), btn(p, 0));
  const brake = Math.max(btn(p, 6), btn(p, 1), btn(p, 2));
  let any = false; for (let i = 0; i < p.buttons.length; i++) if (btn(p, i) > 0.5) { any = true; break; }
  return { steer: clamp(x, -1, 1), dpad: btn(p, 14) > 0.5 || btn(p, 15) > 0.5, go, brake, pause: btn(p, 9) > 0.5, any };
}

// ---------- touch buttons ----------
// Buttons are any elements with data-touch="left|right|brake|go" inside the root.
export class TouchPad {
  constructor(root) {
    this.root = root;
    this.state = { left: false, right: false, brake: false, go: false };
    this.pointers = new Map();
    const down = e => {
      const el = e.target.closest('[data-touch]'); if (!el || !root.contains(el)) return;
      e.preventDefault();
      this.pointers.set(e.pointerId, el.dataset.touch); el.classList.add('held'); this.sync();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const up = e => {
      if (!this.pointers.has(e.pointerId)) return;
      const name = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId); this.sync();
      for (const el of root.querySelectorAll(`[data-touch="${name}"]`)) el.classList.toggle('held', this.state[name]);
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);
    root.addEventListener('contextmenu', e => e.preventDefault());
  }
  sync() {
    for (const k in this.state) this.state[k] = false;
    for (const name of this.pointers.values()) this.state[name] = true;
  }
  release() { this.pointers.clear(); this.sync(); for (const el of this.root.querySelectorAll('.held')) el.classList.remove('held'); }
}

// ---------- one player's merged input ----------
export class PlayerInput {
  // opts: { keyboard, scheme: 'both'|'arrows'|'wasd', gamepad: index | 'any' | null, touch: TouchPad, tilt: Tilt }
  constructor(opts) {
    Object.assign(this, { keyboard: null, scheme: 'both', gamepad: null, touch: null, tilt: null }, opts);
    this.digital = 0;        // eased value of left/right buttons, so a tap is a small correction
    this.out = { steer: 0, throttle: 0, brake: 0, pause: false };
    this.pauseHeld = false;
  }
  read(dt) {
    let left = false, right = false, go = 0, brake = 0, analog = 0, pause = false;
    if (this.keyboard) {
      const k = this.keyboard.read(this.scheme);
      left = left || k.left; right = right || k.right; if (k.go) go = 1; if (k.brake) brake = 1;
    }
    if (this.touch) {
      const s = this.touch.state;
      left = left || s.left; right = right || s.right; if (s.go) go = 1; if (s.brake) brake = 1;
    }
    const pads = this.gamepad === 'any' ? listGamepads() : this.gamepad != null ? listGamepads().filter(p => p.index === this.gamepad) : [];
    for (const p of pads) {
      const g = readGamepad(p); if (!g) continue;
      if (g.dpad) { if (g.steer < 0) left = true; else right = true; }
      else if (Math.abs(g.steer) > Math.abs(analog)) analog = g.steer;
      go = Math.max(go, g.go); brake = Math.max(brake, g.brake); pause = pause || g.pause;
    }
    if (this.tilt && this.tilt.active && Math.abs(this.tilt.steer) > Math.abs(analog)) analog = this.tilt.steer;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = target === 0 ? 9 : (Math.sign(target) !== Math.sign(this.digital) && this.digital !== 0 ? 12 : 5.5);
    const stepMax = rate * dt;
    this.digital += clamp(target - this.digital, -stepMax, stepMax);
    const o = this.out;
    o.steer = Math.abs(analog) > Math.abs(this.digital) ? analog : this.digital;
    o.throttle = go; o.brake = brake;
    o.pause = pause && !this.pauseHeld;        // only on the press, not while held
    this.pauseHeld = pause;
    return o;
  }
}
