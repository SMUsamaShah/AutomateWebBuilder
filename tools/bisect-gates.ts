/**
 * Finds the version gate that makes an old flow unreadable.
 *
 *   npx tsx tools/bisect-gates.ts <dir-of-failing-flows> [--limit 40]
 *
 * A desync is reported where the stream runs out, which is arbitrarily far from
 * the field that actually misread — reading the trail tells you where the
 * reader ended up, not where it went wrong. So instead of reasoning about it,
 * this searches: toggle one field's version gate, re-parse, keep whatever makes
 * the file readable.
 *
 * Two directions, because the schema can be wrong either way:
 *
 *   - a field we read at this version that did not exist yet (gate `min` too
 *     low, or missing entirely), and
 *   - a field we skip that was already there (gate `min` too high).
 *
 * A hit is a *candidate*, not a conclusion: one wrong gate can be compensated
 * by another, and a file can be made to parse by a change that is not the real
 * fix. Confirm against the app's own `z0` method before editing the generator —
 * and note that the schema is generated, so the fix belongs in
 * `tools/generate_schema.py`, never in `schema.json` by hand.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFlo, schema } from '../src/flo/codec';
import type { WireOp } from '../src/flo/types';

const NEVER = 1_000_000;

function parses(bytes: Uint8Array): boolean {
  try {
    parseFlo(bytes);
    return true;
  } catch {
    return false;
  }
}

function versionOf(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(4);
}

interface Candidate {
  type: string;
  cls: string;
  field: string;
  direction: 'remove' | 'add';
}

/** Every (type, op) pair in the schema, in a stable order. */
function allOps(): Array<{ type: string; cls: string; op: WireOp }> {
  const out: Array<{ type: string; cls: string; op: WireOp }> = [];
  for (const [type, rec] of Object.entries(schema)) {
    for (const op of rec.ops ?? []) out.push({ type, cls: rec.cls ?? '?', op });
  }
  return out;
}

function search(bytes: Uint8Array, version: number): Candidate[] {
  const hits: Candidate[] = [];
  for (const { type, cls, op } of allOps()) {
    const min = op.min;
    const max = op.max;
    const active = (min ?? 0) <= version && version <= (max ?? NEVER);

    if (active) {
      // Pretend the field arrived after this version, i.e. do not read it.
      op.min = version + 1;
      if (parses(bytes)) hits.push({ type, cls, field: op.f, direction: 'remove' });
    } else if ((min ?? 0) > version) {
      // Pretend the field already existed, i.e. read it.
      op.min = 0;
      if (parses(bytes)) hits.push({ type, cls, field: op.f, direction: 'add' });
    }

    op.min = min;
    op.max = max;
    if (hits.length >= 4) break; // enough to describe the file
  }
  return hits;
}

function main(): void {
  const dir = process.argv[2];
  if (!dir || !statSync(dir).isDirectory()) {
    console.error('usage: bisect-gates.ts <dir> [--limit N]');
    process.exit(2);
  }
  const limitAt = process.argv.indexOf('--limit');
  const limit = limitAt > 0 ? Number(process.argv[limitAt + 1]) : 40;

  // Smallest failing files first: the search re-parses thousands of times per
  // file, and a small flow pins a gate just as well as a large one.
  const failing = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.flo'))
    .map((f) => ({ f, bytes: new Uint8Array(readFileSync(join(dir, f))) }))
    .filter((x) => !parses(x.bytes))
    .sort((a, b) => a.bytes.length - b.bytes.length)
    .slice(0, limit);

  console.log(`${failing.length} failing flows to bisect\n`);

  const tally = new Map<string, { n: number; versions: Set<number>; direction: string }>();
  let explained = 0;
  for (const { f, bytes } of failing) {
    const version = versionOf(bytes);
    const hits = search(bytes, version);
    if (hits.length === 0) {
      console.log(`  ${f} (v${version}): no single gate explains it`);
      continue;
    }
    explained++;
    for (const h of hits) {
      const key = `${h.direction} ${h.cls.split('.').pop()}.${h.field}`;
      if (!tally.has(key)) tally.set(key, { n: 0, versions: new Set(), direction: h.direction });
      const t = tally.get(key)!;
      t.n++;
      t.versions.add(version);
    }
  }

  console.log(`\n${explained} of ${failing.length} explained by a single gate change:\n`);
  for (const [key, t] of [...tally].sort((a, b) => b[1].n - a[1].n)) {
    const vs = [...t.versions].sort((a, b) => a - b);
    console.log(`${String(t.n).padStart(3)}×  ${key.padEnd(46)} at v${vs.join(', v')}`);
  }
}

main();
