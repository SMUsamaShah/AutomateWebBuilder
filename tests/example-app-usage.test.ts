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

  it('leaves no block unreachable from a flow beginning', () => {
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const c of model.connections) if (c.from === id) walk(c.to);
    };
    const beginnings = byName(model, 'FlowBeginning');
    expect(beginnings.map((b) => b.raw.title)).toEqual(['App usage today', 'List TV apps']);
    beginnings.forEach((b) => walk(b.id));
    expect(model.blocks.filter((b) => !seen.has(b.id)).map((b) => b.id)).toEqual([]);
  });

  it('shows every dialog as a window rather than a notification', () => {
    // Unset, the block posts a notification and the fiber waits for a tap that
    // may never come — the flow just hangs. Nothing on this side detects it.
    const dialogs = model.blocks.filter((b) => /^Dialog/.test(b.entry?.name ?? ''));
    expect(dialogs.length).toBeGreaterThan(0);
    for (const d of dialogs) {
      expect(renderExpression(d.raw.startActivity as never), d.entry!.name).toBe('1');
    }
  });

  it('builds its menu from the device, not from a hardcoded list', () => {
    const pick = only(model, 'DialogChoice');
    expect(renderExpression(pick.raw.choiceTitles as never)).toBe('usageApps');
    expect(renderExpression(pick.raw.multiselect as never)).toBe('1');
    expect(renderExpression(pick.raw.varSelectedIndices as never)).toBe('usageChoice');

    // usageApps is parsed from `pm list packages`, so no package name is
    // written down anywhere and none can drift out of date.
    const source = byName(model, 'VariableAssign').find(
      (b) => renderExpression(b.raw.variable as never) === 'usageApps',
    )!;
    expect(renderExpression(source.raw.value as never)).toMatch(/^sort\(split\(replaceAll\(trim\(usageRaw\)/);

    // Cancelling must not fall through to a lookup with nothing selected.
    expect(
      model.connections.find((c) => c.from === pick.id && c.port === 'onNegative'),
    ).toBeUndefined();
  });

  it('loops the selection back into the For each, or it runs once', () => {
    const each = only(model, 'ForEach');
    expect(renderExpression(each.raw.container as never)).toBe('usageChoice');

    // Automate requires the DO chain to return to the block's IN dot;
    // without it the iteration stops after the first element.
    const seen = new Set<string>();
    let at = model.connections.find((c) => c.from === each.id && c.port === 'onEachElement')!.to;
    let loops = false;
    while (at && !seen.has(at)) {
      seen.add(at);
      const next = model.connections.find((c) => c.from === at && c.port === 'onComplete');
      if (next?.to === each.id) { loops = true; break; }
      at = next?.to as string;
    }
    expect(loops, 'DO chain never returns to the For each').toBe(true);
  });

  it('skips listing and picking when a payload already named the package', () => {
    const gate = byName(model, 'ExpressionDecision').find(
      (b) => renderExpression(b.raw.expression as never) === 'args["package"]',
    )!;
    const yes = model.connections.find((c) => c.from === gate.id && c.port === 'onPositive')!;
    const no = model.connections.find((c) => c.from === gate.id && c.port === 'onNegative')!;
    const block = (id: string) => model.blocks.find((b) => b.id === id)!;
    // It joins the same loop by faking a one-element list with that element
    // selected, rather than carrying a second copy of the reporting path.
    expect(renderExpression(block(yes.to).raw.value as never)).toBe('[[args["package"]], [0]]');
    expect(block(no.to).entry?.name).toBe('AdbShellCommand');
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
    const adb = byName(model, 'AdbShellCommand').find((b) =>
      renderExpression(b.raw.command as never).includes('dumpsys'),
    )!;
    // The concatenation's right operand is the literal the device receives.
    const tail = (adb.raw.command as { f4654Y: { f4649X: string } }).f4654Y.f4649X;
    expect(tail).toBe(
      ' | grep -A 5 "In-memory daily stats" | grep totalTimeUsed' +
        ` | sed 's/.*totalTimeUsed="\\([^"]*\\)".*/\\1/' | head -n 1`,
    );
    expect(renderExpression(adb.raw.varExitCode as never)).toBe('usageExit');
  });

  it('can read the real package names off the device', () => {
    // A guessed package name is indistinguishable from an unused app, so the
    // menu comes from the device rather than from memory.
    const lister = byName(model, 'AdbShellCommand').find((b) =>
      renderExpression(b.raw.command as never).includes('pm list'),
    )!;
    // No pipeline: each stage is another way to come back empty, and the
    // tidying belongs in the expression where the result is visible.
    expect(renderExpression(lister.raw.command as never)).toBe('"pm list packages -3"');
  });

  it('explains an empty app list rather than showing a blank dialog', () => {
    const dialog = byName(model, 'DialogMessage').find((b) =>
      renderExpression(b.raw.message as never).includes('replaceAll'),
    )!;
    const message = renderExpression(dialog.raw.message as never);
    // `||` yields the left operand only when truthy, and empty text is false.
    expect(message).toMatch(/^replaceAll\(trim\(usageRaw\)/);
    expect(message).toContain('usageExit');
    expect(message).toContain('usageStderr');
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
