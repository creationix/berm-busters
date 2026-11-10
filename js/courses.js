// Course data. Positions are in rough metres before `scale`; y is trail height.
// "at", "from" and "to" count along the control points: 4.5 is halfway between points 4 and 5.
// These are inspired by the feel of the real trails, not traced from their routes.

export const FOSSIL_FLATS = {
  id: 'fossil-flats',
  name: 'Fossil Flats',
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
  mountain: { x: 10, z: -15, radius: 80, height: 34 },
  // Lee Creek runs alongside the home straight.
  creek: { z: 112, width: 13, depth: 8 },
  sky: { top: '#2a6fd6', mid: '#8fc7ff', horizon: '#ffd9a0' },
};

export const COURSES = [FOSSIL_FLATS];
