/**
 * The correctness proof for the codec: any `.flo` file we can read must
 * re-serialize byte-for-byte, otherwise the app would reject our output or,
 * worse, silently load a corrupted flow.
 *
 * Real-world fixtures are not committed (they are users' personal flows).
 * Point FLO_FIXTURES at a directory of `.flo` files to exercise them:
 *
 *   FLO_FIXTURES=~/my-flows npm test
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_VERSION, parseFlo, writeFlo } from '../src/flo/codec';
import { createBlock, emptyModel, fromModel, toModel, connect } from '../src/flo/model';

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

describe('flo codec', () => {
  it('round-trips a synthesized flow byte-for-byte', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const delay = createBlock(model, 1046 /* Delay */, 4, 6);
    const toast = createBlock(model, 1120 /* ToastShow */, 4, 12);
    connect(model, begin.id, 'onComplete', delay.id);
    connect(model, delay.id, 'onComplete', toast.id);

    const bytes = fromModel(model);
    const reparsed = toModel(bytes);
    expect(reparsed.blocks).toHaveLength(3);
    expect(writeFlo(parseFlo(bytes))).toEqual(bytes);
  });

  it('preserves block graph structure across a model round-trip', () => {
    const model = emptyModel();
    const a = model.blocks[0];
    const b = createBlock(model, 1058 /* ExpressionDecision */, 4, 6);
    const yes = createBlock(model, 1120 /* ToastShow */, 4, 12);
    const no = createBlock(model, 1120 /* ToastShow */, 10, 12);
    connect(model, a.id, 'onComplete', b.id);
    connect(model, b.id, 'onPositive', yes.id);
    connect(model, b.id, 'onNegative', no.id);

    const again = toModel(fromModel(model));
    expect(again.blocks).toHaveLength(4);
    const ports = again.connections.filter((c) => c.from === b.id).map((c) => c.port).sort();
    expect(ports).toEqual(['onNegative', 'onPositive']);
  });

  const files = fixtureFiles();
  const maybe = files.length ? it : it.skip;

  maybe('round-trips real .flo fixtures byte-for-byte', () => {
    for (const path of files) {
      const original = new Uint8Array(readFileSync(path));
      const flow = parseFlo(original);
      const rewritten = writeFlo(flow);
      expect(rewritten, `${path} did not round-trip`).toEqual(original);
    }
  });

  maybe('exposes every block of real fixtures through the model', () => {
    for (const path of files) {
      const data = new Uint8Array(readFileSync(path));
      const model = toModel(data);
      expect(model.blocks.length, `${path} produced no blocks`).toBeGreaterThan(0);
      for (const block of model.blocks) {
        expect(block.entry, `${path}: block type ${block.typeId} missing from catalog`).toBeTruthy();
      }
    }
  });
});

describe('editing fidelity', () => {
  const files = fixtureFiles();
  const maybe = files.length ? it : it.skip;

  maybe('load -> save with no edits reproduces the file exactly', () => {
    // This is the path the editor itself takes, and a stronger claim than the
    // codec test: it also covers back-reference renumbering and statement
    // ordering after the graph has been flattened into blocks and rebuilt.
    for (const path of files) {
      const original = new Uint8Array(readFileSync(path));
      const rewritten = fromModel(toModel(original));
      expect(rewritten, `${path} changed when opened and saved untouched`).toEqual(original);
    }
  });

  maybe('an edit changes only what was edited', () => {
    for (const path of files) {
      const original = new Uint8Array(readFileSync(path));
      const before = toModel(original);
      const edited = toModel(original);

      // Move exactly one block by one grid cell.
      const target = edited.blocks[Math.floor(edited.blocks.length / 2)];
      const targetId = target.id;
      target.x += 1;

      const after = toModel(fromModel(edited));

      expect(after.blocks.length).toBe(before.blocks.length);
      expect(after.connections.length).toBe(before.connections.length);

      const beforeById = new Map(before.blocks.map((b) => [b.id, b]));
      for (const b of after.blocks) {
        const was = beforeById.get(b.id)!;
        expect(was, `block ${b.id} appeared from nowhere`).toBeTruthy();
        expect(b.typeId).toBe(was.typeId);
        if (b.id === targetId) {
          expect(b.x).toBe(was.x + 1);
        } else {
          expect(b.x, `block ${b.id} moved unexpectedly`).toBe(was.x);
        }
        expect(b.y).toBe(was.y);
      }
    }
  });
});

describe('format version handling', () => {
  it('refuses a flow newer than the schema understands', () => {
    // A reader that guessed at unknown fields would desynchronise and quietly
    // misread the rest of the flow, so a newer version must be rejected.
    const model = emptyModel();
    const bytes = fromModel(model);
    const tampered = new Uint8Array(bytes);
    new DataView(tampered.buffer).setUint16(4, CURRENT_VERSION + 1, false);
    expect(() => parseFlo(tampered)).toThrow(/only understands up to/);
  });

  it('preserves the version a flow arrived with', () => {
    // Saving must not silently upgrade an old flow, which is what keeps
    // round-tripping byte-exact for files from older Automate releases.
    const model = emptyModel();
    model.version = 85;
    expect(parseFlo(fromModel(model)).version).toBe(85);
  });
});
