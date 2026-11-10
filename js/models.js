// Riders and their hover-ships, built in code from simple shapes and merged into one
// vertex-coloured mesh each, so a racer costs a single draw call.
// Local axes: +X forward, +Y up, +Z right.

import * as THREE from '../vendor/three.module.min.js';

export const CHARACTERS = [
  { id: 'fox', name: 'Rusty', animal: 'Fox', fur: '#f08a2c', snout: '#fff3e0', ears: 'pointy', tail: 'bushy', tailTip: '#fff3e0', ship: '#ff4d5e', trim: '#ffd23f', helmet: '#4fd8ff' },
  { id: 'raccoon', name: 'Bandit', animal: 'Raccoon', fur: '#9aa0a8', snout: '#f1f1f1', ears: 'round', mask: '#2a2c33', tail: 'ringed', tailTip: '#2a2c33', ship: '#8a5cf6', trim: '#4fd8ff', helmet: '#ffd23f' },
  { id: 'bear', name: 'Bramble', animal: 'Black Bear', fur: '#3b2d27', snout: '#c9a27a', ears: 'round', ship: '#2f7bff', trim: '#ff8a1f', helmet: '#ff4d5e' },
  { id: 'owl', name: 'Hoot', animal: 'Owl', fur: '#8a6a48', snout: '#ffb020', ears: 'tuft', eyes: 'big', beak: true, ship: '#2fbf71', trim: '#ffe26a', helmet: '#f4f1e6' },
  { id: 'bunny', name: 'Clover', animal: 'Cottontail', fur: '#e9e2d8', snout: '#ffffff', ears: 'long', nose: '#ff8fb0', tail: 'puff', tailTip: '#ffffff', ship: '#ff6fb1', trim: '#ffffff', helmet: '#9be564' },
  { id: 'skunk', name: 'Pepper', animal: 'Skunk', fur: '#25252d', snout: '#3a3a44', ears: 'round', stripe: '#ffffff', tail: 'bushy', tailTip: '#ffffff', ship: '#ffd23f', trim: '#25252d', helmet: '#ff6fb1' },
  { id: 'frog', name: 'Ribbit', animal: 'Tree Frog', fur: '#5fc24a', snout: '#c9f08a', ears: 'none', eyes: 'top', ship: '#ff8a1f', trim: '#19c2c2', helmet: '#8a5cf6' },
  { id: 'bobcat', name: 'Tuft', animal: 'Bobcat', fur: '#c9a26b', snout: '#f6ead2', ears: 'lynx', ruff: true, ship: '#19c2c2', trim: '#ff4d9a', helmet: '#ff8a1f' },
];
export const characterById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

