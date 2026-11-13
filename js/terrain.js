// Shared terrain mesh and collision surface. Physics samples the very triangles drawn by the renderer.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = smooth(0, 1, x - i), v = smooth(0, 1, z - j);
  const a = hash(i, j) * (1 - u) + hash(i + 1, j) * u;
  const b = hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u;
  return a * (1 - v) + b * v;
}
export const WATER_Y = -1.2, FLOOR_Y = -3.2;

export function createTerrain(track) {
  const paths = [track, ...track.branches.map(b => b.geometry)], samples = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const path of paths) for (let i = 0; i < path.N; i += 3) {
    const x = path.X[i], z = path.Z[i];
    samples.push({ path, i, x, z });
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  function nearest(x, z) {
    let best = Infinity, sample, cap = Infinity;
    for (const p of samples) {
      const dx = x - p.x, dz = z - p.z, d = dx * dx + dz * dz, path = p.path, i = p.i;
      // Carve a margin around every solid road, including the lower road at a crossing.
      // The margin prevents coarse terrain triangles from poking through the riding surface.
      if (d < (path.HW[i] + 6) ** 2 && !(path.EDGE_L[i] === 2 && path.EDGE_R[i] === 2)) {
        const along = dx * Math.cos(path.PSI[i]) + dz * Math.sin(path.PSI[i]);
        const side = dx * -Math.sin(path.PSI[i]) + dz * Math.cos(path.PSI[i]);
        if (Math.abs(along) <= 3 && Math.abs(side) <= path.HW[i] + 5) cap = Math.min(cap, path.baseY[i] - side * Math.sin(path.BANK[i]) - 0.7);
      }
      // At an overpass, carve the land around the lower road, leaving the bridge above it.
      if (d < best - 0.5 || Math.abs(d - best) <= 0.5 && p.path.baseY[p.i] < sample.path.baseY[sample.i]) { best = d; sample = p; }
    }
    const p = sample.path;
    let bi = sample.i;
    for (let j = bi - 2; j <= bi + 2; j++) {
      const i = p.index(j * p.step), d = (x - p.X[i]) ** 2 + (z - p.Z[i]) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return { path: p, i: bi, cap, dist: Math.sqrt(best), lat: (x - p.X[bi]) * -Math.sin(p.PSI[bi]) + (z - p.Z[bi]) * Math.cos(p.PSI[bi]) };
  }
  function sample(x, z) {
    const n = nearest(x, z), t = n.path, i = n.i, hw = t.HW[i];
    const edge = n.lat < 0 ? t.EDGE_L[i] : t.EDGE_R[i], o = Math.max(0, n.dist - hw);
    const ty = t.baseY[i] - clamp(n.lat, -hw, hw) * Math.sin(t.BANK[i]);
    const c = track.course, sc = c.scale || 1, m = c.mountain;
    const r = Math.hypot(x - m.x * sc, z - m.z * sc);
    let base = m.height * Math.exp(-((r / (m.radius * sc)) ** 2)) + (noise(x * 0.02, z * 0.02) - 0.5) * 7 + (noise(x * 0.07, z * 0.07) - 0.5) * 2.2;
    if (c.creek) base -= c.creek.depth * Math.exp(-(((z - c.creek.z * sc - Math.sin(x * 0.02) * 6) / c.creek.width) ** 2));
    base += Math.max(0, o - 105) ** 2 * 0.0045;
    let near, a, b;
    if (t.EDGE_L[i] === 2 && t.EDGE_R[i] === 2) { near = FLOOR_Y + noise(x * 0.1, z * 0.1) * 0.8; a = 13; b = 42; }
    else if (o <= 0) { near = ty - 0.4; a = 5; b = 32; }
    else if (edge === 1) { near = ty - 0.4 + smooth(0.2, 8, o) * (15 + noise(x * 0.1, z * 0.1) * 6); a = 9; b = 36; }
    else if (edge === 2) { near = (ty - 0.4) * (1 - smooth(0.6, 9, o)) + FLOOR_Y * smooth(0.6, 9, o); a = 12; b = 44; }
    else { near = ty - 0.4 + (noise(x * 0.09, z * 0.09) - 0.5) * 1.8 * Math.min(1, o / 5); a = 5; b = 32; }
    return { height: Math.min(n.cap, base + (near - base) * (1 - smooth(a, b, o))), o, edge };
  }
  const CELL = 4, MARGIN = 170;
  x0 -= MARGIN; x1 += MARGIN; z0 -= MARGIN; z1 += MARGIN;
  const nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
  const H = new Float32Array(nx * nz), O = new Float32Array(nx * nz), E = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, p = sample(x0 + i * CELL, z0 + j * CELL);
    H[k] = p.height; O[k] = p.o; E[k] = p.edge;
  }
  function heightAt(x, z) {
    const qx = clamp((x - x0) / CELL, 0, nx - 1.000001), qz = clamp((z - z0) / CELL, 0, nz - 1.000001);
    const i = Math.floor(qx), j = Math.floor(qz), fx = qx - i, fz = qz - j, k = j * nx + i;
    const a = H[k], b = H[k + 1], d = H[k + nx], e = H[k + nx + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (d - a) * fz : e + (d - e) * (1 - fx) + (b - e) * (1 - fz);
  }
  return { grid: { x0, z0, nx, nz, CELL, H, O, E }, nearest, sample, heightAt };
}
