/**
 * Runs the whole library over a directory of real flows and reports what broke.
 *
 *   npx tsx tools/audit-corpus.ts <dir>
 *
 * This is the check the test suite cannot be: `npm test` needs a fixed, passing
 * corpus, whereas this is meant to be pointed at a few hundred flows written by
 * strangers and to come back with a list of things we get wrong. Failures here
 * are the backlog, not a broken build.
 *
 * It reports, per flow: whether it parses, whether the bytes survive a codec
 * round trip, whether they survive a *model* round trip (the editor's own
 * load/save path), and whether `validateModel` is clean. Plus coverage — how
 * much of the block vocabulary and how many format versions the corpus reaches,
 * which is what says whether any statistic drawn from it means anything.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFlo, writeFlo } from '../src/flo/codec';
import { catalog, fromModel, toModel, validateModel } from '../src/flo/model';

interface Bucket {
  reason: string;
  files: string[];
  versions: Set<number>;
}

function versionOf(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(4);
}

/** Collapse per-file detail (offsets, ids) so like failures group together. */
function generalise(message: string): string {
  return message
    .replace(/at \d+ \(\+\d+\)/, 'at <offset>')
    .replace(/type id \d+/, 'type id <n>')
    .replace(/format v\d+/, 'format v<n>');
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: audit-corpus.ts <dir>');
    process.exit(2);
  }
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.flo'));
  const buckets = new Map<string, Bucket>();
  const blockTypes = new Map<number, number>();
  const versions = new Map<number, number>();
  let clean = 0;

  const fail = (reason: string, file: string, version: number) => {
    const key = generalise(reason);
    if (!buckets.has(key)) buckets.set(key, { reason: key, files: [], versions: new Set() });
    const b = buckets.get(key)!;
    b.files.push(file);
    b.versions.add(version);
  };

  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(dir, f)));
    const version = versionOf(bytes);
    versions.set(version, (versions.get(version) ?? 0) + 1);
    try {
      const doc = parseFlo(bytes);
      if (Buffer.compare(Buffer.from(writeFlo(doc)), Buffer.from(bytes)) !== 0) {
        fail('codec round trip is not byte-exact', f, version);
        continue;
      }
      const model = toModel(bytes);
      for (const b of model.blocks) blockTypes.set(b.typeId, (blockTypes.get(b.typeId) ?? 0) + 1);
      if (Buffer.compare(Buffer.from(fromModel(model)), Buffer.from(bytes)) !== 0) {
        fail('model round trip is not byte-exact', f, version);
        continue;
      }
      const problems = validateModel(model);
      if (problems.length) {
        fail(`validateModel: ${problems[0]}`, f, version);
        continue;
      }
      clean++;
    } catch (err) {
      fail((err as Error).message, f, version);
    }
  }

  const vlist = [...versions.keys()].sort((a, b) => a - b);
  console.log(`${files.length} flows, ${clean} fully clean (${Math.round((clean / files.length) * 100)}%)`);
  console.log(
    `format versions: ${vlist.length} distinct, v${vlist[0]}–v${vlist[vlist.length - 1]}`,
  );
  console.log(
    `block types    : ${blockTypes.size} of ${Object.keys(catalog).length} seen ` +
      `(${[...blockTypes.values()].filter((n) => n === 1).length} only once)`,
  );

  if (buckets.size === 0) return;
  console.log(`\n${files.length - clean} flows had problems:\n`);
  for (const b of [...buckets.values()].sort((x, y) => y.files.length - x.files.length)) {
    const vs = [...b.versions].sort((a, c) => a - c);
    console.log(`${String(b.files.length).padStart(3)}×  ${b.reason}`);
    console.log(`      versions: ${vs.join(', ')}`);
    console.log(`      e.g. ${b.files.slice(0, 3).join(', ')}`);
  }
}

main();
