# Berm Busters

A hover-ship racing game for kids, set on the mountain bike trails of Devil's Den State Park in the Arkansas Ozarks. Animal riders, cartoon ships, berms, ramps and jumps.

Play: https://creationix.github.io/berm-busters/

**Status:** first playable. Four courses, a solo race against seven computer riders, with touch, tilt, keyboard and gamepad controls. Bash rivals off the trail, rescue eggs along the way, and hatch them afterwards into baby Ozark animals for your Den. Split-screen and play between devices come next. A device check page (screen fit, tilt, gamepads, device-to-device connection) is at `check.html`.

Pick a track in race setup. Each card shows its route, difficulty and lap count; your last choice is remembered. On keyboard or gamepad, up/down chooses the track and left/right chooses the rider.

| Track | Difficulty | Laps | What to expect |
| --- | --- | --- | --- |
| Fossil Flats | Medium | 3 | The original creek loop, bluff ledge and gorge bridge |
| Creekside Cruise | Easy | 3 | Gentle turns with an optional boosted creek loop |
| Pine Hollow | Medium | 3 | A figure eight with a high overpass and an optional forest loop |
| Bluff Run | Hard | 2 | High ledges and narrow bridges, with a safer lower pass |

Steer toward a fork to take an optional path, then rejoin the race automatically. Dotted lines in the course picker and minimap show public alternate routes. Narrow, unmarked shortcuts reward exploration with golden eggs and do not appear on the map. Branches have their own physical lengths; shorter cuts save time while keeping lap counts and race positions consistent. AI rivals sometimes choose alternate routes too.

**Drift and boost:** hold **Shift** (or either gamepad bumper, or the touch DRIFT button) while turning at speed. The ship slides with less grip, throws sparks and charges the boost meter. Press **B/F**, gamepad **Y**, or **BOOST** to spend the reserve on a burst of speed. You start with a small reserve; clean landings and boost pads also add charge. The HUD shows charge and speed. Gamepad **X** remains egg bash.

The banked road, off-road terrain, and simulation now share one ground surface. Driving off the inside of a turn follows the hillside, and the camera stays above it. Elevated crossings keep their separate heights.

Each press of **BASH** explodes the best egg in your on-board inventory. There is no cooldown: collect eggs for more blasts, or save them to hatch at the finish. Better eggs increase blast reach and knockback: Trail < Sky < Cliff < Golden. The outlined egg in the HUD is the next one to explode.

Tilt steering reaches full turn at 15° and responds in one or two sensor updates, so small tilts are enough to steer.

## How it is built

- Plain HTML and JavaScript modules, no build step. Open `index.html` from any static web server.
- Installable (web app manifest) and works offline through a network-first service worker (`sw.js`).
- 3D with [Three.js](https://threejs.org/) and device-to-device play over WebRTC with [PeerJS](https://peerjs.com/). Both are MIT-licensed and copied into `vendor/` at pinned versions (Three.js 0.160.0, PeerJS 1.5.5) so the game does not depend on a CDN.

Run the gameplay checks with Node.js 22.7 or newer: `node --test tests/*.test.mjs`.

## Not an official park product

This is a fan project. It uses the park and its trail names as place names only, follows no real trail route, and is not affiliated with or endorsed by Arkansas State Parks.
