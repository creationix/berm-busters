// The hatchlings: baby Ozark animals that hatch from rescued eggs and live in your Den.
// Models are built in code from simple shapes, like the riders. Local axes: +X forward, +Y up.

import * as THREE from '../vendor/three.module.min.js';
import { Builder } from './models.js';

export const RARITY = ['Common', 'Uncommon', 'Rare', 'Legendary'];
export const RARITY_COLOR = ['#f4f1e6', '#4fd8ff', '#c77dff', '#ffd23f'];
export const EGG_NAME = ['Trail egg', 'Sky egg', 'Cliff egg', 'Golden egg'];

export const CRITTERS = [
  // common
  { id: 'duckling', name: 'Duckling', rarity: 0, kind: 'bird', body: '#ffe066', belly: '#fff3b0', wing: '#f5c93a', beak: '#ff8a1f', bill: true },
  { id: 'bluebird', name: 'Bluebird', rarity: 0, kind: 'bird', body: '#3f8cff', belly: '#ff9a52', wing: '#2a6fd6', beak: '#3a3a44' },
  { id: 'cardinal', name: 'Cardinal', rarity: 0, kind: 'bird', body: '#e8322e', belly: '#f05a4a', wing: '#b9211f', beak: '#ff8a1f', crest: true, mask: '#2a1a1a' },
  { id: 'boxturtle', name: 'Box Turtle', rarity: 0, kind: 'turtle', shell: '#6b4a2a', spots: '#ffb020', skin: '#8a7a3a' },
  { id: 'treefrog', name: 'Tree Frog', rarity: 0, kind: 'frog', body: '#5fc24a', belly: '#e6f5b0' },
  { id: 'crawdad', name: 'Crawdad', rarity: 0, kind: 'crawdad', body: '#d9412a', claw: '#ff6a3a' },
  // uncommon
  { id: 'owlet', name: 'Owlet', rarity: 1, kind: 'bird', body: '#9a7a58', belly: '#e8d8c0', wing: '#7a5c40', beak: '#ffb020', bigEyes: true, tufts: true, fluffy: true },
  { id: 'poult', name: 'Turkey Poult', rarity: 1, kind: 'bird', body: '#c9a26b', belly: '#f0dfb8', wing: '#8a6a40', beak: '#e8c070', stripe: '#5a4028', longLegs: true },
  { id: 'bunting', name: 'Painted Bunting', rarity: 1, kind: 'bird', body: '#e8322e', belly: '#ff5a3a', wing: '#7ac23a', beak: '#b0b0b8', head: '#2f6fe0' },
  { id: 'boomer', name: 'Collared Lizard', rarity: 1, kind: 'crawler', body: '#22b8a0', belly: '#f5e06a', head: '#f5c93a', collar: '#1e1e24', spots: '#f5e06a' },
  // rare
  { id: 'hellbender', name: 'Hellbender', rarity: 2, kind: 'crawler', body: '#8a6a4a', belly: '#c9a880', head: '#8a6a4a', flat: true, spots: '#5a4030' },
  { id: 'roadrunner', name: 'Roadrunner', rarity: 2, kind: 'bird', body: '#8a7a60', belly: '#efe6d0', wing: '#5a4a38', beak: '#4a4a52', crest: true, longTail: true, longLegs: true, stripe: '#3a3028' },
  { id: 'eaglet', name: 'Bald Eaglet', rarity: 2, kind: 'bird', body: '#4a3626', belly: '#5a4230', wing: '#3a2a1e', beak: '#ffc21f', head: '#ffffff', fluffy: true, hook: true },
  { id: 'snapper', name: 'Snapping Turtle', rarity: 2, kind: 'turtle', shell: '#4a5238', spots: null, skin: '#6a7048', spikes: true, bigHead: true },
  // legendary
  { id: 'arkansaurus', name: 'Arkansaurus', rarity: 3, kind: 'dino', body: '#2fbf8a', belly: '#f5e6a0', crest: '#ff6a3a', stripe: '#1f8a66' },
];
export const critterById = id => CRITTERS.find(c => c.id === id);

