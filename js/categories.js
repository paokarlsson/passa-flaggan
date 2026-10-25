// Kategorier. Varje kategori gör frågor i samma format så att gränssnittet kan
// rita dem likadant:
//
//   ask      text ovanför det som frågas om (eller null)
//   subject  det som frågas om: { text?, flag?, silhouette? }
//   after    text under (eller null)
//   optionStyle  'text' | 'flag' | 'textflag'
//   options  [{ text?, flag? }], correctIndex
//   reveal   facit som visas vid smällen: { label, name, flag?, silhouette?, bars? }
//
// Svårigheten (0–1) styr två saker i alla kategorier: hur kända länderna är
// (tierRange) och hur nära felalternativen ligger rätt svar.
import { pick, shuffle } from './random.js';
import { QuestionSource, drawByTier, flagDistance, tierRange, tierWeights } from './questions.js';

// scale: hur högt i trappan kategorin når. Kategorier som är svårare i sig
// (former, storlekar, huvudstäder) ligger lägre, så att de inte blir orimliga.
export const CATEGORIES = {
  flaggor: { label: 'Flaggor', scale: 1 },
  huvudstad: { label: 'Huvud\u00adstäder', chip: 'Huvudstad', scale: 0.8 },
  storst: { label: 'Störst', scale: 0.6 },
  folk: { label: 'Flest invånare', scale: 0.6 },
  varldsdel: { label: 'Världsdel', scale: 1 },
  siluett: { label: 'Siluett', scale: 0.6 },
  grannar: { label: 'Grannar', scale: 0.85 },
  kust: { label: 'Kust', scale: 0.7 },
  udda: { label: 'Udda ut', scale: 0.9 },
};

// I jämförelserna är mikrostater med bara på allra svåraste nivån.
const MIN_AREA = 20000;
const MIN_PEOPLE = 1.5e6;

export const CONTINENTS = ['Afrika', 'Asien', 'Europa', 'Nordamerika', 'Sydamerika', 'Oceanien'];

// Världsdelar som ligger nära varandra blir svårare felsvar.
const ADJACENT = {
  Afrika: ['Europa', 'Asien'],
  Asien: ['Europa', 'Oceanien', 'Afrika'],
  Europa: ['Asien', 'Afrika'],
  Nordamerika: ['Sydamerika', 'Europa'],
  Sydamerika: ['Nordamerika', 'Afrika'],
  Oceanien: ['Asien'],
};

const lerp = (a, b, t) => a + (b - a) * t;

// Felalternativen ska också vara kända länder när det är lätt.
const maxTier = (d) => Math.max(2, tierRange(d)[1]);

// Väljer `count` ur en lista sorterad från mest lik rätt svar till minst lik:
// längst bort när det är lätt, närmast när det är svårt.
export function windowPick(rng, sorted, difficulty, count, ok = () => true) {
  const chosen = [];
  const n = sorted.length;
  const center = Math.round((1 - difficulty) * (n - 1));
  let half = Math.max(count * 2, Math.round(n * 0.12));
  while (chosen.length < count) {
    const window = sorted.slice(Math.max(0, center - half), center + half + 1);
    for (const c of shuffle(rng, window)) {
      if (chosen.length >= count) break;
      if (!chosen.includes(c) && ok(c, chosen)) chosen.push(c);
    }
    if (half > n) break;
    half *= 2;
  }
  return chosen;
}

// Sorterar kandidater efter hur nära de ligger landet a: grannar först, sedan
// grannars grannar, samma världsdel och sist resten.
function byNearness(rng, a, candidates, byId) {
  const near = new Set(a.grannar);
  const near2 = new Set(a.grannar.flatMap((id) => byId.get(id)?.grannar ?? []));
  const score = (c) =>
    near.has(c.id) ? 0 : near2.has(c.id) ? 1 : c.kontinent === a.kontinent ? 2 : 3;
  return shuffle(rng, candidates)
    .map((c) => [c, score(c)])
    .sort((x, y) => x[1] - y[1])
    .map(([c]) => c);
}

export function formatArea(km2) {
  if (km2 >= 1e6) return `${(km2 / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} milj km²`;
  return `${Math.round(km2).toLocaleString('sv-SE')} km²`;
}

export function formatPeople(n) {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} miljarder`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} miljoner`;
  return `${Math.round(n / 1000).toLocaleString('sv-SE')} 000`;
}

export class Quiz {
  constructor(countries, rng) {
    this.rng = rng;
    this.countries = countries;
    this.byId = new Map(countries.map((c) => [c.id, c]));
    this.flags = new QuestionSource(countries, rng);
    this.counters = {};
    this.recent = {};
  }

