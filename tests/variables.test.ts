/**
 * A variable's identity is its node, not its name.
 *
 * Automate resolves each distinct `I3.l` instance to a slot index at load time
 * and addresses variables by that index forever after. Two nodes spelled the
 * same are two different variables, so anything that builds a graph here has to
 * share one node per name — `parseExpression()` and `variableRef()` do not, and
 * the encoder makes up the difference.
 *
 * This failure is invisible on this side: the flow parses, validates, explains
 * correctly and round-trips. It only shows up as a flow misbehaving on a phone,
 * which is why it is pinned here.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VARIABLE_TYPE, parseFlo, writeFlo } from '../src/flo/codec';
import { createBlock, emptyModel, fromModel, toModel } from '../src/flo/model';
import { parseExpression } from '../src/flo/exprparse';
import { variableRef } from '../src/flo/expr';
import type { FloObject, FloValue } from '../src/flo/types';

/** Every variable node reachable from a parsed flow, grouped by name. */
function variableNodes(statements: FloValue[]): Map<string, Set<object>> {
  const byName = new Map<string, Set<object>>();
  const seen = new Set<object>();
  const walk = (v: FloValue): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const o = v as FloObject;
    if (o._type === VARIABLE_TYPE) {
      const name = String(o.f4289X ?? '');
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name)!.add(o);
    }
    for (const [k, x] of Object.entries(o)) {
      if (k === '_type') continue;
      if (Array.isArray(x)) x.forEach((e) => walk(e as FloValue));
      else walk(x as FloValue);
    }
  };
  statements.forEach(walk);
  return byName;
}

function splitNames(bytes: Uint8Array): string[] {
  return [...variableNodes(parseFlo(bytes).statements)]
    .filter(([, nodes]) => nodes.size > 1)
    .map(([name]) => name);
}

describe('variable identity', () => {
  it('merges separately-built references to the same name', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    // Three independently created nodes, all named `host`.
    begin.raw.varPayload = variableRef('host');
    const assign = createBlock(model, 1012 /* VariableAssign */, 4, 6);
    assign.raw.variable = variableRef('host');
    assign.raw.value = parseExpression('host ++ "!"');

    const bytes = fromModel(model);
    expect(splitNames(bytes)).toEqual([]);

    // And the merge survives: the name is still readable afterwards.
    const reloaded = toModel(bytes);
    const back = reloaded.blocks.find((b) => b.typeId === 1012)!;
    expect((back.raw.variable as FloObject).f4289X).toBe('host');
  });

  it('keeps different names apart', () => {
    const model = emptyModel();
    const assign = createBlock(model, 1012, 4, 6);
    assign.raw.variable = variableRef('a');
    assign.raw.value = parseExpression('b ++ c');

    const names = variableNodes(parseFlo(fromModel(model)).statements);
    expect([...names.keys()].sort()).toEqual(['a', 'b', 'c']);
    for (const [, nodes] of names) expect(nodes.size).toBe(1);
  });

  it('is idempotent, so re-saving is stable', () => {
    const model = emptyModel();
    const assign = createBlock(model, 1012, 4, 6);
    assign.raw.variable = variableRef('x');
    assign.raw.value = parseExpression('x + x + x');

    const once = fromModel(model);
    expect(writeFlo(parseFlo(once))).toEqual(once);
    expect(fromModel(toModel(once))).toEqual(once);
  });

  it('holds in flows written by Automate itself', () => {
    const dir = process.env.FLO_FIXTURES;
    let checked = 0;
    try {
      if (!dir || !statSync(dir).isDirectory()) return;
    } catch {
      return;
    }
    for (const f of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.flo'))) {
      const bytes = new Uint8Array(readFileSync(join(dir, f)));
      expect(splitNames(bytes), f).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
