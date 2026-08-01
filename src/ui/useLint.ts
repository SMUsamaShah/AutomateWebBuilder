/**
 * Lint findings for the open flow, grouped for the UI.
 *
 * `lintFlow` walks every block, so this recomputes only when the model actually
 * changes — the model is mutated in place, hence keying on the revision counter
 * rather than on identity.
 */

import { useMemo } from 'react';
import { lintFlow } from '../flo/lint';
import type { LintFinding } from '../flo/lint';
import type { BlockId, FlowModel } from '../flo/model';

export interface FlowLint {
  all: LintFinding[];
  errors: number;
  warnings: number;
  /** Findings for one block, by field name. */
  byBlock: Map<BlockId, LintFinding[]>;
  /** Worst severity per block, for marking the flowchart. */
  severityByBlock: Map<BlockId, 'error' | 'warning'>;
  /** First block with a problem, for "jump to it". */
  first: BlockId | null;
}

export function useLint(model: FlowModel, rev: number): FlowLint {
  return useMemo(() => {
    const all = lintFlow(model);
    const byBlock = new Map<BlockId, LintFinding[]>();
    for (const f of all) {
      const list = byBlock.get(f.blockId);
      if (list) list.push(f);
      else byBlock.set(f.blockId, [f]);
    }
    const severityByBlock = new Map<BlockId, 'error' | 'warning'>();
    for (const f of all) {
      // lintFlow sorts errors first, so the first entry per block is the worst.
      if (!severityByBlock.has(f.blockId)) severityByBlock.set(f.blockId, f.severity);
    }
    return {
      all,
      errors: all.filter((f) => f.severity === 'error').length,
      warnings: all.filter((f) => f.severity === 'warning').length,
      byBlock,
      severityByBlock,
      first: all[0]?.blockId ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, rev]);
}
