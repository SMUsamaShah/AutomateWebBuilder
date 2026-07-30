/**
 * Checks a flow for the mistakes that only show up on a phone.
 *
 * `validateModel()` answers "will Automate load this file?" — wrong argument
 * types, dangling connections, ports assigned instead of connected. Everything
 * it checks is derivable from the format.
 *
 * This answers a different question: "will it then *work*?" Both bugs found by
 * running generated flows on a real device were invisible to every structural
 * check, because the files were perfectly well-formed:
 *
 *   - an argument the app requires at runtime, left null, throws
 *     `RequiredArgumentNullException` the moment the block executes;
 *   - a dialog without `startActivity` posts a notification instead of a
 *     window, and the fiber waits for a tap that never comes.
 *
 * Neither is knowable from the schema, so the rules come from two independent
 * places — the app's own bytecode (`tools/generate_required.py`) and a corpus
 * of real flows (`tools/mine-conventions.ts`). Where they overlap they agree:
 * of the 57 required fields observed in the corpus, not one was ever left null.
 *
 * This is advice, not validation. A flow that lints clean can still be wrong,
 * and an occasional warning will be a false alarm — which is why every finding
 * carries the evidence behind it.
 */

import conventionsJson from '../data/conventions.json';
import requiredJson from '../data/required.json';
import { schema } from './codec';
import { fieldKind } from './blocks';
import type { Block, FlowModel } from './model';

interface Tally {
  set: number;
  of: number;
}

const required = requiredJson as Record<string, string[]>;
const observed = (conventionsJson as { fields: Record<string, Record<string, Tally>> }).fields;
/** A field set in at least this share of real blocks is treated as expected. */
const CONVENTION_RATIO = 0.98;

export interface LintFinding {
  blockId: string;
  /** Block name as the app shows it, for a message a person can act on. */
  block: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

const classOf = new Map<number, string>();
for (const [tid, rec] of Object.entries(schema)) {
  if (rec.cls) classOf.set(Number(tid), rec.cls);
}

function label(block: Block): string {
  return block.entry?.title ?? block.entry?.name ?? `type ${block.typeId}`;
}

/**
 * A port is a connection, not an argument; `fromModel()` fills those in from
 * `model.connections`, so their emptiness here means nothing.
 */
function isArgument(typeId: number, field: string): boolean {
  return fieldKind(typeId, field) !== 'statement';
}

export function lintFlow(model: FlowModel): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const block of model.blocks) {
    const cls = classOf.get(block.typeId);
    if (!cls) continue;

    const isRequired = new Set(required[cls] ?? []);

    for (const field of isRequired) {
      if (!isArgument(block.typeId, field)) continue;
      if (block.raw[field] != null) continue;
      const tally = observed[cls]?.[field];
      // The app checks this field, but the check may sit on a path only some
      // configurations take. Real flows are the tie-breaker: if none of them
      // ever leave it empty, an empty one here is a mistake.
      const proven = tally !== undefined && tally.set === tally.of;
      findings.push({
        blockId: block.id,
        block: label(block),
        field,
        severity: proven ? 'error' : 'warning',
        message: proven
          ? `${field} is required — the app throws RequiredArgumentNullException, ` +
            `and all ${tally!.of} real blocks of this type set it`
          : `${field} has a required-argument check in the app; ` +
            (tally
              ? `${tally.set} of ${tally.of} real blocks set it, so this may be conditional`
              : `no corpus evidence either way`),
      });
    }

    for (const [field, tally] of Object.entries(observed[cls] ?? {})) {
      if (isRequired.has(field)) continue; // already reported, more precisely
      if (!isArgument(block.typeId, field)) continue;
      if (block.raw[field] != null) continue;
      if (tally.set === 0 || tally.set / tally.of < CONVENTION_RATIO) continue;
      findings.push({
        blockId: block.id,
        block: label(block),
        field,
        severity: 'warning',
        message: `${field} is unset, but ${tally.set} of ${tally.of} real blocks of this type set it`,
      });
    }
  }

  return findings.sort((a, b) =>
    a.severity === b.severity ? Number(a.blockId) - Number(b.blockId) : a.severity === 'error' ? -1 : 1,
  );
}

/** One line per finding, for a CLI or a toast. */
export function formatFindings(findings: LintFinding[]): string {
  return findings
    .map((f) => `${f.severity === 'error' ? 'error  ' : 'warning'} #${f.blockId} ${f.block}: ${f.message}`)
    .join('\n');
}
