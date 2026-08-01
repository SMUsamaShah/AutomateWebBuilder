# Automate Web Builder

Browser editor for LlamaLab Automate `.flo` files. The binary format was
reverse-engineered from the app. Everything in `src/data/*.json` is generated
from the decompiled APK.

## Where to look

| For | Read |
| --- | --- |
| Reading or editing a flow with the library | `docs/LLM-GUIDE.md` |
| Changing the library, codec, generators or schema | `docs/INTERNALS.md` |
| Finding a block type | `docs/BLOCKS.md`, or `npm run blocks -- <query>` |
| Any count or figure | `docs/STATS.md` (generated) |

`docs/LLM-GUIDE.md` is self-sufficient. You do not need to read `src/` to use
the library.

## Rules

- `src/data/*.json`, `docs/STATS.md` and `docs/BLOCKS.md` are generated.
  Regenerate them; do not edit them.
- Do not put a derived number in prose. Link to `docs/STATS.md`.
- Do not commit `.flo` files or `public/fonts/AutomateIcons.ttf`. Both are
  gitignored on purpose.
- `op: 'obj'` on an argument does not mean "any expression". Check
  `fieldKind(typeId, field)` first. `continuity` needs `integerBox(1)`.
- Run `validateModel(model)` before saving, then `lintFlow(model)`. A valid file
  can still hang on the device.
- Loading a `.flo` and saving it unchanged must produce identical bytes.
  `FLO_FIXTURES=<dir> npm test` checks this.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | editor, hot reload |
| `npm test` | tests; `FLO_FIXTURES=<dir>` adds the fidelity suite |
| `npm run explain -- f.flo` | what a flow does, in execution order |
| `npm run lint -- f.flo` | will it work on a device |
| `npm run blocks -- wifi` | find a block; `--all` lists every one |
| `npm run audit -- corpus/` | what the library still gets wrong |
| `npm run docs:stats` | refresh `docs/STATS.md` |
| `npm run build` | static site to `dist/` |
| `npm run build:single` | one self-contained HTML file |
| `npm run build:all` | both, in the order that works |
