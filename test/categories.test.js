import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, CONTINENTS, Quiz, formatArea, formatPeople } from '../js/categories.js';
import { Game, RULES } from '../js/game.js';

const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url)));
const byName = new Map(countries.map((c) => [c.namn, c]));

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTIES = [0, 0.25, 0.5, 0.75, 1];
const OPTIONS = [3, 4, 6];

// Kör många frågor per kategori, svårighet och antal alternativ.
function* questions(category, rounds = 40) {
  const quiz = new Quiz(countries, seeded(category.length * 7));
  for (const difficulty of DIFFICULTIES) {
    for (const options of OPTIONS) {
      for (let i = 0; i < rounds; i++) yield quiz.next({ category, options, difficulty });
    }
  }
}

const key = (o) => o.text ?? o.flag.id;

test('alla kategorier ger giltiga frågor', () => {
  for (const category of Object.keys(CATEGORIES)) {
    for (const q of questions(category, 15)) {
      const expected = category === 'varldsdel' ? Math.min(q.options.length, 6) : q.options.length;
      assert.ok(q.options.length >= 3 && q.options.length <= 6, `${category}: ${q.options.length} alternativ`);
      assert.equal(new Set(q.options.map(key)).size, expected, `${category}: dubbletter i ${q.options.map(key)}`);
      assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length, category);
      assert.ok(q.reveal?.name, `${category}: facit saknas`);
      assert.ok(q.subject.text || q.subject.flag || q.subject.silhouette, category);
    }
  }
});

test('antalet alternativ följer nivån', () => {
  for (const category of Object.keys(CATEGORIES)) {
    const quiz = new Quiz(countries, seeded(1));
    for (const options of OPTIONS) {
      const q = quiz.next({ category, options, difficulty: 0.5 });
      assert.equal(q.options.length, options, `${category} med ${options}`);
    }
  }
});

test('huvudstad: rätt svar är huvudstaden och felsvaren är inte huvudstäder i landet', () => {
  for (const q of questions('huvudstad')) {
    const a = q.answer;
    assert.ok(!['il', 'ps', 'va', 'mc', 'sg'].includes(a.id), `${a.id} ska inte ha huvudstadsfrågor`);
    const correct = q.options[q.correctIndex].text;
    if (q.kind === 'stad') {
      assert.equal(correct, a.huvudstad);
      for (const o of q.options) if (o.text !== correct) assert.ok(!a.ovrigaHuvudstader.includes(o.text));
    } else {
      assert.equal(correct, a.namn);
      assert.equal(q.subject.text, a.huvudstad);
    }
  }
});

test('störst och flest invånare: rätt svar är störst, och skillnaden krymper med svårigheten', () => {
  for (const [category, value] of [
    ['storst', (c) => c.yta],
    ['folk', (c) => c.folk],
  ]) {
    const ratios = { 0: [], 1: [] };
    for (const q of questions(category)) {
      const values = q.options.map((o) => value(byName.get(o.text)));
      const best = values[q.correctIndex];
      assert.equal(best, Math.max(...values), category);
      const second = Math.max(...values.filter((v, i) => i !== q.correctIndex));
      if (q.difficulty in ratios) ratios[q.difficulty].push(best / second);
    }
    const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    assert.ok(median(ratios[0]) > 3, `${category}: lätt ska ha stor skillnad (${median(ratios[0])})`);
    assert.ok(median(ratios[1]) < 1.6, `${category}: svårt ska ha liten skillnad (${median(ratios[1])})`);
  }
});

test('världsdel: rätt världsdel och inga länder i två världsdelar', () => {
  for (const q of questions('varldsdel')) {
    assert.ok(!q.answer.tvaVarldsdelar);
    assert.equal(q.options[q.correctIndex].text, q.answer.kontinent);
    for (const o of q.options) assert.ok(CONTINENTS.includes(o.text));
  }
});

test('siluett: bara länder vars form går att se', () => {
  for (const q of questions('siluett')) {
    assert.ok(q.answer.siluett);
    assert.equal(q.options[q.correctIndex].text, q.answer.namn);
  }
});

test('grannar: rätt svar gränsar (eller gränsar inte) till landet', () => {
  let inte = 0;
  for (const q of questions('grannar')) {
    const a = q.answer;
    q.options.forEach((o, i) => {
      const neighbour = a.grannar.includes(byName.get(o.text).id);
      const shouldBe = q.kind === 'grannar' ? i === q.correctIndex : i !== q.correctIndex;
      assert.equal(neighbour, shouldBe, `${a.namn}: ${o.text}`);
    });
    if (q.kind === 'grannar-inte') {
      inte++;
      assert.ok(q.difficulty >= 0.6, 'INTE-varianten bara när det är svårt');
    }
  }
  assert.ok(inte > 0, 'INTE-varianten förekommer');
});

test('kust: rätt svar saknar kust, felsvaren har kust', () => {
  for (const q of questions('kust')) {
    q.options.forEach((o, i) => assert.equal(byName.get(o.text).inland, i === q.correctIndex, o.text));
  }
});

test('udda ut: alla utom en från samma världsdel', () => {
  for (const q of questions('udda')) {
    const odd = q.options[q.correctIndex].flag;
    const rest = q.options.filter((_, i) => i !== q.correctIndex).map((o) => o.flag);
    assert.equal(new Set(rest.map((c) => c.kontinent)).size, 1);
    assert.notEqual(odd.kontinent, rest[0].kontinent);
    assert.equal(q.subject.text, `${rest[0].kontinent}?`);
  }
});

