# Working with Automate `.flo` files — guide for an AI agent

You have been handed this repository and asked to read, analyse or edit an
Automate flow. **This file is enough. Do not read the rest of the source to get
started.** Everything below is verified against the real library; the examples
in it are executed by `tests/guide.test.ts`, so if the API changes the tests
fail rather than this document going quietly stale.

Automate stores a flow as `.flo`, a binary format. This project decodes it, and
its central guarantee is that **loading a flow and saving it untouched
reproduces the file byte for byte**. Your job is to preserve that: change what
was asked and nothing else.

---

## 1. Setup

```bash
npm install            # once
```

Two entry points, both run TypeScript directly through `tsx`:

Put edit scripts at the **repository root** so the relative imports below
(`./src/flo/...`) resolve; from elsewhere, adjust the paths.

```bash
# Read: explain what a flow does, in execution order
npm run explain -- path/to/flow.flo
npm run explain -- path/to/flow.flo --json     # same analysis, machine-readable

# Edit: write a script and run it
npx tsx my-edit.ts
```

```bash
# Discover: which block does X, and what are its arguments called?
npm run blocks -- wifi
npm run blocks -- --id 1046
```

`npm run explain` is almost always the right first move. It prints entry points,
every block with its arguments as Automate expression source, branch labels,
where control loops back, which variables are assigned and referenced, and what
side effects the flow has.

---

## 2. The five rules

Breaking any of these corrupts flows in ways that are hard to notice.

1. **Never invent a block type id or a field name.** Look them up (§4). An
   unknown id throws; a misspelled field is silently ignored and its value lost.
2. **Edit `block.raw` in place; never rebuild a block object.** Fields you do
   not touch are written back exactly as they came in — that is what keeps the
   round trip byte-exact. Replacing `raw` drops everything you did not copy.
3. **Connections go through `connect()` / `disconnect()`, never by assigning
   port fields.** `fromModel()` clears every port field and rebuilds them from
   `model.connections`, so a direct assignment to `raw.onComplete` is discarded.
4. **Position and id live on the `Block`, not in `raw`.** Set `block.x`,
   `block.y` (grid cells, numbers) and read `block.id` (a string). `fromModel()`
   copies them into `raw`.
5. **Verify before handing the file back** (§8). At minimum: reload the saved
   file, and diff `npm run explain` before and after.

---

## 3. The shape of a flow

```ts
import { toModel, fromModel } from './src/flo/model';

const model = toModel(new Uint8Array(readFileSync('flow.flo')));
// ... edit ...
writeFileSync('out.flo', fromModel(model));
```

```ts
interface FlowModel {
  version: number;        // format version the file arrived in; do not change
  nextId: bigint;         // next free statement id; createBlock() maintains it
  blocks: Block[];
  connections: Connection[];
  order: BlockId[];       // top-level statement order; leave alone
}

interface Block {
  id: string;             // statement id, e.g. "50" — shown in the app's corner badge
  typeId: number;         // e.g. 1046 = Delay
  x: number;              // grid cell, not pixels
  y: number;
  raw: FloObject;         // the live serialized object — edit this in place
  entry?: CatalogEntry;   // title, summary, icon, doc page, layout
}

interface Connection {
  from: BlockId;
  port: string;           // field name on the source, e.g. "onComplete"
  to: BlockId;
}
```

`raw` is a plain object keyed by field name, plus `_type`. Three fields have
obfuscated names because the app's own code does:

| Field | Meaning |
| --- | --- |
| `f15575X` | statement id (`bigint`) |
| `f15576Y` | grid x |
| `f15577Z` | grid y |

Leave those to `fromModel()`. Any other `fXXXXX`-style name is a field whose
real name the decompiler could not recover; it still round-trips, and you can
usually identify it from its position in `editableFields()`.

---

## 4. Discovering blocks, and their fields and ports

There are **410 block types**. Never guess an id or a field name: an unknown id
throws, and a misspelled field is silently ignored and its value lost. Three
ways to find what you need, cheapest first.

### a. Search, when you have a keyword

```bash
npm run blocks -- wifi
```

```
1147  WifiEnabled  —  Wi-Fi enabled?
    Check if Wi-Fi is enabled.
    category: Connectivity
    ports:    YES -> onPositive, NO -> onNegative
    fields:   continuity:obj
    docs:     https://llamalab.com/automate/doc/block/wifi_enabled.html
```

It matches name, title and summary, and prints everything needed to use the
block. Search for the *effect* ("vibrate", "clipboard", "screenshot", "http"),
not for a class name you have imagined.

### b. The complete listing, when you do not

