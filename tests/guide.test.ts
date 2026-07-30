/**
 * Executes the recipes in `docs/LLM-GUIDE.md`.
 *
 * That guide is written to be handed to an AI agent instead of the source, so a
 * stale example is worse than no example — it would be followed literally. If an
 * API changes, these fail and the guide gets corrected with it.
 */

import { describe, expect, it } from 'vitest';
import {
  catalog,
  connect,
  createBlock,
  deleteBlock,
  disconnect,
  emptyModel,
  fromModel,
  toModel,
  validateModel,
} from '../src/flo/model';
import { editableFields, fieldKind, outputPorts } from '../src/flo/blocks';
import { parseExpression, ExpressionError } from '../src/flo/exprparse';
import {
  integerBox,
  numberLiteral,
  renderExpression,
  stringLiteral,
  variableRef,
} from '../src/flo/expr';
import { CURRENT_VERSION, parseFlo } from '../src/flo/codec';

const idByName = new Map(
  Object.entries(catalog).map(([tid, e]) => [e.name, Number(tid)]),
);

describe('LLM-GUIDE §4 — finding type ids, fields and ports', () => {
  it('resolves the type ids the guide tabulates', () => {
    expect(idByName.get('Delay')).toBe(1046);
    expect(idByName.get('ToastShow')).toBe(1120);
    expect(idByName.get('LogAppend')).toBe(1093);
    expect(idByName.get('ExpressionDecision')).toBe(1058);
    expect(idByName.get('DialogChoice')).toBe(1052);
    expect(idByName.get('AdbShellCommand')).toBe(1342);
    expect(idByName.get('FlowBeginning')).toBe(1072);
    expect(idByName.get('ForEach')).toBe(1073);
    expect(idByName.get('FailureCatch')).toBe(1263);
  });

  it('lists the fields and ports the guide tabulates', () => {
    expect(editableFields(1046).map((f) => f.name)).toEqual([
      'continuity',
      'wakeup',
      'duration',
    ]);
    expect(editableFields(1120).map((f) => f.name)).toEqual([
      'continuity',
      'message',
      'duration',
    ]);
    expect(editableFields(1093).map((f) => f.name)).toEqual(['message', 'whenLogging']);
    expect(editableFields(1058).map((f) => f.name)).toEqual(['expression']);

    expect(outputPorts(1046).map((p) => [p.label, p.field])).toEqual([['OK', 'onComplete']]);
    expect(outputPorts(1058).map((p) => [p.label, p.field])).toEqual([
      ['YES', 'onPositive'],
      ['NO', 'onNegative'],
    ]);
    expect(outputPorts(1072).map((p) => [p.label, p.field])).toEqual([['GO', 'onComplete']]);
    expect(outputPorts(1073).map((p) => [p.label, p.field])).toEqual([
      ['OK', 'onComplete'],
      ['DO', 'onEachElement'],
    ]);
    expect(outputPorts(1263).map((p) => [p.label, p.field])).toEqual([
      ['OK', 'onComplete'],
      ['FAIL', 'onFailure'],
    ]);
  });

  it('finds blocks by human title, as the search snippet does', () => {
    const hits = Object.entries(catalog)
      .filter(([, e]) => (e.title ?? '').toLowerCase().includes('toast'))
      .map(([tid]) => Number(tid));
    expect(hits).toContain(1120);
  });

  it('documents FlowBeginning.title as plain text, not an expression', () => {
    const title = editableFields(1072).find((f) => f.name === 'title');
    expect(title?.op).toBe('utf_null');
  });
});

describe('LLM-GUIDE §5 — setting field values', () => {
  it('assigns expressions, literals and variable targets', () => {
    const model = emptyModel();
    const toast = createBlock(model, 1120, 4, 6);

    toast.raw.message = parseExpression('"Done in {minutes} min"');
    expect(renderExpression(toast.raw.message as never)).toBe('"Done in {minutes} min"');

    toast.raw.duration = parseExpression('selectedTime * 60');
    expect(renderExpression(toast.raw.duration as never)).toBe('selectedTime * 60');

    toast.raw.message = stringLiteral('plain text');
    expect(renderExpression(toast.raw.message as never)).toBe('"plain text"');

    toast.raw.duration = numberLiteral(30);
    expect(renderExpression(toast.raw.duration as never)).toBe('30');

    const adb = createBlock(model, 1342, 4, 12);
    adb.raw.varStdout = variableRef('out');
    expect(renderExpression(adb.raw.varStdout as never)).toBe('out');

    toast.raw.message = null;
    expect(renderExpression(toast.raw.message as never)).toBe('');
  });

  it('assigns plain text to a utf_null field', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    begin.raw.title = 'My flow';
    expect(toModel(fromModel(model)).blocks[0].raw.title).toBe('My flow');
  });

  it('throws on invalid expression source rather than storing text', () => {
    expect(() => parseExpression('1 +')).toThrow(ExpressionError);
  });
});

