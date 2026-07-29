/**
 * `docs/BLOCKS.md` is how an agent discovers the 410 block types without
 * reading the source, so a stale copy would send it after ids that no longer
 * mean what it thinks. Regenerating is one command; this makes forgetting loud.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex } from '../tools/blocks';
import { catalog } from '../src/flo/model';

describe('docs/BLOCKS.md', () => {
  it('is in sync with the generated catalog', () => {
    const onDisk = readFileSync(join(__dirname, '../docs/BLOCKS.md'), 'utf8');
    expect(
      onDisk,
      'docs/BLOCKS.md is stale — regenerate with `npm run blocks -- --index`',
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