**[BLOCKS.md](BLOCKS.md)** is all 410 blocks with id, name, title and a
one-line description, grouped into the same categories the app uses. It is about
8,000 tokens — small enough to read in full when you need the whole vocabulary,
and the reliable answer to "what can Automate even do?".

```bash
npm run blocks                    # category overview with counts
npm run blocks -- --all           # print every block type
npm run blocks -- --id 1046       # ports and arguments of one block
```

Category sizes, for orientation: Connectivity 70, Camera & sound 56, Apps 51,
Interface 38, File & storage 31, Content 29, Battery & power 25, Sensor 14,
Telephony 14, Messaging 12, Flow 12, Date & time 11, Location 10, Concurrency
10, Settings 9, General 8, Other 10.

### c. Programmatically, inside an edit script

```ts
import { catalog } from './src/flo/model';
import { editableFields, outputPorts } from './src/flo/blocks';

// name -> type id
const idByName = new Map(
  Object.entries(catalog).map(([tid, e]) => [e.name, Number(tid)]),
);
const DELAY = idByName.get('Delay')!;         // 1046

// what can be set on it
editableFields(DELAY);
// [{name:'continuity',op:'obj'}, {name:'wakeup',op:'obj'}, {name:'duration',op:'obj'}]

// where it can continue to
outputPorts(DELAY);   // [{ field:'onComplete', label:'OK', side:'bottom', … }]
```

Search by human title when you only know what the user called it:

```ts
Object.entries(catalog)
  .filter(([, e]) => (e.title ?? '').toLowerCase().includes('toast'))
  .map(([tid, e]) => `${tid} ${e.name} — ${e.title}`);
// ["1120 ToastShow — Toast show"]
```

`catalog[tid]` also gives `summary` and `doc` (the page name on
`https://llamalab.com/automate/doc/block/`), which is the fastest way to check
what an argument means.

> Note: a block's `name` is its class name and its `title` is what the app
> displays, and they often differ — `ActivityStartResult` is shown as "App
> decision?". Search covers both.

### Verified examples

| Block | id | Ports | Editable fields |
| --- | --- | --- | --- |
| `Delay` | 1046 | `OK`→`onComplete` | `continuity`, `wakeup`, `duration` |
| `ToastShow` | 1120 | `OK`→`onComplete` | `continuity`, `message`, `duration` |
| `LogAppend` | 1093 | `OK`→`onComplete` | `message`, `whenLogging` |
| `ExpressionDecision` | 1058 | `YES`→`onPositive`, `NO`→`onNegative` | `expression` |
| `DialogChoice` | 1052 | `YES`→`onPositive`, `NO`→`onNegative` | `title`, `choiceTitles`, `varSelectedIndices`, … |
| `AdbShellCommand` | 1342 | `OK`→`onComplete` | `host`, `port`, `alias`, `command`, `varStdout`, … |
| `FlowBeginning` | 1072 | `GO`→`onComplete` | `title` (plain text), `hidden`, `parallel`, `varPayload` |
| `ForEach` | 1073 | `OK`→`onComplete`, `DO`→`onEachElement` | `container`, `varEntryValue`, … |
| `FailureCatch` | 1263 | `OK`→`onComplete`, `FAIL`→`onFailure` | `retryLimit`, `varFailureMessage`, … |

Note `FlowBeginning.title` is `op: 'utf_null'` — a plain string, not an
expression. Always check `op` before assigning (§5).

---

## 5. Setting field values

`editableFields()` gives each field's `op`, which decides what to assign.

| `op` | Assign | Example |
| --- | --- | --- |
| `obj` | an expression node, or `null` | `parseExpression('"hi"')` |
| `utf`, `utf_null` | a `string`, or `null` | `'My flow'` |
| `u8` | `0` or `1` | `1` |
| `svar32`, `uvar32`, `i16`, `i32`, `f32`, `f64` | a `number` | `3` |
| `svar64`, `i64` | a `bigint` | `3n` |
| `objarray` | `{ _arr: [...] }` | `{ _arr: [variableRef('x')] }` |
| `parcel` | leave untouched | — |

Most interesting fields are `obj`, meaning an Automate expression:

```ts
import { parseExpression } from './src/flo/exprparse';
import { renderExpression, stringLiteral, numberLiteral, variableRef } from './src/flo/expr';

block.raw.message  = parseExpression('"Done in {minutes} min"');
block.raw.duration = parseExpression('selectedTime * 60');
block.raw.message  = stringLiteral('plain text');   // shorthand
block.raw.duration = numberLiteral(30);
block.raw.varStdout = variableRef('out');            // an assignment target

renderExpression(block.raw.duration);                // 'selectedTime * 60'
block.raw.message = null;                            // clear the field
```

`parseExpression` throws `ExpressionError` (with a character offset) on invalid
input — let it throw rather than falling back to a string, or you will store the
source text where an expression belongs.

