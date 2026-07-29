/**
 * Low-level wire primitives for the Automate `.flo` container format.
 *
 * The format is a Java `DataOutput`-style big-endian stream with two additions
 * used heavily by the app's serializer (`Q3.c` / `Q3.d` in the APK):
 *
 *  - LEB128 varints, in unsigned and zig-zag signed flavours
 *  - Java "modified UTF-8" strings (`0x00` escaped, no supplementary chars)
 */

export class ByteReader {
  readonly data: Uint8Array;
  private readonly view: DataView;
  pos = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  private need(n: number): number {
    const p = this.pos;
    if (p + n > this.data.length) {
      throw new RangeError(`unexpected end of stream at ${p} (+${n})`);
    }
    this.pos = p + n;
    return p;
  }

  u8(): number {
    return this.data[this.need(1)];
  }

  bytes(n: number): Uint8Array {
    const p = this.need(n);
    return this.data.subarray(p, p + n);
  }

  i16(): number {
    return this.view.getInt16(this.need(2), false);
  }

  u16(): number {
    return this.view.getUint16(this.need(2), false);
  }

  i32(): number {
    return this.view.getInt32(this.need(4), false);
  }

  i64(): bigint {
    return this.view.getBigInt64(this.need(8), false);
  }

  f32(): number {
    return this.view.getFloat32(this.need(4), false);
  }

  f64(): number {
    return this.view.getFloat64(this.need(8), false);
  }

  /** Unsigned LEB128. */
  uvar(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const b = this.u8();
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 63n) throw new Error('variable length quantity is too long');
    }
  }

  /** Zig-zag signed varint, 32-bit domain. */
  svar32(): number {
    const v = BigInt.asUintN(32, this.uvar());
    return Number(BigInt.asIntN(32, (v >> 1n) ^ -(v & 1n)));
  }

  /** Zig-zag signed varint, 64-bit domain. */
  svar64(): bigint {
    const v = BigInt.asUintN(64, this.uvar());
    return BigInt.asIntN(64, (v >> 1n) ^ -(v & 1n));
  }

  /** Modified-UTF8 string; length prefix is a varint from format v35 onwards. */
  utf(varlen: boolean): string {
    const n = varlen ? Number(this.uvar()) : this.u16();
    return decodeModifiedUtf8(this.bytes(n));
  }
}

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private len = 0;

  constructor(capacity = 1024) {
    this.buf = new Uint8Array(capacity);
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.len;
  }

  private ensure(n: number): number {
    const need = this.len + n;
    if (need > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < need) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
      this.view = new DataView(this.buf.buffer);
    }
    const at = this.len;
    this.len = need;
    return at;
  }

  // NOTE: `ensure()` may reallocate `buf`/`view`, and JavaScript resolves the
  // member expression before evaluating arguments. Each writer below therefore
  // reserves space into a local first, then touches the (possibly new) buffer.

  u8(v: number): void {
    const at = this.ensure(1);
    this.buf[at] = v & 0xff;
  }

  bytes(b: Uint8Array): void {
    const at = this.ensure(b.length);
    this.buf.set(b, at);
  }

  i16(v: number): void {
    const at = this.ensure(2);
    this.view.setInt16(at, v, false);
  }

  u16(v: number): void {
    const at = this.ensure(2);
    this.view.setUint16(at, v, false);
  }

  i32(v: number): void {
    const at = this.ensure(4);
    this.view.setInt32(at, v | 0, false);
  }

  i64(v: bigint): void {
    const at = this.ensure(8);
    this.view.setBigInt64(at, BigInt.asIntN(64, v), false);
  }

  f32(v: number): void {
    const at = this.ensure(4);
    this.view.setFloat32(at, v, false);
  }

  f64(v: number): void {
    const at = this.ensure(8);
    this.view.setFloat64(at, v, false);
  }

  uvar(v: bigint | number): void {
    let x = BigInt.asUintN(64, BigInt(v));
    for (;;) {
      const b = Number(x & 0x7fn);
      x >>= 7n;
      if (x === 0n) {
        this.u8(b);
        return;
      }
      this.u8(b | 0x80);
    }
  }

  svar32(v: number): void {
    const x = BigInt.asIntN(32, BigInt(Math.trunc(v)));
    this.uvar(BigInt.asUintN(32, (x << 1n) ^ (x >> 31n)));
  }

  svar64(v: bigint | number): void {
    const x = BigInt.asIntN(64, BigInt(v));
    this.uvar(BigInt.asUintN(64, (x << 1n) ^ (x >> 63n)));
  }

  utf(s: string | null | undefined, varlen: boolean): void {
    const b = encodeModifiedUtf8(s ?? '');
    if (varlen) this.uvar(b.length);
    else this.u16(b.length);
    this.bytes(b);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/**
 * Java modified UTF-8: NUL is written as the two-byte C0 80 sequence and
 * characters outside the BMP are written as a CESU-8 surrogate pair.
 */
export function encodeModifiedUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i); // UTF-16 unit: surrogates handled naturally
    if (c === 0) {
      out.push(0xc0, 0x80);
    } else if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

export function decodeModifiedUtf8(raw: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const b = raw[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if ((b & 0xe0) === 0xc0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (raw[i + 1] & 0x3f));
      i += 2;
    } else {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((raw[i + 1] & 0x3f) << 6) | (raw[i + 2] & 0x3f),
      );
      i += 3;
    }
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}
