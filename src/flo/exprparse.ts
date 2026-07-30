/**
 * Parser for Automate expression source.
 *
 * Without this, editing an expression field could only ever replace a
 * structured value with flat text — which silently destroyed lists, maps and
 * operator trees, and re-quoted the text on every keystroke. The editor now
 * compiles what you type back into the same node types the app uses.
 *
 * The grammar is a Pratt parser matching the app's own (`L3.f`), including its
 * binding powers. The app numbers them so that *lower binds tighter*:
 *
 *     1  call `(`, index `[`        8  `&`
 *     2  prefix operand             9  `^`
 *     3  `*` `/` `//` `%`          10  `|`
 *     4  `+` `-` `++`              11  `&&`
 *     5  `<<` `>>` `>>>`           12  `||`
 *     6  `<` `<=` `>` `>=`         13  `?:`
 *     7  `=` `!=`                  14  no limit
 *
 * All binary operators are left-associative: the app parses a right operand at
 * the same binding power, and its loop only continues while an operator binds
 * strictly tighter than the current limit.
 */

import { schema } from './codec';
import exprTableJson from '../data/exprtable.json';
import type { FloObject, FloValue } from './types';

interface ExprRule {
  kind: string;
  op?: string;
  name?: string;
  text?: string;
}

const rules = exprTableJson as unknown as Record<string, ExprRule>;

export class ExpressionError extends Error {
  constructor(
    message: string,
    /** Character offset in the source where parsing failed. */
    readonly at: number,
  ) {
    super(message);
    this.name = 'ExpressionError';
  }
}

// ------------------------------------------------------------ type registry

const BINARY_BY_OP = new Map<string, number>();
const PREFIX_BY_OP = new Map<string, number>();
const FUNC_BY_NAME = new Map<string, number>();
const CONST_BY_TEXT = new Map<string, number>();
const byClass = new Map<string, number>();

for (const [tid, rule] of Object.entries(rules)) {
  const id = Number(tid);
  byClass.set(schema[tid].cls, id);
  if (rule.kind === 'binary' && rule.op) BINARY_BY_OP.set(rule.op, id);
  else if (rule.kind === 'prefix' && rule.op) PREFIX_BY_OP.set(rule.op, id);
  else if (rule.kind === 'func' && rule.name) FUNC_BY_NAME.set(rule.name, id);
  else if (rule.kind === 'const' && rule.text) CONST_BY_TEXT.set(rule.text, id);
}

/** Node types looked up by their (obfuscated) class name in the APK. */
const T = {
  variable: byClass.get('I3.l')!,
  string: byClass.get('K3.W')!,
  interp: byClass.get('K3.V')!,
  nul: byClass.get('K3.I')!,
  decimal: byClass.get('K3.J')!,
  hex: byClass.get('K3.C1050s')!,
  binary: byClass.get('K3.C1036d')!,
  bigDecimal: byClass.get('K3.C1034b')!,
  bigHex: byClass.get('K3.r')!,
  bigBinary: byClass.get('K3.C1035c')!,
  group: byClass.get('K3.C1049q')!,
  list: byClass.get('K3.E')!,
  map: byClass.get('K3.F')!,
  index: BINARY_BY_OP.get('[')!,
  ternary: Number(
    Object.entries(rules).find(([, r]) => r.kind === 'ternary')?.[0] ?? 0,
  ),
};

/**
 * `com.llamalab.automate.expr.ConversionType`, in declaration order — the
 * ordinal is what goes on the wire for a `{key: value as Type}` entry.
 */
export const CONVERSION_TYPES = [
  'Boolean', 'BooleanArray', 'Byte', 'ByteArray', 'Char', 'CharArray',
  'Double', 'DoubleArray', 'Float', 'FloatArray', 'Int', 'IntArray',
  'IntList', 'Long', 'LongArray', 'Short', 'ShortArray', 'String',
  'StringArray', 'StringList',
];

// -------------------------------------------------------------- binding power

