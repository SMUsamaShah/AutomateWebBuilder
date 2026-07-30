/**
 * The linter's job is to catch what the format cannot express.
 *
 * Both bugs that reached a device — a required argument left null, and a dialog
 * without `startActivity` — produced files that parsed, validated, explained
 * and round-tripped perfectly. These tests pin that the linter sees them, and,
 * just as importantly, that it stays quiet on flows Automate itself wrote.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildFlow } from '../examples/app-usage-today';
import { lintFlow } from '../src/flo/lint';
import { createBlock, emptyModel, toModel, fromModel } from '../src/flo/model';
import { parseExpression } from '../src/flo/exprparse';
import { variableRef } from '../src/flo/expr';

const fixtures = (): string[] => {
  const dir = process.env.FLO_FIXTURES;
  try {
    if (!dir || !statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.flo'))
    .map((f) => join(dir, f));
};

describe('flow linting', () => {
  it('is clean on the worked example', () => {
    expect(lintFlow(buildFlow())).toEqual([]);
  });

  it('errors on a required argument the corpus never leaves empty', () => {
    const model = emptyModel();
    // HttpRequest.url: the app null-checks it, and all 133 in the corpus set it.
    createBlock(model, 1087 /* HttpRequest */, 4, 6);

    const found = lintFlow(model).filter((f) => f.severity === 'error');
    expect(found.map((f) => f.field)).toContain('url');
    expect(found.find((f) => f.field === 'url')!.message).toMatch(
      /RequiredArgumentNullException/,
    );
  });

  it('only warns when the app checks a field but the corpus cannot confirm it', () => {
    const model = emptyModel();
    // AdbShellCommand.alias is null-checked, but ADB blocks are too rare in the
    // corpus to prove it is unconditional — so this is advice, not a verdict.
    const adb = createBlock(model, 1342, 4, 6);
    adb.raw.command = parseExpression('"ls"');
    adb.raw.varStdout = variableRef('out');

    const found = lintFlow(model);
    const alias = found.find((f) => f.field === 'alias');
    expect(alias).toBeDefined();
    expect(alias!.severity).toBe('warning');
    expect(found.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('catches a dialog that would post a notification instead of a window', () => {
    const model = buildFlow();
    for (const b of model.blocks) {
      if (/^Dialog/.test(b.entry?.name ?? '')) b.raw.startActivity = null;
    }
    const found = lintFlow(model);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.field === 'startActivity')).toBe(true);
    // The evidence has to travel with the finding, or it cannot be judged.
    expect(found[0].message).toMatch(/\d+ of \d+ real blocks/);
  });

  it('survives a save/load cycle without changing its mind', () => {
    const model = buildFlow();
    expect(lintFlow(toModel(fromModel(model)))).toEqual([]);
  });

  it('reports no errors on flows written by Automate itself', () => {
    const files = fixtures();
    if (files.length === 0) return;
    for (const f of files) {
      let model;
      try {
        model = toModel(new Uint8Array(readFileSync(f)));
      } catch {
        continue; // unreadable files are audit-corpus.ts's problem, not the linter's
      }
      const errors = lintFlow(model).filter((x) => x.severity === 'error');
      expect(errors, `${f}: ${errors.map((e) => e.field).join(', ')}`).toEqual([]);
    }
  });
});
