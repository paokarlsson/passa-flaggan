import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseBpm, Fintes, TEMPO } from '../js/tempo.js';

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('grundtempot går jämnt från 60 till 180 slag per minut', () => {
  assert.equal(baseBpm(0), 60);
  assert.equal(baseBpm(1), 180);
  assert.equal(baseBpm(-1), 60);
  assert.equal(baseBpm(2), 180);
  let prev = baseBpm(0);
  for (let i = 1; i <= 1000; i++) {
    const bpm = baseBpm(i / 1000);
    assert.ok(bpm > prev, 'ökar hela tiden');
    assert.ok(bpm - prev < 0.5, 'utan ryck');
    prev = bpm;
  }
});

test('finter sänker tempot en stund och släpper sedan', () => {
  const f = new Fintes(seeded(1));
  const roundS = 60;
  let fintes = 0;
  let inFinte = false;
  let prev = 1;
  for (let t = 0; t <= roundS; t += 0.01) {
    const factor = f.factor(t, t / roundS);
    assert.ok(factor >= 1 - TEMPO.finteDepth - 1e-9 && factor <= 1);
    assert.ok(Math.abs(factor - prev) < 0.02, `mjuk övergång vid ${t.toFixed(2)} s`);
    if (factor < 1 && !inFinte) fintes++;
    inFinte = factor < 1;
    prev = factor;
  }
  assert.ok(fintes >= 2 && fintes <= 8, `${fintes} finter på en minut`);
});

test('inga finter i början och slutet av rundan', () => {
  const f = new Fintes(seeded(2));
  for (let t = 0; t <= 200; t += 0.05) {
    assert.equal(f.factor(t, 0.05), 1);
  }
  const g = new Fintes(seeded(3));
  for (let t = 0; t <= 200; t += 0.05) {
    assert.equal(g.factor(t, 0.95), 1);
  }
});
