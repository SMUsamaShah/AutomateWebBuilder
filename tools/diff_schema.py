#!/usr/bin/env python3
"""Summarise what changed between two generated schemas.

After regenerating `schema.json` from a newer Automate APK, this reports exactly
what the new release changed on the wire — which is the difference between
"upgrade this editor" being a research project and being a code review.

    # keep the current schema, regenerate, then compare
    cp src/data/schema.json /tmp/schema-old.json
    python3 tools/generate_schema.py <new-jadx-sources>
    python3 tools/diff_schema.py /tmp/schema-old.json src/data/schema.json

Exit status is 1 when anything changed, so it can gate CI.
"""
import json
import sys


def load(path):
    with open(path) as f:
        return json.load(f)


def newest_gate(schema):
    """Highest version gate present — the format version this schema understands."""
    best = 0
    for rec in schema.values():
        for op in rec.get("ops", []):
            best = max(best, op.get("min", 0))
    return best


def op_signature(op):
    """Field identity plus its wire shape and version window."""
    return (
        op.get("f"),
        op.get("op"),
        op.get("min", 0),
        op.get("max", 10 ** 9),
    )


def describe(op):
    window = ""
    if op.get("min"):
        window += f" min v{op['min']}"
    if op.get("max", 10 ** 9) < 10 ** 9:
        window += f" max v{op['max']}"
    return f"{op.get('f')}: {op.get('op')}{window}"


def short(cls):
    return cls.rsplit(".", 1)[-1]


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    old, new = load(sys.argv[1]), load(sys.argv[2])
    changed = False

    old_gate, new_gate = newest_gate(old), newest_gate(new)
    print(f"format version understood: v{old_gate} -> v{new_gate}")
    if new_gate != old_gate:
        changed = True
        print(f"  ACTION: set CURRENT_VERSION in src/flo/codec.ts to {new_gate}")
    print()

    added = sorted(set(new) - set(old), key=int)
    removed = sorted(set(old) - set(new), key=int)

    if added:
        changed = True
        print(f"new object types ({len(added)}):")
        for tid in added:
            kind = "block" if int(tid) >= 1000 else "expression"
            print(f"  + {tid:>5}  {short(new[tid]['cls']):<32} ({kind})")
        print("  ACTION: none — generated data already covers these.")
        print()

    if removed:
        changed = True
        print(f"removed object types ({len(removed)}):")
        for tid in removed:
            print(f"  - {tid:>5}  {short(old[tid]['cls'])}")
        print("  ACTION: check no fixture still uses them.")
        print()

    modified = []
    for tid in sorted(set(old) & set(new), key=int):
        a, b = old[tid], new[tid]
        if a.get("kind") != b.get("kind") or a.get("builtin") != b.get("builtin"):
            modified.append((tid, "kind", a.get("kind"), b.get("kind")))
            continue
        aops = [op_signature(o) for o in a.get("ops", [])]
        bops = [op_signature(o) for o in b.get("ops", [])]
        if aops != bops:
            modified.append((tid, "ops", a.get("ops", []), b.get("ops", [])))

    if modified:
        changed = True
        print(f"changed object types ({len(modified)}):")
        for tid, what, before, after in modified:
            print(f"  ~ {tid:>5}  {short(new[tid]['cls'])}")
            if what == "kind":
                print(f"        kind {before} -> {after}")
                continue
            before_sigs = {op_signature(o): o for o in before}
            after_sigs = {op_signature(o): o for o in after}
            for sig, op in after_sigs.items():
                if sig not in before_sigs:
                    print(f"        + {describe(op)}")
            for sig, op in before_sigs.items():
                if sig not in after_sigs:
                    print(f"        - {describe(op)}")
        print()
        print("  ACTION: a changed field on an existing type is the risky case.")
        print("  Run the round-trip tests against real flows before trusting it:")
        print("      FLO_FIXTURES=/path/to/flows npm test")
        print()

    if not changed:
        print("no wire-format changes.")
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
