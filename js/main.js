// Berm Busters: menus, the game loop and the in-race display.

import { buildTrack } from './track.js';
import { FOSSIL_FLATS } from './courses.js';
import { Race, TICK, V_MAX, ASSIST, EGG, MAX_EGGS } from './sim.js';
import { World } from './render.js';
import { CHARACTERS, characterById } from './models.js';
import { CRITTERS, critterById, hatch, loadDen, saveDen, addToDen, denCount, RARITY, RARITY_COLOR, EGG_NAME } from './critters.js';
import { Keyboard, TouchPad, PlayerInput, listGamepads, readGamepad } from './input.js';
import { Tilt } from './tilt.js';
import { Sound } from './audio.js';

const BUILD = '2026-11-11.1';
const LS = 'berm-busters-';            // other games share this origin: keep every saved key under this prefix
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- settings ----------
const DEFAULTS = { character: 'fox', steer: 'buttons', daredevil: 'off', assist: 'some', autoGo: 'on', rivals: 'easy', sfx: true, music: true };
const settings = Object.assign({}, DEFAULTS);
try { Object.assign(settings, JSON.parse(localStorage.getItem(LS + 'settings') || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(LS + 'settings', JSON.stringify(settings)); } catch (e) {} };
const RIVALS = { easy: [0.8, 0.016], normal: [0.86, 0.016], fast: [0.92, 0.015] };

// ---------- world ----------
const track = buildTrack(FOSSIL_FLATS);
const world = new World($('view'), track);
const sound = new Sound();
const keyboard = new Keyboard();
const tilt = new Tilt();
const portraits = {};
for (const ch of CHARACTERS) portraits[ch.id] = world.portrait(ch);
const critterPics = {};
for (const c of CRITTERS) critterPics[c.id] = world.critterIcon(c);
const den = loadDen();                 // every hatchling rescued so far, saved on this device
const EGG_CSS = ['#fff1d0', '#59d4ff', '#c77dff', '#ffd23f'];

let coarse = matchMedia('(pointer: coarse)').matches;
addEventListener('touchstart', () => { if (!coarse) { coarse = true; refreshSetup(); for (const h of G.huds) h.el.classList.add('touching'); } }, { passive: true });

const G = { mode: 'attract', race: null, views: [], huds: [], inputs: [], acc: 0, last: 0, human: -1, followT: 0, frame: 0, slow: 0 };

function attract() {
  G.mode = 'attract';
  const entries = CHARACTERS.map((c, i) => ({ name: c.name, character: c.id, human: false, skill: 0.84 + i * 0.015 }));
  G.race = new Race(track, entries, { laps: 999, countdown: 0.01 });
  world.clearRacers(); for (const r of G.race.racers) world.addRacer(r);
  const v = world.makeView(0); v.orbit = true;
  G.views = [v]; clearHuds(); G.inputs = []; G.human = -1;
  sound.hum(0, false, false);
}

function startRace() {
  const [base, stepUp] = RIVALS[settings.rivals] || RIVALS.easy;
  const others = CHARACTERS.filter(c => c.id !== settings.character);
  const me = characterById(settings.character);
  const entries = [{ name: me.name, character: me.id, human: true, daredevil: settings.daredevil === 'on', assist: ASSIST[settings.assist], autoGo: settings.autoGo === 'on' }];
  others.forEach((c, i) => entries.push({ name: c.name, character: c.id, human: false, skill: base + i * stepUp }));
  // On Easy the computer riders only bash each other, never the player.
  G.race = new Race(track, entries, { seed: (Date.now() & 0xffff) + 1, aiBashHumans: { easy: 0, normal: 0.45, fast: 1.2 }[settings.rivals] || 0 });
  // The player's chosen hatchling rides along as co-pilot.
  world.clearRacers(); for (const r of G.race.racers) world.addRacer(r, r.human && den.buddy ? critterById(den.buddy) : null);
  G.human = 0; G.pendingHatch = null;
  const view = world.makeView(0);
  G.views = [view];
  clearHuds();
  const hud = makeHud(view, G.race.racers[0]);
  G.huds = [hud];
  const useTilt = settings.steer === 'tilt' && tilt.active;
  hud.el.classList.toggle('tilting', useTilt);
  G.inputs = [new PlayerInput({ keyboard, scheme: 'both', gamepad: 'any', touch: hud.pad, tilt: useTilt ? tilt : null })];
  G.mode = 'race'; G.acc = 0;
  show(null);
  sound.setFinalLap(false);
  sound.startMusic();
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
}

// ---------- in-race display ----------
function clearHuds() { for (const h of G.huds) h.el.remove(); G.huds = []; }
function makeHud(view, racer) {
  const el = document.createElement('div');
  el.className = 'hud' + (coarse ? ' touching' : '');
  const r = view.rect;
  el.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
  el.innerHTML = `<div class="flash"></div>
    <div class="place"></div><div class="eggs"></div><div class="kos"></div><div class="lap"></div><canvas class="map" width="150" height="150"></canvas>
    <div class="msg"></div><button class="pauseBtn" aria-label="Pause">❚❚</button>
    <div class="tiltDot"><i></i></div>
    <div class="touch l"><button data-touch="left" aria-label="Steer left">◀</button><button data-touch="right" aria-label="Steer right">▶</button></div>
    <div class="touch r">${racer.autoGo ? '' : '<button class="go" data-touch="go">GO</button>'}<button class="brake" data-touch="brake">BRAKE</button><button class="bash" data-touch="bash">BASH</button></div>`;
  $('huds').appendChild(el);
  const q = s => el.querySelector(s);
  const hud = { el, view, racer, place: q('.place'), lap: q('.lap'), map: q('.map'), msg: q('.msg'), flash: q('.flash'), tiltDot: q('.tiltDot i'), pad: new TouchPad(el), lastPlace: '', lastLap: '', wasAir: false,
    kos: q('.kos'), bashBtn: q('.bash'), lastKos: -1, gotBy: null, eggs: q('.eggs'), lastEggs: null };
  q('.pauseBtn').addEventListener('click', () => pause());
  return hud;
}
function say(hud, text, cls = '', dur = 1.1) {
  const m = hud.msg;
  m.className = 'msg ' + cls + (text.length > 9 ? ' long' : ''); m.textContent = text; m.style.setProperty('--dur', dur + 's');
  void m.offsetWidth; m.classList.add('pop');
}
const ORD = n => ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)];
const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

