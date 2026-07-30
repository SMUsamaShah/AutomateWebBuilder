/**
 * Downloads a sample of public flows from the Automate community site.
 *
 *   npx tsx tools/fetch-community.ts <dir> [--max 400]
 *
 * These are other people's flows. They are fixtures only — never committed
 * (`.gitignore` excludes `*.flo`), never redistributed, and only ever read to
 * learn what a flow written by the app actually looks like.
 *
 * Why bother: byte-exact round-tripping only proves we can reproduce files that
 * came *from* Automate. It says nothing about files we author. The corpus is
 * the evidence for what the app itself writes, which is what
 * `tools/mine-invariants.ts` turns into checks.
 *
 * Polite by construction: one request at a time, a pause between each, and
 * resumable — a flow already on disk is not fetched again.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://llamalab.com/automate/community/api/v1/flows';
/** The API returns a fixed page size regardless of what is asked for. */
const PAGE = 64;
const DELAY_MS = 350;

interface FlowMeta {
  id: number;
  title: string;
  statements: number;
  dataVersion: number;
  user?: { id: number; name: string };
  category?: { id: number; title: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<FlowMeta[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as FlowMeta[];
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: fetch-community.ts <dir> [--max N]');
    process.exit(2);
  }
  const maxAt = process.argv.indexOf('--max');
  const max = maxAt > 0 ? Number(process.argv[maxAt + 1]) : 400;
  mkdirSync(dir, { recursive: true });

  const indexPath = join(dir, 'index.json');
  const index: Record<string, FlowMeta> = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : {};

  const wanted: FlowMeta[] = [];
  for (let offset = 0; wanted.length < max; offset += PAGE) {
    const page = await getJson(`${BASE}?offset=${offset}`);
    if (page.length === 0) break;
    wanted.push(...page);
    await sleep(DELAY_MS);
  }
  wanted.length = Math.min(wanted.length, max);

  let fetched = 0;
  let skipped = 0;
  for (const meta of wanted) {
    const file = join(dir, `${meta.id}.flo`);
    if (existsSync(file)) {
      skipped++;
      continue;
    }
    const res = await fetch(`${BASE}/${meta.id}/data`);
    if (!res.ok) {
      console.warn(`  ${meta.id}: HTTP ${res.status}, skipping`);
      await sleep(DELAY_MS);
      continue;
    }
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
    index[String(meta.id)] = meta;
    fetched++;
    if (fetched % 25 === 0) console.log(`  ${fetched} fetched…`);
    await sleep(DELAY_MS);
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 1));
  const authors = new Set(Object.values(index).map((m) => m.user?.id));
  console.log(
    `${fetched} downloaded, ${skipped} already present; ` +
      `${Object.keys(index).length} flows from ${authors.size} authors in ${dir}`,
  );
}

void main();
