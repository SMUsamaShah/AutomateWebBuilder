/**
 * Editable flow model.
 *
 * `codec.ts` gives back the raw object graph exactly as the app stores it:
 * statements reference their successors directly, and repeated references are
 * encoded as back-references into stream order. That shape is awkward to edit,
 * so this module flattens it into a list of blocks addressed by statement id
 * plus explicit connections, and can rebuild the graph for saving.
 *
 * Round-trip fidelity is preserved by keeping each block's original object and
 * mutating it in place, so fields we never surface in the UI are written back
 * untouched.
 */

import { CURRENT_VERSION, parseFlo, schema, writeFlo } from './codec';
import { fieldKind } from './blocks';
import { catalog } from './catalog';
import type {
  CatalogEntry,
  Flow,
  FloObject,
  FloValue,
  WireOp,
} from './types';

// Re-exported so existing imports of `catalog` from this module keep working.
export { catalog };

/** Statement ids are 64-bit in the format; the UI works with them as strings. */
export type BlockId = string;

export interface Connection {
  from: BlockId;
  /** Field name on the source block, e.g. `onComplete`, `onPositive`. */
  port: string;
  to: BlockId;
}

export interface Block {
  id: BlockId;
  typeId: number;
  /** Grid cell coordinates, exactly as the app stores them. */
  x: number;
  y: number;
  /** Live reference into the object graph; edits here are what get saved. */
  raw: FloObject;
  entry?: CatalogEntry;
}

export interface FlowModel {
  version: number;
  nextId: bigint;
  blocks: Block[];
  connections: Connection[];
  /** Statement-id order of the original top-level list, to keep saves stable. */
  order: BlockId[];
}

/** Field names holding the statement id / cell coordinates on every block. */
const F_ID = 'f15575X';
const F_X = 'f15576Y';
const F_Y = 'f15577Z';

function isObject(v: unknown): v is FloObject {
  return typeof v === 'object' && v !== null && typeof (v as FloObject)._type === 'number';
}

function isStatement(v: unknown): v is FloObject {
  return isObject(v) && v._type >= 1000;
}

/** Ops that carry a reference to another statement (a flow connection). */
export function portOps(typeId: number): WireOp[] {
  const rec = schema[String(typeId)];
  if (!rec?.ops) return [];
  return rec.ops.filter(
    (op) => op.op === 'obj' && op.cast === 'com.llamalab.automate.InterfaceC1482k2',
  );
}

/**
 * Resolve back-references and collect every statement object in the graph.
 * Objects are numbered in the order the decoder created them, which is the
 * same order the encoder will re-number them in.
 */
function resolveGraph(flow: Flow): FloObject[] {
  const ordered: FloObject[] = [];
  const seen = new Set<FloObject>();

  // Rebuild stream order by walking the graph the same way the decoder did.
  const walk = (v: FloValue): void => {
    if (!isObject(v)) return;
    if (seen.has(v)) return;
    seen.add(v);
    ordered.push(v);
    const rec = schema[String(v._type)];
    if (rec?.kind === 'struct') {
      for (const op of rec.ops ?? []) {
        const val = v[op.f];
        if (op.op === 'obj') walk(val as FloValue);
        else if (op.op === 'objarray' || op.op === 'varargs') {
          const box = val as { _arr?: FloValue[]; _varargs2?: FloValue[] } | undefined;
          for (const it of box?._arr ?? box?._varargs2 ?? []) walk(it);
        } else if (op.op === 'kvpairs') {
          for (const [a, b] of (val as { _kv?: Array<[FloValue, FloValue, number]> })?._kv ?? []) {
            walk(a);
            walk(b);
          }
        }
      }
    } else if (rec?.kind === 'objarray' || rec?.builtin === 'array' || rec?.builtin === 'list_expr') {
      for (const it of (v.items as FloValue[]) ?? []) walk(it);
    } else if (rec?.builtin === 'dict') {
      for (const [, val] of (v.items as Array<[string, FloValue, number]>) ?? []) walk(val);
    } else if (rec?.builtin === 'interp_string') {
      for (const e of (v.exprs as FloValue[]) ?? []) walk(e);
    }
  };

  for (const s of flow.statements) walk(s);
  return ordered;
}

