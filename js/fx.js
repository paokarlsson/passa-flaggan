// Ljud (Web Audio API) och vibration (Vibration API, finns inte på iPhone).
let ctx = null;

// Måste anropas från ett tryck, annars tillåter webbläsaren inget ljud.
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, durS, { type = 'square', gain = 0.15, delayS = 0, slideTo = null } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delayS;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + durS);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + durS);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durS + 0.02);
}

function noise(durS, gain) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + durS);
  const amp = ctx.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(t);
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Saknas eller blockerat: inget att göra.
  }
}

export const sound = {
  // progress 0–1: tickandet blir ljusare och starkare mot slutet.
  tick(progress) {
    tone(900 + 700 * progress, 0.04, { gain: 0.05 + 0.15 * progress });
  },
  correct() {
    tone(660, 0.12, { type: 'triangle', gain: 0.25 });
    tone(990, 0.2, { type: 'triangle', gain: 0.25, delayS: 0.09 });
  },
  wrong() {
    tone(180, 0.35, { type: 'sawtooth', gain: 0.18, slideTo: 90 });
  },
  boom() {
    noise(1.6, 0.9);
    tone(120, 1.2, { type: 'sine', gain: 0.8, slideTo: 30 });
  },
  card() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.15, { type: 'triangle', gain: 0.2, delayS: i * 0.08 }));
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.2, delayS: i * 0.15 }));
  },
};
