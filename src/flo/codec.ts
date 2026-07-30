/**
 * Reader and writer for the Automate `.flo` container.
 *
 * A `.flo` file is exactly the blob the app stores in its `flows.data` column:
 *
 *   magic  "LAFl"                     4 bytes
 *   version                           u16 big-endian
 *   nextStatementId                   zig-zag varint
 *   statementCount                    unsigned varint
 *   statements[]                      object graph, depth-first
 *
 * Objects are written as a zig-zag varint type id followed by that type's
 * payload. Zero means null. A negative id is a back-reference to the Nth
 * object already written (1-based, in stream order), which is how the app
 * encodes the flow's arbitrary graph shape without infinite recursion.
 *
 * Every field layout in `schema.json` was derived from the app's own
 * `z0`/`S` (read/write) methods, including their per-version gates, so the
 * same file can be decoded and re-encoded byte-for-byte.
 */

import { ByteReader, ByteWriter, bytesToHex, hexToBytes } from './binary';
import schemaJson from '../data/schema.json';
import type {
  ArrayBox,
  ConvTypeBox,
  Flow,
  FloObject,
  FloValue,
  KvBox,
  ParcelBox,
  Schema,
  SchemaEntry,
  Varargs2Box,
  WireOp,
} from './types';

export const schema = schemaJson as unknown as Schema;

const MAGIC = 0x4c41466c; // "LAFl"
/** Length-prefix for strings became a varint at this format version. */
const VARLEN_UTF_SINCE = 35;
/**
 * Format version written by Automate 1.51.x, and the newest this build can read.
 *
 * The app applies the same rule (`Q3.c.n` throws InvalidVersionException above
 * its own maximum) because a newer file may add fields to existing blocks, and
 * a reader that does not know about them would desynchronise mid-stream and
 * silently misread the rest of the flow. Refusing is the only safe response.
 *
 * Regenerating `schema.json` from a newer APK is what raises this: the highest
 * version gate in the schema is the version that build understands.
 */
export const CURRENT_VERSION = 112;
/** `I3.l`, a reference to a flow variable. See `Encoder.canonicalVariable`. */
export const VARIABLE_TYPE = 102;

export class FloFormatError extends Error {}

function entryFor(typeId: number): SchemaEntry {
  const rec = schema[String(typeId)];
  if (!rec) throw new FloFormatError(`unknown object type id ${typeId}`);
  return rec;
}

/** True when an op participates in the given format version. */
function opActive(op: WireOp, version: number): boolean {
  return (op.min ?? 0) <= version && version <= (op.max ?? Number.MAX_SAFE_INTEGER);
}

// ---------------------------------------------------------------- decoding

class Decoder {
  private readonly r: ByteReader;
  private readonly objects: FloObject[] = [];
  version = 0;
  private varlenUtf = false;

  constructor(data: Uint8Array) {
    this.r = new ByteReader(data);
  }

  get pos(): number {
    return this.r.pos;
  }

  get remaining(): number {
    return this.r.remaining;
  }

  header(): { version: number; nextId: bigint; count: number } {
    if (this.r.i32() !== MAGIC) throw new FloFormatError('not an Automate flow file (bad magic)');
    this.version = this.r.u16();
    if (this.version > CURRENT_VERSION) {
      throw new FloFormatError(
        `This flow was saved in format v${this.version}, but this build only ` +
          `understands up to v${CURRENT_VERSION}. It was probably created by a ` +
          `newer version of Automate — see UPGRADING.md for regenerating the schema.`,
      );
    }
    this.varlenUtf = this.version >= VARLEN_UTF_SINCE;
    const nextId = this.r.svar64();
    const count = Number(this.r.uvar());
    return { version: this.version, nextId, count };
  }

