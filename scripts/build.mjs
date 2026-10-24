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
const barn = new Set(JSON.parse(read('data/barn.json')).lander);
const ids = new Set(kalla.lander.map((l) => l.id));

for (const id of barn) {
  if (!ids.has(id)) throw new Error(`data/barn.json: okänt land "${id}"`);
}

const countries = kalla.lander.map((l) => {
  if (!existsSync(join(root, 'flaggor', `${l.id}.svg`))) {
    throw new Error(`Flagga saknas för ${l.id}`);
  }
  return {
    id: l.id,
    namn: l.namn.sv,
    fn: l.status === 'FN-medlem',
    barn: barn.has(l.id),
    kontinent: l.kontinent,
    liknar: (l.felsvar.flagga_liknar || []).filter((id) => ids.has(id)),
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

console.log(`${countries.length} länder (${barn.size} på Barn-nivå), ${files.length} filer i precache, version ${version}`);
