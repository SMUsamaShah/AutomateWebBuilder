#!/usr/bin/env node
/**
 * Extracts the Automate icon font from an APK so blocks render with the same
 * glyphs as the app.
 *
 * The font is LlamaLab's asset and is deliberately NOT committed to this
 * repository — supply your own copy of the APK to enable the real icons:
 *
 *   node scripts/extract-apk-assets.mjs path/to/automate.apk
 *
 * Without it the editor falls back to drawing each block's initials, so the
 * app is fully usable either way.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apk = process.argv[2];

if (!apk || !existsSync(apk)) {
  console.error('usage: node scripts/extract-apk-assets.mjs <automate.apk>');
  process.exit(1);
}

const ENTRY = 'assets/fonts/AutomateIcons.ttf';
const outDir = resolve(root, 'public/fonts');
const outFile = resolve(outDir, 'AutomateIcons.ttf');

try {
  const data = execFileSync('unzip', ['-p', apk, ENTRY], {
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'buffer',
  });
  if (!data.length) throw new Error(`${ENTRY} is empty`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, data);
  console.log(`wrote ${outFile} (${data.length} bytes)`);
  console.log('Reload the editor — blocks will now use the original Automate icons.');
} catch (err) {
  console.error(`could not extract ${ENTRY}: ${err.message}`);
  process.exit(1);
}