**A field whose name starts with `var` is an assignment target** and takes a
variable reference, not an arbitrary expression: use `variableRef('name')`.

### Expression syntax, briefly

Same language the app shows you: `"text"` with `{expr}` interpolation, numbers
(`42`, `0xff`, `3.5`, `10n`), variables (bare names), `null`, `Now`, `Pi`,
`Infinity`, `NaN`, lists `[a, b]`, maps `{"k": v}` (optionally `v as Int`),
indexing `x[0]`, calls `lowerCase(name)`, `a ? b : c`, and operators. `=` is
equality, `++` is string concatenation. Precedence, tightest first:
`*` `/` `//` `%` → `+` `-` `++` → shifts → comparisons → `=` `!=` → `&` → `^` →
`|` → `&&` → `||` → `?:`. All binary operators are left-associative.

Whitespace and line breaks between tokens are insignificant, so long values can
be laid out over several lines.

---

## 6. Ports and connections

A block continues via named ports. The port *field* is what `connect()` wants;
the *label* is what the app draws.

```ts
import { connect, disconnect } from './src/flo/model';

connect(model, '50', 'onComplete', '60');   // 50 --OK--> 60
connect(model, '46', 'onPositive', '53');   // 46 --YES--> 53
connect(model, '46', 'onNegative', '11');   // 46 --NO--> 11
disconnect(model, '46', 'onNegative');      // leave NO unconnected
```

`connect()` replaces any existing edge from that port — a port has at most one
target. Many blocks may point *into* the same block; that is normal and is how
loops and joins are built.

Common labels: `OK` (action done), `GO` (flow beginning), `YES`/`NO` (decision),
`FAIL` (failure catch), `DO` (for-each body), `NEW` (fork/subroutine child),
`UP`, `SET`, `N/A`. Every block also has an implicit `IN` on top, which is not a
field — it is just where incoming connections land.

---

## 7. Recipes

All of these are exercised by `tests/guide.test.ts`.

### Find blocks

```ts
const delays = model.blocks.filter((b) => b.entry?.name === 'Delay');
const byId = new Map(model.blocks.map((b) => [b.id, b]));
const block50 = byId.get('50')!;

// what does each ADB block run?
model.blocks
  .filter((b) => b.entry?.name === 'AdbShellCommand')
  .map((b) => renderExpression(b.raw.command as never));
```

### Change an argument

```ts
const delay = byId.get('26')!;
delay.raw.duration = parseExpression('selectedTime * 60');
```

### Insert a block into an existing chain

The usual edit: put something *between* two connected blocks.

```ts
import { createBlock, connect } from './src/flo/model';

const after = byId.get('7')!;                       // existing block
const next = model.connections.find((c) => c.from === after.id && c.port === 'onComplete');

const toast = createBlock(model, 1120, after.x, after.y + 6);
toast.raw.message = parseExpression('"Session over"');

connect(model, after.id, 'onComplete', toast.id);
if (next) connect(model, toast.id, 'onComplete', next.to);   // re-link the tail
```

Forgetting the second `connect` silently truncates the flow — always re-attach
what you displaced.

### Add a branch

```ts
const check = createBlock(model, 1058, 4, 12);       // ExpressionDecision
check.raw.expression = parseExpression('selectedTime > 30');
connect(model, check.id, 'onPositive', warnId);
connect(model, check.id, 'onNegative', continueId);
```

### Delete blocks

```ts
import { deleteBlock } from './src/flo/model';

// Removing a mid-chain block leaves a hole; bridge it first.
const victim = byId.get('74')!;
const inbound = model.connections.filter((c) => c.to === victim.id);
const outbound = model.connections.find((c) => c.from === victim.id && c.port === 'onComplete');
for (const c of inbound) if (outbound) connect(model, c.from, c.port, outbound.to);
deleteBlock(model, victim.id);                       // also drops its edges
```

### Find dead blocks

```ts
const reachable = new Set<string>();
const walk = (id: string) => {
  if (reachable.has(id)) return;
  reachable.add(id);
  for (const c of model.connections) if (c.from === id) walk(c.to);
};
for (const b of model.blocks) if (b.entry?.layout === 'block_beginning') walk(b.id);
const dead = model.blocks.filter((b) => !reachable.has(b.id));
```

### Lay blocks out

Measured over 1,650 connections in real flows, the app's own conventions are:

- a continuation (`OK`, `YES`, `GO`) sits **directly below**: `dx = 0, dy = +6`
- a side branch (`NO`, `FAIL`) goes **to the right**: `dx = +8, dy = 0`

