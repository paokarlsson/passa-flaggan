// Räknar ut ett färgfingeravtryck per flagga: medelfärgen i ett rutnät på
// 6 × 4 rutor. Används för att avgöra hur lika två flaggor ser ut.
// Kräver Playwright och en lokal server: npm start, sedan
//   node scripts/flaggfarger.cjs http://localhost:8000
// Resultatet hamnar i data/flaggfarger.json. Kör npm run build efteråt.
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
  await browser.close();
  const lines = Object.entries(result).map(([id, v]) => `  "${id}": [${v.join(',')}]`);
  writeFileSync(join(__dirname, '..', 'data', 'flaggfarger.json'), `{\n${lines.join(',\n')}\n}\n`);
  console.log(`${lines.length} flaggor`);
})();