  value(op: WireOp): unknown {
    switch (op.op) {
      case 'obj':
        return this.object();
      case 'svar32':
        return this.r.svar32();
      case 'svar64':
        return this.r.svar64();
      case 'uvar32':
        return Number(this.r.uvar());
      case 'utf':
        return this.r.utf(this.varlenUtf);
      case 'utf_null': {
        const s = this.r.utf(this.varlenUtf);
        return s.length ? s : null;
      }
      case 'f32':
        return this.r.f32();
      case 'f64':
        return this.r.f64();
      case 'i16':
        return this.r.i16();
      case 'i32':
        return this.r.i32();
      case 'i64':
        return this.r.i64();
      case 'u8':
        return this.r.u8();
      case 'convtype':
        return { _ct: this.r.svar32() } satisfies ConvTypeBox;
      case 'parcel': {
        const n = Number(this.r.uvar());
        return { _parcel: bytesToHex(this.r.bytes(n)) } satisfies ParcelBox;
      }
      case 'objarray':
        return { _arr: this.objectList(Number(this.r.uvar())) } satisfies ArrayBox;
      case 'varargs': {
        if (op.legacy2 !== undefined && this.version < op.legacy2) {
          return { _varargs2: [this.object(), this.object()] } satisfies Varargs2Box;
        }
        return { _arr: this.objectList(Number(this.r.uvar())) } satisfies ArrayBox;
      }
      case 'kvpairs': {
        const n = Number(this.r.uvar());
        const kv: Array<[FloValue, FloValue, number]> = [];
        for (let i = 0; i < n; i++) kv.push([this.object(), this.object(), this.r.svar32()]);
        return { _kv: kv } satisfies KvBox;
      }
      default:
        throw new FloFormatError(`unsupported read op ${op.op}`);
    }
  }

  private objectList(n: number): FloValue[] {
    const out: FloValue[] = [];
    for (let i = 0; i < n; i++) out.push(this.object());
    return out;
  }

  object(): FloValue {
    const tid = this.r.svar32();
    if (tid === 0) return null;
    if (tid < 0) return { _ref: -tid - 1 };

    const rec = entryFor(tid);
    const obj: FloObject = { _type: tid };
    this.objects.push(obj);

    switch (rec.kind) {
      case 'struct': {
        for (const op of rec.ops ?? []) {
          if (!opActive(op, this.version)) continue;
          obj[op.f] = this.value(op);
        }
        return obj;
      }
      case 'singleton':
        return obj;
      case 'objarray': {
        obj.items = this.objectList(Number(this.r.uvar()));
        return obj;
      }
      case 'prim':
        return this.prim(rec, obj);
      case 'builtin':
        return this.builtin(rec.builtin!, obj);
      default:
        throw new FloFormatError(`unsupported kind ${rec.kind}`);
    }
  }

  private prim(rec: SchemaEntry, obj: FloObject): FloObject {
    const scalar: Record<string, () => unknown> = {
      'java.lang.Boolean': () => this.r.u8(),
      'java.lang.Byte': () => this.r.u8(),
      'java.lang.Character': () => this.r.i16(),
      'java.lang.Short': () => this.r.i16(),
      'java.lang.Double': () => this.r.f64(),
      'java.lang.Float': () => this.r.f32(),
      'java.lang.Integer': () => this.r.svar32(),
      'java.lang.Long': () => this.r.svar64(),
      'java.lang.String': () => this.r.utf(this.varlenUtf),
    };
    if (rec.cls in scalar) {
      obj.value = scalar[rec.cls]();
      return obj;
    }
    const element: Record<string, () => unknown> = {
      'boolean[]': () => this.r.u8(),
      'byte[]': () => this.r.u8(),
      'char[]': () => this.r.i16(),
      'short[]': () => this.r.i16(),
      'double[]': () => this.r.f64(),
      'float[]': () => this.r.f32(),
      'int[]': () => this.r.svar32(),
      'long[]': () => this.r.svar64(),
    };
    if (rec.cls in element) {
      const n = Number(this.r.uvar());
      const arr: unknown[] = [];
      for (let i = 0; i < n; i++) arr.push(element[rec.cls]());
      obj.value = arr;
      return obj;
    }
    if (rec.cls === 'I3.b') return this.builtin('bigint', obj);
    throw new FloFormatError(`unsupported primitive ${rec.cls}`);
  }