/** Infix binding power, app convention (lower binds tighter). */
const INFIX_BP: Record<string, number> = {
  '(': 1, '[': 1,
  '*': 3, '/': 3, '//': 3, '%': 3,
  '+': 4, '-': 4, '++': 4,
  '<<': 5, '>>': 5, '>>>': 5,
  '<': 6, '<=': 6, '>': 6, '>=': 6,
  '=': 7, '!=': 7,
  '&': 8,
  '^': 9,
  '|': 10,
  '&&': 11,
  '||': 12,
  '?': 13,
};

const NO_LIMIT = 14;
const PREFIX_OPERAND_BP = 2;

/** Operator spellings, longest first so `>>>` wins over `>>` and `>`. */
const OPERATORS = [
  '>>>', '<<', '>>', '<=', '>=', '!=', '//', '++', '&&', '||',
  '&', '|', '^', '~', '!', '?', ':', ',', '(', ')', '{', '}', '[', ']',
  '+', '-', '*', '%', '/', '=', '<', '>', '#', ';',
];

// -------------------------------------------------------------------- lexer

type TokKind = 'num' | 'str' | 'ident' | 'op' | 'end';

interface Token {
  kind: TokKind;
  /** Operator spelling, identifier text, or raw literal text. */
  text: string;
  start: number;
  /** `str` only: decoded chunks and the source of each embedded expression. */
  parts?: Array<{ text: string } | { expr: string; at: number }>;
}

/**
 * Variable names are not ASCII-only.
 *
 * Real flows in the corpus name variables `멜론재생`, `태태문` and similar; an
 * ASCII-only lexer rejects its own rendered output for any flow not written in
 * English, which in the editor means an unreadable field the user cannot save.
 */
function isIdentStart(c: string): boolean {
  return /[\p{L}\p{Nl}_]/u.test(c);
}

function isIdentPart(c: string): boolean {
  return /[\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}_]/u.test(c);
}

class Lexer {
  pos = 0;

  constructor(readonly src: string) {}

  private skipSpace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  next(): Token {
    this.skipSpace();
    const start = this.pos;
    if (this.pos >= this.src.length) return { kind: 'end', text: '', start };

    const c = this.src[this.pos];

    if (c === '"') return this.string();
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(this.src[this.pos + 1] ?? ''))) {
      return this.number();
    }
    if (isIdentStart(c)) {
      let i = this.pos;
      while (i < this.src.length && isIdentPart(this.src[i])) i++;
      const text = this.src.slice(this.pos, i);
      this.pos = i;
      return { kind: 'ident', text, start };
    }
    for (const op of OPERATORS) {
      if (this.src.startsWith(op, this.pos)) {
        this.pos += op.length;
        return { kind: 'op', text: op, start };
      }
    }
    throw new ExpressionError(`Unexpected character ${JSON.stringify(c)}`, start);
  }

  private number(): Token {
    const start = this.pos;
    const s = this.src;
    let i = this.pos;
    if (s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X')) {
      i += 2;
      while (i < s.length && /[0-9a-fA-F]/.test(s[i])) i++;
    } else if (s[i] === '0' && (s[i + 1] === 'b' || s[i + 1] === 'B')) {
      i += 2;
      while (i < s.length && /[01]/.test(s[i])) i++;
    } else {
      while (i < s.length && /[0-9]/.test(s[i])) i++;
      if (s[i] === '.') {
        i++;
        while (i < s.length && /[0-9]/.test(s[i])) i++;
      }
      if (s[i] === 'e' || s[i] === 'E') {
        let j = i + 1;
        if (s[j] === '+' || s[j] === '-') j++;
        if (/[0-9]/.test(s[j] ?? '')) {
          i = j;
          while (i < s.length && /[0-9]/.test(s[i])) i++;
        }
      }
    }
    if (s[i] === 'n') i++; // big-integer suffix
    this.pos = i;
    return { kind: 'num', text: s.slice(start, i), start };
  }

  /**
   * A string literal, split into literal chunks and `{expression}` holes.
   * Brace depth is tracked across nested strings so an interpolation may itself
   * contain strings, lists and further interpolations.
   */
  private string(): Token {
    const start = this.pos;
    const s = this.src;
    let i = this.pos + 1;
    const parts: Array<{ text: string } | { expr: string; at: number }> = [];
    let chunk = '';

    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const e = s[i + 1];
        chunk +=
          e === 'n' ? '\n' :
          e === 'r' ? '\r' :
          e === 't' ? '\t' :
          e === '0' ? '\0' :
          e === undefined ? '\\' : e;
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        parts.push({ text: chunk });
        this.pos = i;
        return { kind: 'str', text: s.slice(start, i), start, parts };
      }
      if (c === '{') {
        parts.push({ text: chunk });
        chunk = '';
        const exprStart = i + 1;
        let depth = 1;
        let j = exprStart;
        let inString = false;
        while (j < s.length && depth > 0) {
          const d = s[j];
          if (d === '\\') {
            j += 2;
            continue;
          }
          // Braces inside a nested string literal are text, not structure.
          // `"{c ? ".tickLabel \{ display: none; }" : null}"` ends its hole at
          // the final `}`, not at the one inside the CSS.
          if (d === '"') inString = !inString;
          else if (!inString && d === '{') depth++;
          else if (!inString && d === '}') depth--;
          if (depth === 0) break;
          j++;
        }
        if (depth !== 0) throw new ExpressionError('Unclosed { in string', i);
        parts.push({ expr: s.slice(exprStart, j), at: exprStart });
        i = j + 1;
        continue;
      }
      chunk += c;
      i++;
    }
    throw new ExpressionError('Unterminated string', start);
  }
}

