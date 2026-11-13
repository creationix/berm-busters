// Course data. Positions are in rough metres before `scale`; y is trail height.
// "at", "from" and "to" count along the control points: 4.5 is halfway between points 4 and 5.
// These are inspired by the feel of the real trails, not traced from their routes.

export const FOSSIL_FLATS = {
  id: 'fossil-flats',
  name: 'Fossil Flats',
  difficulty: 'Medium',
  color: '#ffd23f',
  blurb: 'A friendly creekside loop: rollers, berms, a bluff ledge and a bridge over Lee Creek.',
  laps: 3,
  scale: 1.3,
  halfWidth: 5.5,
  points: [
    { x: 0, z: 84, y: 0 },          // 0  start / finish, heading east along the creek
    { x: 62, z: 86, y: 0 },         // 1
    { x: 122, z: 74, y: 0.5 },      // 2
    { x: 168, z: 40, y: 1.5 },      // 3  left-hand berm away from the creek
    { x: 182, z: -8, y: 3.5 },      // 4  climbing
    { x: 150, z: -40, y: 5.5 },     // 5  S-bend
    { x: 142, z: -84, y: 8 },       // 6
    { x: 98, z: -104, y: 10.5 },    // 7  onto the bluff
    { x: 44, z: -92, y: 12, w: 5 }, // 8  ledge: rock wall left, drop right
    { x: -8, z: -106, y: 12.5, w: 5 }, // 9
    { x: -62, z: -94, y: 12, w: 5 },   // 10 ledge ends
    { x: -106, z: -60, y: 11.5, w: 4.6 }, // 11 bridge over the gorge
    { x: -128, z: -8, y: 9.5, w: 5 },     // 12 off the bridge, descending
    { x: -112, z: 40, y: 5 },       // 13 rollers
    { x: -66, z: 70, y: 1.5 },      // 14 last berm, then the kicker onto the home straight
  ],
  edges: [
    { from: 7.6, to: 10.3, left: 'wall', right: 'cliff', surface: 'rock' },
    { from: 10.55, to: 11.75, left: 'cliff', right: 'cliff', surface: 'wood' },
  ],
  features: [
    { type: 'boost', at: 0.35, d: 0 },
    { type: 'table', at: 1.25, h: 1.5 },
    { type: 'boost', at: 2.5, d: -2.5 },
    { type: 'rollers', at: 4.35, count: 3, len: 11, h: 0.8 },
    { type: 'kicker', at: 8.75, h: 1.3, len: 9 },
    { type: 'boost', at: 9.55, d: 0 },
    { type: 'boost', at: 12.05, d: 0 },
    { type: 'rollers', at: 12.45, count: 4, len: 11, h: 1.0 },
    { type: 'kicker', at: 14.55, h: 1.9, len: 10 },
  ],
  // The mountain the trail climbs round sits inside the loop.
  branches: [
    { id: 'fern-cut', name: 'Fern Cut', from: 2.2, to: 6.3, side: -1, hidden: true, halfWidth: 2.4,
      points: [{ x: 144, z: -2, y: 3 }, { x: 126, z: -48, y: 6 }] },
  ],
  mountain: { x: 10, z: -15, radius: 80, height: 34 },
  // Lee Creek runs alongside the home straight.
  creek: { z: 112, width: 13, depth: 8 },
  sky: { top: '#2a6fd6', mid: '#8fc7ff', horizon: '#ffd9a0' },
};

