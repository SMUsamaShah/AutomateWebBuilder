/**
 * Guards `examples/app-usage-today.ts`.
 *
 * The example is handed to the user as a `.flo` they load on a phone, where a
 * mistyped field name or a wrongly-typed argument shows up as an exception
 * inside Automate rather than here. These assertions pin the things that would
 * silently go wrong: the argument types, the ports actually being connected,
 * and the shell pipeline surviving expression encoding intact.
 */

import { describe, expect, it } from 'vitest';
import { buildFlow } from '../examples/app-usage-today';
import { fromModel, toModel, validateModel } from '../src/flo/model';
import { renderExpression } from '../src/flo/expr';
import type { Block, FlowModel } from '../src/flo/model';

const model = buildFlow();
const byName = (m: FlowModel, name: string): Block[] =>
  m.blocks.filter((b) => b.entry?.name === name);
const only = (m: FlowModel, name: string): Block => {
  const found = byName(m, name);
  expect(found, name).toHaveLength(1);
  return found[0];
};

describe('app usage example', () => {
  it('passes the same validation the guide tells agents to run', () => {
    expect(validateModel(model)).toEqual([]);
  });

  it('survives a save/load round trip', () => {
    const reloaded = toModel(fromModel(model));
    expect(reloaded.blocks.length).toBe(model.blocks.length);
    expect(reloaded.connections.length).toBe(model.connections.length);
  });

  it('leaves no block unreachable from the flow beginning', () => {
    const start = only(model, 'FlowBeginning');
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const c of model.connections) if (c.from === id) walk(c.to);
    };
    walk(start.id);
    expect([...model.blocks].filter((b) => !seen.has(b.id)).map((b) => b.id)).toEqual([]);
  });

  it('enters the subroutine body through the NEW port', () => {
    const call = only(model, 'Subroutine');
    const child = model.connections.find((c) => c.from === call.id && c.port === 'onChildFiber');
    expect(child).toBeDefined();
    const guard = model.blocks.find((b) => b.id === child!.to);
    expect(guard?.entry?.name).toBe('FailureCatch');
  });

  it('returns the three documented variables', () => {
    const call = only(model, 'Subroutine');
    const names = ((call.raw.returnVariables as { _arr: unknown[] })._arr ?? []).map((v) =>
      renderExpression(v as never),
    );
    expect(names).toEqual(['usageSeconds', 'usageText', 'usageError']);
  });

  it('sends the verified dumpsys pipeline, unescaped, to the device', () => {
    const adb = only(model, 'AdbShellCommand');
    // The concatenation's right operand is the literal the device receives.
    const tail = (adb.raw.command as { f4654Y: { f4649X: string } }).f4654Y.f4649X;
    expect(tail).toBe(
      ' | grep -A 5 "In-memory daily stats" | grep totalTimeUsed' +
        ` | sed 's/.*totalTimeUsed="\\([^"]*\\)".*/\\1/' | head -n 1`,
    );
    expect(renderExpression(adb.raw.varExitCode as never)).toBe('usageExit');
  });

  it('handles MM:SS and H:MM:SS the way the device prints them', () => {
    // Mirrors the expression in the flow; `20:01` is 20 minutes, not 20 hours.
    const seconds = (raw: string): number => {
      const p = raw.trim().split(':');
      if (p.length === 3) return +p[0] * 3600 + +p[1] * 60 + +p[2];
      if (p.length === 2) return +p[0] * 60 + +p[1];
      return 0;
    };
    expect(seconds('20:01\n')).toBe(1201);
    expect(seconds('2:05:03')).toBe(7503);
    expect(seconds('32:16:52')).toBe(116212);
    expect(seconds('')).toBe(0);
  });
});
