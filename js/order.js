// Turordning: slumpad, men alla får en tur per varv och ingen får mobilen
// två gånger i rad.
import { shuffle } from './random.js';

export class TurnOrder {
  constructor(rng) {
    this.rng = rng;
    this.lap = [];
  }

  // Ny runda: den som startar har redan fått sin tur i det här varvet.
  reset(alive, starter) {
    this.lap = shuffle(this.rng, alive.filter((id) => id !== starter));
  }

  next(alive, current) {
    this.lap = this.lap.filter((id) => alive.includes(id) && id !== current);
    if (this.lap.length === 0) {
      this.lap = shuffle(this.rng, alive);
      // Nytt varv får inte börja med den som håller mobilen nu.
      if (this.lap[0] === current && this.lap.length > 1) {
        const j = 1 + Math.floor(this.rng() * (this.lap.length - 1));
        [this.lap[0], this.lap[j]] = [this.lap[j], this.lap[0]];
      }
    }
    return this.lap.shift();
  }
}