export const CREEKSIDE_CRUISE = {
  id: 'creekside-cruise',
  name: 'Creekside Cruise',
  difficulty: 'Easy',
  color: '#9be564',
  blurb: 'Wide turns, gentle rollers and little jumps. A great first race beside the creek.',
  laps: 3,
  halfWidth: 6.5,
  points: [
    { x: 0, z: 68 },
    { x: 56, z: 68 },
    { x: 108, z: 46, y: 0.5 },
    { x: 130, z: 0, y: 1 },
    { x: 108, z: -48, y: 2 },
    { x: 58, z: -68, y: 3 },
    { x: 0, z: -62, y: 3 },
    { x: -56, z: -74, y: 2 },
    { x: -108, z: -42, y: 1 },
    { x: -124, z: 6, y: 0.5 },
    { x: -90, z: 54 },
    { x: -46, z: 72 },
  ],
  features: [
    { type: 'boost', at: 0.4, half: 3 },
    { type: 'rollers', at: 2.2, count: 3, len: 13, h: 0.5 },
    { type: 'table', at: 4.3, h: 0.9, ramp: 9, top: 10 },
    { type: 'boost', at: 6.4, half: 3 },
    { type: 'rollers', at: 8.4, count: 3, len: 12, h: 0.6 },
    { type: 'kicker', at: 10.7, h: 1, len: 10 },
  ],
  branches: [
    { id: 'creek-loop', name: 'Creek Loop', from: 2.7, to: 7.2, side: 1, halfWidth: 4.4,
      points: [{ x: 176, z: -20, y: 2 }, { x: 184, z: -90, y: 5 }, { x: 124, z: -128, y: 5 }, { x: 48, z: -106, y: 4 }],
      features: [{ type: 'boost', at: 1.4 }, { type: 'boost', at: 3.1 }, { type: 'table', at: 4.2, h: 1.2 }] },
    { id: 'reed-cut', name: 'Reed Cut', from: 7.6, to: 11, side: -1, hidden: true, halfWidth: 2.4,
      points: [{ x: -92, z: 0, y: 1 }, { x: -74, z: 36, y: 0.5 }] },
  ],
  mountain: { x: 4, z: -8, radius: 62, height: 15 },
  creek: { z: 92, width: 15, depth: 9 },
  sky: { top: '#247ed4', mid: '#a4dfff', horizon: '#e4f8d1' },
};

export const PINE_HOLLOW = {
  id: 'pine-hollow',
  name: 'Pine Hollow',
  difficulty: 'Medium',
  color: '#4fd8ff',
  blurb: 'A figure eight under and over a high bridge, with a forest loop and secret cut-through.',
  laps: 3,
  scale: 1.15,
  halfWidth: 5.8,
  points: [
    { x: -150.00, z: -0.00, y: 1 },
    { x: -138.58, z: -62.23, y: 1 },
    { x: -106.07, z: -88.00, y: 2 },
    { x: -57.40, z: -62.23, y: 3 },
    { x: 0.00, z: 0.00, y: 4 },
    { x: 57.40, z: 62.23, y: 5 },
    { x: 106.07, z: 88.00, y: 6 },
    { x: 138.58, z: 62.23, y: 7 },
    { x: 150.00, z: 0.00, y: 8 },
    { x: 138.58, z: -62.23, y: 11 },
    { x: 106.07, z: -88.00, y: 15 },
    { x: 57.40, z: -62.23, y: 18 },
    { x: 0.00, z: -0.00, y: 19 },
    { x: -57.40, z: 62.23, y: 16 },
    { x: -106.07, z: 88.00, y: 9 },
    { x: -138.58, z: 62.23, y: 2 },
  ],
  edges: [
    { from: 6.3, to: 7.5, left: 'wall', right: 'cliff', surface: 'rock' },
    { from: 11.3, to: 12.7, left: 'cliff', right: 'cliff', surface: 'wood' },
  ],
  features: [
    { type: 'boost', at: 0.4 },
    { type: 'table', at: 2.1, h: 1.4, ramp: 8 },
    { type: 'rollers', at: 3.8, count: 3, len: 10, h: 0.7 },
    { type: 'boost', at: 5.2, d: -1.5 },
    { type: 'kicker', at: 7.3, h: 1.5, len: 10 },
    { type: 'table', at: 9.6, h: 1.2, top: 12 },
    { type: 'boost', at: 11.4 },
    { type: 'rollers', at: 12.3, count: 4, len: 10, h: 0.8 },
    { type: 'kicker', at: 14.3, h: 1.6, len: 10 },
  ],
  branches: [
    { id: 'hollow-cut', name: 'Hollow Cut', from: 0.6, to: 3.7, side: 1, hidden: true, halfWidth: 2.3,
      points: [{ x: -102, z: -36, y: 2 }, { x: -68, z: -42, y: 3 }] },
    { id: 'canopy-loop', name: 'Canopy Loop', from: 5.1, to: 9, side: 1, halfWidth: 3.6,
      points: [{ x: 140, z: 118, y: 6 }, { x: 188, z: 74, y: 9 }, { x: 188, z: 0, y: 10 }, { x: 154, z: -56, y: 11 }],
      features: [{ type: 'boost', at: 1.4 }, { type: 'boost', at: 2.8 }, { type: 'boost', at: 4.1 }, { type: 'kicker', at: 4.8, h: 1.5, len: 10 }] },
  ],
  mountain: { x: 2, z: -20, radius: 74, height: 30 },
  creek: { z: 120, width: 11, depth: 8 },
  sky: { top: '#3c69b0', mid: '#a6d2ea', horizon: '#d9edcb' },
};

