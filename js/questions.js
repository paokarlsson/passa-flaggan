// Frågor: rätt land plus felaktiga alternativ.
//
// Svårigheten (0–1) följer rundan och är samma för alla. Den styr två saker:
// - Hur kända länderna är (data/kandhet.json, grupp 1–5).
// - Hur lika felalternativens flaggor är: olika flaggor i början, förväxlingsbara på slutet.
// Spelarens nivå styr bara hur många alternativ som visas.
import { pick, shuffle } from './random.js';

export const LEVELS = {
  barn: { label: 'Barn', options: 3 },
  normal: { label: 'Normal', options: 4 },
  nord: { label: 'Nörd', options: 6 },
};

export function levelForAge(age) {
  if (!Number.isFinite(age) || age <= 0) return 'normal';
  if (age < 9) return 'barn';
  if (age < 15) return 'normal';
  return 'nord';
}

// Det största antalet rundor en match kan ha: alla utom vinnaren förlorar alla
// liv, och vinnaren förlorar alla utom ett. Det är antalet steg i trappan.
export function maxRounds(players, lives) {
  return lives * players - 1;
}

export function difficultyForRound(round, totalRounds) {
  if (totalRounds <= 1) return 1;
  return Math.min(1, Math.max(0, (round - 1) / (totalRounds - 1)));
}

// Vilka kändhetsgrupper rätt svar hämtas ur. Börjar med bara grupp 1 och
// flyttar uppåt: [1], [1–2], [1–3], [2–4], [3–5].
export function tierRange(difficulty) {
  const top = 1 + Math.round(difficulty * 4);
  return [Math.max(1, top - 2), top];
}

// Flaggor som är (nästan) identiska. De får aldrig visas som alternativ i
// samma fråga, eftersom det då inte går att svara rätt.
const IDENTICAL = [
  ['id', 'mc'],
  ['td', 'ro'],
];

function clashes(a, b) {
  return IDENTICAL.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

// Hur olika två flaggor ser ut: medelavståndet mellan färgerna i rutnätet.
export function flagDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.farg.length; i += 3) {
    sum += Math.hypot(a.farg[i] - b.farg[i], a.farg[i + 1] - b.farg[i + 1], a.farg[i + 2] - b.farg[i + 2]);
  }
  return sum / (a.farg.length / 3);
}

export class QuestionSource {
  constructor(countries, rng) {
    this.rng = rng;
    this.countries = countries;
    this.byId = new Map(countries.map((c) => [c.id, c]));
    this.recent = []; // nyligen frågade länder, så att samma land inte kommer igen direkt
    this.nearest = new Map(); // id → alla andra länder sorterade från mest lik till minst lik
  }

  byLikeness(answer) {
    if (!this.nearest.has(answer.id)) {
      const sorted = this.countries
        .filter((c) => c.id !== answer.id)
        .map((c) => [c, flagDistance(answer, c)])
        .sort((a, b) => a[1] - b[1])
        .map(([c]) => c);
      this.nearest.set(answer.id, sorted);
    }
    return this.nearest.get(answer.id);
  }

  draw(difficulty) {
    const [lo, hi] = tierRange(difficulty);
    const pool = this.countries.filter((c) => c.kand >= lo && c.kand <= hi);
    const fresh = pool.filter((c) => !this.recent.includes(c.id));
    const answer = pick(this.rng, fresh.length ? fresh : pool);
    this.recent.push(answer.id);
    // Kom ihåg ungefär två tredjedelar av poolen, så att länder kommer igen
    // först när de flesta andra har visats.
    while (this.recent.length > Math.floor(pool.length * 0.66)) this.recent.shift();
    return answer;
  }

  distractors(answer, count, difficulty) {
    // Felalternativen ska också vara kända länder när det är lätt.
    const maxTier = Math.max(2, tierRange(difficulty)[1]);
    // På den lätta halvan utesluts flaggor som datan listar som förväxlingsbara.
    const confusable = (c) => answer.liknar.includes(c.id) || c.liknar.includes(answer.id);
    const candidates = this.byLikeness(answer).filter(
      (c) => c.kand <= maxTier && !clashes(c.id, answer.id) && (difficulty >= 0.5 || !confusable(c)),
    );

    // Svårt: börja med flaggorna som är listade som förväxlingsbara.
    const chosen = [];
    const ok = (c) => !chosen.includes(c) && !chosen.some((o) => clashes(o.id, c.id));
    if (difficulty >= 0.75) {
      for (const id of shuffle(this.rng, answer.liknar)) {
        const c = this.byId.get(id);
        if (chosen.length < Math.ceil(count / 2) && c && candidates.includes(c) && ok(c)) chosen.push(c);
      }
    }

    // Plocka ur ett fönster i listan sorterad efter likhet: längst bort
    // (olika flaggor) när det är lätt, närmast (lika flaggor) när det är svårt.
    const n = candidates.length;
    const center = Math.round((1 - difficulty) * (n - 1));
    let half = Math.max(count * 2, Math.round(n * 0.12));
    while (chosen.length < count && half <= n) {
      const window = candidates.slice(Math.max(0, center - half), center + half + 1);
      for (const c of shuffle(this.rng, window)) {
        if (chosen.length >= count) break;
        if (ok(c)) chosen.push(c);
      }
      half *= 2;
    }
    return chosen;
  }

  // kind: 'flagga' (visa flaggan, välj namn) eller 'namn' (visa namnet, välj flagga)
  next({ options, difficulty, kind }) {
    const answer = this.draw(difficulty);
    const all = shuffle(this.rng, [answer, ...this.distractors(answer, options - 1, difficulty)]);
    return { kind, difficulty, answer, options: all, correctIndex: all.indexOf(answer) };
  }
}
