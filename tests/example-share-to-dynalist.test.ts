/**
 * Guards `examples/share-to-dynalist.ts`.
 *
 * This flow sits in the share sheet and posts to a live API with a secret. The
 * failures that matter are invisible from here unless they are pinned: a token
 * that travels with the file, a fiber that stops and drops out of the sheet,
 * a discarded response that makes the success check read nothing.
 */

import { describe, expect, it } from 'vitest';
import { buildFlow } from '../examples/share-to-dynalist';
import { fromModel, toModel, validateModel } from '../src/flo/model';
import { lintFlow } from '../src/flo/lint';
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
const target = (from: Block, port: string): Block | undefined => {
  const edge = model.connections.find((c) => c.from === from.id && c.port === port);
  return model.blocks.find((b) => b.id === edge?.to);
};

describe('share to Dynalist example', () => {
  it('passes the same validation and lint the guide tells agents to run', () => {
    expect(validateModel(model)).toEqual([]);
    expect(lintFlow(model).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('survives a save/load round trip', () => {
    const reloaded = toModel(fromModel(model));
    expect(reloaded.blocks.length).toBe(model.blocks.length);
    expect(reloaded.connections.length).toBe(model.connections.length);
  });

  it('keeps the API token out of the flow file', () => {
    // The token lives in a per-flow directory the file never carries. A literal
    // anywhere in the encoded bytes would ship it to whoever gets the .flo.
    const text = Buffer.from(fromModel(model)).toString('latin1');
    expect(text).not.toMatch(/dynalist\.io\/api\/v1\/inbox\/add\?/);
    const ask = only(model, 'DialogInput');
    expect(renderExpression(ask.raw.varResultText as never)).toBe('dynalistToken');
    const write = only(model, 'FileWrite');
    expect(renderExpression(write.raw.targetFile as never)).toBe('tokenFile');
  });

  it('creates the private directory before writing into it', () => {
    // storage() returns a path that need not exist; the first write into a
    // fresh flow directory fails with NoSuchFileException without this.
    const write = only(model, 'FileWrite');
    const mkdir = only(model, 'FileMakeDirectory');
    expect(target(mkdir, 'onComplete')?.id).toBe(write.id);
    expect(target(only(model, 'DialogInput'), 'onPositive')?.id).toBe(mkdir.id);
  });

  it('checks for the token now instead of waiting for it to appear', () => {
    // continuity defaults to 1, "when changed" — on a first run that waits
    // forever for a file only this flow can create.
    // continuity is a boxed Integer, not an expression — see the catalog cast.
    const exists = only(model, 'FileExists');
    expect(exists.raw.continuity).toEqual({ _type: 16, value: 0 });
  });

  it('shows the token dialog as a window rather than a notification', () => {
    expect(renderExpression(only(model, 'DialogInput').raw.startActivity as never)).toBe('1');
  });

  it('keeps the response so the success check has something to read', () => {
    // saveResponse defaults to 0, which discards the body — and Dynalist
    // answers 200 even when it refuses the item, so the body is the verdict.
    const post = only(model, 'HttpRequest');
    expect(renderExpression(post.raw.saveResponse as never)).toBe('1');
    expect(renderExpression(post.raw.varResponseBody as never)).toBe('httpBody');
    expect(renderExpression(only(model, 'ExpressionDecision').raw.expression as never)).toBe(
      'httpCode = 200 && jsonDecode(httpBody)["_code"] = "OK"',
    );
  });

  it('logs the whole reply on both failure paths, and never the request', () => {
    // A toast is gone in seconds and truncated; the reason for a refusal is a
    // word in the reply body. The request body holds the token, so it stays out.
    const logs = byName(model, 'LogAppend');
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      const message = renderExpression(log.raw.message as never);
      expect(message).not.toContain('dynalistToken');
      expect(renderExpression(log.raw.whenLogging as never)).toBe('0');
    }

    const decision = only(model, 'ExpressionDecision');
    const refusedLog = target(decision, 'onNegative')!;
    expect(refusedLog.entry?.name).toBe('LogAppend');
    expect(renderExpression(refusedLog.raw.message as never)).toContain('trim(httpBody)');
    expect(target(refusedLog, 'onComplete')?.entry?.name).toBe('ToastShow');

    const unreachableLog = target(only(model, 'FailureCatch'), 'onFailure')!;
    expect(unreachableLog.entry?.name).toBe('LogAppend');
    expect(renderExpression(unreachableLog.raw.message as never)).toContain('shareError');
    expect(target(unreachableLog, 'onComplete')?.entry?.name).toBe('ToastShow');
  });

  it('returns to the share block from every ending, so the sheet keeps working', () => {
    // Any path that runs off the end stops the fiber, and the flow disappears
    // from the share sheet until it is started again by hand.
    const share = only(model, 'ContentShared');
    const toasts = byName(model, 'ToastShow');
    expect(toasts.length).toBeGreaterThan(2);
    for (const toast of toasts) {
      expect(target(toast, 'onComplete')?.id, renderExpression(toast.raw.message as never)).toBe(
        share.id,
      );
    }
    expect(renderExpression(share.raw.mimeType as never)).toBe('"text/*"');
  });

  it('leaves no block unreachable from the flow beginning', () => {
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const c of model.connections) if (c.from === id) walk(c.to);
    };
    walk(only(model, 'FlowBeginning').id);
    expect(model.blocks.filter((b) => !seen.has(b.id)).map((b) => b.id)).toEqual([]);
  });
});
