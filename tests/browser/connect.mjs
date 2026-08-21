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

// The same flow with the blocks flush against each other. A block is 3 cells
// tall, so at a 3-cell step there is no gap at all: each IN dot lands on the
// block above it and on that block's own output dot.
const tight = emptyModel();
createBlock(tight, 1046, 4, 3);
createBlock(tight, 1046, 4, 6);
const tightJson = join(dir, 'tight.json');
writeFileSync(tightJson, JSON.stringify(toJsonFlow(tight)));

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
const blk = (n) => page.locator(`.block[data-block-id="${n}"]`);
const armedPorts = () => page.locator('.port.armed').count();

async function reload(flow = flowJson) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.setInputFiles('input[type=file][accept*=json]', flow);
  await page.waitForTimeout(300);
}

/** A fresh flow with blocks added the way a user adds them: from the palette. */
async function fromPalette(search, times) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.fill('.search', search);
  for (let i = 0; i < times; i++) await page.locator('.palette-item').first().click();
  await page.waitForTimeout(300);
}

const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function dragTo(src, dst) {
  await dragToPoint(src, ...Object.values(centre(await dst.boundingBox())));
}

async function dragToPoint(src, x, y) {
  const a = await src.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/**
 * Drag out to one point and release on another.
 *
 * Needed where the source dot and the target dot are at the same place: going
 * straight there is no movement at all, so it reads as a click.
 */
async function dragVia(src, mid, dst) {
  const a = await src.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 8 });
  await page.mouse.move(dst.x, dst.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** What the browser would hand a press at this point, as `block/class`. */
const hitAt = (x, y) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return 'none';
    return `${el.closest('.block')?.dataset.blockId ?? '-'}/${el.className}`;
  }, [x, y]);

async function zoomOut(times) {
  for (let i = 0; i < times; i++) await page.locator('.zoom button[title="Zoom out"]').click();
  await page.waitForTimeout(120);
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

  // Dropping is measured against block rectangles, not by asking the browser
  // what is under the pointer. Zoomed out, a block is a dozen pixels across and
  // a drop that looks on target lands on the canvas behind it.
  for (const clicks of [0, 4, 8]) {
    await reload();
    await zoomOut(clicks);
    const zoom = await page.locator('.zoom .level').textContent();
    const box = await blk(3).boundingBox();
    console.log(`\nat ${zoom} zoom the target is ${Math.round(box.width)}px wide`);
    await dragToPoint(blk(2).locator('.port.bottom'), box.x + box.width / 2, box.y + box.height / 2);
    check('drop on the centre connects', await edges(), 1);

    await reload();
    await zoomOut(clicks);
    const b2 = await blk(3).boundingBox();
    await dragToPoint(blk(2).locator('.port.bottom'), b2.x + b2.width / 2, b2.y + b2.height + 14);
    check('drop just below the block connects', await edges(), 1);
  }

  console.log('\na drop far from any block keeps the port armed');
  await reload();
  const canvas = await page.locator('.canvas').boundingBox();
  await dragToPoint(
    blk(2).locator('.port.bottom'),
    canvas.x + canvas.width - 60,
    canvas.y + canvas.height - 60,
  );
  check('no edge', await edges(), 0);
  check('port still armed', await armedPorts(), 1);
  await blk(3).click();
  await page.waitForTimeout(150);
  check('clicking the target finishes it', await edges(), 1);

  console.log('\na block with no IN port refuses a connection');
  await reload();
  check('flow beginning has no IN dot', await blk(1).locator('.port.top').count(), 0);
  await dragTo(blk(2).locator('.port.bottom'), blk(1));
  // And it does not snap past that block to a valid one nearby.
  check('no edge', await edges(), 0);

  // The model is mutated in place, so a block added after the flow was opened
  // does not change the identity of `model.blocks`. Anything the canvas
  // memoises against that array therefore keeps answering with the flow as it
  // was loaded, and a wire to a block the user just added is never drawn.
  console.log('\nblocks added from the palette can be wired up');
  await fromPalette('delay', 2);
  check('three blocks', await page.locator('.block').count(), 3);
  await dragTo(blk(1).locator('.port.bottom'), blk(2));
  check('edge drawn', await edges(), 1);
  await dragTo(blk(2).locator('.port.bottom'), blk(3));
  check('second edge drawn', await edges(), 2);

  // A 3-cell step would leave no gap: the new block's IN dot would land on the
  // previous block's output dot, and the dot you drag a wire from would be
  // buried under one that does nothing.
  console.log('\npalette blocks are spaced so their connectors do not collide');
  await fromPalette('delay', 2);
  for (const n of [1, 2]) {
    const dot = centre(await blk(n).locator('.port.bottom').boundingBox());
    check(`block ${n}'s own output dot takes the press`, await hitAt(dot.x, dot.y), `${n}/port bottom`);
  }

  console.log('\nwires follow a block being dragged');
  await fromPalette('delay', 2);
  await dragTo(blk(1).locator('.port.bottom'), blk(2));
  const drawn = async () =>
    (await edges()) ? page.locator('svg.edges path').first().getAttribute('d') : null;
  const wasAt = await drawn();
  check('there is a wire to redraw', wasAt !== null, true);
  const target = await blk(2).boundingBox();
  await page.mouse.move(...Object.values(centre(target)));
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + 200, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  check('the wire was redrawn', (await drawn()) !== wasAt, true);

  // An IN dot hangs half outside its block, above the top edge, so on a tight
  // layout it sits on top of the block above — usually the very block the wire
  // is coming from. Measuring the drop against rectangles alone hands it to
  // that block, which cannot accept its own wire, and the drop does nothing.
  console.log('\nreleasing on an IN dot that overlaps the source block connects');
  await reload(tightJson);
  const inDot = centre(await blk(2).locator('.port.top').boundingBox());
  const goDot = centre(await blk(1).locator('.port.bottom').boundingBox());
  check('the two dots really do coincide', [Math.round(inDot.x), Math.round(inDot.y)],
    [Math.round(goDot.x), Math.round(goDot.y)]);
  check('the output dot takes the press', await hitAt(goDot.x, goDot.y), '1/port bottom');
  await dragVia(blk(1).locator('.port.bottom'), { x: goDot.x + 220, y: goDot.y + 40 }, inDot);
  check('edge created', await edges(), 1);
  check('nothing left armed', await armedPorts(), 0);
} finally {
  await browser.close();
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