  private builtin(name: string, obj: FloObject): FloObject {
    switch (name) {
      case 'array':
      case 'list_expr':
        obj.items = this.objectList(Number(this.r.uvar()));
        return obj;
      case 'dict': {
        const n = Number(this.r.uvar());
        const items: Array<[string, FloValue, number]> = [];
        for (let i = 0; i < n; i++) {
          items.push([this.r.utf(this.varlenUtf), this.object(), this.r.svar32()]);
        }
        obj.items = items;
        return obj;
      }
      case 'bigint':
      case 'bigint_literal': {
        // sign * wordCount, then that many big-endian 32-bit magnitude words.
        const signWords = this.r.svar32();
        obj.signWords = signWords;
        const words: number[] = [];
        for (let i = 0; i < Math.abs(signWords); i++) words.push(this.r.i32());
        obj.words = words;
        return obj;
      }
      case 'interp_string': {
        // "text{expr}text" literals: N string chunks, N-1 embedded expressions.
        const n = Number(this.r.uvar());
        const strings: string[] = [];
        for (let i = 0; i < n; i++) strings.push(this.r.utf(this.varlenUtf));
        obj.strings = strings;
        obj.exprs = this.objectList(Math.max(0, n - 1));
        obj.flags = bytesToHex(this.r.bytes(Math.floor(Math.max(0, n - 1) / 8) + 1));
        return obj;
      }
      case 'samples_u8': {
        const dims = Number(this.r.uvar());
        const size = Number(this.r.uvar());
        obj.dims = dims;
        obj.size = size;
        obj.data = bytesToHex(this.r.bytes(dims * size));
        return obj;
      }
      case 'samples_f32': {
        const dims = Number(this.r.uvar());
        const size = Number(this.r.uvar());
        obj.dims = dims;
        obj.size = size;
        const data: number[] = [];
        for (let i = 0; i < dims * size; i++) data.push(this.r.f32());
        obj.data = data;
        return obj;
      }
      case 'PLUGIN_DECISION':
      case 'PLUGIN_ACTION': {
        obj.sid = this.r.svar64();
        obj.x = this.r.svar32();
        obj.y = this.r.svar32();
        if (name === 'PLUGIN_DECISION') {
          obj.onPositive = this.object();
          obj.onNegative = this.object();
        } else {
          obj.onComplete = this.object();
        }
        obj.pkg = this.r.utf(this.varlenUtf);
        obj.pluginClass = this.r.utf(this.varlenUtf);
        obj.bundle = bytesToHex(this.r.bytes(Number(this.r.uvar())));
        obj.blurb = this.r.utf(this.varlenUtf);
        const nn = Number(this.r.uvar());
        const varNames: string[] = [];
        for (let i = 0; i < nn; i++) varNames.push(this.r.utf(this.varlenUtf));
        obj.varNames = varNames;
        const nd = Number(this.r.uvar());
        const bindings: Array<[string, FloValue]> = [];
        for (let i = 0; i < nd; i++) bindings.push([this.r.utf(this.varlenUtf), this.object()]);
        obj.bindings = bindings;
        obj.immediate = this.r.u8();
        return obj;
      }
      case 'STMT_X': {
        obj.sid = this.r.svar64();
        const n = Number(this.r.uvar());
        obj.n = n;
        if (n > 0) {
          obj.intents = bytesToHex(this.r.bytes(Number(this.r.uvar())));
          obj.bundles = bytesToHex(this.r.bytes(Number(this.r.uvar())));
        }
        return obj;
      }
      default:
        throw new FloFormatError(`unsupported builtin ${name}`);
    }
  }
}

// ---------------------------------------------------------------- encoding

class Encoder {
  private readonly w = new ByteWriter(4096);
  /** Object identity -> 1-based index, mirroring the app's IdentityHashMap. */
  private readonly seen = new Map<object, number>();
  /** Variable name -> the one node every mention of it must share. */
  private readonly variables = new Map<string, FloObject>();
  private count = 0;
  private readonly varlenUtf: boolean;

  constructor(readonly version: number) {
    this.varlenUtf = version >= VARLEN_UTF_SINCE;
  }

  /**
   * Collapse every mention of a variable onto a single node.
   *
   * A variable's name is display-only. When Automate loads a flow it walks the
   * graph through an `IdentityHashMap` and hands each distinct `I3.l`
   * *instance* the next free slot index (`C1453e2.d`); every read and write
   * then goes through that index and never looks at the name again. Two
   * separate nodes both spelled `host` are therefore two unrelated variables —
   * assign one and the other stays null, with nothing to show for it but a
   * flow that quietly does the wrong thing.
   *
   * The app can only ever produce shared instances and all 11 real flows
   * tested satisfy this, so it is a no-op on files that came from the app and
   * byte-exact round-tripping is unaffected. It matters for graphs built here:
   * `variableRef()` and `parseExpression()` mint a fresh node per call.
   */
  private canonicalVariable(v: FloObject): FloObject {
    if (v._type !== VARIABLE_TYPE) return v;
    const name = String(v.f4289X ?? '');
    const first = this.variables.get(name);
    if (first) return first;
    this.variables.set(name, v);
    return v;
  }

  header(nextId: bigint, statements: number): void {
    this.w.i32(MAGIC);
    this.w.u16(this.version);
    this.w.svar64(nextId);
    this.w.uvar(statements);
  }