// minimap: the trail outline scaled to fit a 150 px square
const MAP = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < track.N; i++) { x0 = Math.min(x0, track.X[i]); x1 = Math.max(x1, track.X[i]); z0 = Math.min(z0, track.Z[i]); z1 = Math.max(z1, track.Z[i]); }
  const k = 126 / Math.max(x1 - x0, z1 - z0);
  const ox = 75 - (x0 + x1) / 2 * k, oz = 75 - (z0 + z1) / 2 * k;
  const path = new Path2D();
  for (let i = 0; i <= track.N; i += 4) { const j = i % track.N; if (i) path.lineTo(track.X[j] * k + ox, track.Z[j] * k + oz); else path.moveTo(track.X[j] * k + ox, track.Z[j] * k + oz); }
  path.closePath();
  return { k, ox, oz, path };
})();
function drawMap(hud, race) {
  const c = hud.map.getContext('2d');
  c.clearRect(0, 0, 150, 150);
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 9; c.stroke(MAP.path);
  c.strokeStyle = '#f4e3c0'; c.lineWidth = 5; c.stroke(MAP.path);
  const w = {};
  for (const pass of [0, 1]) for (const r of race.racers) {
    const me = r === hud.racer; if ((pass === 1) !== me || r.mode === 'dead') continue;
    if (r.mode === 'fall') { w.x = r.wx; w.z = r.wz; } else track.toWorld(r.s, r.d, w);
    c.beginPath(); c.arc(w.x * MAP.k + MAP.ox, w.z * MAP.k + MAP.oz, me ? 6.5 : 4, 0, 7);
    c.fillStyle = characterById(r.character).ship; c.fill();
    c.lineWidth = me ? 2.5 : 1.2; c.strokeStyle = me ? '#fff' : 'rgba(0,0,0,.7)'; c.stroke();
  }
}
function updateHud(hud, race) {
  const r = hud.racer;
  const place = r.pos + ORD(r.pos);
  if (place !== hud.lastPlace) { hud.lastPlace = place; hud.place.innerHTML = `${r.pos}<small>${ORD(r.pos)}</small>`; }
  const lap = `Lap ${clamp(r.lapsDone + 1, 1, race.laps)}/${race.laps}`;
  const time = fmtTime(r.finished && r.finishTime ? r.finishTime : race.time);
  const txt = lap + time;
  if (txt !== hud.lastLap) { hud.lastLap = txt; hud.lap.innerHTML = `${lap}<small>${time}</small>`; }
  hud.flash.classList.toggle('on', r.boostT > 0);
  if (r.kos !== hud.lastKos) { hud.lastKos = r.kos; hud.kos.textContent = r.kos ? '💥 × ' + r.kos : ''; }
  // rescued eggs on board, shown as a row of little eggs in their own colours
  const eggKey = r.eggs.join('');
  if (eggKey !== hud.lastEggs) {
    hud.lastEggs = eggKey;
    const tier = Math.max(-1, ...r.eggs), next = r.eggs.indexOf(tier);
    hud.eggs.innerHTML = r.eggs.map((t, i) => `<span class="egg${i === next ? ' next' : ''}" style="--c:${EGG_CSS[t]}" title="${EGG_NAME[t]}${i === next ? ' (next bash)' : ''}"></span>`).join(' ');
    hud.eggs.classList.toggle('full', r.eggs.length >= MAX_EGGS);
    hud.eggs.classList.remove('bump'); void hud.eggs.offsetWidth; hud.eggs.classList.add('bump');
    hud.bashBtn.classList.toggle('empty', tier < 0);
    hud.bashBtn.setAttribute('aria-disabled', String(tier < 0));
    hud.bashBtn.setAttribute('aria-label', tier < 0 ? 'Bash: collect an egg first' : `Bash: explode one ${EGG_NAME[tier]}`);
    hud.bashBtn.innerHTML = `BASH<small>${tier < 0 ? 'No eggs' : EGG_NAME[tier]}</small>`;
    hud.bashBtn.style.setProperty('--egg-color', tier < 0 ? '#ffe26a' : EGG_CSS[tier]);
  }
  if (tilt.active) hud.tiltDot.style.left = (50 + tilt.steer * 50) + '%';
  if (G.frame % 3 === 0) drawMap(hud, race);
}

