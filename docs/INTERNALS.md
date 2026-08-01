# Working on this codebase

For changing the library itself. If you only want to **read or edit a flow**,
you want [LLM-GUIDE.md](LLM-GUIDE.md) instead — it is self-sufficient and you do
not need anything here.

Counts and figures live in [STATS.md](STATS.md), generated from the data.

---

## 1. The shape of the project

```
tools/generate_schema.py      APK sources  -> src/data/schema.json, catalog.json
tools/generate_exprtable.py   APK sources  -> src/data/exprtable.json
tools/generate_required.py    APK sources  -> src/data/required.json
tools/mine-conventions.ts     a flow corpus-> src/data/conventions.json
tools/generate-stats.ts       the above    -> docs/STATS.md

src/flo/binary.ts    varints, Java modified UTF-8
src/flo/codec.ts     .flo reader/writer, driven by schema.json
src/flo/model.ts     object graph <-> blocks + connections, validateModel
src/flo/expr.ts      expression nodes -> Automate source
src/flo/exprparse.ts Automate source -> expression nodes
src/flo/blocks.ts    ports, categories, field kinds, captions
src/flo/lint.ts      will this flow work on a device?
src/flo/json.ts      lossy readable projection
src/ui/              React editor

tools/explain-flow.ts     npm run explain — what does this flow do?
tools/lint-flow.ts        npm run lint
tools/blocks.ts           npm run blocks — find a block type
tools/fetch-community.ts  build a corpus from the community site
tools/audit-corpus.ts     npm run audit — what do we still get wrong?
tools/diff_schema.py      what changed between two Automate releases?
tools/bisect-gates.ts     which version gate makes an old flow unreadable?
```

**Nothing about the format is hand-written.** `src/data/*.json` is generated;
never edit it. Fix the generator and re-run.

---

## 2. The invariant everything rests on

Opening a `.flo` and saving it untouched must reproduce the file **byte for
byte**, through both the codec and the editor's own load/save path.

That is the only real proof the schema is right. The format has hundreds of
optional, version-gated fields; a reader that misunderstands one would quietly
drop or corrupt it, and nothing else would notice. Two tests enforce it:

```bash
FLO_FIXTURES=/dir/with/flo/files npm test
```

### What it does *not* prove

Round-tripping only tests files that came **from** Automate. The moment we
*author* a graph, it says nothing — and every bug that reached a device lived in
exactly that gap. §5 is about closing it.

---

## 3. Regenerating for a new Automate release

You need the APK for this. It is LlamaLab's, so this repo does not carry it and
none of the generated files depend on you having it — `src/data/*.json` is
committed, and that is what the library reads. Get the APK off a device or from
APKMirror.

```bash
# 1. Decompile the new APK (any jadx build; 1.5.x is known to work).
#    Not --no-res: generate_schema.py reads strings.xml, integers.xml and the
#    block_*.xml layouts for titles, icons and port positions.
java -jar jadx-cli.jar -d /tmp/apk-new automate.apk

# 2. Keep the current schema so it can be compared
cp src/data/schema.json /tmp/schema-old.json

# 3. Regenerate. generate_schema.py finds sources/ and res/ under the directory
#    you give it, and writes into src/data/ unless you name somewhere else.
python3 tools/generate_schema.py    /tmp/apk-new
python3 tools/generate_exprtable.py /tmp/apk-new/sources
python3 tools/generate_required.py  /tmp/apk-new/sources > src/data/required.json
npm run blocks -- --write-index      # refresh docs/BLOCKS.md
npm run docs:stats                   # refresh docs/STATS.md

# 4. See exactly what the release changed on the wire
python3 tools/diff_schema.py /tmp/schema-old.json src/data/schema.json

# 5. Prove it against real flows — this is the part that matters
FLO_FIXTURES=/path/to/flows npm test
npm run audit -- /path/to/corpus
```

Both generators print anything they could not parse. An empty "unresolved" list
means every registered type was understood.

### Reading the diff

`diff_schema.py` classifies changes by how much attention they need.

- **New object types** — a release added blocks or functions. Nothing to do: the
  generated catalog already carries titles, icons, ports and fields, so they
  appear in the palette automatically.