A block is 4 cells wide and 3 tall, so `dy = 6` leaves one block of clear space.
When inserting, place relative to the neighbour (`after.y + 6`) and shift what
follows if you need room. Overlapping blocks are legal but unreadable — the user
has to work with the result on a phone too.

---

## 8. Verifying your work

Do this every time. It takes seconds and catches the failures that matter.

```bash
# 1. The saved file must load again, and the analysis must show your change
npm run explain -- out.flo

# 2. The library's own guarantees must still hold
FLO_FIXTURES=/dir/with/flo/files npm test
```

In a script, assert rather than hope:

```ts
import { toModel, fromModel } from './src/flo/model';

const bytes = fromModel(model);
const reloaded = toModel(bytes);                       // throws if malformed
if (reloaded.blocks.length !== model.blocks.length) throw new Error('lost blocks');
writeFileSync('out.flo', bytes);
```

A useful stronger check when you intend a *no-op* (a refactor, a reformat):
compare bytes with the input. If they differ, you changed something you did not
mean to.

Report to the user what changed, by block id, and say plainly that you could not
run the flow — correctness of the *file* is verifiable, but behaviour on their
device is not.

---

## 9. Pitfalls

- **Version ceiling.** A file newer than `CURRENT_VERSION` (112) is refused with
  a clear error. That means the schema needs regenerating from a newer APK — see
  `UPGRADING.md`. Do not try to bypass it.
- **`version` is preserved, not upgraded.** A v85 flow saves as v85. Do not
  "modernise" it; that is what keeps old files byte-exact.
- **Statement ids are strings in the model, `bigint` on the wire.** Use
  `block.id`; let `fromModel()` handle the conversion.
- **`Parcel` payload blocks** (Tasker plug-ins, pinned shortcuts) hold opaque
  bytes. They round-trip untouched but cannot be edited meaningfully — leave
  them alone.
- **The JSON projection is lossy.** `toJsonFlow`/`fromJsonFlow` (used by the
  editor's Import/Export) is for handing a flow to a person or a model as
  readable text. Round-tripping through it turns complex expressions into text
  values. **For editing, use the model API, not JSON.**
- **Editing an interpolated string** resets the per-hole display flags the app
  stores. Harmless, but it means such an edit is not a byte-level no-op.
- **`describeBlock()` is a caption, not data.** Do not parse it; read the fields.

---

## 10. Where things live

| Need | Import from |
| --- | --- |
| load / save / edit a flow | `src/flo/model.ts` — `toModel`, `fromModel`, `createBlock`, `deleteBlock`, `connect`, `disconnect`, `catalog` |
| block metadata, ports, fields | `src/flo/blocks.ts` — `editableFields`, `outputPorts`, `describeBlock` |
| expressions | `src/flo/exprparse.ts` — `parseExpression`; `src/flo/expr.ts` — `renderExpression`, `stringLiteral`, `numberLiteral`, `variableRef` |
| raw bytes, wire schema | `src/flo/codec.ts` — `parseFlo`, `writeFlo`, `schema`, `CURRENT_VERSION` |
| readable JSON (not for editing) | `src/flo/json.ts` — `toJsonFlow`, `fromJsonFlow` |
| all 410 block types | `docs/BLOCKS.md`, or `npm run blocks -- <query>` |

Generated data — `src/data/schema.json`, `catalog.json`, `exprtable.json` — is
produced from the app's compiled code by `tools/`. **Never hand-edit it.**

---

## 11. A complete example

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { toModel, fromModel, createBlock, connect, catalog } from './src/flo/model';
import { parseExpression } from './src/flo/exprparse';

const model = toModel(new Uint8Array(readFileSync('flow.flo')));

const idByName = new Map(Object.entries(catalog).map(([t, e]) => [e.name, Number(t)]));
const byId = new Map(model.blocks.map((b) => [b.id, b]));

// Warn before the timer expires: insert a Toast ahead of block #26 (the wait).
const wait = byId.get('26');
if (!wait) throw new Error('block #26 not found — inspect the flow first');

const inbound = model.connections.filter((c) => c.to === wait.id);
const toast = createBlock(model, idByName.get('ToastShow')!, wait.x, wait.y - 6);
toast.raw.message = parseExpression('"{selectedTime} minutes starting now"');
toast.raw.duration = parseExpression('3.5');

for (const c of inbound) connect(model, c.from, c.port, toast.id);
connect(model, toast.id, 'onComplete', wait.id);

const bytes = fromModel(model);
if (toModel(bytes).blocks.length !== model.blocks.length) throw new Error('verify failed');
writeFileSync('out.flo', bytes);
console.log(`added #${toast.id}; ${model.blocks.length} blocks total`);
```

Then: `npm run explain -- out.flo` and check the change appears where intended.