// ---------- sim events → sound and messages ----------
function handleEvent(e, race) {
  world.onEvent(e, race);
  if (G.mode === 'attract') return;
  if (e.type === 'count') { sound.count(); for (const h of G.huds) say(h, String(e.n), '', 0.9); return; }
  if (e.type === 'go') { sound.go(); for (const h of G.huds) say(h, 'GO!', 'gold', 1); return; }
  if (e.type === 'raceover') { setTimeout(() => { if (G.race === race) showResults(); }, 400); return; }
  const hud = G.huds.find(h => h.racer.index === e.r);
  if (!hud) return;
  switch (e.type) {
    case 'boost': sound.boost(); break;
    case 'land': sound.land(); if (e.airTime > 0.95) say(hud, 'BIG AIR!', 'gold', 0.9); break;
    case 'bump': sound.bump(); break;
    case 'scrape': sound.scrape(); break;
    case 'shield': sound.shield(); break;
    case 'egg':
      sound.egg(e.count, e.tier);
      if (e.stolen) say(hud, 'YOINK!', 'gold', 0.8);
      else if (e.tier === EGG.EDGE) say(hud, 'CLIFF EGG!', 'gold', 0.9);
      else if (e.tier === EGG.AIR) say(hud, 'SKY EGG!', '', 0.8);
      else if (e.count === MAX_EGGS) say(hud, 'FULL NEST!', 'gold', 0.9);
      break;
    case 'eggdrop': sound.eggDrop(); hud.dropped = e.n; break;
    case 'bash': sound.bash(e.power); break;
    case 'knocked': sound.knocked(); say(hud, 'WHOA!', 'red', 0.7); break;
    case 'knockout': sound.knockout(); say(hud, 'KNOCKOUT!', 'gold', 1.2); break;
    case 'fall': sound.fall(); hud.gotBy = e.by >= 0 ? race.racers[e.by].name : null; break;
    case 'explode': {
      sound.explode();
      const lost = hud.dropped ? ` −${hud.dropped} 🥚` : '';
      say(hud, (hud.gotBy ? hud.gotBy + ' got you!' : 'BOOM!') + lost, 'red', 1.6); hud.gotBy = null; hud.dropped = 0; break;
    }
    case 'respawn': sound.respawn(); hud.racer._snap = true; break;
    case 'lap': { const final = e.lap === race.laps; sound.lap(final); if (final) sound.setFinalLap(true); say(hud, final ? 'FINAL LAP!' : 'LAP ' + e.lap, final ? 'gold' : '', 1.3); break; }
    // the race tune ends at the line; the fanfare plays over silence
    case 'finish': sound.stopMusic(); sound.finish(e.place); say(hud, e.place + ORD(e.place) + '!', 'gold', 2.6); hud.view.orbit = true; break;
  }
}

