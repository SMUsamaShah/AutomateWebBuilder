/**
 * Explain what a `.flo` file does, in reading order.
 *
 *   npm run explain -- path/to/flow.flo
 *   npm run explain -- path/to/flow.flo --json
 *
 * Walks the control flow from every entry point, printing each block with its
 * arguments rendered as Automate expression source, labelling branches, and
 * marking where control rejoins a block already shown. Also summarises the
 * variables a flow reads and writes and the side effects it performs, which is
 * the part that is hard to see on a phone screen.
 */

import { readFileSync } from 'node:fs';
import { schema } from '../src/flo/codec';
import { toModel } from '../src/flo/model';
import { describeBlock, editableFields, outputPorts } from '../src/flo/blocks';
import { isExpression, renderExpression } from '../src/flo/expr';
import type { Block, FlowModel } from '../src/flo/model';

// Piping into `head` or `grep -m` closes stdout early; exit quietly instead of
// crashing with an unhandled EPIPE.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const asJson = args.includes('--json');

if (!path) {
  console.error('usage: npm run explain -- <flow.flo> [--json]');
  process.exit(2);
}

const model = toModel(new Uint8Array(readFileSync(path)));
const byId = new Map(model.blocks.map((b) => [b.id, b]));

/** Outgoing edges of a block, keyed by port field. */
function edges(id: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of model.connections) if (c.from === id) out.set(c.port, c.to);
  return out;
}

const incoming = new Map<string, number>();
for (const c of model.connections) {
  incoming.set(c.to, (incoming.get(c.to) ?? 0) + 1);
}

/** Blocks that start execution: flow beginnings, plus anything unreachable. */
function entryPoints(): Block[] {
  const beginnings = model.blocks.filter((b) => b.entry?.layout === 'block_beginning');
  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const to of edges(id).values()) walk(to);
  };
  for (const b of beginnings) walk(b.id);
  const orphans = model.blocks.filter(
    (b) => !reachable.has(b.id) && (incoming.get(b.id) ?? 0) === 0,
  );
  return [...beginnings, ...orphans];
}

/** Arguments worth printing, as `name = expression`. */
function argsOf(block: Block): string[] {
  const out: string[] = [];
  for (const f of editableFields(block.typeId)) {
    const v = block.raw[f.name];
    if (v === null || v === undefined) continue;
    if (isExpression(v)) {
      const text = renderExpression(v as never);
      if (text) out.push(`${f.name} = ${text}`);
    } else if (typeof v === 'string' && v) {
      out.push(`${f.name} = ${JSON.stringify(v)}`);
    } else if (typeof v === 'object' && v && '_type' in (v as object)) {
      const t = (v as { _type: number })._type;
      // Boxed primitives read as plain scalars.
      if ([1, 4, 7, 10, 13, 16, 19, 22, 25].includes(t)) {
        out.push(`${f.name} = ${String((v as { value: unknown }).value)}`);
      }
    }
  }
  return out;
}

const label = (b: Block) => `#${b.id} ${describeBlock(b.raw, b.entry)}`;

/** Depth-first trace with branch labels and revisit markers. */
function trace(startId: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  const visit = (id: string, depth: number, viaLabel: string | null) => {
    const b = byId.get(id);
    if (!b) return;
    const pad = '  '.repeat(depth);
    const via = viaLabel ? `${viaLabel} ` : '';

    if (seen.has(id)) {
      lines.push(`${pad}${via}↺ back to #${id}`);
      return;
    }
    seen.add(id);

    lines.push(`${pad}${via}${label(b)}`);
    for (const a of argsOf(b)) lines.push(`${pad}    ${a}`);

    const out = edges(id);
    const ports = outputPorts(b.typeId);
    const taken = ports.filter((p) => out.has(p.field));

    if (taken.length === 0) {
      const terminal = ports.length === 0 ? ' (end)' : ' (nothing connected)';
      lines[lines.length - 1 - argsOf(b).length] += terminal;
      return;
    }
    for (const p of taken) {
      // A single continuation reads better without a label or extra indent.
      const only = taken.length === 1 && p.label === 'OK';
      visit(out.get(p.field)!, only ? depth : depth + 1, only ? null : `[${p.label}]`);
    }
  };

  visit(startId, 0, null);
  return lines;
}

// ------------------------------------------------------------------ summary

