import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toModel } from '../src/flo/model';
import { renderExpression, isExpression, quote, stringLiteral } from '../src/flo/expr';
import { schema } from '../src/flo/codec';

function fixtureFiles(): string[] {
  const dir = process.env.FLO_FIXTURES;
  if (!dir) return [];
  try { if (!statSync(dir).isDirectory()) return []; } catch { return []; }
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.flo')).map((f) => join(dir, f));
}

describe('expression rendering', () => {
  it('quotes strings like the app does', () => {
    expect(quote('hi')).toBe('"hi"');
    expect(quote('a"b')).toBe('"a\\"b"');
    expect(quote('a\nb')).toBe('"a\\nb"');
  });

  it('renders literals', () => {
    expect(renderExpression(stringLiteral('x'))).toBe('"x"');
  });

  const files = fixtureFiles();
  const maybe = files.length ? it : it.skip;

  maybe('renders every expression in real flows without unknown nodes', () => {
    let rendered = 0;
    for (const path of files) {
      const model = toModel(new Uint8Array(readFileSync(path)));
      for (const block of model.blocks) {
        for (const op of schema[String(block.typeId)].ops ?? []) {
          if (op.op !== 'obj') continue;
          const value = block.raw[op.f];
          if (!isExpression(value)) continue;
          const text = renderExpression(value as never);
          expect(text, `${block.entry?.name}.${op.f} rendered an unknown node`).not.toContain('…');
          rendered++;
        }
      }
    }
    expect(rendered).toBeGreaterThan(100);
  });
});