// ------------------------------------------------------------------- parser

class Parser {
  private tok: Token;
  private readonly lexer: Lexer;

  constructor(readonly src: string, readonly offset = 0) {
    this.lexer = new Lexer(src);
    this.tok = this.lexer.next();
  }

  private advance(): Token {
    const prev = this.tok;
    this.tok = this.lexer.next();
    return prev;
  }

  private at(op: string): boolean {
    return this.tok.kind === 'op' && this.tok.text === op;
  }

  private eat(op: string): boolean {
    if (!this.at(op)) return false;
    this.advance();
    return true;
  }

  private expect(op: string): void {
    if (!this.eat(op)) {
      throw new ExpressionError(
        `Expected ${JSON.stringify(op)} but found ${this.describe()}`,
        this.offset + this.tok.start,
      );
    }
  }

  private atEnd(): boolean {
    return this.tok.kind === 'end';
  }

  private describe(): string {
    return this.atEnd() ? 'end of expression' : JSON.stringify(this.tok.text);
  }

  /** Parse a complete expression and require the whole input to be consumed. */
  parseAll(): FloValue {
    if (this.atEnd()) return null; // empty text means the null literal
    const node = this.expr(NO_LIMIT);
    if (!this.atEnd()) {
      throw new ExpressionError(
        `Unexpected ${this.describe()} after expression`,
        this.offset + this.tok.start,
      );
    }
    return node;
  }

  /** Pratt loop: consume infix operators that bind tighter than `limit`. */
  private expr(limit: number): FloValue {
    let left = this.atom();
    for (;;) {
      if (this.tok.kind !== 'op') break;
      const op = this.tok.text;
      const bp = INFIX_BP[op];
      if (bp === undefined || bp >= limit) break;

      if (op === '(') {
        left = this.call(left);
        continue;
      }
      if (op === '[') {
        this.advance();
        const idx = this.expr(NO_LIMIT);
        this.expect(']');
        left = { _type: T.index, f4653X: left, f4654Y: idx };
        continue;
      }
      if (op === '?') {
        this.advance();
        const yes = this.expr(NO_LIMIT);
        this.expect(':');
        const no = this.expr(NO_LIMIT);
        left = { _type: T.ternary, f4643X: left, f4644Y: yes, f4645Z: no };
        continue;
      }

      const tid = BINARY_BY_OP.get(op);
      if (tid === undefined) break;
      this.advance();
      // Left-associative: the right operand stops at an operator of equal power.
      const right = this.expr(bp);
      left = { _type: tid, f4653X: left, f4654Y: right };
    }
    return left;
  }