- **Changed fields on existing types** — the case to be careful about. A new
  field gated at a newer format version is normal. A field that changed *shape*,
  or moved, means old and new files are read differently; the round-trip tests
  are what confirm the generator got it right.
- **Removed types** — rare. Check no flow you care about still uses them.
- **A raised format version** — update `CURRENT_VERSION` in `src/flo/codec.ts`.

### Why the format version matters

Every `.flo` records the version it was written in, and the editor preserves it:
loading an old flow and saving it writes the same version again, which is what
keeps round-tripping old files byte-exact. `CURRENT_VERSION` is only used for
flows created from scratch.

It is also the **read** limit. A file newer than `CURRENT_VERSION` is refused
rather than parsed, because a newer release may add fields to existing blocks
and a reader that does not know about them would desynchronise mid-stream and
silently misread the rest. The app enforces the same rule (`Q3.c.n` throws
`InvalidVersionException`). An un-upgraded editor handed a newer file refuses
instead of corrupting.

### What is generated, and from what

| Output | Generator | Source |
| --- | --- | --- |
| `src/data/schema.json` | `tools/generate_schema.py` | each type's `z0`/`S` read and write methods, including version gates |
| `src/data/catalog.json` | `tools/generate_schema.py` | `@E3.*` annotations, `strings.xml`, `integers.xml`, `layout/block_*.xml` |
| `src/data/exprtable.json` | `tools/generate_exprtable.py` | each expression node's `w(flags)` to-source method |
| `src/data/required.json` | `tools/generate_required.py` | `Required…Exception` guards in the app's runtime code |
| `src/data/conventions.json` | `tools/mine-conventions.ts` | a corpus of real flows |
| `docs/BLOCKS.md` | `npm run blocks -- --write-index` | the generated catalog |
| `docs/STATS.md` | `npm run docs:stats` | all of the above |
| `public/fonts/AutomateIcons.ttf` | `scripts/extract-apk-assets.mjs` | the APK (not redistributed) |

The generators read decompiled Java as text. That sounds fragile, but it is
deliberately narrow: they recognise only the handful of mechanical shapes the
app's serialization code actually uses, and fail loudly rather than guessing.
Decompiler quirks already handled: `this` aliased to a local, virtual dispatch
through hook methods overridden by subclasses, and reads whose values are
discarded but still occupy bytes.

### The manual-spec trap

`MANUAL_SPECS` in `generate_schema.py` is a **fallback** for classes the
extractor cannot parse. A wrong entry therefore sits unused and correct-looking
until the day extraction fails and it gets picked up.

That happened. `MotionGesture`'s spec claimed it extends `IntermittentDecision`;
it extends `Action`. Two ports and a continuity were read where the file holds
one port, so every flow containing the block desynchronised from that point on,
at every format version. The generator now refuses a spec whose claimed
superclass the class does not have — keep that check working.

---

## 4. The corpus

Byte-exactness needs files that came from Automate, and the conventions half of
the linter needs a lot of them from a lot of people.

```bash
npx tsx tools/fetch-community.ts corpus --max 900 --min-statements 30
npx tsx tools/fetch-community.ts corpus --max 500 --max-data-version 111  # old formats
npm run audit -- corpus
npx tsx tools/mine-conventions.ts corpus > src/data/conventions.json
npm run docs:stats
```

The corpus is **not** committed — other people's flows, and `.gitignore`
excludes `*.flo` and `corpus/`.

Selection matters more than volume. The catalogue holds tens of thousands of
flows; the fetcher ranks by statement count, because one large flow exercises
far more of the block vocabulary than thirty small ones, and caps flows per
author so one prolific person's near-identical flows cannot turn a corpus
statistic into a statistic about their habits.

### `npm run audit` vs `npm test`

They are opposites on purpose. The test suite needs a corpus it **passes**;
`audit-corpus.ts` is meant to be pointed at flows written by strangers and to
come back with a **list**. Failures there are the backlog, not a broken build.

When a flow will not open, the error names the block that lost its place:
parsing stops at the first block whose statement id and grid position cannot be
real, and reports the objects read just before it (`FloDecodeError.trail`). A
desync otherwise only surfaces where the stream happens to run out, arbitrarily
far from the fault, with a trail that is just a march through whatever type ids
the noise decoded to.

