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
        this.music = this.ctx.createGain(); this.music.gain.value = this.musicOn ? 0.13 : 0; this.music.connect(this.ctx.destination);
        const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  }
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.5 : 0; }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.value = on ? 0.13 : 0; }

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
    osc.connect(g); g.connect(o.music ? this.music : this.sfx);
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

  // ----- music: a light looping tune in C major pentatonic -----
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0; this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 90);
  }
  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; }
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const S = 60 / 124 / 2;                                   // eighth notes at 124 bpm
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    const _ = null;
    const lead = [
      12, _, 16, 19, _, 16, 21, 19, 16, _, 12, 14, 16, _, 14, _,
      12, _, 16, 19, _, 24, 21, 19, 21, _, 19, 16, 14, _, 12, _,
      9, _, 12, 16, _, 12, 19, 16, 14, _, 9, 12, 14, _, 12, _,
      7, _, 12, 14, _, 16, 19, 21, 24, _, 21, 19, 16, 14, 12, _,
    ];
    const bass = [0, 0, -3, -3, -8, -8, -5, -5];              // one per half bar: C C A A F F G G
    while (this.nextTime < this.ctx.currentTime + 0.35) {
      const i = this.step % lead.length, t = this.nextTime;
      if (lead[i] != null) this.tone(NOTE(lead[i]), S * 1.7, { music: true, type: 'triangle', vol: 0.5, at: t });
      if (i % 4 === 0) this.tone(NOTE(bass[Math.floor(i / 4) % 8] - 12), S * 3.4, { music: true, vol: 0.7, at: t });
      if (i % 4 === 2) this.tone(NOTE(bass[Math.floor(i / 4) % 8]), S * 1.2, { music: true, vol: 0.3, at: t });
      if (i % 2 === 1) this.noise(0.04, { music: true, freq: 6000, filter: 'highpass', vol: 0.25, at: t });
      this.nextTime += S; this.step++;
    }
  }
}
