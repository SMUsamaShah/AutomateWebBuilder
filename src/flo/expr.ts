/**
 * Renders decoded expression nodes back to Automate expression source.
 *
 * The app's own `w(flags)` methods produce this text; `tools/generate_exprtable.py`
 * lifts their operator symbols and function names into `exprtable.json` so the
 * two stay in agreement.
 *
 * Rendering is one-way for now: it drives the read-only parts of the UI (block
 * summaries, field previews). Fields the user edits are stored as string
 * literals or left untouched, so a flow never loses information it came in with.
 */

import exprTableJson from '../data/exprtable.json';
import type { FloObject, FloValue } from './types';

interface ExprRule {
  kind: string;
  op?: string;
  name?: string;
  text?: string;
}

const table = exprTableJson as unknown as Record<string, ExprRule>;

/** Binding power per binary operator; higher binds tighter. Mirrors the app's grammar. */
const PRECEDENCE: Record<string, number> = {
  '?': 1,
  '||': 2,
  '&&': 3,
  '|': 4,
  '^': 5,
  '&': 6,
  '=': 7,
  '!=': 7,
  '<': 8,
  '<=': 8,
  '>': 8,
  '>=': 8,
  '<<': 9,
  '>>': 9,
  '>>>': 9,
  '+': 10,
  '-': 10,
  '++': 10,
  '*': 11,
  '/': 11,
  '//': 11,
  '%': 11,
  '[': 14,
};

const UNARY_PRECEDENCE = 13;
const ATOM = 100;

function isObject(v: unknown): v is FloObject {
  return typeof v === 'object' && v !== null && typeof (v as FloObject)._type === 'number';
}

/** Quote a string the way Automate expression source does. */
export function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += ch;
  }
  return out + '"';
}

/** Format a double the way the app prints numeric literals. */
function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : v < 0 ? '-Infinity' : 'NaN';
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

function bigintText(o: FloObject): string {
  const words = (o.words as number[]) ?? [];
  const signWords = (o.signWords as number) ?? 0;
  if (signWords === 0 || words.length === 0) return '0n';
  let magnitude = 0n;
  for (const w of words) magnitude = (magnitude << 32n) | BigInt(w >>> 0);
  return `${signWords < 0 ? '-' : ''}${magnitude}n`;
}

interface Rendered {
  text: string;
  /** Binding power of the outermost operator, for parenthesising. */
  power: number;
}

