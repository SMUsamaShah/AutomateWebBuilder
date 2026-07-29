# Upgrading to a new Automate release

Nothing about the `.flo` format is transcribed by hand. The block catalog, the
wire schema and the expression table are all **generated** from the app's own
compiled code, so supporting a new Automate release is a matter of re-running
two scripts and reading a diff.

## The procedure

```bash
# 1. Decompile the new APK (any jadx build; 1.5.x is known to work)
java -jar jadx-cli.jar --no-res -d /tmp/apk-new automate.apk

# 2. Keep the current schema so it can be compared
cp src/data/schema.json /tmp/schema-old.json

# 3. Regenerate the three data files
python3 tools/generate_schema.py    /tmp/apk-new/sources
python3 tools/generate_exprtable.py /tmp/apk-new/sources
npm run blocks -- --write-index           # refresh docs/BLOCKS.md

# 4. See exactly what the release changed on the wire
python3 tools/diff_schema.py /tmp/schema-old.json src/data/schema.json

# 5. Prove it against real flows — this is the part that matters
FLO_FIXTURES=/path/to/your/flows npm test
```

Both generators print anything they could not parse. An empty "unresolved" list
means every registered type was understood.

## Reading the diff

`diff_schema.py` classifies changes by how much attention they need.

**New object types** — a release added blocks or functions. Nothing to do: the
generated catalog already carries their titles, icons, ports and fields, so they
appear in the palette automatically.

**Changed fields on existing types** — the case to be careful about. A new field
gated at a newer format version is normal and harmless. A field that changed
*shape*, or moved, means old files and new files are read differently; the
round-trip tests are what confirm the generator got it right.

**Removed types** — rare. Check that no flow you care about still uses them.

**A raised format version** — the tool reports it and tells you to update
`CURRENT_VERSION` in `src/flo/codec.ts`.

## Why the format version matters

Every `.flo` records the version it was written in, and the editor preserves it:
loading a v85 flow and saving it writes v85 again, which is why round-tripping
old files stays byte-exact. `CURRENT_VERSION` is only used for flows created
from scratch.

It is also the **read** limit. A file newer than `CURRENT_VERSION` is rejected
with a clear message rather than parsed, because a newer release may add fields
to existing blocks; a reader that does not know about them would desynchronise
mid-stream and silently misread the rest of the flow. The app enforces the same
rule (`Q3.c.n` throws `InvalidVersionException`). So an un-upgraded editor is
safe when handed a newer file — it refuses instead of corrupting.

The highest version gate in `schema.json` is the version a given build
understands, which is how the diff tool detects the bump.

## What is generated, and from what

| Output | Generator | Source in the APK |
| --- | --- | --- |
| `src/data/schema.json` | `tools/generate_schema.py` | each type's `z0`/`S` read and write methods, including version gates |
| `src/data/catalog.json` | `tools/generate_schema.py` | `@E3.*` annotations plus `strings.xml`, `integers.xml`, `layout/block_*.xml` |
| `src/data/exprtable.json` | `tools/generate_exprtable.py` | each expression node's `w(flags)` to-source method |
| `public/fonts/AutomateIcons.ttf` | `scripts/extract-apk-assets.mjs` | `assets/fonts/AutomateIcons.ttf` (not redistributed) |
| `docs/BLOCKS.md` | `npm run blocks -- --write-index` | the generated catalog above |

The generators read the decompiled Java as text. That sounds fragile, but it is
deliberately narrow: they only recognise the handful of mechanical shapes the
app's serialization code actually uses, and they fail loudly rather than
guessing. Three decompiler quirks are already handled — `this` aliased to a
local, virtual dispatch through hook methods overridden by subclasses, and reads
whose values are discarded but still occupy bytes.

## What can still need a human

- **New wire shapes.** If a release introduces a serialization pattern the
  generator has not seen, it reports the class as unresolved instead of emitting
  something wrong. Add the pattern, or add a manual spec in `MANUAL_SPECS`.
- **New expression syntax.** Operators and functions are picked up
  automatically, but a genuinely new construct (a new literal form, say) needs
  matching support in `src/flo/exprparse.ts`.
- **New block categories.** Blocks are grouped by name patterns in
  `src/flo/blocks.ts`; a new family may want a rule there. Uncategorised blocks
  fall into "Other" and remain fully usable.

## The test that decides

The suite's central claim is that opening a `.flo` and saving it untouched
reproduces the original file byte for byte, through both the codec and the
editor's own load/save path. If that holds for a corpus of real flows after
regenerating, the upgrade is good. If it does not, the diff above tells you
which type to look at.

Keeping a directory of `.flo` files spanning several Automate versions is the
single most useful thing for this project; `FLO_FIXTURES` points the suite at
it.
