// Browser smoke test against the Vite dev/preview server.
//   npm run dev   (or: npm run build && npm run preview -- --port 5173)
//   npm run smoke -- [baseUrl] [screenshotDir]
// Serves synthetic data via request interception, so it runs with an empty public/data.
// Set CHROMIUM_PATH to use a system Chromium instead of Playwright's download.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { syntheticBike, syntheticIndex } from './syntheticBike';

const base = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3] ?? 'e2e/screenshots';
mkdirSync(shots, { recursive: true });

const waitForPartNo = (page: import('playwright').Page, partNo: string) =>
  page
    .waitForFunction((pn) => document.querySelector('.detail-panel .part-no code')?.textContent === pn, partNo, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('**/data/index.json', (r) => r.fulfill({ json: syntheticIndex() }));
  await page.route('**/data/bikes/test-bike-2022.json', (r) => r.fulfill({ json: syntheticBike() }));

  await page.goto(base);
  await page.fill('.search-input', 'tx7');
  await page.waitForSelector('a.bike-card');
  assert((await page.locator('a.bike-card').count()) === 1, 'search finds the bike');
  await page.screenshot({ path: `${shots}/1-search.png` });

  await page.click('a.bike-card');
  await page.waitForSelector('.viewport canvas');
  await page.waitForTimeout(1500);
  assert(await page.locator('.cat-label').count() > 5, 'category labels render');
  await page.screenshot({ path: `${shots}/2-viewer.png` });

  // Click a part in the 3D view. Selecting from the tree flies the camera so the
  // part is centred; deselect, then click the centre of the canvas.
  await page.click('details.cat >> nth=0 >> summary');
  await page.click('details.cat[open] details.asm >> nth=0 >> summary');
  await page.click('details.asm[open] .part-row >> nth=0');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.detail-panel', { state: 'hidden' });
  await page.waitForTimeout(300);
  const box = (await page.locator('.viewport canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.up();
  const picked = await page
    .waitForSelector('.detail-panel:not([hidden])', { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  assert(picked, 'clicking a mesh opens the detail panel');
  assert(/^#\/bike\/test-bike-2022\/[^/]+\/\d+$/.test(new URL(page.url()).hash), 'selection is reflected in the URL');
  const partNo = await page.textContent('.detail-panel .part-no code');
  assert(partNo?.startsWith('TST-'), `detail shows part number (${partNo})`);
  assert(await page.locator('.detail-panel a.btn.primary[href^="https://example.test/buy/"]').count() === 1, 'detail has a Buy link');
  assert(await page.locator('.part-row.selected').count() === 1, 'tree highlights the selected part');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/3-selected.png` });

  // Tree filter → select via tree.
  await page.fill('.tree-filter', 'TST-00042');
  await page.click('.flat-list .part-row');
  assert(await waitForPartNo(page, 'TST-00042-00'), 'tree filter + select works');

  // Explode slider.
  await page.locator('.explode input').fill('0');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/4-assembled.png` });
  await page.locator('.explode input').fill('1');

  // Isolate assembly from the detail panel.
  await page.click('.detail-panel button:has-text("Isolate assembly")');
  assert(await page.locator('button:has-text("Show all"):visible').count() === 1, 'isolate shows the "Show all" button');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/5-isolated.png` });

  // Deep link reload restores the selection.
  await page.reload();
  assert(await waitForPartNo(page, 'TST-00042-00'), 'deep link restores selection');

  // Mobile layout.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/6-mobile.png` });

  assert(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}