  // Varje kategori varvar sina varianter, t.ex. flagga → namn → flagga.
  variant(category, variants) {
    const i = this.counters[category] ?? 0;
    this.counters[category] = i + 1;
    return variants[i % variants.length];
  }

  // Rätt svar bland länderna som passar kategorin (filter): kändhetsgrupp
  // enligt svårigheten, och inte ett land som frågats om nyligen.
  draw(category, d, filter) {
    const recent = (this.recent[category] ??= []);
    return drawByTier(this.rng, this.countries.filter(filter), d, recent);
  }

  next({ category, options, difficulty }) {
    const make = this[category];
    if (!make) throw new Error(`Okänd kategori: ${category}`);
    const q = make.call(this, difficulty * CATEGORIES[category].scale, options);
    return { category, difficulty, ...q };
  }

  // ---------- Kategorierna ----------

  flaggor(d, n) {
    const kind = this.variant('flaggor', ['flagga', 'namn']);
    const q = this.flags.next({ options: n, difficulty: d, kind });
    const a = q.answer;
    return {
      kind,
      answer: a,
      ask: kind === 'namn' ? 'Vilken flagga har' : null,
      subject: kind === 'flagga' ? { flag: a } : { text: `${a.namn}?` },
      after: kind === 'flagga' ? 'Vilket land?' : null,
      optionStyle: kind === 'flagga' ? 'text' : 'flag',
      options: q.options.map((c) => (kind === 'flagga' ? { text: c.namn } : { flag: c })),
      correctIndex: q.correctIndex,
      reveal: { label: kind === 'flagga' ? 'Flaggan var' : 'Rätt flagga för', name: a.namn, flag: a },
    };
  }

  huvudstad(d, n) {
    const kind = this.variant('huvudstad', ['stad', 'land']);
    const withCapital = (c) => c.huvudstadFelsvar !== null;
    const a = this.draw('huvudstad', d, withCapital);
    const known = (c) => c.kand <= maxTier(d) && c !== a;

    if (kind === 'stad') {
      // Svårt: datans lömska felsvar (största staden, tidigare huvudstad, grannens huvudstad).
      const taken = new Set([a.huvudstad, ...a.ovrigaHuvudstader]);
      const wrong = [];
      for (const svar of shuffle(this.rng, a.huvudstadFelsvar).slice(0, Math.round(d * (n - 1)))) {
        if (!taken.has(svar)) wrong.push(svar), taken.add(svar);
      }
      // Resten: andra länders huvudstäder, från andra världsdelar när det är lätt.
      const others = byNearness(this.rng, a, this.countries.filter((c) => withCapital(c) && known(c)), this.byId);
      for (const c of windowPick(this.rng, others, d, n - 1 - wrong.length, (c) => !taken.has(c.huvudstad))) {
        wrong.push(c.huvudstad);
        taken.add(c.huvudstad);
      }
      const all = shuffle(this.rng, [a.huvudstad, ...wrong]);
      return {
        kind,
        answer: a,
        ask: 'Vad heter huvudstaden i',
        subject: { text: `${a.namn}?` },
        after: null,
        optionStyle: 'text',
        options: all.map((text) => ({ text })),
        correctIndex: all.indexOf(a.huvudstad),
        reveal: { label: `Huvudstaden i ${a.namn} är`, name: a.huvudstad, flag: a },
      };
    }

    const others = byNearness(this.rng, a, this.countries.filter(known), this.byId);
    const all = shuffle(this.rng, [a, ...windowPick(this.rng, others, d, n - 1)]);
    return {
      kind,
      answer: a,
      ask: null,
      subject: { text: a.huvudstad, pin: true },
      after: 'är huvudstad i…',
      optionStyle: 'text',
      options: all.map((c) => ({ text: c.namn })),
      correctIndex: all.indexOf(a),
      reveal: { label: `${a.huvudstad} är huvudstad i`, name: a.namn, flag: a },
    };
  }

