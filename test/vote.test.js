import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoteGame, optionsFor } from '../js/vote.js';
import { CATEGORIES } from '../js/categories.js';
import { LEVELS } from '../js/questions.js';

const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url)));

// Deterministisk slump (mulberry32) så att testerna går att upprepa.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const trio = [
  { alias: 'Ada', level: 'barn' },
  { alias: 'Bo', level: 'normal' },
  { alias: 'Cy', level: 'nord' },
];

const setup = (opts = {}) =>
  new VoteGame({ players: trio, countries, rng: seeded(opts.seed ?? 1), questions: 3, ...opts });

// Alla svarar: rätt eller fel enligt `right`, med insatsen `bet`.
function everyoneVotes(v, right, bet = 2) {
  while (v.phase === 'handover') {
    const id = v.voter().id;
    v.show();
    const view = v.view();
    const choice = right(id) ? v.question.correctIndex : view.find((i) => i !== v.question.correctIndex);
    assert.ok(v.vote(choice, bet));
  }
}

test('alla svarar i tur och ordning innan svaren visas', () => {
  const v = setup();
  assert.equal(v.phase, 'handover');
  const seen = [];
  while (v.phase === 'handover') {
    seen.push(v.voter().id);
    assert.equal(v.vote(v.question.correctIndex, 1), false, 'svarar inte innan frågan visas');
    v.show();
    assert.equal(v.phase, 'answer');
    v.vote(v.question.correctIndex, 1);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.equal(v.phase, 'ready');
  assert.equal(v.results, null, 'inget visas förrän mobilen ligger i mitten');
  v.reveal();
  assert.equal(v.phase, 'reveal');
});

test('rätt ger insatsen, fel drar av den', () => {
  const v = setup();
  everyoneVotes(v, (id) => id !== 1, 3);
  v.reveal();
  assert.deepEqual(v.players.map((p) => p.score), [3, -3, 3]);
  assert.deepEqual(v.results.map((r) => r.points), [3, -3, 3]);
});

test('insatsen måste vara 1–3 och svaret ett av spelarens alternativ', () => {
  const v = setup();
  v.show();
  const right = v.question.correctIndex;
  assert.equal(v.vote(right, 0), false);
  assert.equal(v.vote(right, 4), false);
  assert.equal(v.vote(right, 1.5), false);
  const hidden = v.question.options.map((_, i) => i).find((i) => !v.view().includes(i));
  if (hidden !== undefined) assert.equal(v.vote(hidden, 1), false);
  assert.equal(v.answered(), 0);
  assert.ok(v.vote(right, 1));
});

test('varje nivå ser rätt svar och sitt antal alternativ', () => {
  const v = setup({ categories: Object.keys(CATEGORIES), questions: 30 });
  for (let i = 0; i < 30; i++) {
    const q = v.question;
    trio.forEach((p, id) => {
      const view = v.view(id);
      assert.ok(view.includes(q.correctIndex));
      assert.equal(view.length, Math.min(LEVELS[p.level].options, q.options.length));
    });
    everyoneVotes(v, () => true, 1);
    v.reveal();
    v.next();
  }
  assert.equal(v.phase, 'over');
});

test('den som börjar svara byts varje fråga', () => {
  const v = setup({ questions: 3 });
  const firsts = [];
  for (let i = 0; i < 3; i++) {
    firsts.push(v.voter().id);
    everyoneVotes(v, () => true);
    v.reveal();
    v.next();
  }
  assert.equal(new Set(firsts).size, 3);
});

test('matchen slutar efter valt antal frågor, och lika poäng delar segern', () => {
  const v = setup({ questions: 2 });
  for (let i = 0; i < 2; i++) {
    everyoneVotes(v, (id) => id !== 2);
    v.reveal();
    v.next();
  }
  assert.equal(v.phase, 'over');
  assert.deepEqual(v.winners().map((p) => p.alias), ['Ada', 'Bo']);
  assert.deepEqual(v.standings().map((p) => p.alias), ['Ada', 'Bo', 'Cy']);
  v.newMatch();
  assert.equal(v.number, 1);
  assert.deepEqual(v.players.map((p) => p.score), [0, 0, 0]);
});

test('frågorna blir svårare mot slutet', () => {
  const v = setup({ questions: 10, players: trio.map((p) => ({ ...p, level: 'normal' })) });
  assert.equal(v.difficulty(), 0);
  for (let i = 0; i < 9; i++) {
    everyoneVotes(v, () => true);
    v.reveal();
    v.next();
  }
  assert.equal(v.difficulty(), 1);
});

test('optionsFor behåller frågans ordning', () => {
  const q = { options: [{}, {}, {}, {}, {}, {}], correctIndex: 4 };
  const view = optionsFor(seeded(3), q, 3);
  assert.equal(view.length, 3);
  assert.ok(view.includes(4));
  assert.deepEqual(view, [...view].sort((a, b) => a - b));
});

test('matchen går att spara och fortsätta, men ingen ser ett halvfärdigt svar', () => {
  const v = setup();
  v.show();
  v.vote(v.question.correctIndex, 2);
  v.show();
  const snap = JSON.parse(JSON.stringify(v.snapshot()));
  assert.ok(JSON.stringify(snap).length < 5000, 'länderna sparas utan fingeravtryck');
  const back = VoteGame.restore(snap, { countries, rng: seeded(2) });
  assert.equal(back.phase, 'handover');
  assert.equal(back.voter().id, v.voter().id);
  assert.equal(back.answered(), 1);
  everyoneVotes(back, () => true, 2);
  back.reveal();
  assert.equal(back.results.find((r) => r.id === v.order[0]).points, 2);

  assert.equal(VoteGame.restore({ ...snap, v: 99 }, { countries }), null);
  assert.equal(VoteGame.restore(null, { countries }), null);
  assert.equal(VoteGame.restore({ ...snap, phase: 'konstig' }, { countries }), null);
});
