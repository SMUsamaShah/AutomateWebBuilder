# Automate Web Builder

A web page for editing LlamaLab Automate `.flo` files.

The `.flo` format is not documented. The files in `src/data/` describe it, and
are generated from a decompiled copy of the Automate APK.

## Where to look

| For | Read |
| --- | --- |
| Reading or editing a flow with this library | `docs/LLM-GUIDE.md` |
| Changing the library, codec, generators or schema | `docs/INTERNALS.md` |
| Finding a block type | `docs/BLOCKS.md`, or `npm run blocks -- <query>` |
| Counts and figures | `docs/STATS.md` |

`docs/LLM-GUIDE.md` covers everything needed to use the library. You do not need
to read `src/`.

## Rules

- Do not edit `src/data/*.json`, `docs/STATS.md` or `docs/BLOCKS.md`. They are
  generated. Run the generator instead.
- Do not write counts or figures into the docs. They go out of date. Link to
  `docs/STATS.md`.
- Do not commit `.flo` files or `public/fonts/AutomateIcons.ttf`. Both are in
  `.gitignore`.
- A field with `op: 'obj'` does not accept every kind of expression. Call
  `fieldKind(typeId, field)` to see what it accepts. `continuity` takes
  `integerBox(1)`.
- Call `validateModel(model)` before saving. Then `lintFlow(model)`: a file can
  be valid and still hang when Automate runs it.
- Opening a `.flo` and saving it without changes must produce the same bytes.
  `FLO_FIXTURES=<dir> npm test` checks this.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | start the editor with hot reload |
| `npm test` | run the tests. `FLO_FIXTURES=<dir>` adds tests against real flows |
| `npm run explain -- f.flo` | print what a flow does, in run order |
| `npm run lint -- f.flo` | check a flow for things that fail on a device |
| `npm run blocks -- wifi` | search block types. `--all` lists them all |
| `npm run audit -- corpus/` | check a folder of flows for ones this cannot read |
| `npm run docs:stats` | regenerate `docs/STATS.md` |
| `npm run build` | build the site into `dist/` |
| `npm run build:single` | build one self-contained HTML file |
| `npm run build:all` | both. `build` empties `dist/`, so the order matters |
