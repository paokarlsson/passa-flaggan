// Pulsens tempo. Ren logik utan Web Audio, så att den går att testa i Node.
// Tiden t är i sekunder (AudioContext.currentTime i spelet).
import { randInt } from './random.js';

export const TEMPO = {
  minBpm: 60,
  maxBpm: 180,
  // Finter: tempot sjunker en stund och drar sedan igång igen, så att man inte
  // kan räkna ut timern ur tempot.
  finteMinGapS: 6,
  finteMaxGapS: 14,
  finteDepth: 0.5, // tempot sjunker till hälften
  finteDownS: 0.4,
  finteHoldS: 1.2,
  finteUpS: 0.8,
  finteFrom: 0.15, // bara mellan 15 % och 90 % av rundan
  finteTo: 0.9,
};

// Grundtempot ökar jämnt med hur långt rundan har gått (0–1).
export function baseBpm(progress) {
  const p = Math.min(1, Math.max(0, progress));
  return TEMPO.minBpm + (TEMPO.maxBpm - TEMPO.minBpm) * p ** 1.15;
}

export class Fintes {
  constructor(rng, tempo = TEMPO) {
    this.rng = rng;
    this.tempo = tempo;
    this.reset(0);
  }

  reset(t) {
    this.active = null;
    this.nextAt = t + this.gap();
  }

  gap() {
    return randInt(this.rng, this.tempo.finteMinGapS * 10, this.tempo.finteMaxGapS * 10) / 10;
  }

  length() {
    return this.tempo.finteDownS + this.tempo.finteHoldS + this.tempo.finteUpS;
  }

  // Faktor som grundtempot multipliceras med: 1 normalt, lägre under en fint.
  factor(t, progress) {
    const T = this.tempo;
    if (!this.active && t >= this.nextAt) {
      if (progress >= T.finteFrom && progress <= T.finteTo) {
        this.active = { start: t };
      } else {
        this.nextAt = t + this.gap();
      }
    }
    if (!this.active) return 1;

    const dt = t - this.active.start;
    const low = 1 - T.finteDepth;
    if (dt < T.finteDownS) return 1 - (1 - low) * (dt / T.finteDownS);
    if (dt < T.finteDownS + T.finteHoldS) return low;
    if (dt < this.length()) return low + (1 - low) * ((dt - T.finteDownS - T.finteHoldS) / T.finteUpS);
    this.active = null;
    this.nextAt = t + this.gap();
    return 1;
  }
}
