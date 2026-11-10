# Berm Busters

A hover-ship racing game for kids, set on the mountain bike trails of Devil's Den State Park in the Arkansas Ozarks. Animal riders, cartoon ships, berms, ramps and jumps.

Play: https://creationix.github.io/berm-busters/

**Status:** first playable. One course (Fossil Flats), a solo race against seven computer riders, with touch, tilt, keyboard and gamepad controls. Bash rivals off the trail, rescue eggs along the way, and hatch them afterwards into baby Ozark animals for your Den. Split-screen and play between devices come next. A device check page (screen fit, tilt, gamepads, device-to-device connection) is at `check.html`.

## How it is built

- Plain HTML and JavaScript modules, no build step. Open `index.html` from any static web server.
- Installable (web app manifest) and works offline through a network-first service worker (`sw.js`).
- 3D with [Three.js](https://threejs.org/) and device-to-device play over WebRTC with [PeerJS](https://peerjs.com/). Both are MIT-licensed and copied into `vendor/` at pinned versions (Three.js 0.160.0, PeerJS 1.5.5) so the game does not depend on a CDN.

## Not an official park product

This is a fan project. It uses the park and its trail names as place names only, follows no real trail route, and is not affiliated with or endorsed by Arkansas State Parks.
