/** Types describing the generated wire schema and block catalog. */

/** A single ordered read/write step in a type's serialized form. */
export interface WireOp {
  /** Field name the value is stored under. Synthetic `_anonN` names mark values
   *  the app discards but which still occupy bytes on the wire. */
  f: string;
  op: WireOpKind;
  /** Java cast the app applies, used for port/field classification. */
  cast?: string;
  /** Inclusive format-version bounds; the op is absent outside them. */
  min?: number;
  max?: number;
  /** `varargs` only: below this version the list was a fixed pair. */
  legacy2?: number;
}

export type WireOpKind =
  | 'obj'
  | 'objarray'
  | 'varargs'
  | 'kvpairs'
  | 'parcel'
  | 'convtype'
  | 'svar32'
  | 'svar64'
  | 'uvar32'
  | 'utf'
  | 'utf_null'
  | 'f32'
  | 'f64'
  | 'i16'
  | 'i32'
  | 'i64'
  | 'u8';

export type SchemaKind = 'struct' | 'singleton' | 'prim' | 'objarray' | 'builtin';

export interface SchemaEntry {
  id: number;
  /** Fully-qualified (obfuscated) class name from the APK. */
  cls: string;
  kind: SchemaKind;
  ops?: WireOp[];
  builtin?: string;
  /** True when the app applies value migrations we deliberately do not replay. */
  transforms?: boolean;
  manual?: boolean;
}

export type Schema = Record<string, SchemaEntry>;

export interface CatalogPort {
  /** Field holding the successor statement reference. */
  field: string;
  /** Connector view id from the block layout: top | bottom | right. */
  conn: string | null;
}

export interface CatalogField {
  name: string;
  op: WireOpKind;
  cast?: string;
}

export interface CatalogEntry {
  id: number;
  /** Class simple name, e.g. `Delay`. */
  name: string;
  /** Codepoint in the app's icon font. */
  icon?: number;
  /** Human title, e.g. "Delay". */
  title?: string;
  /** One-line description from the app's strings. */
  summary?: string;
  /** Documentation page name on llamalab.com, e.g. `delay.html`. */
  doc?: string;
  /** Block layout resource, determines the port arrangement. */
  layout?: string;
  ports: CatalogPort[];
  fields: CatalogField[];
}

export type Catalog = Record<string, CatalogEntry>;

/** A decoded object from the flow graph. */
export interface FloObject {
  /** Registry type id. */
  _type: number;
  [key: string]: unknown;
}

/** A back-reference to an earlier object in stream order. */
export interface FloRef {
  _ref: number;
}

export type FloValue = FloObject | FloRef | null | undefined | unknown;

export interface Flow {
  /** Serialization format version (112 = Automate 1.51). */
  version: number;
  /** Next free statement id. */
  nextId: bigint;
  /** Top-level statement list; entries after the first are usually back-refs. */
  statements: FloValue[];
}

/** Wrapper values used to keep non-scalar wire payloads intact. */
export interface ArrayBox {
  _arr: FloValue[];
}
export interface Varargs2Box {
  _varargs2: FloValue[];
}
export interface ParcelBox {
  _parcel: string;
}
export interface ConvTypeBox {
  _ct: number;
}
export interface KvBox {
  _kv: Array<[FloValue, FloValue, number]>;
}
