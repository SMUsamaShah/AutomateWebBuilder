# Automate Web Builder

This project is a web page. It opens a [LlamaLab Automate](https://llamalab.com/automate/)
`.flo` file, edits it, and saves it again. Automate reads the saved file without
an error.

You can build a flow on a phone. To edit one is harder. The blocks are small and
the expression box is narrow. This project draws the same flowchart on a desktop
screen. It also writes the flow as JSON, which you can give to an AI agent.

> This project is not official. LlamaLab did not make it. It reads and writes
> the `.flo` format. It does not run flows.

## What it does

- **Opens and saves `.flo` files.** The format code comes from the app's own
  read and write methods. It includes the per-version field rules. Files from
  old Automate versions open correctly.
- **Knows every block type.** Each block has the app's own title, summary, icon
  and documentation link. You can search them or read them by category.
- **Draws the flowchart like the app.** Same grid, same block shape and same
  connection routes. The connector colours match too (IN, OK, YES, NO, FAIL,
  DO, NEW).
- **Edits expressions.** A field shows real Automate expression source, such as
  `"Do you want to run BigOS " ++ versionbigos ++ " Setup?"`. A parser compiles
  your text back into the flow. Lists, maps and operator trees stay as they are.
- **Reads and writes JSON.** An AI agent can then read or rewrite the flow.
- **Has panels that you can resize.** Drag a divider to change a width.
  Double-click a divider to reset it. The editor remembers the widths.

## What "byte for byte" means

If you open a `.flo` file and save it with no edits, the new file must equal the
old file, byte for byte. The tests check this.

This is not a claim about files that you edit. An edit changes bytes. It is a
claim about the parts that you did not edit.

The format has hundreds of optional fields. Each field belongs to a range of
format versions. If the reader gets one field wrong, a save can drop that field
or corrupt it. Nothing else shows the fault. An exact copy is the proof that
nothing is lost.

Two tests run against real flows:

- Open a file, then save it with no edits. The bytes must be equal.
- Change one thing. Only that thing must differ. Every other block keeps its
  type, its position, its arguments and its connections.

If you move a block and save the file, one block gets new coordinates. The
editor writes the rest of the file back as it arrived. This includes the fields
that the editor has no screen for.

## How correct is it

The format came from `com.llamalab.automate` 1.51.1262. A decompiler produced
the app's Java source. The `z0` and `S` methods read and write each block. A
script reads those methods and writes the format data. Nobody typed the format
data by hand.

The tests run against a set of real community flows. These flows cover most
format versions that Automate has used. Every one is byte-identical after a
round trip, through the codec and through the editor.

To test your own flows, run this command:

```bash
FLO_FIXTURES=/path/to/your/flows npm test
```

## Getting started

There are three ways to run this project. The first needs the least work.

### 1. One file, no install

Build `automate-web-builder.html`, or download it from a release. Then open it
in a browser. The file works from a disk or a USB stick. It holds the whole
editor. It needs no server, no Node and no network.

```bash
npm run build:single     # writes dist/automate-web-builder.html
```

Every release has this file attached. You can download it without a clone of
the repository.

### 2. A static site

Run `npm run build`. It writes plain HTML, JavaScript and CSS into `dist/`. Put
that folder on GitHub Pages, on Netlify, or on any web server. There is no
back end.

On each push, `.github/workflows/ci.yml` checks the types, runs the tests and
builds the site. It uploads the result as a workflow artifact. If you push a
`v*` tag, `.github/workflows/release.yml` publishes a GitHub release. The
release has the single HTML file and a zip of the static site.

Note: this project does not use GitHub Pages, because Pages does not work on a
private repository. `ci.yml` records how to turn Pages on again.

### 3. Development

```bash
npm install
npm run dev
```

Node is a build tool only. It compiles the TypeScript and bundles the app. The
editor itself does not need Node. It never uploads a flow. The browser does all
the reading and writing.

### Block icons

The block icons come from LlamaLab's icon font. This project does not include
that font. Without it, the editor draws the first letters of each block name.
Everything still works.

To get the real icons, use your own copy of the APK:

```bash
node scripts/extract-apk-assets.mjs path/to/automate.apk
npm run dev          # or npm run build:single, which embeds the font
```

The editor tests at run time whether the font loaded. The icon characters sit in
a private area of Unicode. Without the font they draw as blank space, not as
anything you can recognise.

## Edit a flow with an AI agent

To let an AI agent edit a flow properly, give it
**[docs/LLM-GUIDE.md](docs/LLM-GUIDE.md)**. An agent can add blocks, move
connections and change expressions with it. The guide is complete on its own.
The agent does not need to read the source. `tests/guide.test.ts` runs every
example in the guide, so the guide cannot go out of date without a test failure.

**[examples/](examples/)** builds whole flows from nothing with the same API.
`examples/app-usage-today.ts` writes a flow that asks an Android TV over ADB how
long an app ran today. It also shows how the `Subroutine` block makes a function
that you can reuse.

**[docs/BLOCKS.md](docs/BLOCKS.md)** lists every block type. You can also search
from the command line:

```bash
npm run blocks -- wifi           # find a block by what it does
npm run blocks -- --id 1046      # show its ports and arguments
```

To read an existing flow first:

```bash
npm run explain -- path/to/flow.flo          # what it does, step by step
npm run explain -- path/to/flow.flo --json   # the same, as JSON
npm run lint -- path/to/flow.flo             # what can fail on a device
```

## Will the flow work, not only load?

A `.flo` file can be correct and still fail on the phone. Two faults from this
project did that. A dialog with no "Show window" flag showed a notification
instead of a window, and the flow stopped. An argument that Automate checks at
run time was empty, and the block failed the moment it ran. Both files parsed,
passed validation and round-tripped byte for byte.

The editor now reports these faults while you work. It shows a count in the tool
bar, a dot on the block, and the reason under the field. `npm run lint` reports
the same from the command line.

The rules come from two separate sources. The first is Automate's own run-time
checks, from the decompiled app. The second is a set of community flows by
several hundred authors. Each report carries its own evidence:

```
error   #7 App kill: packageName is required — the app throws
        RequiredArgumentNullException, and all 464 real blocks of this type set it
warning #4 Dialog choice?: startActivity is unset, but 2328 of 2333 real blocks
        of this type set it
```

On the flows in the test set it reports no errors. That is the point. A flow
that works must stay silent.

To build your own set of flows and check this project against it:

```bash
# Largest flows first, with a limit per author so one person cannot skew the counts
npx tsx tools/fetch-community.ts corpus --max 900 --min-statements 30
npm run audit -- corpus
npx tsx tools/mine-conventions.ts corpus > src/data/conventions.json
```

`npm run audit` is the opposite of `npm test`. The test suite needs a set of
flows that it passes. The audit expects flows from strangers, and it returns a
list of the files that this project cannot read.

When a file fails, the error names the block that lost its place. Parsing stops
at the first block whose statement id and grid position cannot be real. The
error then lists the objects that it read before that block. This is how three broken block
layouts were found. Each one had corrupted every flow that used it.

## The JSON form

**Export JSON** writes the flow as a flat document:

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

Ask an agent to change it. Then use **Import JSON** and save the flow as `.flo`.

Import loses some detail on purpose. Blocks, positions, connections and simple
argument values survive. An argument that was a complex expression tree returns
as a text value. For real edits, use the model API from the guide above, not the
JSON form. A round trip through `.flo` never loses anything.

## How it works

```
tools/generate_schema.py      APK sources  -> src/data/schema.json + catalog.json
tools/generate_exprtable.py   APK sources  -> src/data/exprtable.json

src/flo/binary.ts   varints, modified UTF-8
src/flo/codec.ts    .flo reader and writer, driven by schema.json
src/flo/model.ts    object graph <-> blocks and connections
src/flo/expr.ts     expression tree -> Automate expression source
src/flo/blocks.ts   ports, categories, block captions
src/flo/lint.ts     what can fail on a device
src/flo/json.ts     the JSON form
src/ui/             the React editor

tools/explain-flow.ts   npm run explain, what a flow does
tools/diff_schema.py    what changed between two Automate releases
docs/LLM-GUIDE.md       give this to an AI agent instead of the source
docs/INTERNALS.md       how to change this project
examples/               flows built from nothing with the model API
```

The APK is not in this repository. It belongs to LlamaLab. You do not need it:
`src/data/*.json` is committed, and that is what the library reads. To use this
project, or to build a flow with it, the APK is not required at any point.

You need it only to add support for a newer Automate release. Then decompile the
APK with [jadx](https://github.com/skylot/jadx) and point the scripts at the
output. `tools/diff_schema.py` shows what the release changed.
**[docs/INTERNALS.md](docs/INTERNALS.md)** has the full procedure.

### The `.flo` format, in short

```
"LAFl"                 magic
u16                    format version (112 = Automate 1.51)
zig-zag varint         next free statement id
uvarint                statement count
statements[]           object graph, depth first
```

An object is a zig-zag varint type id and then that type's payload. A `0` means
null. A negative id points back to an object already written. This is how the
app stores a graph without endless recursion. Strings use Java modified UTF-8.
From v35 the string length is a varint.

Each type has a fixed field order. Format version rules control which fields
appear. This is why a script generates the schema. There are several hundred
types, and each one has its own history of versions.

## Expression fields

An expression field shows Automate expression source. It compiles the text back
when you commit the field. To commit, click away or press Ctrl+Enter or
Cmd+Enter. To revert, press Esc.

Three properties keep this safe:

- **What you type does not reach the flow.** The text stays local until you
  commit it. A redraw cannot overwrite your text.
- **Bad input is refused.** The editor shows the character offset and keeps the
  previous value.
- **A reformat changes nothing.** Spaces and line breaks between tokens carry no
  meaning, so you can lay a long value over several lines. If the new text
  parses to the same expression, the editor keeps the original value. The saved
  file stays byte-identical.

## Limits

- A few block types carry an Android `Parcel` payload. Tasker plug-ins and
  pinned shortcuts are the common ones. This project keeps the payload as it is,
  but you cannot edit it here.
- If you edit a string that has `{expression}` holes, the per-hole display flags
  reset. Everything else about the value stays.
- There is no undo. Press Esc to revert a field that you have not committed. For
  anything else, open the file again.

## Contributing

The most useful bug report has the `.flo` file that caused the fault. A file
that fails to load, or that does not round-trip, is the best of all. Run
`FLO_FIXTURES=... npm test` first. If a file fails that test, that file is the
bug.

To support a new Automate release, read
**[docs/INTERNALS.md](docs/INTERNALS.md)**. In short: run the generators again,
read the schema diff, and check that the round-trip tests still pass.

## Licence

The code is MIT. Automate, the `.flo` format and the icon font belong to
LlamaLab.
