/**
 * Human- and LLM-readable JSON projection of a flow.
 *
 * The binary graph is hostile to reason about, so this renders a flow as a flat
 * list of blocks with named types, readable argument expressions and explicit
 * connections. It is the format to hand an AI agent when asking it to explain
 * or rewrite a flow.
 *
 * Importing is lossy by design: only blocks, positions, connections and simple
 * argument values survive. Round-tripping a `.flo` through JSON and back
 * produces a valid flow, but arguments that were complex expression trees come
 * back as text values unless they were left untouched.
 */

import { CURRENT_VERSION, schema } from './codec';
import { editableFields } from './blocks';
import { isExpression, renderExpression, stringLiteral } from './expr';
import { catalog, createBlock, connect } from './model';
import type { FlowModel } from './model';
import type { FloObject } from './types';

export interface JsonBlock {
  id: string;
  /** Block class name, e.g. `Delay`. */
  type: string;
  /** Registry id — authoritative if `type` is ambiguous. */
  typeId: number;
  title?: string;
  x: number;
  y: number;
  /** Argument name -> Automate expression source (or scalar). */
  args?: Record<string, string | number | boolean | null>;
  /** Port name -> target block id, e.g. `{ "onComplete": "12" }`. */
  next?: Record<string, string>;
}

export interface JsonFlow {
  format: 'automate-web-builder/flow@1';
  /** Serialization version the flow will be written with. */
  version: number;
  blocks: JsonBlock[];
}

/** Project a model into readable JSON. */
export function toJsonFlow(model: FlowModel): JsonFlow {
  const outgoing = new Map<string, Record<string, string>>();
  for (const c of model.connections) {
    const m = outgoing.get(c.from) ?? {};
    m[c.port] = c.to;
    outgoing.set(c.from, m);
  }

  const blocks: JsonBlock[] = model.blocks.map((b) => {
    const args: Record<string, string | number | boolean | null> = {};
    for (const f of editableFields(b.typeId)) {
      const v = b.raw[f.name];
      if (v === null || v === undefined) continue;
      if (isExpression(v)) {
        const text = renderExpression(v as never);
        if (text) args[f.name] = text;
      } else if (typeof v === 'string' || typeof v === 'number') {
        args[f.name] = v;
      } else if (typeof v === 'bigint') {
        args[f.name] = String(v);
      }
    }
    const next = outgoing.get(b.id);
    const out: JsonBlock = {
      id: b.id,
      type: b.entry?.name ?? `Type${b.typeId}`,
      typeId: b.typeId,
      x: b.x,
      y: b.y,
    };
    if (b.entry?.title) out.title = b.entry.title;
    if (Object.keys(args).length) out.args = args;
    if (next && Object.keys(next).length) out.next = next;
    return out;
  });

  return { format: 'automate-web-builder/flow@1', version: model.version, blocks };
}

const idByName = new Map<string, number>();
for (const [tid, entry] of Object.entries(catalog)) {
  idByName.set(entry.name, Number(tid));
}

/** Build a model from the JSON projection. */
export function fromJsonFlow(json: JsonFlow): FlowModel {
  if (!json || !Array.isArray(json.blocks)) {
    throw new Error('not a flow document (missing "blocks")');
  }

  const model: FlowModel = {
    version: json.version ?? CURRENT_VERSION,
    nextId: 1n,
    blocks: [],
    connections: [],
    order: [],
  };

  // Two passes: create every block first so connections can resolve forwards.
  const idMap = new Map<string, string>();
  for (const jb of json.blocks) {
    const typeId = jb.typeId ?? idByName.get(jb.type);
    if (!typeId || !schema[String(typeId)]) {
      throw new Error(`unknown block type "${jb.type}"`);
    }
    const block = createBlock(model, typeId, jb.x ?? 0, jb.y ?? 0);
    idMap.set(jb.id, block.id);

    for (const [name, value] of Object.entries(jb.args ?? {})) {
      if (value === null) continue;
      const op = (schema[String(typeId)].ops ?? []).find((o) => o.f === name);
      if (!op) continue;
      const raw = block.raw as FloObject;
      if (op.op === 'obj') raw[name] = stringLiteral(String(value));
      else if (op.op === 'utf' || op.op === 'utf_null') raw[name] = String(value);
      else if (op.op === 'svar64' || op.op === 'i64') raw[name] = BigInt(value as string);
      else if (typeof value === 'number') raw[name] = value;
      else if (typeof value === 'boolean') raw[name] = value ? 1 : 0;
    }
  }

  for (const jb of json.blocks) {
    const from = idMap.get(jb.id);
    if (!from) continue;
    for (const [port, targetId] of Object.entries(jb.next ?? {})) {
      const to = idMap.get(targetId);
      if (to) connect(model, from, port, to);
    }
  }

  return model;
}