  // Störst till ytan eller flest invånare: rätt svar är störst av alternativen.
  // Lätt: rätt svar är många gånger större. Svårt: nästan lika stora.
  compare(category, value, d, n, minValue) {
    const minRatio = lerp(4, 1.05, d);
    const maxRatio = lerp(300, 2.5, d);
    // Mikrostater bara på allra svåraste nivån: att jämföra dem kan ingen.
    const bigEnough = (c) => d >= 0.9 || value(c) >= minValue;
    const candidates = this.countries.filter((c) => c.kand <= maxTier(d) && bigEnough(c));
    let a;
    let wrong = [];
    for (let attempt = 0; attempt < 40 && wrong.length < n - 1; attempt++) {
      a = this.draw(category, d, bigEnough);
      const relax = attempt >= 30; // hittar vi inget lämpligt släpper vi på kraven
      const fits = candidates.filter((c) => {
        const r = value(a) / value(c);
        return c !== a && r >= (relax ? 1.01 : minRatio) && (relax || r <= maxRatio);
      });
      if (fits.length < n - 1) continue;
      // Svårt: ta alltid med det alternativ som ligger närmast.
      const sorted = fits.sort((x, y) => value(y) - value(x));
      wrong = d >= 0.5 ? [sorted[0], ...shuffle(this.rng, sorted.slice(1)).slice(0, n - 2)] : shuffle(this.rng, sorted).slice(0, n - 1);
    }
    const all = shuffle(this.rng, [a, ...wrong]);
    const max = value(a);
    const format = category === 'storst' ? formatArea : formatPeople;
    return {
      kind: category,
      answer: a,
      ask: null,
      subject: { text: category === 'storst' ? 'Vilket land är störst till ytan?' : 'Var bor flest människor?', icon: category },
      after: null,
      optionStyle: 'textflag',
      options: all.map((c) => ({ text: c.namn, flag: c })),
      correctIndex: all.indexOf(a),
      reveal: {
        label: category === 'storst' ? 'Störst till ytan' : 'Flest invånare',
        name: a.namn,
        bars: [...all]
          .sort((x, y) => value(y) - value(x))
          .map((c) => ({ text: c.namn, valueText: format(value(c)), share: value(c) / max, correct: c === a })),
      },
    };
  }

  storst(d, n) {
    return this.compare('storst', (c) => c.yta, d, n, MIN_AREA);
  }

  folk(d, n) {
    return this.compare('folk', (c) => c.folk, d, n, MIN_PEOPLE);
  }

  varldsdel(d, n) {
    const a = this.draw('varldsdel', d, (c) => !c.tvaVarldsdelar);
    const others = CONTINENTS.filter((k) => k !== a.kontinent);
    const adjacent = ADJACENT[a.kontinent];
    // Bara fem att välja bland, så ordningen avgör: närliggande världsdelar
    // först när det är svårt, avlägsna först när det är lätt.
    const near = shuffle(this.rng, others.filter((k) => adjacent.includes(k)));
    const far = shuffle(this.rng, others.filter((k) => !adjacent.includes(k)));
    const ordered = d >= 0.5 ? [...near, ...far] : [...far, ...near];
    const all = shuffle(this.rng, [a.kontinent, ...ordered.slice(0, Math.min(n, 6) - 1)]);
    return {
      kind: 'varldsdel',
      answer: a,
      ask: 'I vilken världsdel ligger',
      subject: { text: `${a.namn}?`, flag: a, small: true },
      after: null,
      optionStyle: 'text',
      options: all.map((text) => ({ text })),
      correctIndex: all.indexOf(a.kontinent),
      reveal: { label: `${a.namn} ligger i`, name: a.kontinent, flag: a },
    };
  }

  siluett(d, n) {
    const a = this.draw('siluett', d, (c) => c.siluett);
    const shape = (c) => c.form.reduce((s, v, i) => s + Math.abs(v - a.form[i]), 0) / a.form.length;
    // Svårt: grannar och länder med liknande form. Lätt: helt olika former långt bort.
    const sorted = this.countries
      .filter((c) => c.siluett && c !== a && c.kand <= maxTier(d))
      .map((c) => [c, shape(c) - (a.grannar.includes(c.id) ? 15 : 0) - (c.kontinent === a.kontinent ? 6 : 0)])
      .sort((x, y) => x[1] - y[1])
      .map(([c]) => c);
    const all = shuffle(this.rng, [a, ...windowPick(this.rng, sorted, d, n - 1)]);
    return {
      kind: 'siluett',
      answer: a,
      ask: null,
      subject: { silhouette: a },
      after: 'Vilket land har formen?',
      optionStyle: 'text',
      options: all.map((c) => ({ text: c.namn })),
      correctIndex: all.indexOf(a),
      reveal: { label: 'Formen var', name: a.namn, silhouette: a },
    };
  }