const sphere = (r = 1, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const cyl = (r1, r2, h, seg = 6) => new THREE.CylinderGeometry(r1, r2, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const HALF = Math.PI / 2, DARK = '#1e1e24';

function eyes(b, x, y, z, r = 0.07) {
  for (const s of [-1, 1]) {
    b.add(sphere(r, 6, 5), '#ffffff', { p: [x, y, s * z] });
    b.add(sphere(r * 0.6, 5, 4), DARK, { p: [x + r * 0.6, y, s * z * 1.02] });
  }
}

function bird(b, c) {
  const head = c.head || c.body, hy = 0.78, hx = 0.2;
  b.add(sphere(1, 9, 7), c.body, { p: [-0.05, 0.42, 0], s: c.fluffy ? [0.5, 0.48, 0.47] : [0.5, 0.42, 0.4] });
  b.add(sphere(1, 8, 6), c.belly, { p: [0.12, 0.36, 0], s: [0.36, 0.33, 0.33] });
  b.add(sphere(c.fluffy ? 0.34 : 0.3, 9, 7), head, { p: [hx, hy, 0] });
  if (c.mask) b.add(sphere(1, 7, 5), c.mask, { p: [hx + 0.2, hy - 0.04, 0], s: [0.14, 0.12, 0.22] });
  if (c.bill) b.add(sphere(1, 7, 5), c.beak, { p: [hx + 0.34, hy - 0.06, 0], s: [0.2, 0.06, 0.15] });
  else if (c.hook) { b.add(cone(0.09, 0.24, 5), c.beak, { p: [hx + 0.34, hy - 0.04, 0], r: [0, 0, -HALF - 0.5] }); }
  else b.add(cone(0.08, 0.22, 5), c.beak, { p: [hx + 0.34, hy - 0.03, 0], r: [0, 0, -HALF] });
  if (c.bigEyes) { for (const s of [-1, 1]) b.add(sphere(0.15, 8, 6), '#fff6d8', { p: [hx + 0.2, hy + 0.04, s * 0.15], s: [0.5, 1, 1] }); eyes(b, hx + 0.27, hy + 0.04, 0.15, 0.08); }
  else eyes(b, hx + 0.2, hy + 0.07, 0.17);
  if (c.crest) b.add(cone(0.11, 0.34, 4), c.body, { p: [hx - 0.08, hy + 0.34, 0], r: [0, 0, 0.5] });
  if (c.tufts) for (const s of [-1, 1]) b.add(cone(0.07, 0.2, 4), c.wing, { p: [hx - 0.02, hy + 0.32, s * 0.2], r: [s * 0.5, 0, 0] });
  for (const s of [-1, 1]) {
    b.add(sphere(1, 7, 5), c.wing, { p: [-0.1, 0.46, s * 0.4], s: [0.3, 0.2, 0.08], r: [s * 0.25, 0, -0.3] });   // wings
    const leg = c.longLegs ? 0.36 : 0.16;
    b.add(cyl(0.03, 0.03, leg, 4), c.beak === '#3a3a44' ? '#8a6a4a' : '#ff9a3a', { p: [0, leg / 2 - (c.longLegs ? 0.18 : 0), s * 0.15] });
    b.add(box(0.2, 0.03, 0.12), '#ff9a3a', { p: [0.06, c.longLegs ? -0.18 : 0.0, s * 0.15] });
  }
  if (c.stripe) for (const z of [-0.12, 0.12]) b.add(box(0.5, 0.05, 0.06), c.stripe, { p: [-0.08, 0.83, z], r: [0, 0, -0.1] });
  const tl = c.longTail ? 0.7 : 0.26;
  b.add(box(tl, 0.05, 0.2), c.wing, { p: [-0.5 - tl / 2 + 0.1, 0.5 + (c.longTail ? 0.12 : 0.04), 0], r: [0, 0, c.longTail ? -0.3 : -0.5] });
}

function turtle(b, c) {
  b.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, HALF), c.shell, { p: [0, 0.2, 0], s: [0.58, 0.46, 0.48] });   // shell dome
  b.add(cyl(0.6, 0.56, 0.1, 10), c.skin, { p: [0, 0.18, 0], s: [1, 1, 0.84] });
  if (c.spots) for (const [x, y, z] of [[0, 0.62, 0], [0.26, 0.5, 0.18], [0.26, 0.5, -0.18], [-0.26, 0.5, 0.18], [-0.26, 0.5, -0.18]]) b.add(sphere(0.09, 6, 5), c.spots, { p: [x, y, z] });
  if (c.spikes) for (const x of [-0.25, 0, 0.25]) b.add(cone(0.1, 0.2, 4), '#7a8458', { p: [x, 0.66 - Math.abs(x) * 0.3, 0] });
  const hr = c.bigHead ? 0.25 : 0.19;
  b.add(sphere(hr, 8, 6), c.skin, { p: [0.68, 0.34, 0] });
  if (c.bigHead) b.add(cone(0.12, 0.2, 4), c.skin, { p: [0.92, 0.3, 0], r: [0, 0, -HALF] });
  eyes(b, 0.68 + hr * 0.6, 0.34 + hr * 0.5, hr * 0.6, 0.055);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(sphere(0.13, 6, 5), c.skin, { p: [sx * 0.38, 0.12, sz * 0.4], s: [1, 0.7, 1] });
  b.add(cone(0.07, 0.3, 4), c.skin, { p: [-0.68, 0.2, 0], r: [0, 0, HALF] });
}