// ---- tiny geometry merger ----
export class Builder {
  constructor() { this.pos = []; this.col = []; this.m = new THREE.Matrix4(); this.c = new THREE.Color(); }
  // geo: any BufferGeometry. opts: { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz] | number }
  add(geo, color, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = opts.p || [0, 0, 0], r = opts.r || [0, 0, 0];
    const s = typeof opts.s === 'number' ? [opts.s, opts.s, opts.s] : (opts.s || [1, 1, 1]);
    this.m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    const a = g.attributes.position, v = new THREE.Vector3();
    this.c.set(color);
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(this.m);
      this.pos.push(v.x, v.y, v.z); this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const sphere = (r = 1, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const cyl = (r1, r2, h, seg = 6) => new THREE.CylinderGeometry(r1, r2, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const HALF = Math.PI / 2;

export function buildRacerGeometry(ch) {
  const b = new Builder();
  const dark = '#22252b';

  // ---------- ship ----------
  b.add(sphere(1, 10, 6), ch.ship, { s: [1.75, 0.42, 0.82] });                               // hull
  b.add(sphere(1, 8, 5), ch.trim, { p: [0.15, -0.16, 0], s: [1.5, 0.3, 0.95] });             // belly stripe
  b.add(cone(0.4, 1.2, 8), ch.trim, { p: [1.95, 0.02, 0], r: [0, 0, -HALF], s: [1, 1, 1.5] }); // nose
  for (const z of [-1, 1]) {
    b.add(cyl(0.2, 0.27, 1.9, 6), ch.trim, { p: [-0.35, -0.12, z * 0.98], r: [0, 0, -HALF] }); // side pods
    b.add(cone(0.2, 0.5, 6), ch.ship, { p: [0.85, -0.12, z * 0.98], r: [0, 0, -HALF] });
    b.add(cyl(0.16, 0.2, 0.18, 6), '#bff6ff', { p: [-1.38, -0.12, z * 0.98], r: [0, 0, -HALF] }); // pod glow rings
    b.add(box(0.5, 0.07, 0.5), ch.ship, { p: [-0.3, -0.1, z * 0.6] });                        // struts
    b.add(box(0.75, 0.5, 0.07), ch.ship, { p: [-1.25, 0.42, z * 0.5], r: [z * -0.35, 0, -0.5] }); // twin tail fins
  }
  b.add(cyl(0.34, 0.26, 0.5, 8), dark, { p: [-1.72, 0.02, 0], r: [0, 0, -HALF] });           // main thruster
  b.add(cyl(0.25, 0.25, 0.06, 8), '#bff6ff', { p: [-1.98, 0.02, 0], r: [0, 0, -HALF] });
  b.add(sphere(0.62, 8, 5), dark, { p: [-0.1, 0.24, 0], s: [1.15, 0.45, 0.85] });            // cockpit well
  b.add(box(0.08, 0.5, 0.08), dark, { p: [0.62, 0.52, 0], r: [0, 0, -0.35] });               // handlebar stem
  b.add(box(0.08, 0.08, 1.0), dark, { p: [0.72, 0.76, 0] });
  for (const z of [-1, 1]) b.add(sphere(0.09, 5, 4), ch.trim, { p: [0.72, 0.76, z * 0.52] });

  // ---------- rider ----------
  const hy = 1.42, hx = 0.02;                                                                // head centre
  b.add(sphere(1, 8, 6), ch.fur, { p: [-0.12, 0.74, 0], s: [0.36, 0.44, 0.36] });            // body
  b.add(sphere(1, 7, 5), ch.snout, { p: [0.08, 0.72, 0], s: [0.2, 0.3, 0.24] });             // tummy patch
  for (const z of [-1, 1]) b.add(cyl(0.08, 0.08, 0.72, 5), ch.fur, { p: [0.3, 0.84, z * 0.4], r: [z * 0.3, 0, -1.15] }); // arms
  b.add(sphere(0.4, 9, 7), ch.fur, { p: [hx, hy, 0] });                                      // head
  if (ch.ruff) for (const z of [-1, 1]) b.add(cone(0.16, 0.34, 4), ch.snout, { p: [hx + 0.05, hy - 0.14, z * 0.4], r: [z * HALF, 0, 0] });
  if (ch.beak) b.add(cone(0.1, 0.26, 4), ch.snout, { p: [hx + 0.44, hy - 0.06, 0], r: [0, 0, -HALF - 0.3] });
  else {
    b.add(sphere(1, 7, 5), ch.snout, { p: [hx + 0.32, hy - 0.1, 0], s: [0.2, 0.15, 0.2] });  // snout
    b.add(sphere(0.06, 5, 4), ch.nose || dark, { p: [hx + 0.52, hy - 0.06, 0] });            // nose
  }
  if (ch.mask) b.add(sphere(1, 7, 5), ch.mask, { p: [hx + 0.22, hy + 0.06, 0], s: [0.2, 0.1, 0.37] });
  if (ch.eyes === 'big') {
    for (const z of [-1, 1]) {
      b.add(sphere(0.15, 7, 5), '#ffffff', { p: [hx + 0.3, hy + 0.06, z * 0.17], s: [0.6, 1, 1] });
      b.add(sphere(0.07, 5, 4), dark, { p: [hx + 0.38, hy + 0.06, z * 0.17] });
    }
  } else if (ch.eyes === 'top') {
    for (const z of [-1, 1]) {
      b.add(sphere(0.15, 7, 5), ch.fur, { p: [hx + 0.12, hy + 0.36, z * 0.2] });
      b.add(sphere(0.1, 6, 4), '#ffffff', { p: [hx + 0.2, hy + 0.38, z * 0.2] });
      b.add(sphere(0.05, 5, 4), dark, { p: [hx + 0.28, hy + 0.39, z * 0.2] });
    }
  } else {
    for (const z of [-1, 1]) {
      b.add(sphere(0.075, 6, 4), '#ffffff', { p: [hx + 0.32, hy + 0.08, z * 0.16] });
      b.add(sphere(0.045, 5, 4), dark, { p: [hx + 0.38, hy + 0.08, z * 0.16] });
    }
  }
  // helmet: a cap over the top and back of the head, with a peak
  if (ch.eyes !== 'top') {
    b.add(new THREE.SphereGeometry(0.44, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.46), ch.helmet, { p: [hx - 0.04, hy + 0.04, 0], r: [0, 0, 0.25] });
    b.add(box(0.26, 0.05, 0.5), ch.helmet, { p: [hx + 0.36, hy + 0.2, 0], r: [0, 0, -0.15] });
    if (ch.stripe) b.add(box(0.7, 0.06, 0.14), ch.stripe, { p: [hx - 0.08, hy + 0.47, 0], r: [0, 0, 0.25] });
  } else {
    b.add(new THREE.SphereGeometry(0.43, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.3), ch.helmet, { p: [hx - 0.1, hy + 0.03, 0], r: [0, 0, 0.5] });
  }
  // ears
  for (const z of [-1, 1]) {
    if (ch.ears === 'pointy') {
      b.add(cone(0.15, 0.36, 4), ch.fur, { p: [hx - 0.05, hy + 0.5, z * 0.27], r: [z * 0.25, 0, 0] });
      b.add(cone(0.08, 0.2, 4), dark, { p: [hx - 0.03, hy + 0.56, z * 0.28], r: [z * 0.25, 0, 0] });
    } else if (ch.ears === 'lynx') {
      b.add(cone(0.14, 0.36, 4), ch.fur, { p: [hx - 0.05, hy + 0.5, z * 0.27], r: [z * 0.3, 0, 0] });
      b.add(cone(0.035, 0.24, 4), dark, { p: [hx - 0.05, hy + 0.76, z * 0.34], r: [z * 0.3, 0, 0] });
    } else if (ch.ears === 'round') {
      b.add(sphere(0.15, 6, 5), ch.fur, { p: [hx - 0.05, hy + 0.4, z * 0.33], s: [0.6, 1, 1] });
    } else if (ch.ears === 'long') {
      b.add(sphere(1, 6, 5), ch.fur, { p: [hx - 0.16, hy + 0.72, z * 0.2], s: [0.1, 0.42, 0.14], r: [0, 0, 0.3] });
      b.add(sphere(1, 5, 4), ch.nose || '#ff8fb0', { p: [hx - 0.1, hy + 0.72, z * 0.2], s: [0.05, 0.3, 0.08], r: [0, 0, 0.3] });
    } else if (ch.ears === 'tuft') {
      b.add(cone(0.1, 0.3, 4), ch.fur, { p: [hx - 0.02, hy + 0.5, z * 0.3], r: [z * 0.5, 0, 0] });
    }
  }
  // tails
  if (ch.tail === 'bushy') {
    b.add(sphere(1, 6, 5), ch.fur, { p: [-0.72, 0.9, 0], s: [0.42, 0.24, 0.24], r: [0, 0, -0.7] });
    b.add(sphere(0.18, 6, 5), ch.tailTip, { p: [-0.98, 1.14, 0] });
    if (ch.stripe) b.add(box(0.7, 0.06, 0.12), ch.stripe, { p: [-0.72, 1.06, 0], r: [0, 0, -0.7] });
  } else if (ch.tail === 'ringed') {
    for (let i = 0; i < 4; i++) b.add(sphere(0.19 - i * 0.012, 6, 5), i % 2 ? ch.tailTip : ch.fur, { p: [-0.55 - i * 0.17, 0.78 + i * 0.13, 0] });
  } else if (ch.tail === 'puff') {
    b.add(sphere(0.17, 6, 5), ch.tailTip, { p: [-0.55, 0.62, 0] });
  }
  return b.build();
}

// Small standalone picture of a character, used for menu portraits.
export function racerMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
