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
import { schema } from '../src/flo/codec';
import requiredJson from '../src/data/required.json';
import conventionsJson from '../src/data/conventions.json';
import { parseExpression } from '../src/flo/exprparse';
import { variableRef } from '../src/flo/expr';

const required = requiredJson as Record<string, string[]>;
const observed = (
  conventionsJson as { fields: Record<string, Record<string, { set: number; of: number }>> }
).fields;

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
    // Which field qualifies depends on the corpus behind conventions.json —
    // widen it and a field that looked unconditional can turn out not to be.
    // So the example is derived from the data rather than written down, and
    // what is asserted is the rule, not one block's spelling.
    const proven = Object.entries(required).flatMap(([cls, fields]) =>
      fields
        .filter((f) => {
          const t = observed[cls]?.[f];
          return t !== undefined && t.set === t.of && t.of >= 20;
        })
        .map((f) => ({ cls, field: f })),
    );
    expect(proven.length, 'no field is both code-required and always set').toBeGreaterThan(0);

    const typeId = Number(
      Object.entries(schema).find(([, r]) => r.cls === proven[0].cls)![0],
    );
    const model = emptyModel();
    createBlock(model, typeId, 4, 6);

    const errors = lintFlow(model).filter((f) => f.severity === 'error');
    expect(errors.map((f) => f.field)).toContain(proven[0].field);
    expect(errors[0].message).toMatch(/RequiredArgumentNullException/);
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
    const dialogs = model.blocks.filter((b) => /^Dialog/.test(b.entry?.name ?? ''));
    for (const b of dialogs) b.raw.startActivity = null;

    const found = lintFlow(model);
    expect(found.every((f) => f.field === 'startActivity')).toBe(true);
    // The evidence has to travel with the finding, or it cannot be judged.
    expect(found[0].message).toMatch(/\d+ of \d+ real blocks/);

    // *Every* dialog, not just the most uniform one. Widening the corpus once
    // dropped Dialog message from 98.8% to 96.4% and it fell below the bar,
    // silently un-catching the exact defect that hung a flow twice — while this
    // test still passed on Dialog choice at 99.8%. Naming each block type is
    // what makes the calibration a thing that can fail.
    expect(new Set(found.map((f) => f.blockId))).toEqual(
      new Set(dialogs.map((b) => b.id)),
    );
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