  value(op: WireOp, v: unknown): void {
    switch (op.op) {
      case 'obj':
        this.object(v);
        return;
      case 'svar32':
        this.w.svar32(Number(v ?? 0));
        return;
      case 'svar64':
        this.w.svar64((v as bigint) ?? 0n);
        return;
      case 'uvar32':
        this.w.uvar(Number(v ?? 0));
        return;
      case 'utf':
      case 'utf_null':
        this.w.utf(v as string | null, this.varlenUtf);
        return;
      case 'f32':
        this.w.f32(Number(v ?? 0));
        return;
      case 'f64':
        this.w.f64(Number(v ?? 0));
        return;
      case 'i16':
        this.w.i16(Number(v ?? 0));
        return;
      case 'i32':
        this.w.i32(Number(v ?? 0));
        return;
      case 'i64':
        this.w.i64((v as bigint) ?? 0n);
        return;
      case 'u8':
        this.w.u8(Number(v ?? 0));
        return;
      case 'convtype':
        this.w.svar32((v as ConvTypeBox)?._ct ?? 0);
        return;
      case 'parcel': {
        const b = hexToBytes((v as ParcelBox)?._parcel ?? '');
        this.w.uvar(b.length);
        this.w.bytes(b);
        return;
      }
      case 'objarray': {
        const arr = (v as ArrayBox)?._arr ?? [];
        this.w.uvar(arr.length);
        for (const it of arr) this.object(it);
        return;
      }
      case 'varargs': {
        const pair = (v as Varargs2Box)?._varargs2;
        if (pair) {
          for (const it of pair) this.object(it);
          return;
        }
        const arr = (v as ArrayBox)?._arr ?? [];
        this.w.uvar(arr.length);
        for (const it of arr) this.object(it);
        return;
      }
      case 'kvpairs': {
        const kv = (v as KvBox)?._kv ?? [];
        this.w.uvar(kv.length);
        for (const [a, b, c] of kv) {
          this.object(a);
          this.object(b);
          this.w.svar32(c);
        }
        return;
      }
      default:
        throw new FloFormatError(`unsupported write op ${op.op}`);
    }
  }

  object(v: unknown): void {
    if (v === null || v === undefined) {
      this.w.svar32(0);
      return;
    }
    let obj = v as FloObject & { _ref?: number };
    if (typeof obj._ref === 'number') {
      this.w.svar32(-(obj._ref + 1));
      return;
    }
    // Ahead of the identity lookup, so repeat mentions of a variable become
    // back-references to the first — exactly how the app writes them.
    obj = this.canonicalVariable(obj);
    const prior = this.seen.get(obj as object);
    if (prior !== undefined) {
      this.w.svar32(-prior);
      return;
    }
    const rec = entryFor(obj._type);
    this.seen.set(obj as object, ++this.count);
    this.w.svar32(obj._type);

    switch (rec.kind) {
      case 'struct':
        for (const op of rec.ops ?? []) {
          if (!opActive(op, this.version)) continue;
          this.value(op, obj[op.f]);
        }
        return;
      case 'singleton':
        return;
      case 'objarray': {
        const items = (obj.items as FloValue[]) ?? [];
        this.w.uvar(items.length);
        for (const it of items) this.object(it);
        return;
      }
      case 'prim':
        this.prim(rec, obj);
        return;
      case 'builtin':
        this.builtin(rec.builtin!, obj);
        return;
      default:
        throw new FloFormatError(`unsupported kind ${rec.kind}`);
    }
  }

  private prim(rec: SchemaEntry, obj: FloObject): void {
    const v = obj.value;
    switch (rec.cls) {
      case 'java.lang.Boolean':
      case 'java.lang.Byte':
        this.w.u8(Number(v));
        return;
      case 'java.lang.Character':
      case 'java.lang.Short':
        this.w.i16(Number(v));
        return;
      case 'java.lang.Double':
        this.w.f64(Number(v));
        return;
      case 'java.lang.Float':
        this.w.f32(Number(v));
        return;
      case 'java.lang.Integer':
        this.w.svar32(Number(v));
        return;
      case 'java.lang.Long':
        this.w.svar64(v as bigint);
        return;
      case 'java.lang.String':
        this.w.utf(v as string, this.varlenUtf);
        return;
      case 'I3.b':
        this.builtin('bigint', obj);
        return;
    }
    const element: Record<string, (x: unknown) => void> = {
      'boolean[]': (x) => this.w.u8(Number(x)),
      'byte[]': (x) => this.w.u8(Number(x)),
      'char[]': (x) => this.w.i16(Number(x)),
      'short[]': (x) => this.w.i16(Number(x)),
      'double[]': (x) => this.w.f64(Number(x)),
      'float[]': (x) => this.w.f32(Number(x)),
      'int[]': (x) => this.w.svar32(Number(x)),
      'long[]': (x) => this.w.svar64(x as bigint),
    };
    const write = element[rec.cls];
    if (!write) throw new FloFormatError(`unsupported primitive ${rec.cls}`);
    const arr = (v as unknown[]) ?? [];
    this.w.uvar(arr.length);
    for (const x of arr) write(x);
  }