  /** A function call on an already-parsed callee, which must be a bare name. */
  private call(callee: FloValue): FloObject {
    const name = (callee as FloObject | null)?._type === T.variable
      ? String((callee as FloObject).f4289X)
      : null;
    if (name === null) {
      throw new ExpressionError('Only a function name can be called', this.offset + this.tok.start);
    }
    const tid = FUNC_BY_NAME.get(name);
    if (tid === undefined) {
      throw new ExpressionError(`Unknown function ${JSON.stringify(name)}`, this.offset + this.tok.start);
    }
    this.expect('(');
    const args: FloValue[] = [];
    if (!this.at(')')) {
      do {
        args.push(this.expr(NO_LIMIT));
      } while (this.eat(','));
    }
    this.expect(')');
    return buildCall(tid, name, args, this.offset + this.tok.start);
  }

  private atom(): FloValue {
    const t = this.tok;

    if (this.atEnd()) {
      throw new ExpressionError('Expression is incomplete', this.offset + t.start);
    }

    if (t.kind === 'num') {
      this.advance();
      return numberNode(t.text, this.offset + t.start);
    }

    if (t.kind === 'str') {
      this.advance();
      return stringNode(t, this.offset + t.start);
    }

    if (t.kind === 'ident') {
      this.advance();
      if (t.text === 'null') return { _type: T.nul };
      const konst = CONST_BY_TEXT.get(t.text);
      if (konst !== undefined) return { _type: konst };
      // A name followed by `(` becomes a call in the Pratt loop.
      return { _type: T.variable, f4289X: t.text };
    }

    // prefix operators
    if (t.kind === 'op') {
      if (t.text === '(') {
        this.advance();
        const inner = this.expr(NO_LIMIT);
        this.expect(')');
        return { _type: T.group, f4650X: inner };
      }
      if (t.text === '[') return this.listLiteral();
      if (t.text === '{') return this.mapLiteral();
      const tid = PREFIX_BY_OP.get(t.text);
      if (tid !== undefined) {
        this.advance();
        return { _type: tid, f4650X: this.expr(PREFIX_OPERAND_BP) };
      }
    }

    throw new ExpressionError(`Unexpected ${this.describe()}`, this.offset + t.start);
  }

  private listLiteral(): FloObject {
    this.expect('[');
    const items: FloValue[] = [];
    if (!this.at(']')) {
      do {
        if (this.at(']')) break; // trailing comma
        items.push(this.expr(NO_LIMIT));
      } while (this.eat(','));
    }
    this.expect(']');
    return { _type: T.list, items };
  }

  private mapLiteral(): FloObject {
    this.expect('{');
    const kv: Array<[FloValue, FloValue, number]> = [];
    if (!this.at('}')) {
      do {
        if (this.at('}')) break; // trailing comma
        const key = this.expr(NO_LIMIT);
        this.expect(':');
        const value = this.expr(NO_LIMIT);
        let conv = -1;
        if (this.tok.kind === 'ident' && this.tok.text === 'as') {
          this.advance();
          if (this.tok.kind !== 'ident') {
            throw new ExpressionError('Expected a conversion type after `as`', this.offset + this.tok.start);
          }
          const name = this.advance().text;
          const idx = CONVERSION_TYPES.indexOf(name);
          if (idx < 0) {
            throw new ExpressionError(`Unknown conversion type ${JSON.stringify(name)}`, this.offset + this.tok.start);
          }
          conv = idx;
        }
        kv.push([key, value, conv]);
      } while (this.eat(','));
    }
    this.expect('}');
    return { _type: T.map, pairs: { _kv: kv } };
  }
}

