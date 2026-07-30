/**
 * Downloads a sample of public flows from the Automate community site.
 *
 *   npx tsx tools/fetch-community.ts <dir> [--max 800] [--min-statements 20]
 *                                          [--per-author 8] [--index-only]
 *
 * These are other people's flows. They are fixtures only — never committed
 * (`.gitignore` excludes `*.flo` and `corpus/`), never redistributed, and only
 * ever read to learn what a flow written by the app actually looks like.
 *
 * Why bother: byte-exact round-tripping only proves we can reproduce files that
 * came *from* Automate. It says nothing about files we author, and it only
 * covers block types that appear in the corpus. The corpus is the evidence for
 * both, which is what `tools/mine-conventions.ts` and `tools/audit-corpus.ts`
 * consume.
 *
 * Selection matters more than volume. The catalogue holds ~25,000 flows and the
 * goal is *block-type coverage*, so:
 *
 *   - the whole index is harvested first (metadata only, 64 per request) and
 *     ranked by statement count, because a 300-block flow exercises far more of
 *     the vocabulary than thirty 10-block ones;
 *   - and a per-author cap keeps one prolific author's family of near-identical
 *     flows from crowding out everyone else, which would make any statistic
 *     mined from the corpus a statistic about that one person's habits.
 *
 * Polite by construction: one request at a time, a pause between each, and
 * resumable — a flow already on disk is not fetched again, and the harvested
 * index is cached so re-running does not re-walk the catalogue.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://llamalab.com/automate/community/api/v1/flows';
/** The API returns a fixed page size regardless of what is asked for. */
const PAGE = 64;
const DELAY_MS = 300;

interface FlowMeta {
  id: number;
  title: string;
  statements: number;
  dataVersion: number;
  user?: { id: number; name: string };
  category?: { id: number; title: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function flag(name: string, fallback: number): number {
  const at = process.argv.indexOf(name);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
}

async function getPage(offset: number): Promise<FlowMeta[]> {
  const res = await fetch(`${BASE}?offset=${offset}`);
  if (!res.ok) throw new Error(`offset ${offset} -> ${res.status}`);
  return (await res.json()) as FlowMeta[];
}

/** Walk the whole catalogue, metadata only. Cached: it changes slowly. */
async function harvest(cache: string): Promise<FlowMeta[]> {
  if (existsSync(cache)) {
    const known = JSON.parse(readFileSync(cache, 'utf8')) as FlowMeta[];
    console.log(`index: ${known.length} flows (cached)`);
    return known;
  }
  const byId = new Map<number, FlowMeta>();
  for (let offset = 0; ; offset += PAGE) {
    const page = await getPage(offset);
    if (page.length === 0) break;
    for (const m of page) byId.set(m.id, m);
    if (offset % (PAGE * 40) === 0) console.log(`  harvested ${byId.size}…`);
    await sleep(DELAY_MS);
  }
  const all = [...byId.values()];
  writeFileSync(cache, JSON.stringify(all));
  console.log(`index: ${all.length} flows`);
  return all;
}

/** Biggest first, but no author may dominate. */
function select(all: FlowMeta[], max: number, minStatements: number, perAuthor: number) {
  const ranked = all
    .filter((m) => m.statements >= minStatements)
    .sort((a, b) => b.statements - a.statements);
  const used = new Map<number, number>();
  const picked: FlowMeta[] = [];
  for (const m of ranked) {
    if (picked.length >= max) break;
    const author = m.user?.id ?? -1;
    const n = used.get(author) ?? 0;
    if (n >= perAuthor) continue;
    used.set(author, n + 1);
    picked.push(m);
  }
  return picked;
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir || dir.startsWith('--')) {
    console.error('usage: fetch-community.ts <dir> [--max N] [--min-statements N]');
    process.exit(2);
  }
  const max = flag('--max', 400);
  const minStatements = flag('--min-statements', 0);
  const perAuthor = flag('--per-author', 8);
  mkdirSync(dir, { recursive: true });

  const all = await harvest(join(dir, 'index-all.json'));
  if (process.argv.includes('--index-only')) {
    const sizes = all.map((m) => m.statements).sort((a, b) => b - a);
    console.log(
      `statements: max ${sizes[0]}, p50 ${sizes[sizes.length >> 1]}, ` +
        `${sizes.filter((s) => s >= 50).length} flows with 50+`,
    );
    return;
  }

  const wanted = select(all, max, minStatements, perAuthor);
  console.log(
    `selected ${wanted.length} flows, ${wanted.reduce((a, m) => a + m.statements, 0)} statements, ` +
      `from ${new Set(wanted.map((m) => m.user?.id)).size} authors ` +
      `(largest ${wanted[0]?.statements}, smallest ${wanted[wanted.length - 1]?.statements})`,
  );

  const indexPath = join(dir, 'index.json');
  const index: Record<string, FlowMeta> = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : {};

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
    if (fetched % 50 === 0) console.log(`  ${fetched} downloaded…`);
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
