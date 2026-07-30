# Automate Web Builder

A browser-based editor for [LlamaLab Automate](https://llamalab.com/automate/) flows.
Open a `.flo` file, edit it on a real screen with a mouse and a keyboard, and save it
back in a format the app loads without complaint.

Building flows on a phone works, but editing one — tapping tiny blocks, retyping
expressions in a cramped dialog — does not. This gives the same flowchart on a
desktop, plus a readable JSON projection you can hand to an AI agent.

> Unofficial and not affiliated with LlamaLab. It reads and writes the `.flo`
> format; it does not run flows.

## What works

- **Open and save `.flo` files.** The binary format is implemented from the app's
  own serialization code, including its per-version field gates, so files from
  older Automate versions load correctly and files you save are byte-compatible.
- **All 410 block types**, with the app's own titles, summaries, icons, and
  documentation links — searchable and grouped by category.
- **The flowchart, as the app draws it.** Same grid, block shape, connector
  colours (IN/OK/YES/NO/FAIL/DO/NEW), and orthogonal connection routing.
- **Expression editing.** Arguments render as real Automate expression source —
  `"Do you want to run BigOS " ++ versionbigos ++ " Setup?"` — and what you type
  is compiled back by a parser built from the app's own grammar, so lists, maps
  and operator trees survive editing instead of collapsing to text.
- **JSON import/export** for reading or rewriting a flow with an AI agent.
- **Resizable panels.** Drag either divider to trade canvas space for palette or
  detail width; double-click a divider to reset it. Widths are remembered.

## What "byte-for-byte" means

The test suite's central claim is that opening a `.flo` and saving it without
edits reproduces the original file **exactly, byte for byte**.

That is not a claim about edited files — an edit obviously changes bytes. It is
a claim about everything you *didn't* edit. A format this size has hundreds of
optional, version-gated fields; if the reader misunderstood even one of them,
saving would quietly drop or corrupt it. Reproducing the input exactly is the
only way to prove nothing is being lost in the parts of the flow the editor
never shows you.

Concretely, two properties are tested against real flows:

- **Open then save, untouched → identical bytes.** No collateral damage.
- **Change one thing → only that thing differs.** Every other block keeps its
  type, position, arguments and connections.

So when you move a block and save, the moved block's coordinates change and the
rest of the file is written back exactly as it came in — including fields this
editor has no UI for.

## Fidelity

The format was reverse-engineered from `com.llamalab.automate` 1.51.1262 by
decompiling the APK and reading its `z0`/`S` (read/write) methods directly, then
generating the wire schema from them rather than transcribing it by hand.

This was verified against real flows of 21, 43, 343 and 1243 blocks spanning
format versions 84, 85 and 112, all byte-identical after a round trip — both
through the codec directly and through the editor's own load/save path.

To run it against your own flows:

```bash
FLO_FIXTURES=/path/to/your/flows npm test
```

## Getting started

There are three ways to run it, in increasing order of effort.

**1. One file, no install.** Build (or download) `automate-web-builder.html` and
open it in a browser — from your disk, a USB stick, anywhere. Everything is
inlined into that single file: no server, no Node, no network.

```bash
npm run build:single     # -> dist/automate-web-builder.html
```

Released builds attach this file to every GitHub release, so it can be downloaded
and opened without cloning anything.

**2. Static hosting.** `npm run build` produces a plain `dist/` of HTML, JS and
CSS. Drop it on GitHub Pages, Netlify, or any web server. There is no backend.
`.github/workflows/ci.yml` typechecks, tests and builds on every push, uploading
the result as a workflow artifact. Pushing a `v*` tag runs
`.github/workflows/release.yml`, which publishes a GitHub release with the
standalone `.html` and a zip of the static site attached. (Pages is not used
because it is unavailable on private repositories; `ci.yml` documents how to
restore it if this ever becomes public.)

**3. Development.** `npm install && npm run dev` for hot reloading while working
on the code.

Node is a *build-time* tool only — it compiles TypeScript and bundles the app.
Nothing in the running editor needs it, and no flow you open is ever uploaded:
all parsing and writing happens in the browser.

### Block icons

The block glyphs come from LlamaLab's icon font, which is **not** redistributed
here — so a hosted build, including the GitHub Pages one, draws each block's
initials instead. Everything works; the icons are just letters.

To get the real icons, supply your own copy of the APK and build locally:

```bash
node scripts/extract-apk-assets.mjs path/to/automate.apk
npm run dev          # or: npm run build:single, which embeds the font
```

The editor detects at runtime whether the font actually loaded, because its
glyphs sit in the Unicode Private Use Area and would otherwise render as blank
space rather than as anything recognisable.

## Editing a flow with an AI agent

If you want an AI agent to edit a flow *properly* — adding blocks, rewiring
branches, changing expressions — hand it **[docs/LLM-GUIDE.md](docs/LLM-GUIDE.md)**.
That file is written to be self-sufficient: an agent can work from it without
reading the source, and every example in it is executed by `tests/guide.test.ts`
so it cannot go quietly stale.

**[examples/](examples/)** builds whole flows from scratch with that API —
`examples/app-usage-today.ts` writes a flow that asks an Android TV over ADB how
long an app was used today, and explains how Automate's `Subroutine` block is
used to make it a reusable function.

All 410 block types are listed in **[docs/BLOCKS.md](docs/BLOCKS.md)**, or
searchable from the command line:

```bash
npm run blocks -- wifi           # find a block by what it does
npm run blocks -- --id 1046      # its ports and arguments
```

To understand an existing flow first:

```bash
npm run explain -- path/to/flow.flo          # execution-order walkthrough
npm run explain -- path/to/flow.flo --json   # same analysis, machine-readable
npm run lint -- path/to/flow.flo             # will it actually work on a device?
```

## Will it work, not just load?

A `.flo` can be perfectly well-formed and still misbehave on the phone. Two bugs
shipped from this repo did exactly that: a dialog missing its "Show window" flag
posted a notification and hung the fiber, and an argument the app null-checks at
runtime threw the moment its block ran. Both files parsed, validated and
round-tripped byte-for-byte.

`npm run lint` catches that class of mistake. Its rules come from two
independent places — Automate's own runtime guards, decompiled, and a corpus of
~390 community flows by ~250 authors — and every finding carries its evidence:

```
error   #7 HTTP request: url is required — the app throws
        RequiredArgumentNullException, and all 133 real blocks of this type set it
warning #4 Dialog choice?: startActivity is unset, but 300 of 300 real blocks
        of this type set it
```

On those 390 real flows it reports **0 errors**, which is the point: flows that
work should be silent.

Build your own corpus and point the tools at it:

```bash
npx tsx tools/fetch-community.ts corpus --max 400   # public community flows
npm run audit -- corpus                             # what does this library get wrong?
npx tsx tools/mine-conventions.ts corpus > src/data/conventions.json
```

`npm run audit` is the counterpart to `npm test`: the test suite needs a corpus
it passes, this one is meant to be pointed at flows written by strangers and to
come back with a list. On 400 community flows it currently reports 378 fully
clean and 22 it cannot read — 9 of which Automate 1.51 also refuses, 3 saved by
a newer Automate than the schema knows, and 10 that are ours to fix.

For a quick round trip through readable text, **Export JSON** turns the flow into
a flat document:

```json
{
  "format": "automate-web-builder/flow@1",
  "version": 112,
  "blocks": [
    {
      "id": "71",
      "type": "Delay",
      "typeId": 1046,
      "title": "Delay",
      "x": -35, "y": 51,
      "args": { "duration": "3" },
      "next": { "onComplete": "2" }
    }
  ]
}
```

Ask an agent to modify it, then **Import JSON** and save as `.flo`.

Importing is deliberately lossy: blocks, positions, connections and simple
argument values survive, but arguments that were complex expression trees come
back as text values. **For real edits use the model API** as described in the
guide above, not the JSON projection. Round-tripping through `.flo` is always
lossless.

## How it works

```
tools/generate_schema.py      APK sources  -> src/data/schema.json + catalog.json
tools/generate_exprtable.py   APK sources  -> src/data/exprtable.json

src/flo/binary.ts   varints, modified UTF-8
src/flo/codec.ts    .flo reader/writer driven by schema.json
src/flo/model.ts    object graph <-> editable blocks + connections
src/flo/expr.ts     expression AST -> Automate expression source
src/flo/blocks.ts   ports, categories, block captions
src/flo/json.ts     readable JSON projection
src/ui/             React editor

tools/explain-flow.ts   npm run explain — what does this flow do?
tools/diff_schema.py    what changed between two Automate releases?
docs/LLM-GUIDE.md       hand this to an AI agent instead of the source
examples/               flows built from scratch with the model API
```

The generators are checked in so the data can be regenerated for a future
Automate release: decompile the APK with [jadx](https://github.com/skylot/jadx),
point the scripts at its `sources/` directory, and run `tools/diff_schema.py` to
see exactly what the release changed on the wire. **[UPGRADING.md](UPGRADING.md)**
has the full procedure — supporting a new Automate version is meant to be a code
review, not a research project.

### The `.flo` format, briefly

```
"LAFl"                 magic
u16                    format version (112 = Automate 1.51)
zig-zag varint         next free statement id
uvarint                statement count
statements[]           object graph, depth-first
```

Objects are a zig-zag varint type id followed by that type's payload; `0` is
null and a negative id is a back-reference to the Nth object already written,
which is how the app encodes an arbitrary graph without recursing forever.
Strings are Java modified UTF-8, length-prefixed by a varint from v35 onward.

Each type's payload is a fixed field order gated by format version — the reason
the schema is generated rather than written by hand: several hundred types, each
with its own accumulated version history.

## Editing expressions

An expression field shows Automate expression source and compiles it back when
you commit (click away, or Ctrl/Cmd+Enter; Esc reverts). Three properties keep
this safe:

- **Typing never writes to the flow.** The text is local until committed, so
  re-rendering cannot rewrite what you are typing.
- **Invalid input is refused**, with the character offset, and the previous
  value is kept.
- **Reformatting is a no-op.** Whitespace and line breaks between tokens are
  insignificant, so a long value can be laid out over several lines; if the
  result parses to the same expression, the original node is kept and the saved
  file stays byte-identical.

## Status and limits

- A few statement types with Android `Parcel` payloads (Tasker plug-ins, pinned
  shortcuts) are preserved verbatim but not editable here.
- Editing an interpolated string resets the per-hole display flags the app
  stores alongside it. Everything else about the value is preserved.
- There is no undo. Reverting an uncommitted edit is Esc; beyond that, reopen
  the file.

## Contributing to a new Automate release

See [UPGRADING.md](UPGRADING.md). Short version: re-run two generators, read the
schema diff, and confirm the round-trip tests still pass against real flows.

## Contributing

Bug reports with the `.flo` file that triggered them are the most useful thing —
especially any file that fails to load or does not round-trip. Run
`FLO_FIXTURES=... npm test` first; if a file fails that test, that is the bug.

## Licence

MIT for this code. Automate, the `.flo` format and the icon font are the property
of LlamaLab.