function renderNode(v: FloValue, depth: number): Rendered {
  if (v === null || v === undefined) return { text: '', power: ATOM };
  if (depth > 64) return { text: '…', power: ATOM };
  if (!isObject(v)) return { text: String(v), power: ATOM };

  const rule = table[String(v._type)];
  if (!rule) return { text: '…', power: ATOM };

  const child = (field: string): Rendered => renderNode(v[field] as FloValue, depth + 1);
  const wrap = (r: Rendered, minPower: number): string =>
    r.power < minPower ? `(${r.text})` : r.text;

  switch (rule.kind) {
    case 'var':
      return { text: String(v.f4289X ?? ''), power: ATOM };

    case 'string':
      return { text: quote(String(v.f4649X ?? '')), power: ATOM };

    case 'number':
      return { text: formatNumber(Number(v.f4637X ?? 0)), power: ATOM };

    case 'bigint':
      return { text: bigintText(v), power: ATOM };

    case 'null':
      return { text: '', power: ATOM };

    case 'const':
      return { text: rule.text ?? '', power: ATOM };

    case 'group':
      return { text: `(${child('f4650X').text})`, power: ATOM };

    case 'prefix': {
      const inner = child('f4650X');
      return { text: `${rule.op}${wrap(inner, UNARY_PRECEDENCE)}`, power: UNARY_PRECEDENCE };
    }

    case 'binary': {
      const op = rule.op!;
      const power = PRECEDENCE[op] ?? 7;
      const left = child('f4653X');
      const right = child('f4654Y');
      if (op === '[') {
        return { text: `${wrap(left, ATOM)}[${right.text}]`, power: ATOM };
      }
      // Left-associative: the right operand needs parens at equal precedence.
      return {
        text: `${wrap(left, power)} ${op} ${wrap(right, power + 1)}`,
        power,
      };
    }

    case 'ternary': {
      const cond = renderNode(v.f4643X as FloValue, depth + 1);
      const yes = renderNode(v.f4644Y as FloValue, depth + 1);
      const no = renderNode(v.f4645Z as FloValue, depth + 1);
      return { text: `${wrap(cond, 2)} ? ${yes.text} : ${no.text}`, power: 1 };
    }

    case 'func': {
      const args: string[] = [];
      // Functions store operands either as a fixed arity (Z/AbstractC1037e/U
      // field names) or as a variadic array.
      const varargs = v.args as { _arr?: FloValue[]; _varargs2?: FloValue[] } | undefined;
      if (varargs?._arr || varargs?._varargs2) {
        for (const a of varargs._arr ?? varargs._varargs2 ?? []) {
          args.push(renderNode(a, depth + 1).text);
        }
      } else {
        for (const f of ['f4650X', 'f4653X', 'f4654Y', 'f4643X', 'f4644Y', 'f4645Z']) {
          if (f in v) args.push(renderNode(v[f] as FloValue, depth + 1).text);
        }
      }
      while (args.length && args[args.length - 1] === '') args.pop();
      return { text: `${rule.name}(${args.join(', ')})`, power: ATOM };
    }

    case 'interp': {
      // "chunk{expr}chunk…" — N chunks interleaved with N-1 expressions.
      const strings = (v.strings as string[]) ?? [];
      const exprs = (v.exprs as FloValue[]) ?? [];
      let text = '"';
      for (let i = 0; i < strings.length; i++) {
        text += strings[i].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        if (i < exprs.length) text += `{${renderNode(exprs[i], depth + 1).text}}`;
      }
      return { text: text + '"', power: ATOM };
    }

    case 'list': {
      const items = ((v.items as FloValue[]) ?? []).map((i) => renderNode(i, depth + 1).text);
      return { text: `[${items.join(', ')}]`, power: ATOM };
    }

    case 'map': {
      const kv = (v.pairs as { _kv?: Array<[FloValue, FloValue, number]> })?._kv ?? [];
      const parts = kv.map(
        ([k, val]) => `${renderNode(k, depth + 1).text}: ${renderNode(val, depth + 1).text}`,
      );
      return { text: `{${parts.join(', ')}}`, power: ATOM };
    }

    default:
      return { text: '…', power: ATOM };
  }
}

/** Render an expression node to Automate expression source. */
export function renderExpression(v: FloValue): string {
  return renderNode(v, 0).text;
}

/** True when the value is an expression node we know how to render. */
export function isExpression(v: unknown): boolean {
  return isObject(v) && String(v._type) in table;
}

/**
 * Boxed Java primitives (`Integer`, `Boolean`, …) appear as ordinary argument
 * values — `continuity` flags and similar switches are stored this way — so the
 * editor treats them as plain scalars rather than expression trees.
 */
const PRIMITIVE_TYPES = new Set([1, 4, 7, 10, 13, 16, 19, 22, 25]);

export function isPrimitiveBox(v: unknown): v is FloObject {
  return isObject(v) && PRIMITIVE_TYPES.has(v._type) && 'value' in v;
}

/** The scalar inside a boxed primitive, as a string for form fields. */
export function primitiveText(v: FloObject): string {
  const raw = v.value;
  return raw === null || raw === undefined ? '' : String(raw);
}

/** Rebuild a boxed primitive of the same type from edited text. */
export function withPrimitiveText(v: FloObject, text: string): FloObject {
  if (v._type === 25) return { _type: 25, value: text };
  if (v._type === 19) return { _type: 19, value: BigInt(text || '0') };
  const n = Number(text);
  return { _type: v._type, value: Number.isFinite(n) ? n : 0 };
}

/** Build a string-literal expression node (type 106 = K3.W). */
export function stringLiteral(s: string): FloObject {
  return { _type: 106, f4649X: s };
}

/** Build a numeric-literal expression node (type 104 = K3.J). */
export function numberLiteral(n: number): FloObject {
  return { _type: 104, f4637X: n };
}

/** Build a variable-reference node (type 102 = I3.l). */
export function variableRef(name: string): FloObject {
  return { _type: 102, f4289X: name };
}
