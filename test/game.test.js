import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, RULES } from '../js/game.js';
import {
  QuestionSource,
  LEVELS,
  levelForAge,
  maxRounds,
  difficultyForRound,
  tierRange,
  flagDistance,
} from '../js/questions.js';
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

test('alla länder har en kändhetsgrupp och ett färgfingeravtryck', () => {
  assert.equal(countries.length, 197);
  for (const c of countries) {
    assert.ok(c.kand >= 1 && c.kand <= 5, c.id);
    assert.equal(c.farg.length, 72, c.id);
  }
});

test('trappan har lika många steg som matchen kan ha rundor', () => {
  assert.equal(maxRounds(2, 3), 5);
  assert.equal(maxRounds(3, 3), 8);
  assert.equal(maxRounds(8, 3), 23);
  assert.equal(difficultyForRound(1, 5), 0);
  assert.equal(difficultyForRound(3, 5), 0.5);
  assert.equal(difficultyForRound(5, 5), 1);
  assert.deepEqual(tierRange(0), [1, 1]);
  assert.deepEqual(tierRange(0.5), [1, 3]);
  assert.deepEqual(tierRange(1), [3, 5]);
});

const ask = (qs, options, difficulty, kind = 'flagga') => qs.next({ options, difficulty, kind });

test('frågor har rätt antal unika alternativ', () => {
  const qs = new QuestionSource(countries, seeded(2));
  for (const { options } of Object.values(LEVELS)) {
    for (const difficulty of [0, 0.25, 0.5, 0.75, 1]) {
      for (let i = 0; i < 100; i++) {
        const q = ask(qs, options, difficulty);
        assert.equal(q.options.length, options);
        assert.equal(new Set(q.options.map((o) => o.id)).size, options);
        assert.equal(q.options[q.correctIndex], q.answer);
      }
    }
  }
});

test('lätt: kända länder och flaggor som inte liknar varandra', () => {
  const qs = new QuestionSource(countries, seeded(3));
  for (let i = 0; i < 300; i++) {
    const q = ask(qs, 6, 0);
    assert.equal(q.answer.kand, 1);
    for (const o of q.options) assert.ok(o.kand <= 2, `${o.id} är för okänt`);
    assert.ok(!q.answer.liknar.some((id) => q.options.some((o) => o.id === id)), 'inga förväxlingsbara');
  }
});

test('svårt: mindre kända länder och flaggor som liknar varandra', () => {
  const qs = new QuestionSource(countries, seeded(4));
  let easy = 0;
  let hard = 0;
  const qsEasy = new QuestionSource(countries, seeded(5));
  for (let i = 0; i < 300; i++) {
    const q = ask(qs, 4, 1);
    assert.ok(q.answer.kand >= 3);
    for (const o of q.options) if (o !== q.answer) hard += flagDistance(q.answer, o);
    const e = ask(qsEasy, 4, 0);
    for (const o of e.options) if (o !== e.answer) easy += flagDistance(e.answer, o);
  }
  assert.ok(hard < easy / 2, `felalternativen liknar rätt svar mer när det är svårt (${hard} mot ${easy})`);
});

test('identiska flaggor visas aldrig i samma fråga', () => {
  const qs = new QuestionSource(countries, seeded(6));
  for (let i = 0; i < 3000; i++) {
    const ids = ask(qs, 6, 1, 'namn').options.map((o) => o.id);
    assert.ok(!(ids.includes('id') && ids.includes('mc')));
    assert.ok(!(ids.includes('td') && ids.includes('ro')));
  }
});

test('samma land kommer inte igen direkt', () => {
  const qs = new QuestionSource(countries, seeded(7));
  const seen = [];
  for (let i = 0; i < 19; i++) seen.push(ask(qs, 3, 0).answer.id);
  assert.equal(new Set(seen).size, seen.length);
});

test('matchen blir svårare för varje runda', () => {
  const { game, advance } = setup(trio, { seed: 8 });
  const levels = [];
  while (game.phase !== 'over') {
    game.startRound();
    levels.push(game.difficulty());
    if (game.current.type === 'fraga') assert.equal(game.current.difficulty, game.difficulty());
    advance(RULES.fuseMaxMs);
    game.nextRound();
  }
  assert.equal(levels[0], 0);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1]);
  game.newMatch();
  game.startRound();
  assert.equal(game.difficulty(), 0, 'revansch börjar om från början');
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
  const { game } = setup(trio, { rules: { frikortChance: 0, fuseMinMs: 2000, fuseMaxMs: 2000, fuseFloorMs: 0 } });
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

test('rundan varar 2–4 minuter', () => {
  for (let seed = 1; seed < 50; seed++) {
    const { game } = setup(trio, { seed });
    game.startRound();
    assert.ok(game.fuseMs >= 120000 && game.fuseMs <= 240000);
  }
});

test('pulsen är lugn de två första varven och ökar sedan mot smällen', () => {
  const { game, advance } = setup(trio, { rules: { frikortChance: 0 } });
  game.startRound();
  // Två hela varv med tre spelare: starten plus fem överlämningar.
  for (let i = 0; i < 5; i++) {
    advance(1000);
    assert.equal(game.progress(), 0, `lugnt efter ${i + 1} överlämningar`);
    answerCorrectly(game);
    game.ready();
  }
  advance(1000);
  answerCorrectly(game); // första överlämningen i tredje varvet
  assert.ok(!game.isCalm());
  assert.equal(game.progress(), 0);
  advance(5000);
  const p1 = game.progress();
  advance(5000);
  const p2 = game.progress();
  assert.ok(p1 > 0 && p2 > p1, 'ökar efter det lugna läget');
  advance(game.remainingMs() - 1);
  assert.ok(game.progress() > 0.99);
});

test('det lugna läget slutar senast halvvägs', () => {
  const { game, advance } = setup(trio, { rules: { frikortChance: 0 } });
  game.startRound();
  advance(game.fuseMs * 0.5 - 10);
  assert.ok(game.isCalm());
  advance(20);
  assert.ok(!game.isCalm());
  advance(game.fuseMs * 0.25);
  assert.ok(Math.abs(game.progress() - 0.5) < 0.01);
});

test('fel svar får tempot att hoppa framåt', () => {
  const { game, advance } = setup(trio, { rules: { frikortChance: 0 } });
  game.startRound();
  advance(game.fuseMs * 0.6);
  const before = game.progress();
  const q = game.current;
  game.answer((q.correctIndex + 1) % q.options.length);
  assert.ok(game.progress() > before);
});

test('paus påverkar inte tempot', () => {
  const { game, advance } = setup(trio);
  game.startRound();
  advance(game.fuseMs * 0.7);
  const before = game.progress();
  game.pause();
  advance(60000);
  game.resume();
  assert.ok(Math.abs(game.progress() - before) < 1e-9);
});
