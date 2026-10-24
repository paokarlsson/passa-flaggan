import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, RULES } from '../js/game.js';
import { QuestionSource, LEVELS, levelForAge } from '../js/questions.js';
import { TurnOrder } from '../js/order.js';

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

function setup(players, { seed = 1, rules = {} } = {}) {
  let time = 0;
  const clock = () => time;
  const game = new Game({
    players,
    countries,
    rng: seeded(seed),
    clock,
    rules: { ...RULES, ...rules },
  });
  return { game, advance: (ms) => { time += ms; game.tick(); } };
}

const trio = [
  { alias: 'Ada', level: 'barn' },
  { alias: 'Bo', level: 'normal' },
  { alias: 'Cy', level: 'nord' },
];

function answerCorrectly(game) {
  if (game.current.type === 'frikort') return game.useFrikort();
  return game.answer(game.current.correctIndex);
}

test('ålder ger förvald nivå', () => {
  assert.equal(levelForAge(6), 'barn');
  assert.equal(levelForAge(9), 'normal');
  assert.equal(levelForAge(14), 'normal');
  assert.equal(levelForAge(15), 'nord');
  assert.equal(levelForAge(NaN), 'normal');
});

test('datan har rätt storlek per nivå', () => {
  assert.equal(countries.length, 197);
  assert.equal(countries.filter((c) => c.fn).length, 193);
  assert.equal(countries.filter((c) => c.barn).length, 40);
});

test('frågor har rätt antal unika alternativ och hämtas ur rätt pool', () => {
  const qs = new QuestionSource(countries, seeded(2));
  for (const level of Object.keys(LEVELS)) {
    for (let i = 0; i < 300; i++) {
      const q = qs.next(level, 'flagga');
      assert.equal(q.options.length, LEVELS[level].options);
      assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length);
      assert.equal(q.options[q.correctIndex], q.answer);
      for (const o of q.options) {
        if (level === 'barn') assert.ok(o.barn, `${o.id} är inte en barnflagga`);
        if (level === 'normal') assert.ok(o.fn, `${o.id} är inte FN-medlem`);
      }
    }
  }
});

test('identiska flaggor visas aldrig i samma fråga', () => {
  const qs = new QuestionSource(countries, seeded(3));
  for (let i = 0; i < 3000; i++) {
    const ids = qs.next('nord', 'namn').options.map((o) => o.id);
    assert.ok(!(ids.includes('id') && ids.includes('mc')));
    assert.ok(!(ids.includes('td') && ids.includes('ro')));
  }
});

test('samma land kommer inte igen förrän leken är slut', () => {
  const qs = new QuestionSource(countries, seeded(4));
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(qs.next('barn', 'flagga').answer.id);
  assert.equal(seen.size, 40);
});

test('turordning: alla får en tur per varv, aldrig samma två gånger i rad', () => {
  const order = new TurnOrder(seeded(5));
  const alive = [0, 1, 2, 3, 4];
  let current = 2;
  order.reset(alive, current);
  const turns = [current];
  for (let i = 0; i < 4; i++) turns.push((current = order.next(alive, current)));
  assert.deepEqual([...turns].sort(), alive, 'första varvet');
  for (let i = 0; i < 200; i++) {
    const next = order.next(alive, current);
    assert.notEqual(next, current);
    current = next;
  }
});

test('turordning med två spelare växlar', () => {
  const order = new TurnOrder(seeded(6));
  let current = 0;
  order.reset([0, 1], current);
  for (let i = 0; i < 10; i++) {
    const next = order.next([0, 1], current);
    assert.equal(next, 1 - current);
    current = next;
  }
});

test('frågetyperna växlar mellan flagga och namn', () => {
  const { game } = setup(trio, { rules: { frikortChance: 0 } });
  game.startRound();
  const kinds = [];
  for (let i = 0; i < 6; i++) {
    kinds.push(game.current.kind);
    answerCorrectly(game);
    game.ready();
  }
  assert.deepEqual(kinds, ['flagga', 'namn', 'flagga', 'namn', 'flagga', 'namn']);
});

test('frågan följer nivån för den som håller mobilen', () => {
  const { game } = setup(trio, { rules: { frikortChance: 0 } });
  game.startRound();
  for (let i = 0; i < 20; i++) {
    assert.equal(game.current.level, game.player().level);
    assert.equal(game.current.options.length, LEVELS[game.player().level].options);
    answerCorrectly(game);
    game.ready();
  }
});

