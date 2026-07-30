/**
 * Reports the mistakes that only show up on a phone.
 *
 *   npm run lint -- path/to/flow.flo [more.flo ...]
 *
 * Exits non-zero if any flow has an error-level finding, so it can gate a
 * build. Warnings are advice and do not fail.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toModel, validateModel } from '../src/flo/model';
import { formatFindings, lintFlow } from '../src/flo/lint';

function expand(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      out.push(...readdirSync(p).filter((f) => f.toLowerCase().endsWith('.flo')).map((f) => join(p, f)));
    } else {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: lint-flow.ts <flow.flo | dir> ...');
    process.exit(2);
  }

  let errors = 0;
  let warnings = 0;
  let unreadable = 0;

  for (const file of expand(args)) {
    let model;
    try {
      model = toModel(new Uint8Array(readFileSync(file)));
    } catch (err) {
      console.log(`${file}\n  could not read: ${(err as Error).message}`);
      unreadable++;
      continue;
    }

    const structural = validateModel(model);
    const findings = lintFlow(model);
    if (structural.length === 0 && findings.length === 0) continue;

    console.log(file);
    for (const p of structural) console.log(`  invalid ${p}`);
    if (findings.length) console.log(formatFindings(findings).replace(/^/gm, '  '));
    errors += structural.length + findings.filter((f) => f.severity === 'error').length;
    warnings += findings.filter((f) => f.severity === 'warning').length;
  }

  console.log(`\n${errors} error(s), ${warnings} warning(s), ${unreadable} unreadable`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
