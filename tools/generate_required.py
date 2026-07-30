#!/usr/bin/env python3
"""Extract each block's required arguments from the app's own runtime checks.

    python3 tools/generate_required.py <jadx-sources> > src/data/required.json

Automate validates arguments when a block *runs*, not when the flow loads:

    String s = I3.h.x(c1561u0, this.alias, null);
    if (s == null)
        throw new RequiredArgumentNullException("alias");

so a flow with that argument left empty is perfectly well-formed on disk and
throws the moment it reaches the block. Nothing in the file format, the schema
or `validateModel` can see it coming.

Two things make this harder than grepping `p1()`:

  - **Inheritance.** `AdbShellCommand.p1()` calls `super.p1()`, and the `alias`
    check lives in `AdbAction`. Requirements are merged down the `extends`
    chain.
  - **Virtual hooks.** `AdbShellCommand`'s own `command` check is not in `p1()`
    at all but in `q()`, which the base class calls. Chasing dispatch properly
    is a static analysis; instead every method of the class is scanned, which
    over-approximates.

Over-approximating is deliberate. This file only proposes *candidates*; how
strongly to warn is decided against the corpus at lint time, where a field the
app checks but real flows routinely leave empty is demoted from an error to a
warning. Code says what is checked; the corpus says whether it matters in
practice, and neither is trustworthy alone.
"""

import json
import os
import re
import sys

# `X v = <helper>(c1561u0, this.<field>, ...)` — the app's argument readers.
ASSIGN = re.compile(
    r"^\s*(?:final\s+)?[\w.$\[\]<>]+\s+(\w+)\s*=\s*"
    r"[\w.$]*\.\w+\(\s*\w+\s*,\s*this\.(\w+)\s*[,)]"
)
GUARD = re.compile(r"^\s*if\s*\(\s*(\w+)\s*==\s*null\s*\)")
# `if (this.<field>.length == 0) throw ... RequiredVariableMissingException`
EMPTY_GUARD = re.compile(r"^\s*if\s*\(\s*this\.(\w+)\.(?:length|isEmpty\(\))\s*==?\s*0?\s*\)")
THROW = re.compile(r"throw new com\.llamalab\.automate\.Required\w*(?:Null|Missing)\w*Exception")
EXTENDS = re.compile(r"\bclass\s+(\w+)\s+extends\s+([\w.$]+)")


def scan(src):
    """Fields guarded by an explicit Required…Exception anywhere in the class."""
    found = set()
    var_to_field = {}
    guard_var = None

    for line in src.splitlines():
        a = ASSIGN.match(line)
        if a:
            var_to_field[a.group(1)] = a.group(2)

        g = GUARD.match(line)
        if g:
            guard_var = g.group(1)
            continue

        e = EMPTY_GUARD.match(line)
        if e:
            guard_var = "\0" + e.group(1)
            continue

        if THROW.search(line):
            if guard_var is not None:
                field = guard_var[1:] if guard_var.startswith("\0") else var_to_field.get(guard_var)
                if field:
                    found.add(field)
            guard_var = None
        elif line.strip() and not line.strip().startswith("//"):
            # A guard only covers the statement (or block) immediately after it.
            if guard_var is not None and "{" not in line and "}" not in line:
                guard_var = None

    return found


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: generate_required.py <jadx-sources>")
    root = os.path.join(sys.argv[1], "com", "llamalab", "automate", "stmt")

    own = {}
    parent = {}
    for name in sorted(os.listdir(root)):
        if not name.endswith(".java"):
            continue
        cls = name[:-5]
        src = open(os.path.join(root, name), encoding="utf-8", errors="replace").read()
        m = EXTENDS.search(src)
        if m and m.group(1) == cls:
            parent[cls] = m.group(2).split(".")[-1]
        own[cls] = scan(src)

    # Merge each class's requirements with everything it inherits.
    def resolved(cls, seen=()):
        if cls in seen or cls not in own:
            return set()
        return own[cls] | resolved(parent.get(cls, ""), seen + (cls,))

    out = {}
    for cls in own:
        fields = resolved(cls)
        if fields:
            out["com.llamalab.automate.stmt." + cls] = sorted(fields)

    json.dump(out, sys.stdout, indent=1, sort_keys=True)
    print()
    total = sum(len(v) for v in out.values())
    print(f"// {len(out)} classes, {total} required-argument candidates", file=sys.stderr)


if __name__ == "__main__":
    main()