// ---------- loop ----------
function tick() {
  const race = G.race;
  const inputs = [];
  for (let i = 0; i < G.inputs.length; i++) {
    const o = G.inputs[i].read(TICK);
    inputs[G.huds[i].racer.index] = o;
    if (o.pause) pause();
  }
  race.step(inputs);
  for (const e of race.events) handleEvent(e, race);
  for (const h of G.huds) {
    const r = h.racer;
    if (r.air && !h.wasAir && r.vy > 4.5) sound.jump();
    h.wasAir = r.air;
  }
}
function draw(dt) {
  const race = G.race;
  if (G.mode === 'attract') {
    G.followT -= dt;
    if (G.followT <= 0) { G.followT = 9; G.views[0].racer = race.order[Math.floor(Math.random() * 3)].index; G.views[0].ready = false; }
  }
  // how far we are between the last simulation step and the next one
  const alpha = G.mode === 'paused' || G.testing ? 1 : clamp(G.acc / TICK, 0, 1);
  world.update(race, G.mode === 'paused' ? 0 : dt, alpha);
  for (const v of G.views) world.updateView(v, race, dt, alpha);
  for (const r of race.racers) r._snap = false;
  world.render(G.views);
  for (const h of G.huds) updateHud(h, race);
  if (G.human >= 0) { const r = race.racers[G.human]; sound.hum(r.v / V_MAX, r.boostT > 0, G.mode === 'race' && r.mode === 'drive' && race.state !== 'finished'); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - G.last) / 1000 || 0);
  G.last = now; G.frame++;
  if (G.mode === 'race' || G.mode === 'attract' || G.mode === 'results') {
    G.acc += dt;
    let n = 0;
    while (G.acc >= TICK && n < 6) { tick(); G.acc -= TICK; n++; }
    if (n === 6) G.acc = 0;
  }
  menuPads();
  draw(dt);
  // If frames are slow, render fewer pixels rather than drop frame rate.
  // (One-off hitches, such as coming back from the background, are capped so they do not count as a slow device.)
  if (!document.hidden) G.slow = G.slow * 0.97 + Math.min(dt, 0.04) * 0.03;
  if (G.frame % 90 === 0 && G.frame > 100 && G.slow > 0.021 && world.pixelRatio > 0.75) { world.pixelRatio = Math.max(0.75, world.pixelRatio - 0.25); G.slow = 0.016; }
}

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  G.screen = id;
}
function pause() {
  if (G.mode !== 'race') return;
  G.mode = 'paused'; show('pause'); sound.hum(0, false, false);
  for (const h of G.huds) h.pad.release();
}
function resume() { if (G.mode === 'paused') { G.mode = 'race'; G.last = performance.now(); show(null); } }
function quit() { sound.stopMusic(); attract(); show('menu'); }
function showResults() {
  if (G.mode !== 'race' && G.mode !== 'paused') return;
  G.mode = 'results';
  const race = G.race, me = race.racers[G.human];
  $('resultsTitle').textContent = me.place === 1 ? 'You won!' : me.place <= 3 ? `${me.place}${ORD(me.place)} place!` : `You finished ${me.place}${ORD(me.place)}`;
  const rows = race.racers.slice().sort((a, b) => a.place - b.place).map(r => {
    const ch = characterById(r.character);
    return `<tr class="${r === me ? 'me' : ''}"><td class="p">${r.place}${ORD(r.place)}</td><td><img src="${portraits[ch.id]}" alt=""></td><td>${ch.name}${r === me ? ' (you)' : ''}</td><td>${r.finishTime ? fmtTime(r.finishTime) : ''}</td><td>${r.kos ? '💥 × ' + r.kos : ''}</td></tr>`;
  });
  $('resultsTable').innerHTML = rows.join('');
  // Who got whom: the stuff people argue about afterwards.
  let nemesis = null, most = 0;
  for (const k in me.koBy) if (me.koBy[k] > most) { most = me.koBy[k]; nemesis = race.racers[k]; }
  const bits = [];
  if (me.kos) bits.push(`You knocked ${me.kos} rider${me.kos === 1 ? '' : 's'} off the trail`);
  if (nemesis) bits.push(`${nemesis.name} knocked you off ${most === 1 ? 'once' : most + ' times'}`);
  // Eggs: everything still on board at the line, plus one for finishing and a prize egg for the podium.
  // So every rider, wherever they finish, gets something to hatch.
  const eggs = (me.rescued || []).slice();
  eggs.push(EGG.COMMON);
  if (me.place === 1) eggs.push(EGG.GOLD); else if (me.place <= 3) eggs.push(EGG.AIR);
  const carried = eggs.length - (me.place <= 3 ? 2 : 1);
  bits.unshift(`You rescued ${carried} egg${carried === 1 ? '' : 's'}`);
  $('resultsNote').textContent = bits.join(' · ');
  // Decide the hatchlings and save them now, so they are safe even if the hatching screen is skipped.
  G.pendingHatch = eggs.map(t => { const h = hatch(t); return Object.assign(h, addToDen(den, h)); });
  saveDen(den); labelDen();
  $('hatchBtn').innerHTML = `Hatch ${eggs.length} egg${eggs.length === 1 ? '' : 's'}! ` + eggs.map(t => `<span class="egg" style="--c:${EGG_CSS[t]};font-size:.62em"></span>`).join('');
  $('hatchBtn').style.display = '';
  for (const h of G.huds) h.el.style.display = 'none';
  show('results');
  sound.startMusic('den');             // a gentle tune for results, hatching and the Den
}

