/**
 * Discover block types.
 *
 *   npm run blocks                  # category overview
 *   npm run blocks -- wifi          # search name, title and summary
 *   npm run blocks -- --id 1046     # everything about one block
 *   npm run blocks -- --index       # regenerate docs/BLOCKS.md
 *
 * An agent editing a flow needs to answer "which block turns Wi-Fi on, and what
 * are its arguments called?" without reading 400 classes. Search covers that
 * when a keyword is known; `docs/BLOCKS.md` is the whole vocabulary in one
 * readable file, small enough to hand over in full.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from '../src/flo/model';
import { blockCategory, categories, editableFields, outputPorts } from '../src/flo/blocks';
import type { CatalogEntry } from '../src/flo/types';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = Object.values(catalog) as CatalogEntry[];

const byCategory = () => {
  const groups = new Map<string, CatalogEntry[]>();
  for (const e of all) {
    const c = blockCategory(e);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(e);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name));
  }
  return groups;
};

/** Ports and arguments, the two things needed to actually use a block. */
function detail(e: CatalogEntry): string[] {
  const ports = outputPorts(e.id);
  const fields = editableFields(e.id);
  return [
    `${e.id}  ${e.name}  —  ${e.title ?? ''}`,
    e.summary ? `    ${e.summary}` : '',
    `    category: ${blockCategory(e)}`,
    `    ports:    ${ports.map((p) => `${p.label} -> ${p.field}`).join(', ') || '(terminal)'}`,
    `    fields:   ${fields.map((f) => `${f.name}:${f.op}`).join(', ') || '(none)'}`,
    e.doc ? `    docs:     https://llamalab.com/automate/doc/block/${e.doc}` : '',
  ].filter(Boolean);
}

function search(query: string): CatalogEntry[] {
  const q = query.toLowerCase();
  return all
    .filter((e) =>
      `${e.name} ${e.title ?? ''} ${e.summary ?? ''}`.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      // Name matches first: a search for "wifi" wants WifiEnabled before a
      // block that merely mentions Wi-Fi in its description.
      const an = a.name.toLowerCase().includes(q) ? 0 : 1;
      const bn = b.name.toLowerCase().includes(q) ? 0 : 1;
      return an - bn || (a.title ?? a.name).localeCompare(b.title ?? b.name);
    });
}

/** The complete index, as Markdown. Kept in sync by tests/blocks-index.test.ts. */
export function buildIndex(): string {
  const groups = byCategory();
  const lines: string[] = [
    '# Block reference',
    '',
    `All ${all.length} block types Automate supports, generated from the app itself by`,
    '`tools/blocks.ts` (`npm run blocks -- --index`). Do not edit by hand.',
    '',
    'The **id** is what `createBlock(model, id, x, y)` takes. For a block\'s ports and',
    'argument names — which you need before setting anything — run:',
    '',
    '```bash',
    'npm run blocks -- --id 1046',
    '```',
    '',
    'See [LLM-GUIDE.md](LLM-GUIDE.md) for how to use these in an edit.',
    '',
  ];

  for (const cat of categories()) {
    const list = groups.get(cat);
    if (!list?.length) continue;
    lines.push(`## ${cat} (${list.length})`, '');
    lines.push('| id | name | title | what it does |');
    lines.push('| --- | --- | --- | --- |');
    for (const e of list) {
      const summary = (e.summary ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${e.id} | \`${e.name}\` | ${e.title ?? ''} | ${summary} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--index')) {
    const out = join(REPO, 'docs/BLOCKS.md');
    writeFileSync(out, buildIndex());
    console.log(`wrote ${out} (${all.length} blocks)`);
    return;
  }

  const idFlag = args.indexOf('--id');
  if (idFlag !== -1) {
    const id = Number(args[idFlag + 1]);
    const entry = catalog[String(id)];
    if (!entry) {
      console.error(`no block with id ${id}`);
      process.exit(1);
    }
    console.log(detail(entry).join('\n'));
    return;
  }

  const query = args.find((a) => !a.startsWith('--'));
  if (!query) {
    const groups = byCategory();
    console.log(`${all.length} block types.\n`);
    for (const cat of categories()) {
      const list = groups.get(cat);
      if (list?.length) console.log(`  ${String(list.length).padStart(3)}  ${cat}`);
    }
    console.log('\nSearch:            npm run blocks -- wifi');
    console.log('One block:         npm run blocks -- --id 1046');
    console.log('Complete listing:  docs/BLOCKS.md');
    return;
  }

  const hits = search(query);
  if (!hits.length) {
    console.log(`nothing matches "${query}". Try a broader word, or see docs/BLOCKS.md.`);
    return;
  }
  console.log(`${hits.length} match(es) for "${query}":\n`);
  for (const e of hits.slice(0, 25)) console.log(detail(e).join('\n') + '\n');
  if (hits.length > 25) console.log(`… ${hits.length - 25} more; narrow the search.`);
}

// Only run as a CLI; the index builder is imported by tests.
if (process.argv[1]?.endsWith('blocks.ts')) main();
