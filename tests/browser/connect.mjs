/**
 * Browser test for connecting two blocks on the canvas.
 *
 *   npm run build
 *   npm run test:ui
 *
 * Not part of `npm test`. It needs a real browser, because the bug it guards
 * against only exists in one: the block captured the pointer on pointerdown,
 * and a captured pointer retargets the click to the capture container, so the
 * click handler on the port never ran. jsdom does not implement pointer
 * capture, so it cannot see this.
 *
 * Set CHROME to a Chromium binary if the default path is wrong.
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyModel, createBlock } from '../../src/flo/model.ts';
import { toJsonFlow } from '../../src/flo/json.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8099;

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  const detail = ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail}`);
};

// A flow beginning (no IN port) and two Delay blocks, unconnected.
const dir = mkdtempSync(join(tmpdir(), 'flo-ui-'));
const model = emptyModel();
createBlock(model, 1046, 0, 6);
createBlock(model, 1046, 0, 12);
const flowJson = join(dir, 'two.json');
writeFileSync(flowJson, JSON.stringify(toJsonFlow(model)));

const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: join(ROOT, 'dist'),
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => {
  console.log('PAGE ERROR:', e.message);
  fails++;
});

const edges = () => page.locator('svg.edges path:not([stroke-dasharray])').count();
const blk = (n) =>
  page.locator('.block', { has: page.locator('.badge', { hasText: new RegExp(`^${n}$`) }) });

async function reload() {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.setInputFiles('input[type=file][accept*=json]', flowJson);
  await page.waitForTimeout(300);
}

async function dragTo(src, dst) {
  const a = await src.boundingBox();
  const b = await dst.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

try {
  console.log('\ndrag a port onto the target block body');
  await reload();
  await dragTo(blk(2).locator('.port.bottom'), blk(3));
  check('edge created', await edges(), 1);
  // The whole point: the press belonged to the port, not to the block.
  check('source block stayed put', await blk(2).evaluate((e) => e.style.top), '144px');

  console.log('\nclick a port, then click the target block body');
  await reload();
  await blk(2).locator('.port.bottom').click();
  check('port armed', await blk(2).locator('.port.armed').count(), 1);
  await blk(3).click();
  check('edge created', await edges(), 1);
  check('armed cleared', await page.locator('.port.armed').count(), 0);

  console.log('\nclick a port, then click the target IN dot');
  await reload();
  await blk(2).locator('.port.bottom').click();
  await blk(3).locator('.port.top').click();
  check('edge created', await edges(), 1);

  console.log('\nclick a connected port to disconnect');
  await blk(2).locator('.port.bottom').click();
  check('edge removed', await edges(), 0);

  console.log('\nclick an armed port again to disarm');
  await reload();
  await blk(2).locator('.port.bottom').click();
  await blk(2).locator('.port.bottom').click();
  check('nothing armed', await page.locator('.port.armed').count(), 0);
  check('no edge', await edges(), 0);

  console.log('\ndragging a block still moves it');
  await reload();
  const before = await blk(3).evaluate((e) => e.style.top);
  const box = await blk(3).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 96, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  check('block moved', (await blk(3).evaluate((e) => e.style.top)) !== before, true);
  check('no accidental edge', await edges(), 0);

  console.log('\na block cannot connect to itself');
  await reload();
  await dragTo(blk(2).locator('.port.bottom'), blk(2));
  check('no edge', await edges(), 0);

  console.log('\nthe live line follows the pointer');
  await reload();
  const a = await blk(2).locator('.port.bottom').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y + 160, { steps: 8 });
  check('dashed line drawn', await page.locator('svg.edges path[stroke-dasharray]').count(), 1);
  await page.mouse.up();
  await page.waitForTimeout(100);
  check('live line gone after drop', await page.locator('svg.edges path[stroke-dasharray]').count(), 0);

  console.log('\na block with no IN port refuses a connection');
  await reload();
  check('flow beginning has no IN dot', await blk(1).locator('.port.top').count(), 0);
  await dragTo(blk(2).locator('.port.bottom'), blk(1));
  check('no edge', await edges(), 0);
} finally {
  await browser.close();
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