  grannar(d, n) {
    // INTE-varianten bara när det är svårt, och bara om landet har grannar nog till felsvaren.
    const inte = d >= 0.6 && this.rng() < 0.4;
    // Bara länder med minst en känd granne, så att rätt svar går att kunna.
    const knownNeighbour = (c) => c.grannar.some((id) => this.byId.get(id).kand <= maxTier(d));
    const filter = inte ? (c) => c.grannar.length >= n - 1 : knownNeighbour;
    const a = this.draw('grannar', d, filter);
    const neighbours = a.grannar.map((id) => this.byId.get(id));
    const nonNeighbours = byNearness(
      this.rng,
      a,
      this.countries.filter((c) => c !== a && !a.grannar.includes(c.id) && c.kand <= maxTier(d)),
      this.byId,
    );
    const knownFirst = (list) => [...list].sort((x, y) => x.kand - y.kand || this.rng() - 0.5);

    let correct;
    let wrong;
    if (inte && neighbours.length >= n - 1) {
      wrong = knownFirst(neighbours).slice(0, n - 1);
      correct = windowPick(this.rng, nonNeighbours, Math.max(d, 0.8), 1)[0];
    } else {
      const known = neighbours.filter((c) => c.kand <= maxTier(d));
      correct = pick(this.rng, knownFirst(known.length ? known : neighbours).slice(0, 3));
      wrong = windowPick(this.rng, nonNeighbours, d, n - 1);
    }
    const all = shuffle(this.rng, [correct, ...wrong]);
    const names = knownFirst(neighbours).map((c) => c.namn);
    return {
      kind: inte ? 'grannar-inte' : 'grannar',
      answer: a,
      ask: inte ? 'Vilket land gränsar INTE till' : 'Vilket land gränsar till',
      subject: { text: `${a.namn}?` },
      after: null,
      optionStyle: 'text',
      options: all.map((c) => ({ text: c.namn })),
      correctIndex: all.indexOf(correct),
      reveal: {
        label: `${a.namn} gränsar till`,
        name: names.length > 5 ? `${names.slice(0, 5).join(', ')} m.fl.` : names.join(', '),
        flag: a,
        small: true,
      },
    };
  }

  kust(d, n) {
    const a = this.draw('kust', d, (c) => c.inland);
    // Svårt: kustländer som är grannar till rätt svar.
    const coastal = byNearness(
      this.rng,
      a,
      this.countries.filter((c) => !c.inland && c.kand <= maxTier(d)),
      this.byId,
    );
    const all = shuffle(this.rng, [a, ...windowPick(this.rng, coastal, d, n - 1)]);
    return {
      kind: 'kust',
      answer: a,
      ask: null,
      subject: { text: 'Vilket land saknar kust?', icon: 'kust' },
      after: null,
      optionStyle: 'text',
      options: all.map((c) => ({ text: c.namn })),
      correctIndex: all.indexOf(a),
      reveal: { label: 'Saknar kust', name: a.namn, flag: a },
    };
  }

  udda(d, n) {
    const ok = (c) => !c.tvaVarldsdelar;
    const base = this.draw('udda', d, ok);
    const home = base.kontinent;
    // Gruppen från samma världsdel. Räcker inte kända länder tas mindre kända med.
    // Gruppen från samma världsdel, vald med samma viktning som rätt svar.
    const sameAll = this.countries.filter((c) => ok(c) && c !== base && c.kontinent === home);
    const group = [base];
    while (group.length < n - 1 && group.length - 1 < sameAll.length) {
      group.push(drawByTier(this.rng, sameAll.filter((c) => !group.includes(c)), d, []));
    }
    // Det udda landet: lätt = långt bort och olik flagga, svårt = granndel och lik flagga.
    // Ur ett fönster i den ordningen väljs det med samma viktning som rätt svar.
    const adjacent = ADJACENT[home];
    const likeness = (c) => group.reduce((s, g) => s + flagDistance(g, c), 0) / group.length;
    const sorted = this.countries
      .filter((c) => ok(c) && c.kontinent !== home)
      .map((c) => [c, likeness(c) - (adjacent.includes(c.kontinent) ? 40 : 0)])
      .sort((x, y) => x[1] - y[1])
      .map(([c]) => c);
    const center = Math.round((1 - d) * (sorted.length - 1));
    const window = sorted.slice(Math.max(0, center - 20), center + 21);
    const odd = drawByTier(this.rng, window, d, (this.recent.uddaOdd ??= []));
    const all = shuffle(this.rng, [odd, ...group]);
    return {
      kind: 'udda',
      answer: odd,
      ask: 'Vilken flagga hör inte till',
      subject: { text: `${home}?` },
      after: null,
      optionStyle: 'flag',
      options: all.map((c) => ({ flag: c })),
      correctIndex: all.indexOf(odd),
      reveal: { label: `Udda var ${odd.namn}, som ligger i`, name: odd.kontinent, flag: odd },
    };
  }
}