describe('LLM-GUIDE §6/§7 — connections and edits', () => {
  it('connects, replaces and disconnects ports', () => {
    const model = emptyModel();
    const a = createBlock(model, 1058, 4, 6);
    const b = createBlock(model, 1120, 4, 12);
    const c = createBlock(model, 1120, 12, 12);

    connect(model, a.id, 'onPositive', b.id);
    connect(model, a.id, 'onNegative', c.id);
    expect(model.connections.filter((x) => x.from === a.id)).toHaveLength(2);

    // A port holds at most one target; connecting again replaces it.
    connect(model, a.id, 'onPositive', c.id);
    expect(model.connections.filter((x) => x.from === a.id && x.port === 'onPositive'))
      .toHaveLength(1);

    disconnect(model, a.id, 'onNegative');
    expect(model.connections.some((x) => x.from === a.id && x.port === 'onNegative')).toBe(false);
  });

  it('rule 3: assigning a port field directly is discarded', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const toast = createBlock(model, 1120, 4, 6);

    // The tempting wrong way.
    begin.raw.onComplete = toast.raw;
    expect(toModel(fromModel(model)).connections).toHaveLength(0);

    // The documented way.
    connect(model, begin.id, 'onComplete', toast.id);
    expect(toModel(fromModel(model)).connections).toHaveLength(1);
  });

  it('inserts a block into an existing chain, re-linking the tail', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const tail = createBlock(model, 1046, 4, 12);
    connect(model, begin.id, 'onComplete', tail.id);

    const next = model.connections.find(
      (c) => c.from === begin.id && c.port === 'onComplete',
    );
    const toast = createBlock(model, 1120, begin.x, begin.y + 6);
    toast.raw.message = parseExpression('"Session over"');
    connect(model, begin.id, 'onComplete', toast.id);
    if (next) connect(model, toast.id, 'onComplete', next.to);

    const again = toModel(fromModel(model));
    const chain = (id: string, port: string) =>
      again.connections.find((c) => c.from === id && c.port === port)?.to;
    expect(chain(begin.id, 'onComplete')).toBe(toast.id);
    expect(chain(toast.id, 'onComplete')).toBe(tail.id);
  });

  it('bridges around a deleted mid-chain block', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const victim = createBlock(model, 1046, 4, 6);
    const tail = createBlock(model, 1120, 4, 12);
    connect(model, begin.id, 'onComplete', victim.id);
    connect(model, victim.id, 'onComplete', tail.id);

    const inbound = model.connections.filter((c) => c.to === victim.id);
    const outbound = model.connections.find(
      (c) => c.from === victim.id && c.port === 'onComplete',
    );
    for (const c of inbound) if (outbound) connect(model, c.from, c.port, outbound.to);
    deleteBlock(model, victim.id);

    const again = toModel(fromModel(model));
    expect(again.blocks.map((b) => b.id)).not.toContain(victim.id);
    expect(again.connections.find((c) => c.from === begin.id)?.to).toBe(tail.id);
  });

  it('finds unreachable blocks with the dead-block walk', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const live = createBlock(model, 1120, 4, 6);
    const orphan = createBlock(model, 1120, 20, 6);
    connect(model, begin.id, 'onComplete', live.id);

    const reachable = new Set<string>();
    const walk = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      for (const c of model.connections) if (c.from === id) walk(c.to);
    };
    for (const b of model.blocks) if (b.entry?.layout === 'block_beginning') walk(b.id);

    expect(model.blocks.filter((b) => !reachable.has(b.id)).map((b) => b.id)).toEqual([
      orphan.id,
    ]);
  });
});

describe('LLM-GUIDE §9 — pitfalls', () => {
  it('preserves the format version rather than upgrading it', () => {
    const model = emptyModel();
    model.version = 85;
    expect(parseFlo(fromModel(model)).version).toBe(85);
  });

  it('refuses a file newer than CURRENT_VERSION', () => {
    const bytes = fromModel(emptyModel());
    const tampered = new Uint8Array(bytes);
    new DataView(tampered.buffer).setUint16(4, CURRENT_VERSION + 1, false);
    expect(() => toModel(tampered)).toThrow(/only understands up to/);
  });

  it('exposes statement ids as strings on the model', () => {
    const model = emptyModel();
    expect(typeof model.blocks[0].id).toBe('string');
  });
});