---

## 5. The linter

<a id="the-linter"></a>

`validateModel()` asks *will Automate load this file?* — argument types, ports,
dangling connections. All derivable from the format.

`lintFlow()` asks *will it then work?* Nothing in the format can answer that, so
its rules come from two places, and neither is trustworthy alone:

- **`generate_required.py`** reads the app's own runtime guards — the
  `Required…Exception` sites. It follows `extends` (`AdbShellCommand` inherits
  its `alias` check from `AdbAction`) and scans every method, not just `p1`
  (`AdbShellCommand`'s own `command` check lives in the virtual hook `q`). That
  over-approximates: some guards sit on paths only certain configurations take.
- **`mine-conventions.ts`** counts how often real flows set each field. It
  cannot tell a convention from one author's habit, and says nothing about why.

`lintFlow` combines them. A field the app checks that *all* real blocks set is
an **error**; one the corpus sometimes leaves empty, or has never seen, is a
**warning** carrying its own counts.

### Calibration is load-bearing

`CONVENTION_RATIO` (0.95, in `src/flo/lint.ts` and mirrored in
`mine-conventions.ts`) decides what is worth mentioning. It has already been
wrong once: at 0.98, tripling the corpus took `startActivity` on `Dialog
message` from 243/246 to 1540/1597 — 96.4% — and the rule that motivated the
entire linter silently switched itself off. Its test still passed, because
`Dialog choice` sits higher and satisfied the assertion alone.

Two lessons worth keeping: a threshold near real data needs a test that names
each case rather than any case, and **the corpus should report 0 errors** —
flows that work must stay silent, or the signal is worthless.

Some false positives are inherent. Statistics cannot distinguish "deliberately
assigns null" from "nobody filled this in". That is why findings are advice,
carry their evidence, and never block a save.

---

## 6. Testing

```bash
npm test                                   # unit + generated-doc checks
FLO_FIXTURES=/dir/with/flos npm test       # adds the fidelity suite
npm run audit -- corpus                    # the backlog, not a build gate
```

| Test | Guards |
| --- | --- |
| `roundtrip` | byte-exactness, through codec and model |
| `variables` | one node per variable name (see below) |
| `expr`, `exprparse` | every expression in every fixture renders and re-parses |
| `guide` | the code examples in LLM-GUIDE.md actually run |
| `stats` | `docs/STATS.md` matches the data |
| `lint` | the promotion rule, and silence on real flows |
| `example-app-usage` | the worked example in `examples/` |

`tests/guide.test.ts` executing the guide's examples is why that document can be
handed over without a warning about staleness. Keep it that way: an example
added to the guide should be added there too.

---

## 7. Things that cost a day, so they are written down

**A variable is its node, not its name.** Automate gives each distinct `I3.l`
instance a slot index at load time and addresses variables by that index; the
name is only ever displayed. Two nodes spelled `host` are two unrelated
variables. `variableRef()` and `parseExpression()` mint a fresh node per call,
so `fromModel()` merges them by name on save. Do not defeat that.

**`createBlock` leaves fields null, which is not always a sensible default.** A
`Dialog…` block with `startActivity` unset posts a notification and pauses the
fiber until someone taps it. The file is valid; the flow just hangs. This is the
class of bug `lintFlow` exists for.

**A desync is reported nowhere near its cause.** See §4.

**Strings escape `{`.** It opens an interpolation hole, so an unescaped one turns
a literal into a template — and the corpus is full of HTML and JavaScript.
Interpolation holes can also contain nested strings, whose braces are text.

**Real expression trees are deep.** The corpus has trees 139 levels deep; a
render limit below that silently truncates a field to a marker the user can then
save over the original.

**Non-ASCII identifiers exist.** Variables named in Korean round-trip fine and
must lex.

---

## 8. House rules

- Never hand-edit `src/data/*.json` or `docs/STATS.md` / `docs/BLOCKS.md`.
- Never commit `.flo` files or `public/fonts/AutomateIcons.ttf` — users' personal
  flows and LlamaLab's asset, both deliberately ignored.
- Quote no derived number in prose. Link to [STATS.md](STATS.md).
