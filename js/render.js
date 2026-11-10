// The 3D world: terrain, trail, scenery, racers, particles and cameras.
// Built to stay cheap enough for phones and for several split-screen views:
// a few dozen draw calls, no shadow maps, no post-processing.

import * as THREE from '../vendor/three.module.min.js';
import { EDGE, SURF } from './track.js';
import { V_MAX } from './sim.js';
import { Builder, buildRacerGeometry, racerMaterial, characterById } from './models.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function hash2(x, z) { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

const WATER_Y = -1.2, FLOOR_Y = -3.2;
const FALL_COLORS = ['#e8552a', '#f08a1f', '#f7b52c', '#d93a2a', '#b9c23c', '#8fae3a', '#c7482a', '#ffcf3f'];

// ---------- particles ----------
class Particles {
  constructor(max, additive) {
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: `attribute float size; attribute vec4 pcolor; varying vec4 vColor; uniform float uScale;
        void main() { vColor = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vColor;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, ${additive ? '0.1' : '0.38'}, d) * vColor.a;
          if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.tmp = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, o) {
    const i = this.cursor; this.cursor = (i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size0[i] = size;
    this.grav[i] = o && o.gravity || 0; this.drag[i] = o && o.drag || 0; this.grow[i] = o && o.grow || 0;
    this.tmp.set(color);
    this.col[i * 4] = this.tmp.r; this.col[i * 4 + 1] = this.tmp.g; this.col[i * 4 + 2] = this.tmp.b; this.col[i * 4 + 3] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const k = this.life[i] / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 4 + 3] = Math.min(1, k * 2.5);
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - k));
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.pcolor.needsUpdate = a.size.needsUpdate = true;
  }
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(canvas, track) {
    this.canvas = canvas; this.track = track; this.course = track.course;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    const sky = this.course.sky;
    this.scene.fog = new THREE.Fog(new THREE.Color(sky.horizon), 110, 520);
    this.racers = []; this.time = 0; this.leafT = 0;
    this._n = { i: 0, dist: 0, lat: 0 };
    this._pose = {}; this._v = new THREE.Vector3();

    this.scene.add(new THREE.HemisphereLight('#cfe6ff', '#b07a45', 2.3));
    const sun = new THREE.DirectionalLight('#fff0cf', 2.6);
    sun.position.set(-0.5, 0.8, 0.35);
    this.scene.add(sun);

    this.buildSky();
    this.buildTerrain();
    this.buildTrail();
    this.buildProps();
    this.buildScenery();

    this.fx = new Particles(1400, true);      // glows, sparks, thrusters
    this.bits = new Particles(900, false);    // dust, smoke, leaves, confetti
    this.scene.add(this.bits.points, this.fx.points);
    this.racerMat = racerMaterial();
    this.glowTex = canvasTexture(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
  }

  // ----- nearest point on the trail centreline -----
  nearest(x, z) {
    const t = this.track, N = t.N;
    let best = 1e18, bi = 0;
    for (let i = 0; i < N; i += 3) { const dx = x - t.X[i], dz = z - t.Z[i], q = dx * dx + dz * dz; if (q < best) { best = q; bi = i; } }
    for (let j = bi - 2; j <= bi + 2; j++) { const i = ((j % N) + N) % N, dx = x - t.X[i], dz = z - t.Z[i], q = dx * dx + dz * dz; if (q < best) { best = q; bi = i; } }
    const psi = t.PSI[bi];
    const n = this._n;
    n.i = bi; n.dist = Math.sqrt(best); n.lat = (x - t.X[bi]) * -Math.sin(psi) + (z - t.Z[bi]) * Math.cos(psi);
    return n;
  }

  // Height of the land at a point: the trail's own cross-section near the trail,
  // blending into rolling hills and the central mountain further out.
  terrainAt(x, z) {
    const t = this.track, c = this.course, sc = c.scale || 1;
    const n = this.nearest(x, z), i = n.i;
    const hw = t.HW[i], ty = t.baseY[i];
    const edge = n.lat < 0 ? t.EDGE_L[i] : t.EDGE_R[i];
    const o = Math.max(0, n.dist - hw);
    const bridge = t.EDGE_L[i] === EDGE.CLIFF && t.EDGE_R[i] === EDGE.CLIFF;
    const m = c.mountain;
    const r = Math.hypot(x - m.x * sc, z - m.z * sc);
    let B = m.height * Math.exp(-Math.pow(r / (m.radius * sc), 2)) + (noise(x * 0.02, z * 0.02) - 0.5) * 7 + (noise(x * 0.07, z * 0.07) - 0.5) * 2.2;
    if (c.creek) B -= c.creek.depth * Math.exp(-Math.pow((z - c.creek.z * sc - Math.sin(x * 0.02) * 6) / c.creek.width, 2));
    const far = Math.max(0, o - 105); B += far * far * 0.0045;          // a ring of hills hides the edge of the world
    let P, R0, R1;
    if (bridge) { P = FLOOR_Y + noise(x * 0.1, z * 0.1) * 0.8; R0 = 13; R1 = 42; }
    else if (o <= 0) { P = ty - 0.4; R0 = 5; R1 = 32; }
    else if (edge === EDGE.WALL) { P = ty - 0.4 + smooth(0.2, 8, o) * (15 + noise(x * 0.1, z * 0.1) * 6); R0 = 9; R1 = 36; }
    else if (edge === EDGE.CLIFF) { P = lerp(ty - 0.4, FLOOR_Y, smooth(0.6, 9, o)); R0 = 12; R1 = 44; }
    else { P = ty - 0.4 + (noise(x * 0.09, z * 0.09) - 0.5) * 1.8 * Math.min(1, o / 5); R0 = 5; R1 = 32; }
    const w = 1 - smooth(R0, R1, o);
    this._o = o; this._edge = edge;
    return B + (P - B) * w;
  }

  buildSky() {
    const sky = this.course.sky;
    const g = new THREE.SphereGeometry(900, 24, 12);
    const top = new THREE.Color(sky.top), mid = new THREE.Color(sky.mid), hor = new THREE.Color(sky.horizon), c = new THREE.Color();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 900;
      if (h > 0.25) c.copy(mid).lerp(top, smooth(0.25, 0.9, h)); else c.copy(hor).lerp(mid, smooth(-0.02, 0.25, h));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    // sun glow
    const sunTex = canvasTexture(128, 128, x => {
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.18, 'rgba(255,240,180,.9)'); gr.addColorStop(0.5, 'rgba(255,200,120,.25)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    });
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    sun.position.set(-430, 330, 300); sun.scale.setScalar(330);
    this.sky.add(sun);
    // clouds
    const rnd = rng(7);
    const cg = new THREE.SphereGeometry(1, 7, 5);
    const clouds = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0.9 }), 40);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, rad = 380 + rnd() * 380, y = 150 + rnd() * 120, big = 28 + rnd() * 26;
      for (let j = 0; j < 3 && k < 40; j++) {
        p.set(Math.cos(a) * rad + (j - 1) * big * 0.9, y + (j === 1 ? big * 0.2 : 0), Math.sin(a) * rad + (rnd() - 0.5) * 12);
        s.set(big * (j === 1 ? 1.2 : 0.85), big * 0.4, big * 0.7);
        clouds.setMatrixAt(k++, m.compose(p, q, s));
      }
    }
    clouds.count = k; clouds.frustumCulled = false;
    this.sky.add(clouds);
  }

  buildTerrain() {
    const t = this.track, CELL = 4, MARGIN = 170;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < t.N; i++) { x0 = Math.min(x0, t.X[i]); x1 = Math.max(x1, t.X[i]); z0 = Math.min(z0, t.Z[i]); z1 = Math.max(z1, t.Z[i]); }
    x0 -= MARGIN; x1 += MARGIN; z0 -= MARGIN; z1 += MARGIN;
    const nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
    const H = new Float32Array(nx * nz), O = new Float32Array(nx * nz), E = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      H[k] = this.terrainAt(x0 + i * CELL, z0 + j * CELL); O[k] = this._o; E[k] = this._edge;
    }
    this.grid = { x0, z0, nx, nz, CELL, H };
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    const leaf = [new THREE.Color('#8a9a3c'), new THREE.Color('#c98a2e'), new THREE.Color('#b5582a')];
    const rockA = new THREE.Color('#d1a86c'), rockB = new THREE.Color('#b0834e'), rockC = new THREE.Color('#e0c08e');
    const gravel = new THREE.Color('#d9cba6'), bed = new THREE.Color('#7f9372'), dirt = new THREE.Color('#b98f5c');
    const forestA = new THREE.Color('#d9602a'), forestB = new THREE.Color('#e9a52c'), forestC = new THREE.Color('#7f9a38');
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = x0 + i * CELL, z = z0 + j * CELL, h = H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hx = H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)];
      const hz = H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i];
      const steep = Math.hypot(hx, hz) / (2 * CELL);
      const n1 = noise(x * 0.045, z * 0.045), n2 = noise(x * 0.3, z * 0.3);
      if (h < WATER_Y - 0.3) c.copy(bed);
      else if (h < WATER_Y + 0.9) c.copy(gravel);
      // Bare sandstone only on the bluffs beside the trail and on really steep faces; distant hills read as autumn forest.
      else if (steep > (O[k] < 30 ? 0.62 : 1.25)) { const band = Math.floor((h + n1 * 3) / 2.2) % 3; c.copy(band === 0 ? rockA : band === 1 ? rockB : rockC); }
      else {
        c.copy(n1 < 0.4 ? leaf[0] : n1 < 0.62 ? leaf[1] : leaf[2]);
        c.lerp(leaf[1], n2 * 0.35);
        if (O[k] > 30) { const n3 = noise(x * 0.11 + 9, z * 0.11); c.lerp(n3 < 0.33 ? forestA : n3 < 0.66 ? forestB : forestC, 0.55 * smooth(30, 60, O[k])); }
        else if (steep > 0.4) c.lerp(rockB, (steep - 0.4) / 0.22);
        if (O[k] < 2.5) c.lerp(dirt, 1 - O[k] / 2.5);
      }
      c.multiplyScalar(0.9 + n2 * 0.2);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    // water
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: '#3fa7d6', transparent: true, opacity: 0.82 }));
    water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, WATER_Y, (z0 + z1) / 2);
    this.scene.add(water);
  }

  gridHeight(x, z) {
    const g = this.grid;
    const fx = clamp((x - g.x0) / g.CELL, 0, g.nx - 1.001), fz = clamp((z - g.z0) / g.CELL, 0, g.nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * g.nx + i;
    return lerp(lerp(g.H[k], g.H[k + 1], u), lerp(g.H[k + g.nx], g.H[k + g.nx + 1], u), v);
  }

  // Point on the trail surface for sample row i and sideways offset d.
  trailPoint(i, d, lift, out) {
    const t = this.track, k = ((i % t.N) + t.N) % t.N, psi = t.PSI[k];
    out.set(t.X[k] - Math.sin(psi) * d, t.Y[k] - d * Math.sin(t.BANK[k]) + lift, t.Z[k] + Math.cos(psi) * d);
    return out;
  }

  buildTrail() {
    const t = this.track, N = t.N;
    const pos = [], col = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), color = new THREE.Color();
    const quad = (hex, shade) => {
      color.set(hex).multiplyScalar(shade);
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
    };
    const EDGE_W = 0.65;
    for (let i = 0; i < N; i++) {
      const hw0 = t.HW[i], hw1 = t.HW[(i + 1) % N], surf = t.SURFACE[i];
      // riding surface, striped along its length so speed is easy to read
      let hex, shade;
      if (surf === SURF.WOOD) { hex = '#b9803f'; shade = i % 2 ? 1 : 0.86; }
      else if (surf === SURF.ROCK) { hex = '#cfb089'; shade = (i >> 2) % 2 ? 1 : 0.93; }
      else { hex = '#cf9f66'; shade = (i >> 2) % 2 ? 1 : 0.92; }
      this.trailPoint(i, -(hw0 - EDGE_W), 0.03, a); this.trailPoint(i, hw0 - EDGE_W, 0.03, b);
      this.trailPoint(i + 1, -(hw1 - EDGE_W), 0.03, c); this.trailPoint(i + 1, hw1 - EDGE_W, 0.03, d);
      quad(hex, shade);
      // edge bands: cream markers in the forest, hazard stripes where there is a drop, grey by a rock wall
      for (const side of [-1, 1]) {
        const e = side < 0 ? t.EDGE_L[i] : t.EDGE_R[i];
        const on = (i >> 1) % 2;
        const eh = e === EDGE.CLIFF ? (on ? '#ff8a1f' : '#2b2b30') : e === EDGE.WALL ? '#8d7b66' : (on ? '#fff6dc' : '#e7c58e');
        this.trailPoint(i, side * (hw0 - EDGE_W), 0.03, a); this.trailPoint(i, side * hw0, 0.03, b);
        this.trailPoint(i + 1, side * (hw1 - EDGE_W), 0.03, c); this.trailPoint(i + 1, side * hw1, 0.03, d);
        quad(eh, 1);
        // skirt down into the ground so ramps and banked corners have solid sides
        const bridge = t.EDGE_L[i] === EDGE.CLIFF && t.EDGE_R[i] === EDGE.CLIFF;
        const depth = bridge ? 0.7 : 3.2;
        this.trailPoint(i, side * hw0, 0.03, a); this.trailPoint(i + 1, side * hw1, 0.03, c);
        b.copy(a); b.y -= depth; d.copy(c); d.y -= depth;
        quad(surf === SURF.WOOD ? '#8a5c2a' : '#8c6a46', 0.9);
      }
    }
    // bridge underside and posts
    const post = new Builder();
    for (let i = 0; i < N; i += 7) {
      if (!(t.EDGE_L[i] === EDGE.CLIFF && t.EDGE_R[i] === EDGE.CLIFF)) continue;
      for (const side of [-1, 1]) {
        this.trailPoint(i, side * (t.HW[i] - 0.5), 0, a);
        const h = a.y - FLOOR_Y + 1;
        post.add(new THREE.BoxGeometry(0.55, h, 0.55), '#6e4a24', { p: [a.x, a.y - 0.6 - h / 2, a.z] });
      }
      this.trailPoint(i, 0, -1.0, a);
      post.add(new THREE.BoxGeometry(0.4, 0.4, t.HW[i] * 2), '#6e4a24', { p: [a.x, a.y, a.z], r: [0, -t.PSI[i], 0] });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
    this.scene.add(mesh);
    if (post.pos.length) { const pm = new THREE.Mesh(post.build(), mat); pm.frustumCulled = false; this.scene.add(pm); }

    // boost pads: animated chevrons lying on the trail
    this.boostTex = canvasTexture(64, 64, (x) => {
      x.fillStyle = 'rgba(20,60,140,.55)'; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = '#7dffff'; x.lineWidth = 9; x.lineJoin = 'miter';
      for (const y of [44, 12]) { x.beginPath(); x.moveTo(8, y + 14); x.lineTo(32, y - 8); x.lineTo(56, y + 14); x.stroke(); }
    });
    this.boostTex.wrapS = this.boostTex.wrapT = THREE.RepeatWrapping;
    const bp = [], buv = [];
    for (const bo of t.boosts) {
      const i0 = Math.round(bo.s0 / t.step), i1 = Math.round(bo.s1 / t.step);
      for (let i = i0; i < i1; i++) {
        this.trailPoint(i, bo.d - bo.half, 0.09, a); this.trailPoint(i, bo.d + bo.half, 0.09, b);
        this.trailPoint(i + 1, bo.d - bo.half, 0.09, c); this.trailPoint(i + 1, bo.d + bo.half, 0.09, d);
        const v0 = (i - i0) / 3, v1 = (i + 1 - i0) / 3;
        bp.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
        buv.push(0, v0, 0, v1, 1, v0, 1, v0, 0, v1, 1, v1);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
    const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: this.boostTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    bm.frustumCulled = false; this.scene.add(bm);
  }

  buildProps() {
    const t = this.track, v = new THREE.Vector3();
    const hw = t.HW[0], psi = t.PSI[0];
    const b = new Builder();
    // start gate posts
    for (const side of [-1, 1]) {
      this.trailPoint(0, side * (hw + 0.7), 0, v);
      b.add(new THREE.CylinderGeometry(0.35, 0.45, 7.5, 8), '#8a5c2a', { p: [v.x, v.y + 3.5, v.z] });
      b.add(new THREE.SphereGeometry(0.6, 8, 6), '#ffd23f', { p: [v.x, v.y + 7.5, v.z] });
    }
    // chequered line on the ground
    const SQ = 1.1, cols = Math.floor((hw * 2) / SQ);
    for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
      const d = -hw + (c + 0.5) * (hw * 2 / cols);
      this.trailPoint(0, d, 0.07, v);
      const ox = Math.cos(psi) * (r - 0.5) * SQ, oz = Math.sin(psi) * (r - 0.5) * SQ;
      b.add(new THREE.BoxGeometry(SQ, 0.04, hw * 2 / cols), (r + c) % 2 ? '#ffffff' : '#1e1e24', { p: [v.x + ox, v.y, v.z + oz], r: [0, -psi, 0] });
    }
    // ramp arrows: bright posts either side of each ramp so jumps can be seen coming
    for (const rp of t.ramps) {
      const i = Math.round((rp.s - rp.len) / t.step);
      for (const side of [-1, 1]) {
        this.trailPoint(i, side * (t.HW[((i % t.N) + t.N) % t.N] + 0.5), 0, v);
        b.add(new THREE.CylinderGeometry(0.16, 0.16, 3, 6), '#f4f1e6', { p: [v.x, v.y + 1.5, v.z] });
        b.add(new THREE.ConeGeometry(0.6, 1.1, 4), '#ff4d9a', { p: [v.x, v.y + 3.5, v.z] });
      }
    }
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.frustumCulled = false; this.scene.add(mesh);
    // banner
    const name = this.course.name.toUpperCase();
    const tex = canvasTexture(1024, 160, (x, w, h) => {
      x.fillStyle = '#1b2b5a'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        x.fillStyle = (i + j) % 2 ? '#fff' : '#16161c';
        x.fillRect(i * 40, j * 40, 40, 40); x.fillRect(w - 160 + i * 40, j * 40, 40, 40);
      }
      x.fillStyle = '#ffd23f'; x.font = '900 104px system-ui, "Segoe UI", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(name, w / 2, h / 2 + 6, w - 380);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 1.4, (hw * 2 + 1.4) * 160 / 1024), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    this.trailPoint(0, 0, 6.3, v);
    banner.position.copy(v); banner.rotation.y = -psi - Math.PI / 2;
    this.scene.add(banner);
  }

  buildScenery() {
    const t = this.track, g = this.grid, rnd = rng(4242);
    const W = (g.nx - 1) * g.CELL, D = (g.nz - 1) * g.CELL;
    const trees = [], pines = [], rocks = [];
    for (let k = 0; k < 5200 && trees.length + pines.length < 950; k++) {
      const x = g.x0 + rnd() * W, z = g.z0 + rnd() * D;
      const n = this.nearest(x, z), o = n.dist - t.HW[n.i];
      if (o < 3.4 || o > 150) continue;
      if (o > 45 && rnd() > 0.4) continue;
      const edge = n.lat < 0 ? t.EDGE_L[n.i] : t.EDGE_R[n.i];
      if (edge !== EDGE.FOREST && o < 16) continue;                        // keep the bluff face and the gorge clear
      const h = this.gridHeight(x, z);
      if (h < WATER_Y + 0.5) continue;
      const slope = Math.abs(this.gridHeight(x + 2, z) - this.gridHeight(x - 2, z)) + Math.abs(this.gridHeight(x, z + 2) - this.gridHeight(x, z - 2));
      if (slope > (o > 30 ? 5.5 : 3.2)) continue;
      (rnd() < 0.22 ? pines : trees).push({ x, z, h, s: 0.8 + rnd() * 0.7, c: FALL_COLORS[Math.floor(rnd() * FALL_COLORS.length)], r: rnd() * 6.28 });
    }
    for (let k = 0; k < 1500 && rocks.length < 130; k++) {
      const x = g.x0 + rnd() * W, z = g.z0 + rnd() * D;
      const n = this.nearest(x, z), o = n.dist - t.HW[n.i];
      if (o < 2.6 || o > 30) continue;
      rocks.push({ x, z, h: this.gridHeight(x, z), s: 0.5 + rnd() * 1.4, r: rnd() * 6.28 });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
    const lam = () => new THREE.MeshLambertMaterial({ flatShading: true });
    const add = (geo, mat, list, fn) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => { fn(o); im.setMatrixAt(i, m.compose(p, q, s)); im.setColorAt(i, col); });
      im.frustumCulled = false; this.scene.add(im); return im;
    };
    const trunk = new THREE.CylinderGeometry(0.2, 0.32, 1, 5); trunk.translate(0, 0.5, 0);
    add(trunk, lam(), trees, o => { p.set(o.x, o.h - 0.3, o.z); q.identity(); s.set(o.s, 3.4 * o.s, o.s); col.set('#5d4332'); });
    add(new THREE.IcosahedronGeometry(1, 0), lam(), trees, o => {
      p.set(o.x, o.h + 3.1 * o.s + 1.3 * o.s, o.z); q.setFromEuler(e.set(0, o.r, 0)); s.set(2.3 * o.s, 2.1 * o.s, 2.3 * o.s); col.set(o.c);
    });
    add(new THREE.IcosahedronGeometry(1, 0), lam(), trees, o => {
      p.set(o.x + Math.cos(o.r) * o.s, o.h + 2.6 * o.s, o.z + Math.sin(o.r) * o.s); q.setFromEuler(e.set(o.r, 0, o.r)); s.setScalar(1.4 * o.s); col.set(o.c).multiplyScalar(0.85);
    });
    const pine = new THREE.ConeGeometry(1, 1, 6); pine.translate(0, 0.5, 0);
    add(trunk, lam(), pines, o => { p.set(o.x, o.h - 0.3, o.z); q.identity(); s.set(o.s, 2 * o.s, o.s); col.set('#4d3828'); });
    add(pine, lam(), pines, o => { p.set(o.x, o.h + 1.2 * o.s, o.z); q.setFromEuler(e.set(0, o.r, 0)); s.set(1.9 * o.s, 7 * o.s, 1.9 * o.s); col.set(o.r > 3 ? '#2f6b3a' : '#3d7d3f'); });
    add(new THREE.DodecahedronGeometry(1, 0), lam(), rocks, o => {
      p.set(o.x, o.h + 0.1, o.z); q.setFromEuler(e.set(o.r, o.r * 2, 0)); s.set(o.s * 1.3, o.s * 0.8, o.s); col.set(o.r > 3 ? '#c9a878' : '#a98a66');
    });
  }

  // ---------- racers ----------
  clearRacers() {
    for (const v of this.racers) { this.scene.remove(v.group, v.shadow); v.mesh.geometry.dispose(); }
    this.racers = [];
  }
  addRacer(r) {
    const ch = characterById(r.character);
    const group = new THREE.Group(), tilt = new THREE.Group();
    const mesh = new THREE.Mesh(buildRacerGeometry(ch), this.racerMat);
    tilt.add(mesh);
    const flameGeo = new THREE.ConeGeometry(0.3, 1, 8); flameGeo.rotateZ(Math.PI / 2); flameGeo.translate(-0.5, 0, 0);
    const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.set(-1.95, 0.02, 0); tilt.add(flame);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3), new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#6fe8ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.42; tilt.add(glow);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), new THREE.MeshBasicMaterial({ color: '#8ff4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    shield.scale.set(2.7, 1.7, 1.9); shield.position.y = 0.5; tilt.add(shield);
    group.add(tilt);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 14), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(group, shadow);
    const v = { group, tilt, mesh, flame, glow, shield, shadow, ch, x: 0, y: 0, z: 0, heading: 0, bob: Math.random() * 6 };
    this.racers[r.index] = v;
    return v;
  }

  // ---------- per-frame ----------
  update(race, dt) {
    this.time += dt;
    const t = this.track, P = this._pose;
    this.boostTex.offset.y -= dt * 2.2;
    for (const r of race.racers) {
      const v = this.racers[r.index]; if (!v) continue;
      race.pose(r, P);
      v.group.visible = P.visible;
      v.shadow.visible = P.visible && r.mode === 'drive';
      if (!P.visible) continue;
      const hover = 0.78 + Math.sin(this.time * 5 + v.bob) * 0.06 - (r.landT > 0 ? r.landT * 0.9 : 0);
      v.x = P.x; v.y = P.y + (r.mode === 'drive' ? hover : 0); v.z = P.z; v.heading = P.heading;
      v.group.position.set(v.x, v.y, v.z);
      v.group.rotation.y = -P.heading;
      v.tilt.rotation.set(P.roll, 0, P.pitch);
      const boosting = r.boostT > 0;
      const k = clamp(r.v / V_MAX, 0, 1.4);
      v.flame.scale.set(0.4 + k * (boosting ? 3.4 : 1.5) + Math.random() * 0.25, boosting ? 1.6 : 1, boosting ? 1.6 : 1);
      v.flame.material.color.set(boosting ? '#ffb347' : '#7df9ff');
      v.glow.material.opacity = r.air ? 0.25 : 0.7;
      v.mesh.visible = r.invuln > 0 ? Math.floor(this.time * 14) % 2 === 0 : true;
      v.shield.material.opacity = r.invuln > 0 ? 0.22 : r.shieldT > 0 ? r.shieldT * 0.8 : 0;
      if (r.mode === 'drive') {
        const gy = t.heightAt(r.s) - r.d * Math.sin(t.bankAt(r.s));
        v.shadow.position.set(P.x, gy + 0.08, P.z);
        const up = Math.max(0, P.y - gy);
        v.shadow.scale.setScalar(Math.max(0.35, 1 - up * 0.12));
        v.shadow.material.opacity = 0.32 * Math.max(0.3, 1 - up * 0.12);
        // thruster trail
        if (r.v > 4) {
          const fx = Math.cos(P.heading), fz = Math.sin(P.heading);
          const n = boosting ? 3 : 1;
          for (let i = 0; i < n; i++) this.fx.spawn(v.x - fx * 2.2 + (Math.random() - 0.5) * 0.3, v.y + 0.05 + (Math.random() - 0.5) * 0.3, v.z - fz * 2.2 + (Math.random() - 0.5) * 0.3,
            -fx * 3 + (Math.random() - 0.5), Math.random() * 0.6, -fz * 3 + (Math.random() - 0.5), boosting ? 0.5 : 0.3, boosting ? 1.5 : 0.9, boosting ? (i ? '#ff7a1f' : '#ffe26a') : v.ch.trim, { grow: -0.7 });
        }
        if (r.offroad && r.v > 6 && Math.random() < 0.5) this.puff(v.x, gy + 0.3, v.z, '#b89a6a', 1);
      } else if (Math.random() < 0.7) {
        this.bits.spawn(v.x, v.y, v.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.7, 1.4, '#4a4a52', { grow: 1.5 });
      }
    }
    // drifting autumn leaves around the first camera
    const cam = this.leafCam;
    if (cam) {
      this.leafT += dt * 26;
      while (this.leafT > 1) {
        this.leafT -= 1;
        cam.getWorldDirection(this._v);
        const ahead = 8 + Math.random() * 45, sidew = (Math.random() - 0.5) * 44;
        this.bits.spawn(cam.position.x + this._v.x * ahead - this._v.z * sidew, cam.position.y + 2 + Math.random() * 9, cam.position.z + this._v.z * ahead + this._v.x * sidew,
          1.5 + Math.random(), -1.4 - Math.random(), 0.8, 3.5, 0.42, FALL_COLORS[Math.floor(Math.random() * FALL_COLORS.length)], { drag: 0.1 });
      }
    }
    this.fx.update(dt); this.bits.update(dt);
  }

  puff(x, y, z, color, n) {
    for (let i = 0; i < n; i++) this.bits.spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.6, 1.3, color, { grow: 1.6, drag: 1.5 });
  }
  burst(x, y, z, n, speed, colors, life, size, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u), sp = speed * (0.35 + Math.random() * 0.65);
      (opts && opts.solid ? this.bits : this.fx).spawn(x, y, z, Math.cos(a) * q * sp, Math.abs(u) * sp + (opts && opts.up || 0), Math.sin(a) * q * sp,
        life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), colors[i % colors.length], opts);
    }
  }

  // Sim events → visual effects.
  onEvent(e, race) {
    const v = this.racers[e.r]; const r = race.racers[e.r];
    if (e.type === 'explode') {
      this.burst(e.x, e.y, e.z, 70, 22, ['#ffffff', '#ffe26a', '#ff8a1f', '#ff4d5e'], 0.9, 2.6, { gravity: 12, drag: 1.2 });
      this.burst(e.x, e.y, e.z, 26, 9, ['#55555e', '#77777f'], 1.3, 3.2, { solid: true, grow: 2, drag: 1.5, up: 3 });
      this.burst(e.x, e.y, e.z, 30, 15, FALL_COLORS, 1.6, 0.6, { solid: true, gravity: 16, up: 8 });
      this.fx.spawn(e.x, e.y, e.z, 0, 0, 0, 0.35, 16, '#ffffff', { grow: 2 });
      return;
    }
    if (!v || !r) return;
    if (e.type === 'boost') this.burst(v.x, v.y, v.z, 16, 9, ['#ffe26a', '#7dffff'], 0.5, 1.1, { drag: 2 });
    else if (e.type === 'land') { this.puff(v.x, v.y - 0.6, v.z, '#d6b98c', 7); }
    else if (e.type === 'scrape' || e.type === 'shield') {
      const psi = this.track.psiAt(r.s), sx = -Math.sin(psi) * e.side * 1.1, sz = Math.cos(psi) * e.side * 1.1;
      this.burst(v.x + sx, v.y, v.z + sz, 7, 6, e.type === 'shield' ? ['#8ff4ff', '#ffffff'] : ['#ffb347', '#ffe26a'], 0.35, 0.7, { gravity: 9 });
    } else if (e.type === 'bump') this.burst(v.x, v.y + 0.4, v.z, 8, 6, ['#ffffff', '#ffe26a'], 0.3, 0.8, {});
    else if (e.type === 'respawn') {
      const w = this.track.toWorld(r.s, r.d);
      for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283; this.fx.spawn(w.x + Math.cos(a) * 1.8, w.y + 0.3, w.z + Math.sin(a) * 1.8, 0, 3 + Math.random() * 3, 0, 0.8, 1, i % 2 ? '#8ff4ff' : '#ffffff', {}); }
    } else if (e.type === 'finish') {
      this.burst(v.x, v.y + 2, v.z, 110, 14, ['#ff4d5e', '#ffd23f', '#4fd8ff', '#9be564', '#ff6fb1', '#ffffff'], 2.4, 0.55, { solid: true, gravity: 9, drag: 0.8, up: 9 });
    }
  }

  // ---------- cameras ----------
  makeView(racerIndex) {
    return { racer: racerIndex, cam: new THREE.PerspectiveCamera(64, 1, 0.3, 1500), pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 64, ready: false, rect: { x: 0, y: 0, w: 1, h: 1 }, orbit: false, spin: 0 };
  }
  updateView(view, race, dt) {
    const r = race.racers[view.racer], P = this._pose, v = this._v;
    race.pose(r, P);
    const kPos = 1 - Math.exp(-dt * 7), kLook = 1 - Math.exp(-dt * 11);
    if (r.mode === 'drive') {
      let h = P.psi + r.th * 0.55, dist = 6.6 + clamp(r.v / V_MAX, 0, 1.3) * 1.8, height = 3.1;
      if (view.orbit) { view.spin += dt * 0.25; h += 2.4 + Math.sin(view.spin) * 0.9; dist = 9; height = 3.6; }
      else if (race.state === 'countdown') h += Math.max(0, race.countdown - 0.4) * 0.55;
      const fx = Math.cos(h), fz = Math.sin(h), py = P.y + 0.78;
      v.set(P.x - fx * dist, py + height, P.z - fz * dist);
      // keep the camera out of the hillside
      const gy = this.gridHeight(v.x, v.z) + 1.3; if (v.y < gy) v.y = gy;
      if (!view.ready || r._snap) { view.pos.copy(v); } else view.pos.lerp(v, kPos);
      const ahead = view.orbit ? 0 : 6;
      v.set(P.x + Math.cos(P.psi + r.th * 0.55) * ahead, py + 1.0, P.z + Math.sin(P.psi + r.th * 0.55) * ahead);
      if (!view.ready || r._snap) view.look.copy(v); else view.look.lerp(v, kLook);
      view.ready = true;
    } else {
      v.set(P.x, P.y, P.z); view.look.lerp(v, kLook);
    }
    const k = clamp(r.v / V_MAX, 0, 1.2);
    const fov = 62 + 11 * k * k + (r.boostT > 0 ? 9 : 0);
    view.fov += (fov - view.fov) * (1 - Math.exp(-dt * 5));
    view.cam.position.copy(view.pos);
    view.cam.lookAt(view.look);
    if (r.mode === 'drive' && !view.orbit) view.cam.rotateZ(-r.steer * 0.035);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== this._w || h !== this._h || this.pixelRatio !== this._pr) {
      this._w = w; this._h = h; this._pr = this.pixelRatio;
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(w, h, false);
    }
    return true;
  }
  render(views) {
    if (!this.resize()) return;
    const W = this._w, H = this._h, rdr = this.renderer;
    rdr.setScissorTest(true);
    this.leafCam = views.length ? views[0].cam : null;
    for (const view of views) {
      const x = Math.round(view.rect.x * W), y = Math.round(view.rect.y * H), w = Math.round(view.rect.w * W), h = Math.round(view.rect.h * H);
      rdr.setViewport(x, H - y - h, w, h); rdr.setScissor(x, H - y - h, w, h);
      const cam = view.cam;
      // narrow (portrait) views get a taller field of view so the trail ahead stays visible
      cam.fov = w / h < 1.2 ? view.fov + (1.2 - w / h) * 26 : view.fov;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      this.sky.position.copy(cam.position);
      const scale = h * this.pixelRatio / (2 * Math.tan(cam.fov * Math.PI / 360));
      this.fx.material.uniforms.uScale.value = scale; this.bits.material.uniforms.uScale.value = scale;
      rdr.render(this.scene, cam);
    }
  }

  // A small picture of a character for the menus.
  portrait(ch, size = 200) {
    const rdr = this.renderer, scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b07a45', 2.6));
    const sun = new THREE.DirectionalLight('#fff0cf', 2.4); sun.position.set(0.6, 1, 0.8); scene.add(sun);
    const geo = buildRacerGeometry(ch);
    const mesh = new THREE.Mesh(geo, this.racerMat); mesh.rotation.y = -0.75; scene.add(mesh);
    const cam = new THREE.PerspectiveCamera(27, 1, 0.1, 50);
    cam.position.set(4.3, 2.5, 4.3); cam.lookAt(0.2, 0.78, 0);
    const prevTarget = rdr.getRenderTarget();
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    rdr.setScissorTest(false);
    rdr.setRenderTarget(rt); rdr.setClearColor(0x000000, 0); rdr.clear(); rdr.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    rdr.readRenderTargetPixels(rt, 0, 0, size, size, px);
    rdr.setRenderTarget(prevTarget); rt.dispose(); geo.dispose();
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
}
