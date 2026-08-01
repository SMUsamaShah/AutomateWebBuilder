/**
 * `docs/STATS.md` must match the data it was generated from.
 *
 * The guides quote no derived number; they link to that file instead. That only
 * helps if the file is current, and "remember to run the generator" is exactly
 * the discipline that failed before — a corpus pull silently invalidated a
 * figure the guide presented as a worked example. So this regenerates it and
 * compares, making a stale number a build failure.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('generated figures', () => {
  it('are up to date with the data', () => {
    const before = readFileSync('docs/STATS.md', 'utf8');
    execFileSync('npx', ['tsx', 'tools/generate-stats.ts'], { stdio: 'pipe' });
    const after = readFileSync('docs/STATS.md', 'utf8');
    expect(after, 'docs/STATS.md is stale — run: npm run docs:stats').toBe(before);
  });

  it('is what the guides point at, so it has to carry the load', () => {
    const stats = readFileSync('docs/STATS.md', 'utf8');
    for (const heading of ['The format', 'fieldKind', 'category', 'Expressions', 'Lint rules']) {
      expect(stats).toContain(heading);
    }
    // A guide that quotes a count instead of linking here is how this started.
    const guide = readFileSync('docs/LLM-GUIDE.md', 'utf8');
    expect(guide).toContain('STATS.md');
  });
});
