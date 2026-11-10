# Berm Busters

A hover-ship racing game for kids, set on the mountain bike trails of Devil's Den State Park in the Arkansas Ozarks. Animal riders, cartoon ships, berms, ramps and jumps.

Play: https://creationix.github.io/berm-busters/

**Status:** early. The page currently published is a device check (screen fit, tilt steering, gamepads, device-to-device connection). The game itself comes next.

## How it is built

- Plain HTML and JavaScript modules, no build step. Open `index.html` from any static web server.
- Installable (web app manifest) and works offline through a network-first service worker (`sw.js`).
- 3D with [Three.js](https://threejs.org/) and device-to-device play over WebRTC with [PeerJS](https://peerjs.com/). Both are MIT-licensed and copied into `vendor/` at pinned versions (Three.js 0.160.0, PeerJS 1.5.5) so the game does not depend on a CDN.

## Not an official park product

This is a fan project. It uses the park and its trail names as place names only, follows no real trail route, and is not affiliated with or endorsed by Arkansas State Parks.