test('rätt svar skickar vidare, fel svar ger straff, spärr och ny fråga', () => {
  const { game, advance } = setup(trio, { rules: { frikortChance: 0 } });
  game.startRound();
  const first = game.holder;
  const before = game.remainingMs();
  const q = game.current;
  assert.equal(game.answer((q.correctIndex + 1) % q.options.length), 'wrong');
  assert.equal(game.remainingMs(), before - RULES.wrongPenaltyMs);
  assert.equal(game.answer(q.correctIndex), null, 'spärrad efter fel svar');
  assert.equal(game.current, q, 'samma fråga under spärren');
  advance(RULES.lockMs);
  assert.notEqual(game.current, q, 'ny fråga efter spärren');
  assert.equal(game.holder, first);
  assert.equal(answerCorrectly(game), 'correct');
  assert.equal(game.phase, 'handover');
  assert.notEqual(game.holder, first);
});

test('bomben smäller hos den som håller mobilen', () => {
  const { game, advance } = setup(trio);
  game.startRound();
  const holder = game.holder;
  advance(RULES.fuseMaxMs);
  assert.equal(game.phase, 'exploded');
  assert.equal(game.explosion.loser, holder);
  assert.equal(game.player(holder).lives, RULES.lives - 1);
  game.nextRound();
  assert.equal(game.phase, 'intro');
  assert.equal(game.holder, holder, 'förloraren startar nästa runda');
});

test('smäller det under överlämningen förlorar mottagaren', () => {
  const { game, advance } = setup(trio);
  game.startRound();
  answerCorrectly(game);
  const receiver = game.holder;
  advance(RULES.fuseMaxMs);
  assert.equal(game.explosion.loser, receiver);
  assert.ok(game.explosion.duringHandover);
});

test('fel svar kan spräcka bomben direkt', () => {
  const { game } = setup(trio, { rules: { frikortChance: 0, fuseMinMs: 2000, fuseMaxMs: 2000 } });
  game.startRound();
  const q = game.current;
  assert.equal(game.answer((q.correctIndex + 1) % q.options.length), 'wrong');
  assert.equal(game.phase, 'exploded');
  assert.equal(game.explosion.question, q);
});

test('frikort dyker upp ibland och skickar vidare utan svar', () => {
  const { game } = setup(trio, { seed: 7 });
  game.startRound();
  let cards = 0;
  for (let i = 0; i < 500; i++) {
    if (game.current.type === 'frikort') {
      cards++;
      const holder = game.holder;
      assert.equal(game.answer(0), null);
      assert.ok(game.useFrikort());
      assert.notEqual(game.holder, holder);
    } else {
      game.answer(game.current.correctIndex);
    }
    game.ready();
  }
  assert.ok(cards > 20 && cards < 100, `${cards} frikort på 500 frågor`);
});

test('paus stoppar timern', () => {
  const { game, advance } = setup(trio);
  game.startRound();
  const left = game.remainingMs();
  game.pause();
  advance(RULES.fuseMaxMs * 2);
  assert.equal(game.phase, 'question');
  game.resume();
  assert.equal(game.remainingMs(), left);
});

test('hel match: sist kvar vinner och revansch nollställer', () => {
  const { game, advance } = setup(trio, { seed: 8 });
  let rounds = 0;
  while (game.phase !== 'over') {
    game.startRound();
    for (let i = 0; i < 3; i++) {
      answerCorrectly(game);
      game.ready();
    }
    advance(RULES.fuseMaxMs);
    assert.equal(game.phase, 'exploded');
    game.nextRound();
    // Två spelare ska ut (6 liv) och vinnaren kan ha tappat 2: 6–8 rundor.
    assert.ok(++rounds <= 8, 'matchen tar högst 8 rundor med 3 spelare');
  }
  assert.ok(rounds >= 6);
  assert.equal(game.alive().length, 1);
  assert.equal(game.winner, game.alive()[0].id);
  game.newMatch();
  assert.equal(game.phase, 'intro');
  assert.ok(game.players.every((p) => p.lives === RULES.lives));
});

test('utslagna spelare får aldrig mobilen', () => {
  const { game, advance } = setup(trio, { seed: 9 });
  while (game.phase !== 'over') {
    game.startRound();
    for (let i = 0; i < 10; i++) {
      assert.ok(game.player().lives > 0);
      answerCorrectly(game);
      assert.ok(game.player().lives > 0);
      game.ready();
    }
    advance(RULES.fuseMaxMs);
    game.nextRound();
  }
});
