// Räknar ut fingeravtryck som används för att avgöra hur lika två bilder ser ut:
// - flaggor: medelfärgen i ett rutnät på 6 × 4 rutor → data/flaggfarger.json
// - siluetter: hur stor del av varje ruta i ett rutnät på 8 × 8 som är land
//   (0–100) → data/siluettform.json
// Kräver Playwright och en lokal server: npm start, sedan
//   node scripts/fingeravtryck.cjs http://localhost:8000
// Kör npm run build efteråt.
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const base = process.argv[2] || 'http://localhost:8000';
const COLS = 6;
const ROWS = 4;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(
    async ({ COLS, ROWS }) => {
      const countries = await (await fetch('data/countries.json')).json();
      const W = 120;
      const H = 90;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      const out = {};
      for (const { id } of countries) {
        const img = new Image();
        img.src = `flaggor/${id}.svg`;
        await img.decode();
        c.fillStyle = '#fff';
        c.fillRect(0, 0, W, H);
        c.drawImage(img, 0, 0, W, H);
        const px = c.getImageData(0, 0, W, H).data;
        const cells = [];
        for (let r = 0; r < ROWS; r++) {
          for (let k = 0; k < COLS; k++) {
            const sum = [0, 0, 0];
            let n = 0;
            for (let y = Math.floor((r * H) / ROWS); y < Math.floor(((r + 1) * H) / ROWS); y++) {
              for (let x = Math.floor((k * W) / COLS); x < Math.floor(((k + 1) * W) / COLS); x++) {
                const i = (y * W + x) * 4;
                sum[0] += px[i];
                sum[1] += px[i + 1];
                sum[2] += px[i + 2];
                n++;
              }
            }
            cells.push(...sum.map((s) => Math.round(s / n)));
          }
        }
        out[id] = cells;
      }
      return out;
    },
    { COLS, ROWS },
  );
  const shapes = await page.evaluate(async () => {
    const countries = await (await fetch('data/countries.json')).json();
    const N = 8;
    const S = 96;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    const out = {};
    for (const { id } of countries) {
      const img = new Image();
      img.src = `siluetter/${id}.svg`;
      await img.decode();
      c.clearRect(0, 0, S, S);
      c.drawImage(img, 0, 0, S, S);
      const px = c.getImageData(0, 0, S, S).data;
      const cell = S / N;
      const cells = [];
      for (let r = 0; r < N; r++) {
        for (let k = 0; k < N; k++) {
          let on = 0;
          for (let y = r * cell; y < (r + 1) * cell; y++) {
            for (let x = k * cell; x < (k + 1) * cell; x++) if (px[(y * S + x) * 4 + 3] > 127) on++;
          }
          cells.push(Math.round((100 * on) / (cell * cell)));
        }
      }
      out[id] = cells;
    }
    return out;
  });
  await browser.close();
  const write = (file, data) => {
    const lines = Object.entries(data).map(([id, v]) => `  "${id}": [${v.join(',')}]`);
    writeFileSync(join(__dirname, '..', 'data', file), `{\n${lines.join(',\n')}\n}\n`);
    return lines.length;
  };
  console.log(`${write('flaggfarger.json', result)} flaggor, ${write('siluettform.json', shapes)} siluetter`);
})();
