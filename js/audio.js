// Sound effects and music, all synthesised (no audio files).
// Kept soft and musical: sine and triangle tones, gentle noise, music quieter than effects.

const NOTE = n => 261.63 * Math.pow(2, n / 12);          // semitones from middle C

export class Sound {
  constructor() {
    this.ctx = null; this.sfxOn = true; this.musicOn = true;
    this.musicTimer = null; this.step = 0; this.nextTime = 0; this.humNodes = null;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.sfxOn || this.musicOn) this.ctx.resume();
    });
  }
  // Must be called from inside a tap or key press: browsers only start audio then.
  unlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';   // iOS: play even with the mute switch on
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC();
        this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 0.5 : 0; this.sfx.connect(this.ctx.destination);
        this.music = this.ctx.createGain(); this.music.gain.value = this.musicOn ? 0.15 : 0; this.music.connect(this.ctx.destination);
        const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  }
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.5 : 0; }
  setMusic(on) {
    this.musicOn = on;
    if (this.music) { const t = this.ctx.currentTime; this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(on && this.tune ? MUSIC_LEVEL[this.tune] : 0, t, 0.03); }
  }

  tone(freq, dur, o = {}) {
    if (!this.ctx || !(o.music ? this.musicOn : this.sfxOn)) return;
    const t = (o.at != null ? o.at : this.ctx.currentTime) + (o.delay || 0), vol = o.vol != null ? o.vol : 0.3;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || (o.music ? this.music : this.sfx));
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  noise(dur, o = {}) {
    if (!this.ctx || !(o.music ? this.musicOn : this.sfxOn)) return;
    const t = (o.at != null ? o.at : this.ctx.currentTime) + (o.delay || 0), vol = o.vol != null ? o.vol : 0.2;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.music ? this.music : this.sfx);
    src.start(t, Math.random() * 0.5, dur + 0.1);
  }

  click() { this.tone(NOTE(12), 0.08, { type: 'triangle', vol: 0.2 }); }
  count() { this.tone(NOTE(7), 0.22, { type: 'triangle', vol: 0.3 }); }
  go() { for (const [i, n] of [12, 16, 19].entries()) this.tone(NOTE(n), 0.5, { type: 'triangle', vol: 0.22, delay: i * 0.03 }); }
  boost() { this.noise(0.55, { freq: 500, to: 3200, vol: 0.2, filter: 'bandpass' }); this.tone(NOTE(7), 0.4, { to: NOTE(19), vol: 0.16 }); }
  jump() { this.tone(NOTE(4), 0.28, { to: NOTE(16), vol: 0.14 }); }
  land() { this.tone(110, 0.16, { to: 60, vol: 0.3 }); this.noise(0.14, { freq: 500, vol: 0.12 }); }
  bump() { this.tone(180, 0.1, { to: 110, type: 'triangle', vol: 0.22 }); }
  // Eggs: each one scooped rings a step higher; special eggs add a sparkle.
  egg(count, tier) {
    this.tone(NOTE(12 + count * 2), 0.16, { type: 'triangle', vol: 0.26 });
    this.tone(NOTE(19 + count * 2), 0.22, { vol: 0.16, delay: 0.06 });
    if (tier) for (let i = 0; i < 3; i++) this.tone(NOTE(24 + i * 4 + tier * 2), 0.14, { vol: 0.12, delay: 0.12 + i * 0.05 });
  }
  eggDrop() { for (const [i, n] of [14, 10, 5].entries()) this.tone(NOTE(n), 0.16, { type: 'triangle', vol: 0.22, delay: i * 0.09 }); }
  crack() { this.noise(0.05, { freq: 3200, filter: 'highpass', vol: 0.2 }); this.noise(0.04, { freq: 2600, filter: 'highpass', vol: 0.16, delay: 0.3 }); this.noise(0.05, { freq: 3000, filter: 'highpass', vol: 0.2, delay: 0.55 }); }
  // A hatchling pops out: a brighter, longer flourish the rarer it is, with extra sparkle for a new or shiny one.
  hatch(rarity, isNew, shiny) {
    const tune = [[12, 16], [12, 16, 19], [12, 16, 19, 24], [12, 16, 19, 24, 28, 31]][rarity] || [12, 16];
    tune.forEach((n, i) => this.tone(NOTE(n), i === tune.length - 1 ? 0.4 : 0.14, { type: 'triangle', vol: 0.22, delay: i * 0.07 }));
    this.noise(0.08, { freq: 2400, filter: 'highpass', vol: 0.14 });
    if (isNew) this.tone(NOTE(tune[tune.length - 1] + 12), 0.5, { vol: 0.12, delay: tune.length * 0.07 });
    if (shiny) for (let i = 0; i < 6; i++) this.tone(NOTE(31 + (i % 3) * 5), 0.12, { vol: 0.1, delay: 0.25 + i * 0.06 });
  }
  bash() { this.tone(250, 0.24, { to: 70, type: 'triangle', vol: 0.34 }); this.noise(0.26, { freq: 800, to: 2800, vol: 0.15, filter: 'bandpass' }); }
  knocked() { this.tone(NOTE(17), 0.32, { to: NOTE(0), type: 'triangle', vol: 0.24 }); }
  knockout() { for (const [i, n] of [19, 24, 28].entries()) this.tone(NOTE(n), 0.24, { type: 'triangle', vol: 0.22, delay: i * 0.07 }); }
  scrape() { this.noise(0.12, { freq: 1800, vol: 0.07, filter: 'bandpass' }); }
  shield() { this.tone(NOTE(19), 0.14, { to: NOTE(24), vol: 0.1 }); }
  fall() { this.tone(NOTE(19), 0.9, { to: NOTE(-5), vol: 0.16 }); }
  explode() { this.noise(0.7, { freq: 1400, to: 120, vol: 0.34 }); this.tone(150, 0.5, { to: 45, vol: 0.3 }); }
  respawn() { for (const [i, n] of [7, 12, 16, 19].entries()) this.tone(NOTE(n), 0.2, { vol: 0.14, delay: i * 0.06 }); }
  lap(final) { for (const [i, n] of (final ? [12, 16, 19, 24] : [12, 19]).entries()) this.tone(NOTE(n), 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.1 }); }
  finish(place) {
    const tune = place <= 3 ? [12, 12, 16, 19, 16, 19, 24] : [12, 9, 7, 12];
    tune.forEach((n, i) => this.tone(NOTE(n), i === tune.length - 1 ? 0.7 : 0.24, { type: 'triangle', vol: 0.22, delay: i * 0.14 }));
  }

  // Continuous hover hum for the local rider. k = speed 0..1+.
  hum(k, boosting, on) {
    if (!this.ctx) return;
    if (!this.humNodes) {
      const a = this.ctx.createOscillator(), b = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      a.type = 'triangle'; b.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
      a.connect(f); b.connect(f); f.connect(g); g.connect(this.sfx); a.start(); b.start();
      this.humNodes = { a, b, f, g };
    }
    const n = this.humNodes, t = this.ctx.currentTime, base = 62 + k * 70 + (boosting ? 28 : 0);
    n.a.frequency.setTargetAtTime(base, t, 0.08); n.b.frequency.setTargetAtTime(base * 1.5, t, 0.08);
    n.f.frequency.setTargetAtTime(350 + k * 700, t, 0.1);
    n.g.gain.setTargetAtTime(on ? 0.05 + k * 0.05 : 0, t, 0.1);
  }

  // ----- music -----
  // Two tunes: 'race' is fast and scrappy (four-on-the-floor kick, snare on 2 and 4, a galloping
  // bass and a cheeky lead riff in E minor; the lead is a square wave through a low-pass filter,
  // so it has bite without being harsh). 'den' is a gentle music-box tune for the results,
  // hatching and Den screens. Starting one stops the other.
  startMusic(tune = 'race') {
    if (!this.ctx) return;
    if (this.musicTimer && this.tune === tune) return;
    this.stopMusic();
    this.tune = tune;
    // A short silence between tunes, so notes already queued from the old one are not heard under the new one.
    const now = this.ctx.currentTime, gap = 0.4;
    this.music.gain.setTargetAtTime(this.musicOn ? MUSIC_LEVEL[tune] : 0, now + gap - 0.06, 0.02);
    if (!this.leadBus) {
      this.leadBus = this.ctx.createBiquadFilter(); this.leadBus.type = 'lowpass'; this.leadBus.frequency.value = 2300; this.leadBus.Q.value = 0.8;
      this.leadBus.connect(this.music);
      this.bassBus = this.ctx.createBiquadFilter(); this.bassBus.type = 'lowpass'; this.bassBus.frequency.value = 620;
      this.bassBus.connect(this.music);
    }
    this.step = 0; this.fast = false; this.nextTime = now + gap;
    this.musicTimer = setInterval(() => this.schedule(), 80);
  }
  // Stops at once: the music is faded out in a few hundredths of a second, cutting off queued notes too.
  stopMusic() {
    clearInterval(this.musicTimer); this.musicTimer = null; this.tune = null; this.fast = false;
    if (this.music) { const t = this.ctx.currentTime; this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(0, t, 0.03); }
  }
  // Final lap: the race tune speeds up.
  setFinalLap(on) { this.fast = on; }
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    if (this.tune === 'den') return this.scheduleDen();
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      const S = 60 / (this.fast ? 172 : 154) / 4;                // one sixteenth note
      const t = this.nextTime, i = this.step % 16;
      const bar = SONG[Math.floor(this.step / 16) % SONG.length];
      const lead = bar.lead[i], root = bar.root;
      // drums
      if (i % 4 === 0) this.tone(150, 0.13, { music: true, to: 46, vol: 1.0, at: t });
      if (i === 4 || i === 12) { this.noise(0.13, { music: true, freq: 1900, filter: 'bandpass', vol: 0.55, at: t }); this.tone(200, 0.07, { music: true, to: 130, type: 'triangle', vol: 0.35, at: t }); }
      if (i % 2 === 0) this.noise(0.03, { music: true, freq: 7500, filter: 'highpass', vol: i % 4 === 2 ? 0.26 : 0.12, at: t });
      if (this.fast && i % 2 === 1) this.noise(0.02, { music: true, freq: 8000, filter: 'highpass', vol: 0.1, at: t });
      if (bar.fill && i >= 12) this.noise(0.07, { music: true, freq: 1500 + i * 120, filter: 'bandpass', vol: 0.45, at: t });
      // bass: a gallop on the chord root with octave pops
      const b = BASS[i];
      if (b != null) {
        this.tone(NOTE(root + b), S * 1.5, { music: true, type: 'square', vol: 0.34, at: t, dest: this.bassBus });
        this.tone(NOTE(root + b), S * 1.8, { music: true, type: 'triangle', vol: 0.5, at: t });
      }
      // lead
      if (lead != null) {
        this.tone(NOTE(lead), S * 1.9, { music: true, type: 'square', vol: 0.3, at: t, dest: this.leadBus, attack: 0.006 });
        this.tone(NOTE(lead - 12), S * 1.6, { music: true, type: 'triangle', vol: 0.26, at: t });
      }
      this.nextTime += S; this.step++;
    }
  }
  // The Den tune: slow, no drums, soft sine notes like a music box, with a low hum underneath.
  scheduleDen() {
    const S = 60 / 92 / 2;                                        // eighth notes at 92 bpm
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      const i = this.step % DEN_LEAD.length, t = this.nextTime, n = DEN_LEAD[i];
      if (n != null) {
        this.tone(NOTE(n + 12), S * 3.2, { music: true, vol: 0.5, at: t, attack: 0.004 });
        this.tone(NOTE(n + 24), S * 1.4, { music: true, vol: 0.12, at: t, attack: 0.004 });
      }
      if (i % 4 === 0) this.tone(NOTE(DEN_BASS[Math.floor(i / 4) % DEN_BASS.length] - 12), S * 4.2, { music: true, type: 'triangle', vol: 0.4, at: t, attack: 0.05 });
      this.nextTime += S; this.step++;
    }
  }
}