// ---------------------------------------------------------------- builders

/**
 * Place call arguments into the fields the node actually serializes. The wire
 * schema states them, so arity handling stays correct without a per-function
 * table: variadic functions take an array, fixed-arity ones take slots.
 */
function buildCall(tid: number, name: string, args: FloValue[], at: number): FloObject {
  const ops = schema[String(tid)]?.ops ?? [];
  const node: FloObject = { _type: tid };

  const variadic = ops.find((o) => o.op === 'varargs');
  if (variadic) {
    node[variadic.f] = { _arr: args };
    return node;
  }

  // De-duplicated: a few generated entries name the same field twice
  // (`urlDecode` has `f4645Z` in two slots), and assigning both would write the
  // argument and then immediately overwrite it with the missing one's null.
  const slots = [...new Set(ops.filter((o) => o.op === 'obj').map((o) => o.f))];
  if (args.length > slots.length) {
    throw new ExpressionError(
      `${name}() takes at most ${slots.length} argument(s), got ${args.length}`,
      at,
    );
  }
  slots.forEach((field, i) => {
    node[field] = i < args.length ? args[i] : null;
  });
  return node;
}

function numberNode(text: string, at: number): FloObject {
  const big = text.endsWith('n');
  const body = big ? text.slice(0, -1) : text;

  const hex = /^0[xX]/.test(body);
  const bin = /^0[bB]/.test(body);

  if (big) {
    const value = BigInt(hex || bin ? body : body);
    return bigIntNode(hex ? T.bigHex : bin ? T.bigBinary : T.bigDecimal, value);
  }

  const value = hex || bin ? Number(BigInt(body)) : Number(body);
  if (!Number.isFinite(value)) throw new ExpressionError(`Invalid number ${text}`, at);
  return { _type: hex ? T.hex : bin ? T.binary : T.decimal, f4637X: value };
}

/** Big integers are stored as sign * word count, then big-endian 32-bit words. */
function bigIntNode(tid: number, value: bigint): FloObject {
  if (value === 0n) return { _type: tid, signWords: 0, words: [] };
  const negative = value < 0n;
  let magnitude = negative ? -value : value;
  const words: number[] = [];
  while (magnitude > 0n) {
    words.unshift(Number(BigInt.asIntN(32, magnitude & 0xffffffffn)));
    magnitude >>= 32n;
  }
  return { _type: tid, signWords: (negative ? -1 : 1) * words.length, words };
}

function stringNode(tok: Token, at: number): FloObject {
  const parts = tok.parts ?? [{ text: '' }];
  const exprSources = parts.filter((p): p is { expr: string; at: number } => 'expr' in p);

  if (exprSources.length === 0) {
    const text = parts.map((p) => ('text' in p ? p.text : '')).join('');
    return { _type: T.string, f4649X: text };
  }

  // Interpolated: N+1 literal chunks around N embedded expressions.
  const strings: string[] = [];
  const exprs: FloValue[] = [];
  let pending = '';
  for (const p of parts) {
    if ('text' in p) {
      pending += p.text;
    } else {
      strings.push(pending);
      pending = '';
      exprs.push(new Parser(p.expr, p.at).parseAll());
    }
  }
  strings.push(pending);

  if (strings.length !== exprs.length + 1) {
    throw new ExpressionError('Malformed string interpolation', at);
  }
  const flagBytes = Math.floor(exprs.length / 8) + 1;
  return {
    _type: T.interp,
    strings,
    exprs,
    flags: '00'.repeat(flagBytes),
  };
}

// -------------------------------------------------------------------- public

/**
 * Compile Automate expression source into an expression node.
 * Empty (or whitespace-only) source yields `null`, the app's null literal.
 *
 * Throws {@link ExpressionError} with a source offset on invalid input.
 */
export function parseExpression(source: string): FloValue {
  return new Parser(source).parseAll();
}
