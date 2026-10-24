// Ljudmotorn. Spelets ljud syntetiseras med Web Audio API. Bara musiken i
// menyn och på vinnarskärmen är ljudfiler (ljud/).
//
// Högtalaren (ofta Bluetooth) bär stämningen: puls och smäll. Mobilen ger den
// personliga återkopplingen med färg och vibration. Bluetooth fördröjer ljudet
// 150–300 ms, så inget ljud kräver exakt synk med bilden. Undantaget är
// smällen: allt tystnar, och bilden väntar in ljudet (se explode()).
//
// Kedja: källor → bussar (puls, effekter, smäll, musik) → master → limiter → högtalare
import { Fintes, baseBpm } from './tempo.js';

const LOOKAHEAD_S = 0.12; // så långt fram pulsslagen schemaläggs
const SCHEDULER_MS = 25; // hur ofta schemaläggaren tittar efter nya slag
const FREEZE_S = 0.3; // tystnad före smällen
const FALLBACK_LATENCY_S = 0.2; // om webbläsaren inte rapporterar fördröjningen
const KEEPALIVE_GAIN = 0.002; // nästan ohörbart brus så att högtalaren inte somnar
const STORAGE_KEY = 'passa-flaggan:ljud';
const MUSIC_FADE_S = 0.8;

export const TRACKS = {
  meny: { url: 'ljud/meny.mp3', gain: 0.18, loop: true }, // låg, ligger i bakgrunden
  vinnare: { url: 'ljud/vinnare.mp3', gain: 0.7, loop: false },
};

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Saknas (t.ex. iPhone) eller blockerat: inget att göra.
  }
}

export class AudioEngine {
  // ctx kan skickas in (t.ex. en OfflineAudioContext i tester). Annars skapas
  // en riktig AudioContext vid första unlock().
  constructor({ ctx = null, rng = Math.random } = {}) {
    this.ctx = ctx;
    this.rng = rng;
    this.enabled = loadEnabled();
    this.fintes = new Fintes(rng);
    this.progress = 0;
    this.pulsing = false;
    this.timer = null;
    this.keepAliveSrc = null;
    this.musicWanted = null; // vilket spår som ska spela
    this.music = null; // { name, src, gain } som spelar nu
    this.buffers = new Map(); // namn → Promise<AudioBuffer>
    this.onBeat = null; // anropas ungefär när ett slag hörs, med progress som argument
    if (ctx) this.build();
  }

  // Måste anropas från ett tryck, annars tillåter webbläsaren inget ljud.
  unlock() {
    try {
      // Spela även när iPhone står på ljudlöst (Safari 16.4+).
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // Inte tillgängligt.
    }
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    this.applyMusic();
  }

  // När appen inte syns ska inget låta, t.ex. menymusiken.
  sleep() {
    if (this.ready && this.ctx.state === 'running') this.ctx.suspend();
  }

  wake() {
    if (this.ready && this.ctx.state === 'suspended') this.ctx.resume();
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;

    // Limiter: hård kompressor sist i kedjan så att smällen inte klipper.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.2;

    this.master.connect(this.limiter).connect(ctx.destination);

    this.pulseBus = this.bus();
    this.sfxBus = this.bus();
    this.boomBus = this.bus();
    this.musicBus = this.bus();

    // Brusbuffert som återanvänds av alla brusljud.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = this.rng() * 2 - 1;
  }

