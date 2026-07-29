import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toModel, fromModel, emptyModel, createBlock, connect } from '../src/flo/model';
import { toJsonFlow, fromJsonFlow } from '../src/flo/json';
import { parseFlo } from '../src/flo/codec';

function fixtureFiles(): string[] {
  const dir = process.env.FLO_FIXTURES;
  if (!dir) return [];
  try { if (!statSync(dir).isDirectory()) return []; } catch { return []; }
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.flo')).map((f) => join(dir, f));
}

describe('JSON projection', () => {
  it('survives a JSON round-trip with structure intact', () => {
    const model = emptyModel();
    const begin = model.blocks[0];
    const decide = createBlock(model, 1058, 4, 6);
    const yes = createBlock(model, 1120, 4, 12);
    connect(model, begin.id, 'onComplete', decide.id);
    connect(model, decide.id, 'onPositive', yes.id);

    const json = toJsonFlow(model);
    expect(json.format).toBe('automate-web-builder/flow@1');
    expect(json.blocks).toHaveLength(3);

    const back = fromJsonFlow(json);
    expect(back.blocks).toHaveLength(3);
    expect(back.connections).toHaveLength(2);
    // The rebuilt flow must still be writable as a valid .flo.
    expect(() => parseFlo(fromModel(back))).not.toThrow();
  });

  it('rejects documents that are not flows', () => {
    expect(() => fromJsonFlow({} as never)).toThrow(/blocks/);
  });

  const files = fixtureFiles();
  const maybe = files.length ? it : it.skip;

  maybe('projects real flows to JSON and back into loadable flows', () => {
    for (const path of files) {
      const model = toModel(new Uint8Array(readFileSync(path)));
      const json = toJsonFlow(model);
      expect(json.blocks.length).toBe(model.blocks.length);
      const back = fromJsonFlow(json);
      expect(back.blocks.length).toBe(model.blocks.length);
      // Every connection must survive the projection.
      expect(back.connections.length).toBe(model.connections.length);
      expect(() => parseFlo(fromModel(back))).not.toThrow();
    }
  });
});