export const BLUFF_RUN = {
  id: 'bluff-run',
  name: 'Bluff Run',
  difficulty: 'Hard',
  color: '#ff8eae',
  blurb: 'A high ridge, two narrow bridges and big jumps. Watch those open edges!',
  laps: 2,
  scale: 1.25,
  halfWidth: 5.2,
  points: [
    { x: 0, z: 104, y: 2, w: 6 },
    { x: 64, z: 104, y: 2, w: 6 },
    { x: 134, z: 76, y: 6 },
    { x: 184, z: 22, y: 12 },
    { x: 166, z: -36, y: 19 },
    { x: 188, z: -92, y: 24, w: 4.8 },
    { x: 134, z: -132, y: 27, w: 4.8 },
    { x: 70, z: -106, y: 28, w: 4.8 },
    { x: 10, z: -138, y: 26, w: 4.8 },
    { x: -60, z: -118, y: 24, w: 4.6 },
    { x: -114, z: -74, y: 22, w: 4.6 },
    { x: -170, z: -44, y: 17 },
    { x: -150, z: 18, y: 12 },
    { x: -184, z: 76, y: 7 },
    { x: -124, z: 118, y: 3, w: 6 },
    { x: -64, z: 94, y: 2, w: 6 },
  ],
  edges: [
    { from: 3.8, to: 6.3, left: 'wall', right: 'cliff', surface: 'rock' },
    { from: 6.7, to: 7.5, left: 'cliff', right: 'cliff', surface: 'wood' },
    { from: 7.8, to: 9.5, left: 'wall', right: 'cliff', surface: 'rock' },
    { from: 9.8, to: 10.6, left: 'cliff', right: 'cliff', surface: 'wood' },
    { from: 10.9, to: 12.2, left: 'wall', right: 'cliff', surface: 'rock' },
  ],
  features: [
    { type: 'boost', at: 0.5 },
    { type: 'table', at: 2.2, h: 1.8, ramp: 8, top: 10 },
    { type: 'boost', at: 3.4, d: -1 },
    { type: 'kicker', at: 5.6, h: 2, len: 11 },
    { type: 'table', at: 6.7, h: 1.3, top: 12 },
    { type: 'boost', at: 8.5, d: -1 },
    { type: 'table', at: 9.8, h: 1.5, top: 12 },
    { type: 'kicker', at: 11.6, h: 2.2, len: 12 },
    { type: 'rollers', at: 13.1, count: 4, len: 11, h: 1 },
    { type: 'boost', at: 14.2 },
    { type: 'kicker', at: 15.4, h: 1.8, len: 11 },
  ],
  branches: [
    { id: 'ridge-cut', name: 'Ridge Cut', from: 3.8, to: 7.4, side: -1, hidden: true, halfWidth: 2.6,
      points: [{ x: 132, z: -62, y: 24 }, { x: 114, z: -100, y: 27 }],
      edges: [{ from: 1.8, to: 4.3, left: 'cliff', right: 'cliff', surface: 'wood' }] },
    { id: 'lower-pass', name: 'Lower Pass', from: 8.8, to: 11.5, side: -1, halfWidth: 3.8,
      points: [{ x: -32, z: -70, y: 13 }, { x: -66, z: -35, y: 11 }, { x: -118, z: -4, y: 13 }],
      features: [{ type: 'boost', at: 2.3 }, { type: 'boost', at: 3.5 }] },
  ],
  mountain: { x: 12, z: -26, radius: 90, height: 48 },
  creek: { z: 146, width: 12, depth: 12 },
  sky: { top: '#5546aa', mid: '#e4a8bb', horizon: '#ffe1a3' },
};

export const COURSES = [FOSSIL_FLATS, CREEKSIDE_CRUISE, PINE_HOLLOW, BLUFF_RUN];