// ---------- hatching and the Den ----------
let hatchTimer = null;
function showHatch() {
  const list = G.pendingHatch; if (!list) return;
  G.pendingHatch = null;
  $('hatchBtn').style.display = 'none';
  show('hatch');
  $('hatchTitle').textContent = 'Hatching!';
  $('hatchNote').textContent = 'Tap to hurry them up';
  $('hatchBtns').style.visibility = 'hidden';
  const box = $('hatchCards');
  box.innerHTML = list.map(h => `<div class="card waiting" style="--c:${RARITY_COLOR[h.critter.rarity]}"><span class="egg" style="--c:${EGG_CSS[h.tier]}"></span><i>${EGG_NAME[h.tier]}</i></div>`).join('');
  let i = 0;
  const next = () => {
    clearTimeout(hatchTimer);
    if (i >= list.length) return;
    const h = list[i], card = box.children[i];
    if (card.classList.contains('waiting')) {           // first the egg wobbles and cracks...
      card.classList.remove('waiting'); sound.crack();
      hatchTimer = setTimeout(next, 800);
      return;
    }
    card.className = 'card out' + (h.shiny ? ' shiny' : '');   // ...then out it pops
    card.innerHTML = `<img src="${critterPics[h.critter.id]}" alt=""><b>${h.critter.name}</b><i style="color:${RARITY_COLOR[h.critter.rarity]}">${RARITY[h.critter.rarity]}</i>` +
      (h.isNew ? '<span class="tag">NEW!</span>' : '') + (h.shiny ? '<span class="tag shiny">★ SHINY</span>' : '');
    sound.hatch(h.critter.rarity, h.isNew, h.shiny);
    i++;
    if (i < list.length) hatchTimer = setTimeout(next, 650);
    else {
      const fresh = list.filter(x => x.isNew).length, shiny = list.filter(x => x.shiny).length;
      $('hatchTitle').textContent = fresh ? `${fresh} new friend${fresh === 1 ? '' : 's'}!` : 'Welcome home!';
      $('hatchNote').textContent = `Your Den: ${denCount(den)} of ${CRITTERS.length} kinds found` + (shiny ? ' · ★ a shiny one!' : '');
      $('hatchBtns').style.visibility = '';
    }
  };
  G.hatchNext = next;
  hatchTimer = setTimeout(next, 500);
}
$('hatchCards').addEventListener('click', () => { if (G.hatchNext) G.hatchNext(); });