test('siffror skrivs på svenska', () => {
  assert.equal(formatArea(8515767), '8,5 milj km²');
  assert.equal(formatArea(450295), '450 295 km²');
  assert.equal(formatPeople(1463865525), '1,46 miljarder');
  assert.equal(formatPeople(10596620), '10,6 miljoner');
});

// ---------- Spelets regler kring kategorier och tid ----------

function setup(players, opts = {}) {
  let time = 0;
  const game = new Game({
    players,
    countries,
    rng: seeded(opts.seed ?? 1),
    clock: () => time,
    categories: opts.categories,
    rules: { ...RULES, ...opts.rules },
  });
  return { game, advance: (ms) => ((time += ms), game.tick()) };
}

const trio = [
  { alias: 'Ada', level: 'barn' },
  { alias: 'Bo', level: 'normal' },
  { alias: 'Cy', level: 'nord' },
];

test('frågorna hämtas ur rundans kategorier', () => {
  const { game } = setup(trio, { categories: ['huvudstad', 'kust'], rules: { frikortChance: 0 } });
  game.startRound();
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    seen.add(game.current.category);
    game.answer(game.current.correctIndex);
    game.ready();
  }
  assert.deepEqual([...seen].sort(), ['huvudstad', 'kust']);
});

test('den som sprängs väljer kategorier för nästa runda', () => {
  const { game, advance } = setup(trio, { categories: ['flaggor', 'storst', 'siluett'] });
  game.startRound();
  const loser = game.holder;
  advance(RULES.fuseMaxMs);
  assert.equal(game.chooser, loser);
  game.nextRound(['siluett', 'okänd', 'storst', 'flaggor']);
  assert.deepEqual(game.roundCategories, ['siluett', 'storst'], 'högst två, bara matchens kategorier');
  assert.equal(game.holder, loser, 'den som valde startar');
  game.startRound();
  assert.ok(['siluett', 'storst'].includes(game.current.category ?? 'siluett'));
});

test('utan val behåller nästa runda förra rundans kategorier', () => {
  const { game, advance } = setup(trio, { categories: ['flaggor', 'kust'] });
  game.startRound();
  advance(RULES.fuseMaxMs);
  game.nextRound(['kust']);
  game.startRound();
  advance(RULES.fuseMaxMs);
  game.nextRound();
  assert.deepEqual(game.roundCategories, ['kust']);
});

test('är den som sprängs ute väljer den som startar nästa runda', () => {
  const { game, advance } = setup(trio, { seed: 4 });
  for (;;) {
    game.startRound();
    const loser = game.holder;
    advance(RULES.fuseMaxMs);
    if (game.winner !== null) break;
    if (game.player(loser).lives === 0) {
      assert.notEqual(game.chooser, loser);
      assert.ok(game.player(game.chooser).lives > 0);
      return;
    }
    game.nextRound();
  }
});

test('rundorna blir kortare, men aldrig under golvet', () => {
  const { game } = setup(trio);
  const at = (round) => Array.from({ length: 200 }, () => game.fuseFor(round));
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.min(...at(1)) >= RULES.fuseMinMs && Math.max(...at(1)) <= RULES.fuseMaxMs);
  assert.ok(avg(at(2)) < avg(at(1)) * 0.9);
  assert.ok(avg(at(5)) < avg(at(1)) * 0.6);
  assert.ok(Math.min(...at(30)) >= RULES.fuseFloorMs);
});

test('med många spelare är det lugna läget bara ett varv', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ alias: `S${i}`, level: 'normal' }));
  assert.equal(setup(many).game.calmLaps(), 1);
  assert.equal(setup(trio).game.calmLaps(), 2);
});

test('världsdel: närliggande världsdelar som felsvar när det är svårt', () => {
  const quiz = new Quiz(countries, seeded(9));
  const share = (d) => {
    let near = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const q = quiz.next({ category: 'varldsdel', options: 3, difficulty: d });
      const adjacent = { Afrika: ['Europa', 'Asien'], Asien: ['Europa', 'Oceanien', 'Afrika'], Europa: ['Asien', 'Afrika'], Nordamerika: ['Sydamerika', 'Europa'], Sydamerika: ['Nordamerika', 'Afrika'], Oceanien: ['Asien'] }[q.answer.kontinent];
      for (const o of q.options) if (o.text !== q.answer.kontinent) (total++, adjacent.includes(o.text) && near++);
    }
    return near / total;
  };
  assert.ok(share(1) > 0.8, 'svårt: nästan bara närliggande');
  assert.ok(share(0) < 0.2, 'lätt: nästan bara avlägsna');
});

test('kategorierna kan väljas på skärmen före rundan, men inte mitt i den', () => {
  const { game, advance } = setup(trio, { categories: ['flaggor', 'kust', 'udda'] });
  game.startRound();
  game.chooseCategories(['kust']);
  assert.deepEqual(game.roundCategories, ['flaggor', 'kust', 'udda'], 'ignoreras under rundan');
  advance(RULES.fuseMaxMs);
  game.nextRound();
  game.chooseCategories(['udda', 'kust']);
  assert.deepEqual(game.roundCategories, ['udda', 'kust']);
});
