#!/usr/bin/env node
/**
 * Bundles the built site into one self-contained `.html` file.
 *
 * Node is only needed to *produce* this file. The result has no scripts, no
 * styles and no assets to fetch: open it from a disk, a USB stick or any static
 * host and it runs. Nothing is uploaded — flows are read and written locally.
 *
 *   npm run build:single    ->  dist/automate-web-builder.html
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-single');
const indexPath = join(dist, 'index.html');

if (!existsSync(indexPath)) {
  console.error('dist-single/index.html not found — run `npm run build:single`.');
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf8');
const assets = dist;
const files = existsSync(assets) ? readdirSync(assets) : [];

// Inline stylesheets.
for (const css of files.filter((f) => f.endsWith('.css'))) {
  const body = readFileSync(join(assets, css), 'utf8');
  const link = new RegExp(`<link[^>]*href="[^"]*${css}"[^>]*>`);
  if (!link.test(html)) continue;
  html = html.replace(link, `<style>\n${body}\n</style>`);
}

// Inline scripts. `</script>` inside the bundle would close the tag early.
//
// The bundle becomes a classic script because module scripts are blocked on
// `file://` URLs, and classic scripts are not deferred — so it has to move to
// the end of <body>, after #root exists, rather than staying in <head>.
for (const js of files.filter((f) => f.endsWith('.js'))) {
  const body = readFileSync(join(assets, js), 'utf8').replace(/<\/script>/gi, '<\\/script>');
  const tag = new RegExp(`<script[^>]*src="[^"]*${js}"[^>]*>\\s*</script>`);
  if (!tag.test(html)) continue;
  html = html.replace(tag, '');
  html = html.replace('</body>', `  <script>\n${body}\n  </script>\n  </body>`);
}

// The icon font, when the user has extracted it, so the single file is complete.
const font = join(root, 'public/fonts/AutomateIcons.ttf');
if (existsSync(font)) {
  const b64 = readFileSync(font).toString('base64');
  html = html.replace(
    /url\(["']?[^"')]*AutomateIcons\.ttf["']?\)/,
    `url(data:font/ttf;base64,${b64})`,
  );
  console.log('embedded AutomateIcons.ttf');
} else {
  console.log('no icon font found — blocks will render initials (see README)');
}

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'automate-web-builder.html');
writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote ${out} (${kb} kB, self-contained)`);