function labelDen() { $('denBtn').textContent = `My Den ${denCount(den)}/${CRITTERS.length}`; }
function showDen(from) {
  G.denFrom = from || G.screen || 'menu';
  $('denTitle').textContent = `My Den  ${denCount(den)}/${CRITTERS.length}`;
  $('denNote').textContent = den.hatched ? `${den.hatched} hatched so far. Tap a friend to make them your co-pilot.` : 'Rescue eggs in a race and they will hatch here.';
  $('denCards').innerHTML = CRITTERS.map(c => {
    const n = den.found[c.id] || 0, col = RARITY_COLOR[c.rarity];
    if (!n) return `<div class="card unknown"><img src="${critterPics[c.id]}" alt=""><b>???</b><i style="color:${col}">${RARITY[c.rarity]}</i></div>`;
    return `<div class="card found${den.buddy === c.id ? ' pal' : ''}${den.shiny[c.id] ? ' hasShiny' : ''}" data-id="${c.id}"><span class="count">×${n}</span>${den.shiny[c.id] ? '<span class="star">★</span>' : ''}` +
      `<img src="${critterPics[c.id]}" alt=""><b>${c.name}</b><i style="color:${col}">${den.buddy === c.id ? 'Co-pilot' : RARITY[c.rarity]}</i></div>`;
  }).join('');
  show('den');
}
$('denCards').addEventListener('click', e => {
  const card = e.target.closest('.card.found'); if (!card) return;
  den.buddy = card.dataset.id; saveDen(den); sound.click(); showDen(G.denFrom);
});
$('denBtn').addEventListener('click', () => { sound.unlock(); sound.click(); showDen('menu'); sound.startMusic('den'); });
$('denBackBtn').addEventListener('click', () => {
  sound.click();
  if (G.denFrom === 'hatch') show('hatch'); else { show('menu'); sound.stopMusic(); }
});
$('hatchBtn').addEventListener('click', () => { sound.click(); showHatch(); });
$('hatchAgainBtn').addEventListener('click', () => { sound.click(); startRace(); });
$('hatchDenBtn').addEventListener('click', () => { sound.click(); showDen('hatch'); });
$('hatchMenuBtn').addEventListener('click', () => quit());
labelDen();

