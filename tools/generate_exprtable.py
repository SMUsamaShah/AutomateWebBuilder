#!/usr/bin/env python3
"""Extract the expression rendering table from the decompiled Automate APK.

Every expression node in the app implements `w(int flags)`, which renders the
node back to Automate expression source. Those methods follow a handful of
mechanical shapes, so the operator symbols, function names and arities can be
lifted straight out of them rather than transcribed by hand.

Output: src/data/exprtable.json  { "<typeId>": {kind, ...} }
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def load_schema():
    with open(os.path.join(REPO, "src/data/schema.json")) as f:
        return json.load(f)


def method_source(src, name):
    """Return the full text of the first method called `name`."""
    m = re.search(rf"(?:public|protected|private|static|final| )*[\w.$<>\[\]]+ {re.escape(name)}\((.*?)\)[^;{{]*\{{", src)
    if not m:
        return None
    depth, j = 0, m.end() - 1
    while j < len(src):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    return src[m.start():j + 1]


def class_path(srcdir, fqcn):
    parts = fqcn.split(".")
    for i in range(len(parts), 0, -1):
        p = os.path.join(srcdir, *parts[:i]) + ".java"
        if os.path.exists(p):
            return p
    return None


# `w()` body shapes we recognise, most specific first.
PATTERNS = [
    # Ternary: two chained appends, `cond ? a : b`. Must precede the binary
    # pattern, whose regex also matches the first of the two calls.
    ("ternary", re.compile(r'\.l\(this\.f\d+X, \w+, sb, " \? "\).*?\.l\(this\.f\d+Y, \w+, sb, " : "\)', re.S)),
    # Binary infix: C6.h.l(a, i8, sb, " OP "); ... e(b, ...)
    ("binary", re.compile(r'\.l\(this\.f\d+X, \w+, sb, "([^"]+)"\)')),
    # Parenthesised group: "(" + x.w(i8) + ")"
    ("group", re.compile(r'return "\(" \+ this\.f\d+X\.w\(\w+\) \+ "\)"')),
    # Prefix unary: "OP" + operand
    ("prefix", re.compile(r'return "([^"]{1,3})" \+ ')),
    # Prefix unary built through a seeded StringBuilder: new StringBuilder("OP")
    ("prefix", re.compile(r'new java\.lang\.StringBuilder\("([^"]{1,3})"\)')),
    # Function-style: I3.h.L(i8, l(), ...) — name comes from NAME constant
    ("func", re.compile(r"I3\.h\.L\(\w+, l\(\)")),
    # Named function with literal name
    ("func_literal", re.compile(r'I3\.h\.L\(\w+, "([^"]+)"')),
]


def classify(src, fqcn):
    # Function nodes carry their source name in a NAME constant; the `w()` that
    # formats `name(args...)` lives on the shared arity base class.
    name_m = re.search(r'NAME = "([^"]+)"', src)
    if name_m:
        return {"kind": "func", "name": name_m.group(1)}

    w = method_source(src, "w")
    if w is None:
        return None

    for kind, rex in PATTERNS:
        m = rex.search(w)
        if not m:
            continue
        if kind == "binary":
            return {"kind": "binary", "op": m.group(1).strip()}
        if kind == "group":
            return {"kind": "group"}
        if kind == "prefix":
            sym = m.group(1)
            if sym in ("!", "-", "~", "+", "++", "#"):
                return {"kind": "prefix", "op": sym}
            continue
        if kind == "ternary":
            return {"kind": "ternary"}
        if kind == "func_literal":
            return {"kind": "func", "name": m.group(1)}
        if kind == "func":
            return {"kind": "func", "name": None}

    # Index / member access: a[b] or a.b
    if re.search(r'sb\.append\(.\[.\)|"\["', w):
        return {"kind": "index"}
    return None


# Nodes whose rendering is intrinsic rather than derived from `w()`.
INTRINSIC = {
    "I3.l": {"kind": "var"},                 # variable reference
    "K3.W": {"kind": "string"},              # string literal
    "K3.J": {"kind": "number"},              # decimal literal
    "K3.C1036d": {"kind": "number"},         # binary literal
    "K3.C1050s": {"kind": "number"},         # hex literal
    "K3.I": {"kind": "null"},                # null
    "K3.C1051t": {"kind": "const", "text": "Infinity"},
    "K3.C": {"kind": "const", "text": "NaN"},
    "K3.H": {"kind": "const", "text": "Now"},
    "K3.L": {"kind": "const", "text": "Pi"},
    "K3.V": {"kind": "interp"},              # "text{expr}" interpolation
    "K3.E": {"kind": "list"},                # [a, b, c]
    "K3.F": {"kind": "map"},                 # {k: v}
    "K3.C1034b": {"kind": "bigint"},
    "K3.C1035c": {"kind": "bigint"},
    "K3.r": {"kind": "bigint"},
}


def main():
    srcdir = sys.argv[1] if len(sys.argv) > 1 else None
    if not srcdir or not os.path.isdir(srcdir):
        print("usage: generate_exprtable.py <jadx-sources-dir>", file=sys.stderr)
        return 1

    schema = load_schema()
    table = {}
    unresolved = []

    for tid, rec in schema.items():
        if int(tid) >= 1000:
            continue  # statements, not expressions
        cls = rec["cls"]
        if cls in INTRINSIC:
            table[tid] = dict(INTRINSIC[cls])
            continue
        path = class_path(srcdir, cls)
        if not path:
            continue
        info = classify(open(path).read(), cls)
        if info:
            if info.get("kind") == "func" and not info.get("name"):
                unresolved.append((tid, cls))
                continue
            table[tid] = info
        elif rec["kind"] == "struct":
            unresolved.append((tid, cls))

    out = os.path.join(REPO, "src/data/exprtable.json")
    with open(out, "w") as f:
        json.dump(table, f, indent=1, sort_keys=True)
    print(f"wrote {out}: {len(table)} expression types")
    if unresolved:
        print(f"unresolved ({len(unresolved)}):")
        for tid, cls in unresolved[:25]:
            print(f"   {tid} {cls}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
