// Genererar data/countries.json (det spelet behöver ur lander.json) och
// precache.js (filerna som service workern sparar för offline-läge).
// Kör: npm run build
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const kalla = JSON.parse(read('data/kalla/lander.json'));
const ids = new Set(kalla.lander.map((l) => l.id));
const farger = JSON.parse(read('data/flaggfarger.json'));

// Kändhetsgrupp per land. Varje land ska finnas i exakt en grupp.
const kand = new Map();
for (const [grupp, lander] of Object.entries(JSON.parse(read('data/kandhet.json')).grupper)) {
  for (const id of lander) {
    if (!ids.has(id)) throw new Error(`data/kandhet.json: okänt land "${id}"`);
    if (kand.has(id)) throw new Error(`data/kandhet.json: "${id}" finns i flera grupper`);
    kand.set(id, Number(grupp));
  }
}
const saknas = [...ids].filter((id) => !kand.has(id));
if (saknas.length) throw new Error(`data/kandhet.json saknar: ${saknas.join(', ')}`);

const countries = kalla.lander.map((l) => {
  if (!existsSync(join(root, 'flaggor', `${l.id}.svg`))) {
    throw new Error(`Flagga saknas för ${l.id}`);
  }
  if (!farger[l.id]) throw new Error(`data/flaggfarger.json saknar ${l.id}: kör scripts/flaggfarger.cjs`);
  return {
    id: l.id,
    namn: l.namn.sv,
    fn: l.status === 'FN-medlem',
    kand: kand.get(l.id),
    kontinent: l.kontinent,
    liknar: (l.felsvar.flagga_liknar || []).filter((id) => ids.has(id)),
    farg: farger[l.id],
  };
});

countries.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
writeFileSync(join(root, 'data/countries.json'), JSON.stringify(countries) + '\n');

const files = [
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  'data/countries.json',
  ...readdirSync(join(root, 'icons')).map((f) => `icons/${f}`),
  ...readdirSync(join(root, 'ljud')).map((f) => `ljud/${f}`),
  ...countries.map((c) => `flaggor/${c.id}.svg`),
].sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);

writeFileSync(
  join(root, 'precache.js'),
  '// Genererad av scripts/build.mjs, redigera inte för hand.\n' +
    `self.PRECACHE_VERSION = '${version}';\n` +
    `self.PRECACHE_FILES = ${JSON.stringify(files, null, 0).replace(/","/g, '",\n  "').replace('["', '[\n  "').replace('"]', '"\n]')};\n`,
);

const perGrupp = [1, 2, 3, 4, 5].map((g) => countries.filter((c) => c.kand === g).length).join('/');
console.log(`${countries.length} länder (kändhetsgrupper ${perGrupp}), ${files.length} filer i precache, version ${version}`);