function refreshSetup() {
  for (const el of $('riders').children) el.classList.toggle('on', el.dataset.id === settings.character);
  for (const seg of document.querySelectorAll('.seg')) for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(settings[seg.dataset.key]));
  $('optSteer').style.display = coarse && Tilt.supported ? '' : 'none';
}
$('riders').innerHTML = CHARACTERS.map(c => `<button class="rider" data-id="${c.id}"><img src="${portraits[c.id]}" alt=""><b>${c.name}</b><i>${c.animal}</i></button>`).join('');
$('riders').addEventListener('click', e => { const b = e.target.closest('.rider'); if (!b) return; settings.character = b.dataset.id; save(); sound.click(); refreshSetup(); });
$('opts').addEventListener('click', e => {
  const b = e.target.closest('.seg button'); if (!b) return;
  settings[b.parentElement.dataset.key] = b.dataset.v; save(); sound.click(); refreshSetup();
  $('setupNote').textContent = '';
});
const labelToggles = () => { $('sfxBtn').textContent = 'Sound: ' + (settings.sfx ? 'on' : 'off'); $('musicBtn').textContent = 'Music: ' + (settings.music ? 'on' : 'off'); };
sound.setSfx(settings.sfx); sound.setMusic(settings.music); labelToggles();
$('sfxBtn').addEventListener('click', () => { settings.sfx = !settings.sfx; save(); sound.unlock(); sound.setSfx(settings.sfx); labelToggles(); sound.click(); });
$('musicBtn').addEventListener('click', () => { settings.music = !settings.music; save(); sound.unlock(); sound.setMusic(settings.music); labelToggles(); });
$('playBtn').addEventListener('click', () => { sound.unlock(); sound.click(); refreshSetup(); show('setup'); });
$('backBtn').addEventListener('click', () => { sound.click(); show('menu'); });
async function go() {
  sound.unlock(); sound.click();
  if (settings.steer === 'tilt' && coarse && !tilt.active) {
    const res = await tilt.enable();           // iOS shows its motion permission prompt here, from this tap
    if (res !== 'ok') {
      settings.steer = 'buttons'; save(); refreshSetup();
      $('setupNote').textContent = res === 'denied' ? 'Tilt was not allowed, so steering is on the buttons. Tap GO! again.' : 'Tilt is not available on this device. Tap GO! again.';
      return;
    }
  }
  startRace();
}
$('goBtn').addEventListener('click', go);
$('resumeBtn').addEventListener('click', resume);
$('restartBtn').addEventListener('click', () => { sound.click(); startRace(); });
$('quitBtn').addEventListener('click', quit);
$('againBtn').addEventListener('click', () => { sound.click(); startRace(); });
$('menuBtn').addEventListener('click', quit);

// keyboard and gamepad shortcuts for the menus
function advance() {
  if (G.screen === 'menu') $('playBtn').click();
  else if (G.screen === 'setup') go();
  else if (G.screen === 'pause') resume();
  else if (G.screen === 'results') { if (G.pendingHatch) showHatch(); else $('againBtn').click(); }
  else if (G.screen === 'hatch') { if ($('hatchBtns').style.visibility === 'hidden') G.hatchNext(); else startRace(); }
}
function cycleRider(dir) {
  if (G.screen !== 'setup') return;
  const i = CHARACTERS.findIndex(c => c.id === settings.character);
  settings.character = CHARACTERS[(i + dir + CHARACTERS.length) % CHARACTERS.length].id; save(); sound.click(); refreshSetup();
}
keyboard.onKey = e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { sound.unlock(); advance(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'race') pause(); else if (G.mode === 'paused') resume(); else if (G.screen === 'setup') show('menu'); }
  else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycleRider(-1);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') cycleRider(1);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
};
const padHeld = { a: false, start: false, l: false, r: false };
function menuPads() {
  let a = false, start = false, l = false, r = false;
  for (const p of listGamepads()) { const g = readGamepad(p); a = a || (p.buttons[0] && p.buttons[0].pressed); start = start || g.pause; l = l || g.steer < -0.6; r = r || g.steer > 0.6; }
  if (G.screen) {
    if ((a && !padHeld.a) || (start && !padHeld.start && G.screen !== 'pause')) { sound.unlock(); advance(); }
    else if (start && !padHeld.start && G.screen === 'pause') resume();
    if (l && !padHeld.l) cycleRider(-1);
    if (r && !padHeld.r) cycleRider(1);
  }
  padHeld.a = a; padHeld.start = start; padHeld.l = l; padHeld.r = r;
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
const turnHint = () => { $('turn').style.display = coarse && innerHeight > innerWidth * 1.1 ? 'flex' : 'none'; };
addEventListener('resize', turnHint); turnHint();

$('build').textContent = 'build ' + BUILD;
refreshSetup();
attract();
show('menu');
requestAnimationFrame(frame);
window.__bbReady = true;
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

// Hooks for automated checks: the preview pane throttles animation frames when hidden,
// so tests step the simulation directly.
window.__bb = {
  G, world, track, settings, sound, tilt, keyboard, BUILD, startRace, attract, pause, resume, showResults, show, tick, draw,
  step(n = 1, input) {
    for (let i = 0; i < n; i++) {
      if (input) { G.race.step([input]); for (const e of G.race.events) handleEvent(e, G.race); } else tick();
    }
    G.testing = true; draw(TICK); G.testing = false;
  },
};