/** Replace `{_ref: n}` placeholders with the object they point at. */
function inlineRefs(flow: Flow): void {
  const ordered = resolveGraph(flow);
  const deref = (v: FloValue): FloValue => {
    if (v && typeof v === 'object' && '_ref' in (v as object)) {
      const idx = (v as { _ref: number })._ref;
      const target = ordered[idx];
      if (!target) throw new Error(`dangling back-reference #${idx}`);
      return target;
    }
    return v;
  };

  for (const obj of ordered) {
    const rec = schema[String(obj._type)];
    if (rec?.kind === 'struct') {
      for (const op of rec.ops ?? []) {
        const val = obj[op.f];
        if (op.op === 'obj') obj[op.f] = deref(val as FloValue);
        else if (op.op === 'objarray' || op.op === 'varargs') {
          const box = val as { _arr?: FloValue[]; _varargs2?: FloValue[] } | undefined;
          if (box?._arr) box._arr = box._arr.map(deref);
          if (box?._varargs2) box._varargs2 = box._varargs2.map(deref);
        } else if (op.op === 'kvpairs') {
          const box = val as { _kv?: Array<[FloValue, FloValue, number]> } | undefined;
          if (box?._kv) box._kv = box._kv.map(([a, b, c]) => [deref(a), deref(b), c]);
        }
      }
    } else if (rec?.kind === 'objarray' || rec?.builtin === 'array' || rec?.builtin === 'list_expr') {
      obj.items = ((obj.items as FloValue[]) ?? []).map(deref);
    } else if (rec?.builtin === 'dict') {
      obj.items = ((obj.items as Array<[string, FloValue, number]>) ?? []).map(
        ([k, v, c]) => [k, deref(v), c] as [string, FloValue, number],
      );
    } else if (rec?.builtin === 'interp_string') {
      obj.exprs = ((obj.exprs as FloValue[]) ?? []).map(deref);
    }
  }

  // Top-level list may itself contain back-references.
  flow.statements = flow.statements.map(deref);
}

/** Build the editable model from decoded `.flo` bytes. */
export function toModel(data: Uint8Array): FlowModel {
  const flow = parseFlo(data);
  inlineRefs(flow);

  const blocks: Block[] = [];
  const byObject = new Map<FloObject, Block>();
  const order: BlockId[] = [];

  for (const s of resolveGraph(flow)) {
    if (!isStatement(s)) continue;
    const id = String(s[F_ID] as bigint);
    const block: Block = {
      id,
      typeId: s._type,
      x: Number(s[F_X] ?? 0),
      y: Number(s[F_Y] ?? 0),
      raw: s,
      entry: catalog[String(s._type)],
    };
    blocks.push(block);
    byObject.set(s, block);
  }

  for (const s of flow.statements) {
    if (isStatement(s)) order.push(String(s[F_ID] as bigint));
  }

  const connections: Connection[] = [];
  for (const b of blocks) {
    for (const op of portOps(b.typeId)) {
      const target = b.raw[op.f];
      if (isStatement(target)) {
        const to = byObject.get(target);
        if (to) connections.push({ from: b.id, port: op.f, to: to.id });
      }
    }
  }

  return { version: flow.version, nextId: flow.nextId, blocks, connections, order };
}

/** Serialize the model back to `.flo` bytes. */
export function fromModel(model: FlowModel): Uint8Array {
  const byId = new Map<BlockId, Block>(model.blocks.map((b) => [b.id, b]));

  // Push UI-owned values (position, id) and connections back into the raw graph.
  for (const b of model.blocks) {
    b.raw[F_ID] = BigInt(b.id);
    b.raw[F_X] = b.x;
    b.raw[F_Y] = b.y;
    for (const op of portOps(b.typeId)) b.raw[op.f] = null;
  }
  for (const c of model.connections) {
    const from = byId.get(c.from);
    const to = byId.get(c.to);
    if (from && to) from.raw[c.port] = to.raw;
  }

  // Preserve the original top-level ordering where possible; append new blocks.
  const emitted = new Set<BlockId>();
  const statements: FloValue[] = [];
  for (const id of model.order) {
    const b = byId.get(id);
    if (b && !emitted.has(id)) {
      emitted.add(id);
      statements.push(b.raw);
    }
  }
  for (const b of model.blocks) {
    if (!emitted.has(b.id)) {
      emitted.add(b.id);
      statements.push(b.raw);
    }
  }

  return writeFlo({ version: model.version, nextId: model.nextId, statements });
}

/** Allocate the next free statement id and bump the counter. */
export function allocateId(model: FlowModel): BlockId {
  let next = model.nextId;
  const used = new Set(model.blocks.map((b) => b.id));
  while (used.has(String(next))) next += 1n;
  model.nextId = next + 1n;
  return String(next);
}