  private builtin(name: string, obj: FloObject): void {
    switch (name) {
      case 'array':
      case 'list_expr': {
        const items = (obj.items as FloValue[]) ?? [];
        this.w.uvar(items.length);
        for (const it of items) this.object(it);
        return;
      }
      case 'dict': {
        const items = (obj.items as Array<[string, FloValue, number]>) ?? [];
        this.w.uvar(items.length);
        for (const [k, val, ct] of items) {
          this.w.utf(k, this.varlenUtf);
          this.object(val);
          this.w.svar32(ct);
        }
        return;
      }
      case 'bigint':
      case 'bigint_literal': {
        this.w.svar32(obj.signWords as number);
        for (const word of (obj.words as number[]) ?? []) this.w.i32(word);
        return;
      }
      case 'interp_string': {
        const strings = (obj.strings as string[]) ?? [];
        this.w.uvar(strings.length);
        for (const s of strings) this.w.utf(s, this.varlenUtf);
        for (const e of (obj.exprs as FloValue[]) ?? []) this.object(e);
        this.w.bytes(hexToBytes(obj.flags as string));
        return;
      }
      case 'samples_u8': {
        this.w.uvar(obj.dims as number);
        this.w.uvar(obj.size as number);
        this.w.bytes(hexToBytes(obj.data as string));
        return;
      }
      case 'samples_f32': {
        this.w.uvar(obj.dims as number);
        this.w.uvar(obj.size as number);
        for (const f of (obj.data as number[]) ?? []) this.w.f32(f);
        return;
      }
      case 'PLUGIN_DECISION':
      case 'PLUGIN_ACTION': {
        this.w.svar64(obj.sid as bigint);
        this.w.svar32(obj.x as number);
        this.w.svar32(obj.y as number);
        if (name === 'PLUGIN_DECISION') {
          this.object(obj.onPositive);
          this.object(obj.onNegative);
        } else {
          this.object(obj.onComplete);
        }
        this.w.utf(obj.pkg as string, this.varlenUtf);
        this.w.utf(obj.pluginClass as string, this.varlenUtf);
        const bundle = hexToBytes(obj.bundle as string);
        this.w.uvar(bundle.length);
        this.w.bytes(bundle);
        this.w.utf(obj.blurb as string, this.varlenUtf);
        const varNames = (obj.varNames as string[]) ?? [];
        this.w.uvar(varNames.length);
        for (const s of varNames) this.w.utf(s, this.varlenUtf);
        const bindings = (obj.bindings as Array<[string, FloValue]>) ?? [];
        this.w.uvar(bindings.length);
        for (const [n, val] of bindings) {
          this.w.utf(n, this.varlenUtf);
          this.object(val);
        }
        this.w.u8(obj.immediate as number);
        return;
      }
      case 'STMT_X': {
        this.w.svar64(obj.sid as bigint);
        const n = obj.n as number;
        this.w.uvar(n);
        if (n > 0) {
          const a = hexToBytes(obj.intents as string);
          this.w.uvar(a.length);
          this.w.bytes(a);
          const b = hexToBytes(obj.bundles as string);
          this.w.uvar(b.length);
          this.w.bytes(b);
        }
        return;
      }
      default:
        throw new FloFormatError(`unsupported builtin ${name}`);
    }
  }

  finish(): Uint8Array {
    return this.w.toUint8Array();
  }
}

// ------------------------------------------------------------------ public

/** Decode a `.flo` file into its raw object graph. */
export function parseFlo(data: Uint8Array): Flow {
  const d = new Decoder(data);
  const { version, nextId, count } = d.header();
  const statements: FloValue[] = [];
  for (let i = 0; i < count; i++) statements.push(d.object());
  if (d.remaining !== 0) {
    throw new FloFormatError(`trailing data: ${d.remaining} byte(s) after ${count} statements`);
  }
  return { version, nextId, statements };
}

/** Encode an object graph back into `.flo` bytes. */
export function writeFlo(flow: Flow): Uint8Array {
  const e = new Encoder(flow.version);
  e.header(flow.nextId, flow.statements.length);
  for (const s of flow.statements) e.object(s);
  return e.finish();
}
