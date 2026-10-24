// Frågor: rätt land plus felaktiga alternativ, anpassat efter nivå.
import { shuffle } from './random.js';

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

// Flaggor som är (nästan) identiska. De får aldrig visas som alternativ i
// samma fråga, eftersom det då inte går att svara rätt.
const IDENTICAL = [
  ['id', 'mc'],
  ['td', 'ro'],
];

function clashes(a, b) {
  return IDENTICAL.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export class QuestionSource {
  constructor(countries, rng) {
    this.rng = rng;
    this.byId = new Map(countries.map((c) => [c.id, c]));
    this.pools = {
      barn: countries.filter((c) => c.barn),
      normal: countries.filter((c) => c.fn),
      nord: countries,
    };
    this.decks = { barn: [], normal: [], nord: [] };
    this.last = null;
  }

  // Varje nivå har en egen kortlek, så att samma land inte kommer igen förrän
  // alla i leken har visats.
  draw(level) {
    let deck = this.decks[level];
    if (deck.length === 0) {
      deck = this.decks[level] = shuffle(this.rng, this.pools[level]);
    }
    let i = deck.length - 1;
    if (deck[i].id === this.last && deck.length > 1) i--;
    const [answer] = deck.splice(i, 1);
    this.last = answer.id;
    return answer;
  }

  distractors(level, answer) {
    const pool = this.pools[level];
    const count = LEVELS[level].options - 1;
    const chosen = [];
    const ok = (c) =>
      c.id !== answer.id &&
      !chosen.includes(c) &&
      !clashes(c.id, answer.id) &&
      !chosen.some((o) => clashes(o.id, c.id));
    const take = (candidates) => {
      for (const c of shuffle(this.rng, candidates)) {
        if (chosen.length >= count) return;
        if (ok(c)) chosen.push(c);
      }
    };

    if (level === 'nord') {
      // Förväxlingsbara flaggor först, sedan grannar på samma kontinent.
      take(answer.liknar.map((id) => this.byId.get(id)).filter(Boolean));
      take(pool.filter((c) => c.kontinent === answer.kontinent));
    }
    take(pool);
    return chosen;
  }

  // kind: 'flagga' (visa flaggan, välj namn) eller 'namn' (visa namnet, välj flagga)
  next(level, kind) {
    const answer = this.draw(level);
    const options = shuffle(this.rng, [answer, ...this.distractors(level, answer)]);
    return { kind, level, answer, options, correctIndex: options.indexOf(answer) };
  }
}