/** Create a new block of the given type with default (null) fields. */
export function createBlock(model: FlowModel, typeId: number, x: number, y: number): Block {
  const rec = schema[String(typeId)];
  if (!rec) throw new Error(`unknown block type ${typeId}`);
  const raw: FloObject = { _type: typeId };
  for (const op of rec.ops ?? []) {
    switch (op.op) {
      case 'obj':
        raw[op.f] = null;
        break;
      case 'objarray':
      case 'varargs':
        raw[op.f] = { _arr: [] };
        break;
      case 'kvpairs':
        raw[op.f] = { _kv: [] };
        break;
      case 'utf':
      case 'utf_null':
        raw[op.f] = null;
        break;
      case 'svar64':
      case 'i64':
        raw[op.f] = 0n;
        break;
      case 'parcel':
        raw[op.f] = { _parcel: '' };
        break;
      case 'convtype':
        raw[op.f] = { _ct: 0 };
        break;
      default:
        raw[op.f] = 0;
    }
  }
  const id = allocateId(model);
  raw[F_ID] = BigInt(id);
  raw[F_X] = x;
  raw[F_Y] = y;
  const block: Block = { id, typeId, x, y, raw, entry: catalog[String(typeId)] };
  model.blocks.push(block);
  model.order.push(id);
  return block;
}

export function deleteBlock(model: FlowModel, id: BlockId): void {
  model.blocks = model.blocks.filter((b) => b.id !== id);
  model.connections = model.connections.filter((c) => c.from !== id && c.to !== id);
  model.order = model.order.filter((o) => o !== id);
}

export function connect(model: FlowModel, from: BlockId, port: string, to: BlockId): void {
  model.connections = model.connections.filter((c) => !(c.from === from && c.port === port));
  model.connections.push({ from, port, to });
}

export function disconnect(model: FlowModel, from: BlockId, port: string): void {
  model.connections = model.connections.filter((c) => !(c.from === from && c.port === port));
}

/**
 * Check every block's arguments against the types the app will cast them to.
 *
 * The app reads an argument and immediately casts it, so a numeric *expression*
 * where a boxed `Integer` is required throws when Automate loads the flow — a
 * failure that only shows up on the phone. This catches it before saving.
 *
 * Returns human-readable problems; an empty array means nothing detectable is
 * wrong. Run it before writing a file you did not simply round-trip.
 */
export function validateModel(model: FlowModel): string[] {
  const problems: string[] = [];
  const ids = new Set(model.blocks.map((b) => b.id));

  const typeOf = (v: unknown): number | null =>
    v && typeof v === 'object' && typeof (v as FloObject)._type === 'number'
      ? (v as FloObject)._type
      : null;

  for (const b of model.blocks) {
    const where = `#${b.id} ${b.entry?.name ?? b.typeId}`;
    for (const op of schema[String(b.typeId)].ops ?? []) {
      const value = b.raw[op.f];
      if (value === null || value === undefined) continue;
      const kind = fieldKind(b.typeId, op.f);
      const t = typeOf(value);

      if (kind === 'variable' && op.op === 'obj' && t !== 102) {
        problems.push(`${where}.${op.f} must be a variable reference (variableRef), got type ${t}`);
      } else if (kind === 'integer' && t !== 16) {
        problems.push(`${where}.${op.f} must be a boxed Integer (integerBox), got type ${t}`);
      } else if (kind === 'statement' && t !== null && t < 1000) {
        problems.push(`${where}.${op.f} is a port; connect() it instead of assigning type ${t}`);
      } else if (kind === 'variable' && op.op === 'objarray') {
        for (const item of (value as { _arr?: unknown[] })?._arr ?? []) {
          if (typeOf(item) !== 102) {
            problems.push(`${where}.${op.f} entries must be variable references`);
            break;
          }
        }
      }

      // A field gated above this flow's version is silently dropped on save.
      // Two exclusions keep this from crying wolf: `_anon*` names are internal
      // placeholders for values the app reads and discards, and a field often has
      // one op per format era — if any of them is active, the value is written.
      const activeElsewhere = (schema[String(b.typeId)].ops ?? []).some(
        (other) =>
          other.f === op.f &&
          (other.min ?? 0) <= model.version &&
          model.version <= (other.max ?? Number.MAX_SAFE_INTEGER),
      );
      if ((op.min ?? 0) > model.version && !op.f.startsWith('_anon') && !activeElsewhere) {
        problems.push(
          `${where}.${op.f} needs format v${op.min} but the flow is v${model.version}; ` +
            `it will not be saved (raise model.version to ${CURRENT_VERSION} if intended)`,
        );
      }
    }
  }

  for (const c of model.connections) {
    if (!ids.has(c.from) || !ids.has(c.to)) {
      problems.push(`connection ${c.from} --${c.port}--> ${c.to} references a missing block`);
    }
  }
  return problems;
}

/** An empty flow containing a single "Flow beginning" block. */
export function emptyModel(): FlowModel {
  const model: FlowModel = {
    version: CURRENT_VERSION,
    nextId: 1n,
    blocks: [],
    connections: [],
    order: [],
  };
  createBlock(model, 1072 /* FlowBeginning */, 4, 0);
  return model;
}