const MUSIC_LEVEL = { race: 0.15, den: 0.1 };

// Sixteen steps per bar. Lead notes are semitones above middle C; null is a rest.
const _ = null;
const DEN_LEAD = [
  12, _, 16, 19, _, 16, 21, 19, 16, _, 12, 14, 16, _, 14, _,
  12, _, 16, 19, _, 24, 21, 19, 21, _, 19, 16, 14, _, 12, _,
  9, _, 12, 16, _, 12, 19, 16, 14, _, 9, 12, 14, _, 12, _,
  7, _, 12, 14, _, 16, 19, 21, 24, _, 21, 19, 16, 14, 12, _,
];
const DEN_BASS = [0, 0, -3, -3, -8, -8, -5, -5];                  // one per half bar: C C A A F F G G
const BASS = [0, _, 0, 0, 12, _, 0, _, 0, _, 0, 0, 12, _, 7, _];
const A = [
  { root: -20, lead: [16, _, 16, 19, _, 16, _, 11, 14, _, 16, _, 19, 21, _, _] },            // E minor
  { root: -17, lead: [19, _, 19, 23, _, 19, _, 14, 16, _, 19, _, 23, 21, 19, _] },           // G
  { root: -22, lead: [18, _, 18, 21, _, 18, _, 14, 16, _, 18, _, 21, 18, _, 14] },           // D
  { root: -15, lead: [16, _, 13, 16, _, 21, _, 16, 13, _, 16, 18, 19, 21, 23, 25], fill: true }, // A, with a run up into the repeat
];
const B = [
  { root: -24, lead: [12, _, _, 16, _, _, 19, _, 24, _, 19, _, 16, _, 19, _] },              // C
  { root: -22, lead: [14, _, _, 18, _, _, 21, _, 26, _, 21, _, 18, _, 21, _] },              // D
  { root: -20, lead: [16, _, 19, _, 23, _, 28, _, 26, _, 23, _, 19, _, 16, _] },             // E minor
  { root: -25, lead: [15, _, 18, _, 23, _, 27, _, 23, 23, _, 23, 23, _, 23, 23], fill: true }, // B: drum-roll finish
];
const SONG = [...A, ...A, ...B, ...A];
