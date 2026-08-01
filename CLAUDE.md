# Automate Web Builder

This project is a web page. It edits LlamaLab Automate `.flo` files.

Automate does not document the `.flo` file format. The scripts in `tools/` read
a decompiled copy of the Automate APK. They write the format data into
`src/data/`.

The APK is not in this repository. It is LlamaLab's. You do not need it. The
files in `src/data/` are committed, and the library reads those. To build a
flow, or to change the library, you never open the Java code. Get the APK only
to add support for a newer Automate release. `docs/INTERNALS.md` section 3 tells
you how.

## Which document to read

| Your task | Document |
| --- | --- |
| Read or edit a flow with this library | `docs/LLM-GUIDE.md` |
| Change the library, the codec or the generators | `docs/INTERNALS.md` |
| Find a block type | `docs/BLOCKS.md` |
| Find a count or a figure | `docs/STATS.md` |

`docs/LLM-GUIDE.md` is complete. To use the library, you do not need to read
`src/`.

## Rules

Do not edit these files. A script writes them:

- `src/data/*.json`
- `docs/STATS.md`
- `docs/BLOCKS.md`

Do not write a count or a figure into a document. The number goes out of date.
Link to `docs/STATS.md`.

Do not commit `.flo` files. Do not commit `public/fonts/AutomateIcons.ttf`. Git
ignores both files.

A field with `op: 'obj'` does not accept every expression. Call
`fieldKind(typeId, field)` first. This function gives the type that the field
accepts. The `continuity` field takes `integerBox(1)`.

Before you save a flow, call `validateModel(model)`. Then call
`lintFlow(model)`. A file can be correct and still fail when Automate runs it.

If you open a `.flo` file and save it with no changes, the bytes must stay the
same. To test this, run `FLO_FIXTURES=<dir> npm test`.

## Commands

| Command | Result |
| --- | --- |
| `npm run dev` | Starts the editor. Reloads it after each change. |
| `npm test` | Runs the tests. `FLO_FIXTURES=<dir>` adds tests against real flows. |
| `npm run explain -- f.flo` | Prints what a flow does, step by step. |
| `npm run lint -- f.flo` | Reports the parts of a flow that can fail on a device. |
| `npm run blocks -- wifi` | Searches the block types. `--all` prints all of them. |
| `npm run audit -- corpus/` | Reads every flow in a folder. Reports the files that this project cannot read. |
| `npm run docs:stats` | Writes `docs/STATS.md` again. |
| `npm run build` | Builds the web page into `dist/`. |
| `npm run build:single` | Builds one HTML file with everything inside it. |
| `npm run build:all` | Builds both. `npm run build` empties `dist/`, so the order is important. |
