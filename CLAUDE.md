# Automate Web Builder

Browser-based editor for LlamaLab Automate `.flo` flow files. The binary format
is reverse-engineered from the app; the wire schema, block catalog and
expression table are **generated** from the decompiled APK, never hand-written.

## Read this first

- **Reading, analysing or editing a flow** → `docs/LLM-GUIDE.md`. It is written
  to be self-sufficient; you do not need to read `src/` to use the library.
  Its examples are executed by `tests/guide.test.ts`.
- **Which block does X?** → `docs/BLOCKS.md` (all 410), or
  `npm run blocks -- <query>`.
- **Supporting a new Automate release** → `UPGRADING.md`.

## The trap worth knowing before touching a flow

`op: 'obj'` on a block argument does **not** mean "any expression". The app casts
each argument as it reads it, so the wrong node type throws inside Automate when
the flow loads. Ask `fieldKind(typeId, field)` and run `validateModel(model)`
before saving. `continuity` is the usual casualty: it needs `integerBox(1)`, not
`parseExpression('1')`.

## The one invariant

Loading a `.flo` and saving it untouched must reproduce the file **byte for
byte**, through both the codec and the editor's load/save path. That is what
proves nothing is lost in the parts of a flow the UI never shows. Two tests
enforce it; run them against real flows before trusting a change:

```bash
FLO_FIXTURES=/dir/with/flo/files npm test
```

## Commands

```bash
npm run dev            # editor with hot reload
npm test               # full suite (fixture tests skip without FLO_FIXTURES)
npm run explain -- f.flo   # execution-order walkthrough of a flow
npm run blocks -- wifi     # find a block type (--all lists every one)
npm run build          # static site -> dist/
npm run build:single   # one self-contained dist/automate-web-builder.html
npm run build:all      # both, in the order that works (vite empties dist/)
```

## Do not

- Hand-edit `src/data/*.json` — regenerate with `tools/`.
- Commit `public/fonts/AutomateIcons.ttf` or any `.flo` file; both are ignored
  deliberately (LlamaLab's asset, and users' personal flows).
