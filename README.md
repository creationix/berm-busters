# Berm Busters

A hover-ship racing game for kids, set on the mountain bike trails of Devil's Den State Park in the Arkansas Ozarks. Animal riders, cartoon ships, berms, ramps and jumps.

Play: https://creationix.github.io/berm-busters/

**Status:** first playable. Four courses, a solo race against seven computer riders, with touch, tilt, keyboard and gamepad controls. Bash rivals off the trail, rescue eggs along the way, and hatch them afterwards into baby Ozark animals for your Den. Split-screen and play between devices come next. A device check page (screen fit, tilt, gamepads, device-to-device connection) is at `check.html`.

Pick a track in race setup. Each card shows its route, difficulty and lap count; your last choice is remembered. On keyboard or gamepad, up/down chooses the track and left/right chooses the rider.

| Track | Difficulty | Laps | What to expect |
| --- | --- | --- | --- |
| Fossil Flats | Medium | 3 | The original creek loop, bluff ledge and gorge bridge |
| Creekside Cruise | Easy | 3 | A short, wide loop with gentle rollers and small jumps |
| Pine Hollow | Medium | 3 | Winding forest bends, a wooded ridge and a little gorge |
| Bluff Run | Hard | 2 | High ledges, two narrow bridges and bigger jumps |

Each press of **BASH** explodes the best egg in your on-board inventory. There is no cooldown: collect eggs for more blasts, or save them to hatch at the finish. Better eggs increase blast reach and knockback: Trail < Sky < Cliff < Golden. The outlined egg in the HUD is the next one to explode.

Tilt steering reaches full turn at 15° and responds in one or two sensor updates, so small tilts are enough to steer.

## How it is built

- Plain HTML and JavaScript modules, no build step. Open `index.html` from any static web server.
- Installable (web app manifest) and works offline through a network-first service worker (`sw.js`).
- 3D with [Three.js](https://threejs.org/) and device-to-device play over WebRTC with [PeerJS](https://peerjs.com/). Both are MIT-licensed and copied into `vendor/` at pinned versions (Three.js 0.160.0, PeerJS 1.5.5) so the game does not depend on a CDN.

Run the gameplay checks with Node.js 22.7 or newer: `node --test tests/*.test.mjs`.

## Not an official park product

This is a fan project. It uses the park and its trail names as place names only, follows no real trail route, and is not affiliated with or endorsed by Arkansas State Parks.