function variableUse(m: FlowModel) {
  const written = new Set<string>();
  const read = new Set<string>();

  // Expression trees are small, but a statement's fields point at the *next*
  // statement, and those chains loop. Walking into them overflows the stack on a
  // large flow, so stop at statement boundaries (the outer loop visits every
  // block anyway) and guard against shared subtrees.
  const seen = new WeakSet<object>();
  const collectReads = (v: unknown, into: Set<string>) => {
    if (!v || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    const o = v as { _type?: number; [k: string]: unknown };
    if ((o._type ?? 0) >= 1000) return; // a statement, not an expression
    if (o._type === 102) into.add(String(o.f4289X));
    for (const val of Object.values(o)) {
      if (Array.isArray(val)) val.forEach((x) => collectReads(x, into));
      else if (val && typeof val === 'object') collectReads(val, into);
    }
  };

  const nameOf = (v: unknown): string | null =>
    v && typeof v === 'object' && (v as { _type?: number })._type === 102
      ? String((v as { f4289X: string }).f4289X)
      : null;

  for (const b of m.blocks) {
    for (const op of schema[String(b.typeId)].ops ?? []) {
      const v = b.raw[op.f];
      // A field cast to the variable type is an assignment target, not a read.
      if (op.op === 'obj' && op.cast === 'I3.l') {
        const n = nameOf(v);
        if (n) written.add(n);
        continue;
      }
      // Destructuring blocks assign a whole array of targets at once.
      if (op.op === 'objarray' && op.cast === 'I3.l[]') {
        for (const item of (v as { _arr?: unknown[] } | undefined)?._arr ?? []) {
          const n = nameOf(item);
          if (n) written.add(n);
        }
        continue;
      }
      if (op.op === 'obj') collectReads(v, read);
    }
  }
  return { written: [...written].sort(), read: [...read].sort() };
}

const SIDE_EFFECTS: Array<[RegExp, string]> = [
  [/^Adb|^ShellCommand/, 'runs shell commands'],
  [/^Http|^Ftp|^GDrive|^OneDrive|^WakeOnLan|^Ping|^Nsd/, 'network access'],
  [/^File|^Zip|^MediaStore|^Content(Write|Insert|Update|Delete)/, 'reads or writes files'],
  [/^Dialog|^Toast|^Notification|^FloatingButton|^QuickSettings/, 'shows UI'],
  [/^Sound|^Speak|^Tone|^Vibrate|^Dtmf/, 'plays sound or vibrates'],
  [/^Sms|^Mms|^Email|^Gmail|^Call|^Dial/, 'messaging or calls'],
  [/^Wifi|^Bluetooth|^Nfc|^MobileData|^AirplaneMode|^Usb/, 'changes connectivity'],
  [/^Location|^Geocoding|^Weather/, 'location'],
  [/^Interact|^KeySend|^Screenshot|^InspectLayout/, 'drives other apps (accessibility)'],
  [/^Flow(Start|Stop)|^Subroutine|^Fork|^Fiber/, 'starts or stops other flows'],
  [/^SystemSetting|^AppOp|^Device(Reboot|Shutdown|Restart)/, 'changes system settings'],
];

function summary(m: FlowModel) {
  const counts = new Map<string, number>();
  for (const b of m.blocks) {
    const n = b.entry?.title ?? b.entry?.name ?? `type ${b.typeId}`;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const effects = new Set<string>();
  for (const b of m.blocks) {
    const name = b.entry?.name ?? '';
    for (const [rex, what] of SIDE_EFFECTS) if (rex.test(name)) effects.add(what);
  }
  return {
    blockCounts: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    effects: [...effects].sort(),
  };
}

// ------------------------------------------------------------------- output

const entries = entryPoints();
const vars = variableUse(model);
const sum = summary(model);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        file: path,
        version: model.version,
        blocks: model.blocks.length,
        connections: model.connections.length,
        entryPoints: entries.map((b) => ({ id: b.id, label: label(b) })),
        variables: vars,
        sideEffects: sum.effects,
        blockCounts: Object.fromEntries(sum.blockCounts),
        traces: entries.map((b) => ({ from: b.id, lines: trace(b.id) })),
      },
      null,
      2,
    ),
  );
} else {
  const name = path.split('/').pop();
  console.log(`${name}`);
  console.log(
    `format v${model.version} · ${model.blocks.length} blocks · ${model.connections.length} connections\n`,
  );

  console.log(`Entry points (${entries.length}):`);
  for (const b of entries) console.log(`  ${label(b)}`);
  console.log();

  if (sum.effects.length) {
    console.log('Does:');
    for (const e of sum.effects) console.log(`  - ${e}`);
    console.log();
  }

  console.log(`Variables assigned (${vars.written.length}): ${vars.written.join(', ') || '—'}`);
  console.log(`Variables referenced (${vars.read.length}): ${vars.read.join(', ') || '—'}`);
  console.log();

  console.log('Most used blocks:');
  for (const [n, c] of sum.blockCounts.slice(0, 12)) console.log(`  ${String(c).padStart(3)}  ${n}`);
  console.log();

  for (const b of entries) {
    console.log('─'.repeat(72));
    console.log(`Trace from ${label(b)}`);
    console.log('─'.repeat(72));
    for (const line of trace(b.id)) console.log(line);
    console.log();
  }
}