function crawler(b, c) {
  const flat = c.flat ? 0.7 : 1;
  b.add(sphere(1, 9, 6), c.body, { p: [-0.05, 0.22, 0], s: [0.55, 0.19 * flat, c.flat ? 0.3 : 0.22] });
  b.add(sphere(1, 8, 5), c.belly, { p: [-0.02, 0.16, 0], s: [0.5, 0.13 * flat, 0.19] });
  b.add(sphere(1, 8, 6), c.head, { p: [0.55, 0.3, 0], s: [0.26, 0.17 * flat + 0.02, c.flat ? 0.3 : 0.2] });
  if (c.collar) b.add(sphere(1, 8, 5), c.collar, { p: [0.36, 0.27, 0], s: [0.07, 0.19, 0.21] });
  eyes(b, 0.62, 0.42 * (c.flat ? 0.85 : 1), c.flat ? 0.2 : 0.13, c.flat ? 0.04 : 0.06);
  b.add(cone(0.15, 0.85, 6), c.body, { p: [-0.9, 0.2, 0], r: [0, 0, HALF], s: [flat, 1, 1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(cyl(0.05, 0.05, 0.3, 4), c.body, { p: [sx * 0.28, 0.12, sz * 0.3], r: [sz * 0.9, 0, 0] });
    b.add(sphere(0.08, 5, 4), c.belly, { p: [sx * 0.28 + 0.05, 0.04, sz * 0.42], s: [1.3, 0.5, 1] });
  }
  if (c.spots) for (const [x, z] of [[-0.3, 0.08], [-0.05, -0.1], [0.18, 0.07], [-0.5, -0.04]]) b.add(sphere(0.06, 5, 4), c.spots, { p: [x, 0.39 * flat + (c.flat ? 0.07 : 0), z], s: [1, 0.4, 1] });
}

function frog(b, c) {
  b.add(sphere(1, 9, 7), c.body, { p: [0, 0.3, 0], s: [0.42, 0.3, 0.4] });
  b.add(sphere(1, 8, 6), c.belly, { p: [0.1, 0.24, 0], s: [0.34, 0.22, 0.34] });
  for (const s of [-1, 1]) {
    b.add(sphere(0.14, 7, 6), c.body, { p: [0.2, 0.6, s * 0.2] });
    b.add(sphere(0.1, 6, 5), '#ffffff', { p: [0.27, 0.62, s * 0.2] });
    b.add(sphere(0.055, 5, 4), DARK, { p: [0.34, 0.63, s * 0.2] });
    b.add(sphere(1, 7, 5), c.body, { p: [-0.2, 0.16, s * 0.4], s: [0.3, 0.15, 0.17], r: [0, s * 0.5, 0] });     // folded back legs
    b.add(sphere(1, 6, 4), '#ffb020', { p: [0.06, 0.03, s * 0.52], s: [0.2, 0.04, 0.14] });
    b.add(cyl(0.05, 0.05, 0.3, 4), c.body, { p: [0.3, 0.14, s * 0.26] });
    b.add(sphere(1, 6, 4), '#ffb020', { p: [0.36, 0.02, s * 0.28], s: [0.14, 0.04, 0.12] });
  }
  b.add(box(0.03, 0.03, 0.4), '#2f7a2a', { p: [0.4, 0.36, 0] });       // a wide smile
}

function crawdad(b, c) {
  b.add(sphere(1, 8, 6), c.body, { p: [0.15, 0.24, 0], s: [0.36, 0.2, 0.24] });
  for (let i = 0; i < 3; i++) b.add(sphere(1, 7, 5), i % 2 ? c.claw : c.body, { p: [-0.2 - i * 0.2, 0.22 - i * 0.02, 0], s: [0.16, 0.15 - i * 0.02, 0.2 - i * 0.02] });
  b.add(box(0.26, 0.04, 0.44), c.claw, { p: [-0.88, 0.16, 0] });       // tail fan
  for (const s of [-1, 1]) {
    b.add(cyl(0.05, 0.05, 0.42, 4), c.body, { p: [0.52, 0.26, s * 0.3], r: [s * 0.55, 0, -HALF + 0.2] });
    b.add(sphere(1, 7, 5), c.claw, { p: [0.82, 0.3, s * 0.44], s: [0.22, 0.12, 0.15] });
    b.add(cone(0.06, 0.24, 4), c.claw, { p: [1.02, 0.36, s * 0.4], r: [0, 0, -HALF] });
    b.add(cone(0.05, 0.2, 4), c.claw, { p: [1.0, 0.24, s * 0.5], r: [0, 0, -HALF] });
    b.add(cyl(0.02, 0.02, 0.14, 4), c.body, { p: [0.44, 0.44, s * 0.1] });
    b.add(sphere(0.06, 5, 4), DARK, { p: [0.45, 0.53, s * 0.1] });
    b.add(cyl(0.012, 0.012, 0.6, 3), c.claw, { p: [0.7, 0.5, s * 0.14], r: [0, s * -0.3, -HALF + 0.5] });      // antennae
    for (let i = 0; i < 3; i++) b.add(cyl(0.025, 0.025, 0.26, 3), c.body, { p: [0.2 - i * 0.16, 0.1, s * 0.28], r: [s * 1.0, 0, 0] });
  }
}

function dino(b, c) {
  b.add(sphere(1, 9, 7), c.body, { p: [-0.05, 0.62, 0], s: [0.42, 0.28, 0.25] });
  b.add(sphere(1, 8, 6), c.belly, { p: [0.0, 0.55, 0], s: [0.36, 0.2, 0.21] });
  b.add(cyl(0.09, 0.13, 0.55, 6), c.body, { p: [0.36, 0.95, 0], r: [0, 0, -0.45] });                         // long neck
  b.add(sphere(1, 8, 6), c.body, { p: [0.55, 1.25, 0], s: [0.2, 0.15, 0.15] });                               // small head
  b.add(cone(0.08, 0.2, 5), '#f5c93a', { p: [0.78, 1.22, 0], r: [0, 0, -HALF] });                              // beak
  eyes(b, 0.6, 1.3, 0.11, 0.055);
  for (let i = 0; i < 3; i++) b.add(cone(0.05, 0.16, 4), c.crest, { p: [0.44 - i * 0.07, 1.4 - i * 0.1, 0], r: [0, 0, 0.6] });   // feathery crest
  b.add(cone(0.2, 1.0, 6), c.body, { p: [-0.88, 0.66, 0], r: [0, 0, HALF - 0.12] });                           // tail
  for (const x of [-0.6, -0.9, -1.15]) b.add(box(0.1, 0.04, 0.2), c.stripe, { p: [x, 0.78 + (x + 0.6) * -0.1, 0] });
  for (const s of [-1, 1]) {
    b.add(sphere(1, 7, 5), c.body, { p: [-0.1, 0.42, s * 0.17], s: [0.16, 0.24, 0.12] });                     // thighs
    b.add(cyl(0.045, 0.04, 0.34, 4), c.stripe, { p: [-0.02, 0.17, s * 0.17] });
    b.add(box(0.26, 0.04, 0.14), '#f5c93a', { p: [0.07, 0.02, s * 0.17] });
    b.add(cyl(0.03, 0.03, 0.22, 4), c.body, { p: [0.3, 0.6, s * 0.2], r: [0, 0, -1.0] });                     // little arms
  }
}

const KINDS = { bird, turtle, crawler, frog, crawdad, dino };

export function buildCritterGeometry(c) {
  const b = new Builder();
  KINDS[c.kind](b, c);
  return b.build();
}

// ---------- hatching ----------
// What an egg of each kind can hatch into: [rarity, weight] pairs.
const HATCH_TABLE = [
  [[0, 86], [1, 14]],           // trail egg
  [[1, 80], [2, 20]],           // sky egg
  [[2, 90], [3, 10]],           // cliff egg
  [[3, 22], [2, 78]],           // golden egg
];
export const SHINY_CHANCE = 0.07;

export function hatch(tier, rnd = Math.random) {
  const table = HATCH_TABLE[tier] || HATCH_TABLE[0];
  let roll = rnd() * table.reduce((a, t) => a + t[1], 0), rarity = table[0][0];
  for (const [r, w] of table) { if (roll < w) { rarity = r; break; } roll -= w; }
  const pool = CRITTERS.filter(c => c.rarity === rarity);
  return { critter: pool[Math.floor(rnd() * pool.length)], shiny: rnd() < SHINY_CHANCE, tier };
}

// ---------- the Den: what has been hatched so far (saved on this device) ----------
const KEY = 'berm-busters-den';      // other games share this origin: keep the name specific
export function loadDen() {
  let den = null;
  try { den = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!den || typeof den !== 'object') den = {};
  den.found = den.found || {}; den.shiny = den.shiny || {}; den.buddy = den.buddy || null; den.hatched = den.hatched || 0;
  return den;
}
export function saveDen(den) { try { localStorage.setItem(KEY, JSON.stringify(den)); } catch (e) {} }
// Adds one hatch to the den and says what was new about it.
export function addToDen(den, h) {
  const id = h.critter.id;
  const isNew = !den.found[id], newShiny = h.shiny && !den.shiny[id];
  den.found[id] = (den.found[id] || 0) + 1;
  if (h.shiny) den.shiny[id] = true;
  if (!den.buddy) den.buddy = id;          // the very first hatchling becomes the co-pilot
  den.hatched++;
  return { isNew, newShiny };
}
export const denCount = den => CRITTERS.filter(c => den.found[c.id]).length;
