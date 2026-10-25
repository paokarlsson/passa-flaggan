// Frågor: rätt land plus felaktiga alternativ.
//
// Svårigheten (0–1) följer rundan och är samma för alla. Den styr två saker:
// - Hur kända länderna är (data/kandhet.json, grupp 1–5).
// - Hur lika felalternativens flaggor är: olika flaggor i början, förväxlingsbara på slutet.
// Spelarens nivå styr bara hur många alternativ som visas.
import { pick, shuffle } from './random.js';

// difficulty: hur högt i trappan nivån ligger. Barn får lättare länder än vuxna.
export const LEVELS = {
  barn: { label: 'Barn', options: 3, difficulty: 0.5 },
  normal: { label: 'Normal', options: 4, difficulty: 1 },
  nord: { label: 'Nörd', options: 6, difficulty: 1 },
};

// Trappan har minst så här många steg, så att den inte blir för brant med få spelare.
export const MIN_STEPS = 10;

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

// Vilka kändhetsgrupper felalternativen får hämtas ur: [1], [1–2], [1–3], [2–4], [3–5].
export function tierRange(difficulty) {
  const top = 1 + Math.round(difficulty * 4);
  return [Math.max(1, top - 2), top];
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Hur mycket varje kändhetsgrupp (1–5) väger vid svårigheten d. Fronten går
// från grupp 1 till grupp 5. Nästa grupp tonas in gradvis, så att andelen okända
// länder ökar jämnt i stället för i hopp, och grupper långt under fronten tonas ut.
export function tierWeights(d) {
  const front = 1 + 4 * clamp01(d);
  return [1, 2, 3, 4, 5].map((k) => Math.min(clamp01(front - k + 1), clamp01(k - (front - 3))));
}

// Minst så många länder att välja bland, annars tas närmaste grupper med.
const MIN_POOL = 6;

// Väljer rätt svar. Varje kändhetsgrupp får sin vikt från tierWeights, så att
// en stor grupp inte tar över. Finns för
// få länder (t.ex. kända länder utan kust) fylls det på från närmaste grupper,
// med lägre vikt ju längre bort de ligger. Länder i `recent` undviks tills de
// flesta andra har visats.
export function drawByTier(rng, items, d, recent) {
  const weights = tierWeights(d);
  const front = 1 + 4 * clamp01(d);
  const weight = new Map();
  for (const k of [1, 2, 3, 4, 5]) {
    const inTier = items.filter((c) => c.kand === k);
    for (const c of inTier) if (weights[k - 1] > 0) weight.set(c, weights[k - 1] / inTier.length);
  }
  const byDistance = shuffle(rng, items.filter((c) => !weight.has(c))).sort(
    (x, y) => Math.abs(x.kand - front) - Math.abs(y.kand - front),
  );
  for (const c of byDistance) {
    if (weight.size >= MIN_POOL) break;
    weight.set(c, 0.5 ** Math.ceil(Math.abs(c.kand - front)) / MIN_POOL);
  }
  const allowed = [...weight.keys()];
  // Först en grupp efter vikt, sedan ett land i gruppen. Då påverkar minnet av
  // nyligen frågade länder bara vilket land det blir, inte hur svårt det är.
  const weightedPick = (list) => {
    let r = rng() * list.reduce((sum, [, w]) => sum + w, 0);
    for (const [item, w] of list) if ((r -= w) < 0) return item;
    return list[list.length - 1][0];
  };
  const tiers = [...new Set(allowed.map((c) => c.kand))];
  const tier = weightedPick(
    tiers.map((k) => [k, allowed.filter((c) => c.kand === k).reduce((sum, c) => sum + weight.get(c), 0)]),
  );
  const inTier = allowed.filter((c) => c.kand === tier);
  const fresh = inTier.filter((c) => !recent.includes(c.id));
  const answer = weightedPick((fresh.length ? fresh : inTier).map((c) => [c, weight.get(c)]));
  recent.push(answer.id);
  while (recent.length > Math.max(1, Math.floor(allowed.length * 0.66))) recent.shift();
  return answer;
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
    return drawByTier(this.rng, this.countries, difficulty, this.recent);
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
