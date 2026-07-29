/**
 * The property that makes expression editing safe: what the editor shows you
 * must parse back to something that renders identically.
 *
 * If render(parse(text)) !== text, then opening a field and pressing a key
 * would silently rewrite the value — which is exactly the bug this parser
 * exists to fix.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toModel } from '../src/flo/model';
import { isExpression, renderExpression } from '../src/flo/expr';
import { ExpressionError, parseExpression } from '../src/flo/exprparse';
import { schema } from '../src/flo/codec';

function fixtureFiles(): string[] {
  const dir = process.env.FLO_FIXTURES;
  if (!dir) return [];
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.flo'))
    .map((f) => join(dir, f));
}

/** render -> parse -> render must be a fixed point. */
function stable(text: string): string {
  return renderExpression(parseExpression(text));
}

describe('expression parser', () => {
  it('parses literals', () => {
    expect(stable('"hello"')).toBe('"hello"');
    expect(stable('42')).toBe('42');
    expect(stable('3.5')).toBe('3.5');
    expect(stable('0xff')).toBe('255');
    expect(stable('')).toBe('');
    expect(stable('Now')).toBe('Now');
    expect(stable('Pi')).toBe('Pi');
  });

  it('parses variables and functions', () => {
    expect(stable('myVar')).toBe('myVar');
    expect(stable('lowerCase(name)')).toBe('lowerCase(name)');
    expect(stable('contains(app, "retro")')).toBe('contains(app, "retro")');
    expect(stable('max(1, 2, 3)')).toBe('max(1, 2, 3)');
  });

  it('honours the app operator precedence', () => {
    expect(stable('1 + 2 * 3')).toBe('1 + 2 * 3');
    expect(stable('(1 + 2) * 3')).toBe('(1 + 2) * 3');
    expect(stable('a = 1 && b = 2')).toBe('a = 1 && b = 2');
    expect(stable('a ++ b ++ c')).toBe('a ++ b ++ c');
    expect(stable('!a')).toBe('!a');
    expect(stable('-x + 1')).toBe('-x + 1');
    expect(stable('x[0]')).toBe('x[0]');
    expect(stable('a ? b : c')).toBe('a ? b : c');
  });

  it('parses string interpolation', () => {
    expect(stable('"value: {x}"')).toBe('"value: {x}"');
    expect(stable('"{a} and {b}"')).toBe('"{a} and {b}"');
    // A literal brace must survive as a literal brace, not become a hole.
    expect(stable('"a \\{ b"')).toBe('"a \\{ b"');
  });

  it('parses lists and maps, including conversion types', () => {
    expect(stable('[1, 2, 3]')).toBe('[1, 2, 3]');
    expect(stable('{"a": 1}')).toBe('{"a": 1}');
    expect(stable('{"a": 1, "b": "two"}')).toBe('{"a": 1, "b": "two"}');
    expect(stable('{"n": x as Int}')).toBe('{"n": x as Int}');
    expect(stable('[{"a": 1}, {"b": 2}]')).toBe('[{"a": 1}, {"b": 2}]');
  });

  it('ignores insignificant whitespace, so values can be reformatted', () => {
    // This is the reformatting case: newlines and indentation between tokens
    // must be accepted and must not change the value.
    const formatted = `[
      {"tv": "192.168.0.30", "shield": "192.168.0.34"},
      {"tv": "TV", "shield": "Shield"}
    ]`;
    expect(stable(formatted)).toBe(
      '[{"tv": "192.168.0.30", "shield": "192.168.0.34"}, {"tv": "TV", "shield": "Shield"}]',
    );
  });

  it('reports errors instead of mangling the input', () => {
    expect(() => parseExpression('1 +')).toThrow(ExpressionError);
    expect(() => parseExpression('"unterminated')).toThrow(ExpressionError);
    expect(() => parseExpression('nosuchfunction(1)')).toThrow(/Unknown function/);
    expect(() => parseExpression('[1, 2')).toThrow(ExpressionError);
    expect(() => parseExpression('1 2')).toThrow(/after expression/);
  });

  it('is idempotent, so repeated edits cannot compound', () => {
    // The original bug: each keystroke re-wrapped the value in a string
    // literal, escaping it again every time.
    const source = '[{"tv": "192.168.0.30"}, {"kids": "YouTube Kids"}]';
    let text = source;
    for (let i = 0; i < 5; i++) text = stable(text);
    expect(text).toBe(source);
  });

  const files = fixtureFiles();
  const maybe = files.length ? it : it.skip;

  maybe('round-trips every expression in real flows', () => {
    const failures: string[] = [];
    let checked = 0;

    for (const path of files) {
      const model = toModel(new Uint8Array(readFileSync(path)));
      for (const block of model.blocks) {
        for (const op of schema[String(block.typeId)].ops ?? []) {
          if (op.op !== 'obj') continue;
          const value = block.raw[op.f];
          if (!isExpression(value)) continue;
          const text = renderExpression(value as never);
          if (!text) continue;
          checked++;
          try {
            const again = renderExpression(parseExpression(text));
            if (again !== text) {
              failures.push(`${block.entry?.name}.${op.f}\n  in:  ${text}\n  out: ${again}`);
            }
          } catch (err) {
            failures.push(`${block.entry?.name}.${op.f}: ${(err as Error).message}\n  ${text}`);
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(100);
    expect(failures.slice(0, 10).join('\n\n')).toBe('');
  });
});