  bus() {
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  get ready() {
    return !!this.ctx;
  }

  now() {
    return this.ctx.currentTime;
  }

  // ---------- Inställningar ----------

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      // Sparas inte, men fungerar ändå.
    }
    if (this.ready) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.now(), 0.02);
  }

  // ---------- Match och runda ----------

  // Håller högtalaren vaken hela matchen, även mellan rundor och efter smällen.
  keepAlive() {
    if (!this.ready || this.keepAliveSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = KEEPALIVE_GAIN;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    this.keepAliveSrc = src;
  }

  endMatch() {
    this.setPulse(false);
    if (this.keepAliveSrc) {
      this.keepAliveSrc.stop();
      this.keepAliveSrc = null;
    }
  }

  // Startar eller stoppar pulsen. Anropas varje bildruta, så den gör inget om
  // läget redan stämmer. Används för rundstart, paus och återupptagning.
  setPulse(on) {
    if (!this.ready || on === this.pulsing) return;
    this.pulsing = on;
    if (on) {
      const t = this.now();
      this.pulseBus.gain.cancelScheduledValues(t);
      this.pulseBus.gain.setValueAtTime(1, t);
      this.sfxBus.gain.cancelScheduledValues(t);
      this.sfxBus.gain.setValueAtTime(1, t);
      this.fintes.reset(t);
      this.nextBeat = t + 0.05;
      this.beatIndex = 0;
      this.schedule();
      this.timer = setInterval(() => this.schedule(), SCHEDULER_MS);
    } else {
      clearInterval(this.timer);
      this.timer = null;
      // Slag som redan är schemalagda tystas.
      const t = this.now();
      this.pulseBus.gain.cancelScheduledValues(t);
      this.pulseBus.gain.setTargetAtTime(0, t, 0.01);
    }
  }

  // Hur långt rundan har gått, 0–1. Styr tempot. Hoppar framåt vid fel svar.
  setProgress(p) {
    this.progress = p;
  }

  bpmAt(t) {
    return baseBpm(this.progress) * this.fintes.factor(t, this.progress);
  }

  // Lookahead-schemaläggning: slagen läggs mot ctx.currentTime, inte med setTimeout.
  schedule() {
    const horizon = this.now() + LOOKAHEAD_S;
    while (this.nextBeat < horizon) {
      const t = this.nextBeat;
      const interval = 60 / this.bpmAt(t);
      this.heartbeat(t, interval, this.progress);
      if (this.onBeat) {
        const p = this.progress;
        setTimeout(() => this.onBeat?.(p), Math.max(0, (t - this.now()) * 1000));
      }
      this.nextBeat = t + interval;
      this.beatIndex++;
    }
  }

  // ---------- Ljud ----------

  // attack: hur snabbt ljudet når full styrka. Kort ger ett hårt anslag, långt ett mjukt.
  osc(type, t, dur, f0, f1, gain, dest, attack = 0.004) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(t, dur, gain, dest, filterType, f0, f1 = f0, q = 1, attack = 0.003) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true; // bufferten är 2 s, längre brus loopar
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(t, this.rng() * 1.5);
    src.stop(t + dur + 0.02);
  }

  // Hjärtslag, "dunk-dunk". Sub-bas för stora högtalare och ett mellanregister
  // som hörs även i mobilens egen högtalare.
  heartbeat(t, interval, p) {
    const bus = this.pulseBus;
    // Pulsen ligger klart under smällen så att smällen känns.
    const level = 0.18 + 0.14 * p;
    const thump = (at, strength) => {
      const s = level * strength;
      this.osc('sine', at, 0.22, 62, 38, 0.9 * s, bus); // sub-bas
      this.osc('triangle', at, 0.12, 130, 80, 0.45 * s, bus); // mellanregister
      this.noise(at, 0.03, 0.12 * s, bus, 'bandpass', 1400, 1400, 1.5); // anslag
    };
    thump(t, 1);
    thump(t + Math.min(0.17, interval * 0.3), 0.6);
  }

  // Mullret efter bomben: byggs upp och klingar sedan långsamt ut under några sekunder.
  rumble(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(260, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.4);
    g.gain.setTargetAtTime(0, t + 0.6, 1.1);
    src.connect(filter).connect(g).connect(this.boomBus);
    src.start(t, this.rng() * 1.5);
    src.stop(t + 6);
  }

  // Kort swoosh uppåt, under 200 ms.
  correct() {
    if (!this.ready) return;
    const t = this.now();
    this.noise(t, 0.18, 0.5, this.sfxBus, 'bandpass', 500, 4000, 2);
    this.osc('triangle', t + 0.02, 0.15, 880, 1320, 0.15, this.sfxBus);
  }

  // Kort surr, under 200 ms.
  wrong() {
    if (!this.ready) return;
    const t = this.now();
    this.osc('sawtooth', t, 0.18, 150, 110, 0.3, this.sfxBus);
    this.osc('square', t, 0.18, 156, 114, 0.15, this.sfxBus);
  }

  // Frikort: en snabb uppåtgående treklang, under 200 ms.
  card() {
    if (!this.ready) return;
    const t = this.now();
    [784, 988, 1175].forEach((f, i) => this.osc('triangle', t + i * 0.05, 0.1, f, f, 0.2, this.sfxBus));
  }

  // ---------- Musik ----------

  // Väljer vilket spår som ska spela (ett namn i TRACKS, eller null för tyst).
  // Anropas vid varje skärmbyte; gör inget om spåret redan är valt, så att ett
  // spår som spelats klart inte börjar om.
  setMusic(name) {
    if (name === this.musicWanted) return;
    this.musicWanted = name;
    this.applyMusic();
  }

  applyMusic() {
    if (!this.ready) return; // spelas när unlock() har körts
    const name = this.musicWanted;
    if (this.music?.name === name) return;
    this.stopMusic();
    if (!name) return;
    const track = TRACKS[name];
    this.loadTrack(name)
      .then((buffer) => {
        if (this.musicWanted !== name || this.music?.name === name) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = track.loop;
        const gain = this.ctx.createGain();
        const t = this.now();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(track.gain, t + MUSIC_FADE_S);
        src.connect(gain).connect(this.musicBus);
        src.start(t);
        this.music = { name, src, gain };
      })
      .catch(() => {
        // Spåret kunde inte laddas: spelet fungerar ändå utan musik.
      });
  }

  stopMusic() {
    if (!this.music) return;
    const { src, gain } = this.music;
    const t = this.now();
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + MUSIC_FADE_S);
    src.stop(t + MUSIC_FADE_S + 0.05);
    this.music = null;
  }

  loadTrack(name) {
    if (!this.buffers.has(name)) {
      const p = fetch(TRACKS[name].url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)));
      p.catch(() => this.buffers.delete(name)); // försök igen nästa gång
      this.buffers.set(name, p);
    }
    return this.buffers.get(name);
  }

  // Allt tystnar, efter FREEZE_S kommer smällen. Returnerar efter hur många
  // millisekunder bilden ska visa smällen, så att den hamnar samtidigt som
  // ljudet trots Bluetooth-fördröjningen.
  explode() {
    let latency = FALLBACK_LATENCY_S;
    if (this.ready && this.ctx.outputLatency > 0) latency = this.ctx.outputLatency;
    if (!this.ready) return Math.round((FREEZE_S + latency) * 1000);

    this.setPulse(false);
    const t = this.now();
    this.sfxBus.gain.cancelScheduledValues(t);
    this.sfxBus.gain.setTargetAtTime(0, t, 0.01);

    const b = t + FREEZE_S;
    const bus = this.boomBus;
    // En dov bomb, inte en smäll: inga höga frekvenser och mjuka anslag.
    this.osc('sine', b, 2.6, 70, 22, 1.0, bus, 0.012); // sub-bas som faller
    this.noise(b, 3.5, 1.0, bus, 'lowpass', 1100, 40, 0.5, 0.02); // dånet, mörknar
    this.noise(b, 1.3, 0.55, bus, 'bandpass', 380, 110, 0.8, 0.015); // dov duns som hörs i små högtalare
    this.osc('triangle', b, 1.0, 120, 38, 0.45, bus, 0.01); // tryckvågen
    this.rumble(b + 0.15); // mullret efteråt
    this.sfxBus.gain.setValueAtTime(1, b);
    // Därefter tystnad: pulsen står still tills nästa runda, bara keep-alive-bruset hörs.

    return Math.round((FREEZE_S + latency) * 1000);
  }
}

function loadEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}
