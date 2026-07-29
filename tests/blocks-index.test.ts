/**
 * `docs/BLOCKS.md` is how an agent discovers the 410 block types without
 * reading the source, so a stale copy would send it after ids that no longer
 * mean what it thinks. Regenerating is one command; this makes forgetting loud.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildIndex } from '../tools/blocks';
import { catalog } from '../src/flo/model';

describe('docs/BLOCKS.md', () => {
  it('is in sync with the generated catalog', () => {
    const onDisk = readFileSync(join(__dirname, '../docs/BLOCKS.md'), 'utf8');
    expect(
      onDisk,
      'docs/BLOCKS.md is stale — regenerate with `npm run blocks -- --write-index`',
    ).toBe(buildIndex());
  });

  it('lists every block exactly once', () => {
    const index = buildIndex();
    for (const [tid, entry] of Object.entries(catalog)) {
      const rows = index.split('\n').filter((l) => l.startsWith(`| ${tid} |`));
      expect(rows, `block ${tid} (${entry.name}) missing from the index`).toHaveLength(1);
    }
  });
});

describe('block discovery CLI', () => {
  it('lists every block in --all output', () => {
    // The listing is what an agent falls back to when a keyword search misses,
    // so a block missing from it is effectively invisible.
    const listed = new Set(
      execFileSync('npx', ['tsx', 'tools/blocks.ts', '--all'], {
        cwd: join(__dirname, '..'),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      })
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((t) => /^\d+$/.test(t)),
    );
    for (const tid of Object.keys(catalog)) {
      expect(listed.has(tid), `block ${tid} missing from --all`).toBe(true);
    }
  });
});
