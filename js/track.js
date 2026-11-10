// Course geometry in "trail coordinates":
//   s = distance along the centreline in metres (wraps at track.length)
//   d = sideways offset from the centreline in metres (+ = right of travel)
// The centreline is a closed smooth curve through the course's control points,
// resampled every metre. Hills, ramps and rollers are added to the height profile,
// so anything that drives the profile can leave the ground at a crest or a ramp lip.

export const EDGE = { FOREST: 0, WALL: 1, CLIFF: 2 };
export const SURF = { DIRT: 0, WOOD: 1, ROCK: 2 };

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack(course) {
  const sc = course.scale || 1;
  const pts = course.points.map(p => ({ x: p.x * sc, z: p.z * sc, y: p.y || 0, w: p.w || course.halfWidth || 5.5 }));
  const n = pts.length;
  const P = i => pts[((i % n) + n) % n];

  // 1. Dense polyline with running length, remembering the control-point parameter u.
  const dense = [];
  const SUB = 48;
  let len = 0, prev = null;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB;
      const q = {
        x: catmull(P(i - 1).x, P(i).x, P(i + 1).x, P(i + 2).x, t),
        z: catmull(P(i - 1).z, P(i).z, P(i + 1).z, P(i + 2).z, t),
        y: catmull(P(i - 1).y, P(i).y, P(i + 1).y, P(i + 2).y, t),
        w: catmull(P(i - 1).w, P(i).w, P(i + 1).w, P(i + 2).w, t),
        u: i + t,
      };
      if (prev) len += Math.hypot(q.x - prev.x, q.z - prev.z);
      q.len = len; dense.push(q); prev = q;
    }
  }
  const total = len + Math.hypot(dense[0].x - prev.x, dense[0].z - prev.z);
  dense.push({ ...dense[0], u: n, len: total });

  // 2. Resample every metre.
  const N = Math.round(total);
  const step = total / N;
  const X = new Float32Array(N), Z = new Float32Array(N), baseY = new Float32Array(N), HW = new Float32Array(N), U = new Float32Array(N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const target = i * step;
    while (dense[k + 1].len < target) k++;
    const a = dense[k], b = dense[k + 1];
    const f = (target - a.len) / Math.max(1e-6, b.len - a.len);
    X[i] = a.x + (b.x - a.x) * f; Z[i] = a.z + (b.z - a.z) * f;
    baseY[i] = a.y + (b.y - a.y) * f; HW[i] = a.w + (b.w - a.w) * f; U[i] = a.u + (b.u - a.u) * f;
  }
  const wrap = i => ((i % N) + N) % N;

  // 3. Direction, curvature and banking.
  const PSI = new Float32Array(N), KAPPA = new Float32Array(N), BANK = new Float32Array(N);
  for (let i = 0; i < N; i++) PSI[i] = Math.atan2(Z[wrap(i + 1)] - Z[wrap(i - 1)], X[wrap(i + 1)] - X[wrap(i - 1)]);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const rawK = new Float32Array(N);
  for (let i = 0; i < N; i++) rawK[i] = angDiff(PSI[wrap(i + 2)], PSI[wrap(i - 2)]) / (4 * step);
  for (let i = 0; i < N; i++) {
    let sum = 0; for (let j = -4; j <= 4; j++) sum += rawK[wrap(i + j)];
    KAPPA[i] = sum / 9;
  }
  for (let i = 0; i < N; i++) {
    let sum = 0; for (let j = -10; j <= 10; j++) sum += KAPPA[wrap(i + j)];
    BANK[i] = clamp((sum / 21) * 9, -0.4, 0.4);   // lean into the turn: positive = right side lower
  }

  // Convert a control-point position (e.g. 4.5 = halfway between points 4 and 5) to metres along the trail.
  function sOfU(u) {
    u = ((u % n) + n) % n;
    let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (U[mid] <= u) lo = mid; else hi = mid - 1; }
    return lo * step;
  }

  // 4. Features: ramps, tabletops, rollers (height), wood surface, boost pads, edges.
  const FEAT = new Float32Array(N), SURFACE = new Uint8Array(N), EDGE_L = new Uint8Array(N), EDGE_R = new Uint8Array(N);
  const boosts = [], ramps = [];
  const forRange = (s0, s1, fn) => {
    const i0 = Math.floor(s0 / step), i1 = Math.ceil(s1 / step);
    for (let i = i0; i <= i1; i++) fn(wrap(i), clamp((i * step - s0) / Math.max(1e-6, s1 - s0), 0, 1));
  };
  for (const f of course.features || []) {
    const s0 = sOfU(f.at);
    if (f.type === 'kicker') {
      // Rises to a lip then stops dead: anything quick enough flies off the end.
      const L = f.len || 9, H = f.h || 1.5;
      forRange(s0 - L, s0, (i, t) => { FEAT[i] += H * t * t; SURFACE[i] = SURF.WOOD; });
      ramps.push({ type: 'kicker', s: s0, len: L, h: H });
    } else if (f.type === 'table') {
      const R = f.ramp || 7, T = f.top || 8, H = f.h || 1.4;
      // One pass over the whole shape (up-ramp, flat top, down-ramp) so no sample is counted twice.
      const span = R + T + R;
      forRange(s0 - R, s0 + T + R, (i, t) => {
        const x = t * span;
        const up = x < R ? x / R : x > R + T ? (span - x) / R : 1;
        FEAT[i] += H * (0.5 - 0.5 * Math.cos(Math.PI * up)); SURFACE[i] = SURF.WOOD;
      });
      ramps.push({ type: 'table', s: s0, len: R, h: H });
    } else if (f.type === 'rollers') {
      const C = f.count || 3, W = f.len || 11, H = f.h || 0.9;
      forRange(s0, s0 + C * W, (i, t) => { FEAT[i] += H * (0.5 - 0.5 * Math.cos(TAU * t * C)); });
    } else if (f.type === 'boost') {
      const L = f.len || 9;
      boosts.push({ s0, s1: s0 + L, d: f.d || 0, half: f.half || 2.2 });
    }
  }
  for (const e of course.edges || []) {
    const s0 = sOfU(e.from), s1 = sOfU(e.to);
    const span = s1 > s0 ? s1 - s0 : s1 + total - s0;
    forRange(s0, s0 + span, i => {
      if (e.left) EDGE_L[i] = EDGE[e.left.toUpperCase()];
      if (e.right) EDGE_R[i] = EDGE[e.right.toUpperCase()];
      if (e.surface) SURFACE[i] = SURF[e.surface.toUpperCase()];
    });
  }
  const Y = new Float32Array(N);
  for (let i = 0; i < N; i++) Y[i] = baseY[i] + FEAT[i];

  // ---- Queries ----
  const lerpArr = (A, s) => {
    const q = s / step, i = Math.floor(q), f = q - i;
    const a = A[wrap(i)], b = A[wrap(i + 1)];
    return a + (b - a) * f;
  };
  const track = {
    course, name: course.name, laps: course.laps || 3,
    length: total, N, step,
    X, Z, Y, baseY, HW, PSI, KAPPA, BANK, SURFACE, EDGE_L, EDGE_R, FEAT,
    boosts, ramps,
    wrapS: s => ((s % total) + total) % total,
    index: s => wrap(Math.floor(s / step)),
    sOfU,
    heightAt: s => lerpArr(Y, s),
    baseHeightAt: s => lerpArr(baseY, s),
    kappaAt: s => lerpArr(KAPPA, s),
    bankAt: s => lerpArr(BANK, s),
    halfWidthAt: s => lerpArr(HW, s),
    edgeAt: (s, side) => (side < 0 ? EDGE_L : EDGE_R)[wrap(Math.round(s / step))],
    psiAt: s => {
      const q = s / step, i = Math.floor(q), f = q - i;
      const a = PSI[wrap(i)];
      return a + angDiff(PSI[wrap(i + 1)], a) * f;
    },
    // Shortest signed distance along the trail from s2 to s1.
    deltaS: (s1, s2) => { let d = (s1 - s2) % total; if (d > total / 2) d -= total; if (d < -total / 2) d += total; return d; },
    // World position of a trail coordinate. Height includes banking.
    toWorld(s, d, out = {}) {
      const psi = track.psiAt(s);
      const fx = Math.cos(psi), fz = Math.sin(psi);
      out.x = lerpArr(X, s) - fz * d;
      out.z = lerpArr(Z, s) + fx * d;
      out.y = lerpArr(Y, s) - d * Math.sin(lerpArr(BANK, s));
      out.psi = psi;
      return out;
    },
    boostAt(s, d) {
      for (const b of boosts) {
        let rel = s - b.s0; if (rel < 0) rel += total;
        if (rel <= b.s1 - b.s0 && Math.abs(d - b.d) <= b.half) return true;
      }
      return false;
    },
  };
  return track;
}