describe('LLM-GUIDE §11 — the complete example', () => {
  it('runs end to end and verifies before saving', () => {
    // Build a stand-in for the user's flow: begin -> wait.
    const model = emptyModel();
    const begin = model.blocks[0];
    const wait = createBlock(model, 1046, 4, 12);
    wait.raw.duration = parseExpression('selectedTime * 60');
    connect(model, begin.id, 'onComplete', wait.id);
    const before = model.blocks.length;

    const inbound = model.connections.filter((c) => c.to === wait.id);
    const toast = createBlock(model, idByName.get('ToastShow')!, wait.x, wait.y - 6);
    toast.raw.message = parseExpression('"{selectedTime} minutes starting now"');
    toast.raw.duration = parseExpression('3.5');
    for (const c of inbound) connect(model, c.from, c.port, toast.id);
    connect(model, toast.id, 'onComplete', wait.id);

    const bytes = fromModel(model);
    const reloaded = toModel(bytes);
    expect(reloaded.blocks.length).toBe(before + 1);

    const path = (id: string) =>
      reloaded.connections.find((c) => c.from === id)?.to;
    expect(path(begin.id)).toBe(toast.id);
    expect(path(toast.id)).toBe(wait.id);
    expect(
      renderExpression(reloaded.blocks.find((b) => b.id === toast.id)!.raw.message as never),
    ).toBe('"{selectedTime} minutes starting now"');
  });
});

describe('LLM-GUIDE §5 — field kinds are the rule, not op alone', () => {
  it('classifies the fields the guide calls out', () => {
    expect(fieldKind(1046, 'duration')).toBe('expression');
    expect(fieldKind(1046, 'continuity')).toBe('integer');
    expect(fieldKind(1342, 'varStdout')).toBe('variable');
    expect(fieldKind(1046, 'onComplete')).toBe('statement');
    expect(fieldKind(1072, 'title')).toBe('text');
    expect(fieldKind(1072, 'hidden')).toBe('flag');
    expect(fieldKind(1046, 'nosuchfield')).toBeNull();
  });

  it('catches an expression put where a boxed Integer is required', () => {
    // The app casts this field, so a numeric expression throws on load. This is
    // the single easiest mistake to make from the field list alone.
    const model = emptyModel();
    const delay = createBlock(model, 1046, 4, 6);
    delay.raw.continuity = numberLiteral(1);
    expect(validateModel(model).join('\n')).toMatch(/continuity must be a boxed Integer/);

    delay.raw.continuity = integerBox(1);
    expect(validateModel(model)).toEqual([]);
  });

  it('catches a non-variable in an assignment target', () => {
    const model = emptyModel();
    const adb = createBlock(model, 1342, 4, 6);
    adb.raw.varStdout = numberLiteral(5);
    expect(validateModel(model).join('\n')).toMatch(/varStdout must be a variable reference/);

    adb.raw.varStdout = variableRef('out');
    expect(validateModel(model)).toEqual([]);
  });

  it('catches a dangling connection', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const gone = createBlock(model, 1120, 4, 6);
    connect(model, begin.id, 'onComplete', gone.id);
    model.blocks = model.blocks.filter((b) => b.id !== gone.id); // wrong way to delete
    expect(validateModel(model).join('\n')).toMatch(/references a missing block/);
  });

  it('warns when a modern argument cannot be saved into an old flow', () => {
    const model = emptyModel();
    model.version = 85;
    const http = createBlock(model, 1087, 4, 6); // HttpRequest
    http.raw.alias = stringLiteral('cert'); // gated at v109
    expect(validateModel(model).join('\n')).toMatch(/needs format v109 but the flow is v85/);
  });
});

describe('LLM-GUIDE §9 — pitfalls that are checkable', () => {
  it('accepts negative grid coordinates', () => {
    const model = emptyModel();
    const b = createBlock(model, 1120, -3, -29);
    const again = toModel(fromModel(model)).blocks.find((x) => x.id === b.id)!;
    expect([again.x, again.y]).toEqual([-3, -29]);
  });

  it('hides _anon placeholder fields from the editable list', () => {
    for (const tid of Object.keys(catalog)) {
      const names = editableFields(Number(tid)).map((f) => f.name);
      expect(names.filter((n) => n.startsWith('_anon'))).toEqual([]);
    }
  });
});
