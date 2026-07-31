#!/usr/bin/env python3
"""Generate .flo serialization schema + block catalog from jadx-decompiled Automate APK. v2"""
import re, os, sys, json
from collections import OrderedDict

SCRATCH = "/tmp/claude-0/-home-user-AutomateWebBuilder/84838f6f-cc16-5dd9-ad46-e1909201725c/scratchpad"
SRC = os.path.join(SCRATCH, "apk/decompiled/sources")
RESV = os.path.join(SCRATCH, "apk/resources/resources/res/values")
RESL = os.path.join(SCRATCH, "apk/resources/resources/res/layout")
OUT = os.path.join(SCRATCH, "generated")
os.makedirs(OUT, exist_ok=True)

# ---------------- resources ----------------
public = {}  # int id -> (type, name)
for m in re.finditer(r'<public type="(\w+)" name="([\w.]+)" id="0x([0-9a-f]+)" />',
                     open(os.path.join(RESV, "public.xml")).read()):
    public[int(m.group(3), 16)] = (m.group(1), m.group(2))

strings = {}
for m in re.finditer(r'<string name="([\w.]+)"[^>]*>(.*?)</string>',
                     open(os.path.join(RESV, "strings.xml")).read(), re.S):
    strings[m.group(1)] = m.group(2)

integers = {}
for m in re.finditer(r'<integer name="([\w.]+)">(0x[0-9a-fA-F]+|\d+)</integer>',
                     open(os.path.join(RESV, "integers.xml")).read()):
    integers[m.group(1)] = int(m.group(2), 0)

def res_string(rid):
    t = public.get(rid)
    if t and t[0] == "string":
        s = strings.get(t[1], "")
        s = s.replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n")
        s = re.sub(r"<[^>]+>", "", s)  # strip html tags
        return s
    return None

def res_integer(rid):
    t = public.get(rid)
    if t and t[0] == "integer":
        return integers.get(t[1])
    return None

def res_name(rid):
    t = public.get(rid)
    return t[1] if t else None

# layout -> ports (side -> kind)
LAYOUT_PORTS = {}
for f in os.listdir(RESL):
    if f.startswith("block_"):
        src = open(os.path.join(RESL, f)).read()
        ports = {}
        for m in re.finditer(r'android:id="@\+?id/(\w+)"[^>]*?style="@style/Widget\.Flowchart\.Connector\.(\w+)\.(\w+)"', src, re.S):
            ports[m.group(1)] = {"side": m.group(2).lower(), "kind": m.group(3)}
        LAYOUT_PORTS[f[:-4]] = ports

# ---------------- constants ----------------
constants = {}
with open(os.path.join(SRC, "com/llamalab/android/system/MoreOsConstants.java")) as f:
    for m in re.finditer(r"public static final int (\w+) = (-?\d+);", f.read()):
        constants[m.group(1)] = int(m.group(2))

def resolve_int(tok):
    tok = tok.strip()
    if re.fullmatch(r"-?\d+", tok):
        return int(tok)
    m = re.fullmatch(r"com\.llamalab\.android\.system\.MoreOsConstants\.(\w+)", tok)
    if m:
        return constants[m.group(1)]
    raise ValueError(f"cannot resolve {tok}")

# ---------------- registry ----------------
reg_src = open(os.path.join(SRC, "Q3/g.java")).read()
init = re.search(r"new Q3\.g\((.*?)\);\n", reg_src, re.S).group(1)

registry = {}
for m in re.finditer(r"new Q3\.g\.a\(([^,]+), ([\w.$]+)\.class\)", init):
    registry[resolve_int(m.group(1))] = {"kind": "struct", "cls": m.group(2)}
for m in re.finditer(r"new Q3\.g\.b\(([^,]+), ([\w.$\[\]]+)\.class\)", init):
    registry[resolve_int(m.group(1))] = {"kind": "objarray", "cls": m.group(2)}
for m in re.finditer(r"new Q3\.g\.c\(([^,]+), ([\w.$]+)\.f\d+\w*\)", init):
    registry[resolve_int(m.group(1))] = {"kind": "singleton", "cls": m.group(2)}
# Primitive built-in types (ids 1..41) — verified against Q3.g.d.* inner classes.
PRIMS = {
    1: "java.lang.Boolean", 3: "boolean[]", 4: "java.lang.Byte", 6: "byte[]",
    7: "java.lang.Character", 9: "char[]", 10: "java.lang.Double", 12: "double[]",
    13: "java.lang.Float", 15: "float[]", 16: "java.lang.Integer", 18: "int[]",
    19: "java.lang.Long", 21: "long[]", 22: "java.lang.Short", 24: "short[]",
    25: "java.lang.String", 40: "I3.b",
}
for pid, pcls in PRIMS.items():
    registry[pid] = {"kind": "prim", "cls": pcls}

# ---------------- scope-aware java parsing ----------------
class Scope:
    def __init__(self, name, start, end, header):
        self.name = name
        self.start = start
        self.end = end
        self.header = header
        self.children = []

def parse_scopes(src):
    """Return list of top-level class scopes with nested children (by brace matching)."""
    scopes = []
    stack = []
    for m in re.finditer(r"(?:public |protected |private |static |final |abstract )*(?:class|interface|enum) (\w+)[^{;]*\{|\{|\}", src):
        tok = m.group(0)
        if tok.endswith("{") and m.group(1):
            sc = Scope(m.group(1), m.start(), None, tok)
            if stack and isinstance(stack[-1], Scope):
                stack[-1].children.append(sc)
            elif not stack:
                scopes.append(sc)
            stack.append(sc)
        elif tok == "{":
            stack.append("{")
        else:
            if stack:
                top = stack.pop()
                if isinstance(top, Scope):
                    top.end = m.end()
    return scopes

def scope_source(src, scope, exclude_children=True):
    """Source text of scope with child class bodies removed."""
    text = src[scope.start:scope.end]
    if exclude_children:
        pieces = []
        pos = 0
        for ch in scope.children:
            s = ch.start - scope.start
            e = (ch.end or scope.end) - scope.start
            pieces.append(text[pos:s])
            pos = e
        pieces.append(text[pos:])
        text = "\n".join(pieces)
    return text

class JavaClass:
    def __init__(self, fqcn, path, inner=None):
        self.fqcn = fqcn
        self.path = path
        raw = open(path).read()
        scopes = parse_scopes(raw)
        target = scopes[0] if scopes else None
        if inner:
            # walk to inner class (dot-separated)
            for part in inner.split("."):
                nxt = None
                for ch in (target.children if target else []):
                    if ch.name == part or ch.name.endswith(part):
                        nxt = ch
                        break
                target = nxt
                if target is None:
                    break
        self.src = scope_source(raw, target) if target else raw
        self.raw = raw
        self.extends = None
        m = re.search(r"(?:class|interface) \w+(?:<[^>]*>)? extends ([\w.$]+)", self.src)
        if m:
            self.extends = m.group(1)
        self.annotations = {}
        # class-level annotations appear before class decl in raw (may precede scope start)
        head = raw[: raw.find("class ")] if not inner else self.src[:200]
        for am in re.finditer(r"@E3\.(\w)\((\d+|\"[^\"]*\")\)", raw[:raw.index("public") + 100] if False else raw.split("class " + (inner or fqcn.split(".")[-1]))[0]):
            self.annotations[am.group(1)] = am.group(2)
        # fields with optional E3.d annotation
        self.fields = OrderedDict()
        self.field_conn = {}
        for fm in re.finditer(r"(?:@E3\.d\((\d+)\)\s+)?public (?:final )?([\w.$\[\]<>]+) (\w+)(?: = [^;]+)?;", self.src):
            self.fields[fm.group(3)] = fm.group(2)
            if fm.group(1):
                self.field_conn[fm.group(3)] = int(fm.group(1))

    def method_body(self, name, nargs=None):
        lines = self.src.split("\n")
        for i, ln in enumerate(lines):
            m = re.search(rf"(?:public|protected|private)?\s*(?:static )?(?:final )?(?:void|[\w.$\[\]<>]+) {re.escape(name)}\((.*?)\)", ln)
            if m and "{" in ln:
                args = [a.strip() for a in m.group(1).split(",") if a.strip()]
                if nargs is not None and len(args) != nargs:
                    continue
                depth = ln.count("{") - ln.count("}")
                body, j = [], i + 1
                while j < len(lines) and depth > 0:
                    depth += lines[j].count("{") - lines[j].count("}")
                    if depth > 0 or lines[j].strip() != "}":
                        body.append(lines[j].strip())
                    j += 1
                return body, args
        return None, None

CLASS_CACHE = {}
def load_class(fqcn):
    if fqcn in CLASS_CACHE:
        return CLASS_CACHE[fqcn]
    parts = fqcn.split(".")
    jc = None
    for i in range(len(parts), 0, -1):
        p = os.path.join(SRC, *parts[:i]) + ".java"
        if os.path.exists(p):
            inner = ".".join(parts[i:]) or None
            jc = JavaClass(fqcn, p, inner)
            break
    CLASS_CACHE[fqcn] = jc
    return jc

# ---------------- op builder ----------------
READ_OPS = {
    "b()": "svar64", "a()": "svar32", "d()": "uvar32",
    "readUTF()": "utf", "i()": "utf_null", "m()": "utf_null",
    "readDouble()": "f64", "readFloat()": "f32",
    "readInt()": "i32", "readLong()": "i64", "readShort()": "i16",
    "readBoolean()": "u8", "readUnsignedByte()": "u8", "readByte()": "u8",
}

class ParseFail(Exception):
    pass

DECL_RE = re.compile(r"^(?:boolean|int|long|float|double|short|byte|char|java\.lang\.\w+|[\w.$\[\]<>]+) \w+;$")

def build_ops(fqcn, body, cvar, jc, depth=0, valias=None, derived=None):
    if depth > 12:
        raise ParseFail("recursion")
    derived = derived or fqcn
    valias = set(valias or ())
    ops = []
    has_transform = False
    lines = [l for l in body if l]
    # Normalize decompiler's `this` aliasing: `Foo bar = this;` (or bare `bar = this;`)
    # followed by `bar.field = ...`. Rewrite alias uses to `this.` and drop the alias lines.
    aliases = set()
    for ln in lines:
        am = re.fullmatch(r"(?:[\w.$]+ )?(\w+) = this;", ln)
        if am:
            aliases.add(am.group(1))
    for alias in aliases:
        lines = [re.sub(rf"\b{alias}\.", "this.", l) for l in lines]
    if aliases:
        lines = [l for l in lines
                 if not re.fullmatch(r"(?:[\w.$]+ )?(\w+) = this;", l)
                 or re.fullmatch(r"(?:[\w.$]+ )?(\w+) = this;", l).group(1) not in aliases]
    locals_read = {}
    i = 0
    ceiling = None  # max version constraint after a min-gate block ended with return

    def push(op):
        if ceiling is not None:
            op["max"] = min(op.get("max", 10 ** 9), ceiling)
        ops.append(op)

    def vgate(expr):
        """Match version comparison expr, return (kind,N) or None."""
        for va in list(valias) + [f"{cvar}.f6067x0"]:
            m = re.fullmatch(rf"(\d+) <= {re.escape(va)}", expr)
            if m:
                return ("min", int(m.group(1)))
            m = re.fullmatch(rf"(\d+) > {re.escape(va)}(?: && .*)?", expr)
            if m:
                return ("max", int(m.group(1)) - 1)
        return None

    while i < len(lines):
        ln = lines[i]
        if DECL_RE.fullmatch(ln) and cvar not in ln:
            i += 1
            continue
        # version alias
        m = re.fullmatch(rf"int (\w+) = {cvar}\.f6067x0;", ln)
        if m:
            valias.add(m.group(1))
            i += 1
            continue
        if re.fullmatch(rf"super\.z0\({cvar}\);", ln):
            sops, st = spec_for(jc.extends, derived)
            has_transform |= st
            [push(dict(o)) for o in sops]
            i += 1
            continue
        m = re.fullmatch(rf"(?:this\.)?(\w+)\({cvar}(?:, ([\w.]+|\d+))?\);", ln)
        if m and m.group(1) not in ("f", "readFully"):
            hname, harg = m.group(1), m.group(2)
            # Virtual dispatch: resolve the override starting from the most-derived
            # class, not from the class whose body we are currently inlining.
            cur = load_class(derived) or jc
            hb = None
            while cur is not None:
                hb, hargs = cur.method_body(hname, nargs=2 if harg else 1)
                if hb is not None:
                    break
                cur = load_class(cur.extends) if cur.extends else None
            if hb is None:
                raise ParseFail(f"helper {hname} not found")
            hcvar = hargs[0].split()[-1]
            hbody = hb
            if harg is not None:
                pname = hargs[1].split()[-1]
                val = str(resolve_int(harg))
                hbody = [re.sub(rf"\b{pname}\b", val, l) for l in hb]
            hops, ht = build_ops(cur.fqcn, hbody, hcvar, cur, depth=depth + 1, derived=derived)
            has_transform |= ht
            [push(_o) for _o in hops]
            i += 1
            continue
        # if gates
        m = re.fullmatch(r"if \((.*?)\) \{", ln)
        if m:
            g = vgate(m.group(1))
            if g:
                # gather branch chain: [(lo,hi,block), ...]
                lo1, hi1 = (g[1], 10**9) if g[0] == "min" else (0, g[1])
                block, i2 = collect_block(lines, i)
                branches = [(lo1, hi1, block)]
                # accumulated "not any previous branch" constraint
                acc_lo, acc_hi = 0, 10**9
                def inv(lo, hi):
                    # inverse of [lo,hi] within [0,inf): only valid for half-bounded ranges
                    if lo > 0 and hi >= 10**9:
                        return (0, lo - 1)
                    if lo <= 0 and hi < 10**9:
                        return (hi + 1, 10**9)
                    return (0, 10**9)
                acc_lo, acc_hi = inv(lo1, hi1)
                while i2 < len(lines) and lines[i2].startswith("} else"):
                    em = re.fullmatch(r"\} else if \((.*?)\) \{", lines[i2])
                    if em:
                        g2 = vgate(em.group(1))
                        blk, i2 = collect_block(lines, i2)
                        if g2:
                            l2, h2 = (g2[1], 10**9) if g2[0] == "min" else (0, g2[1])
                            branches.append((max(acc_lo, l2), min(acc_hi, h2), blk))
                            nl, nh = inv(l2, h2)
                            acc_lo, acc_hi = max(acc_lo, nl), min(acc_hi, nh)
                        else:
                            if any(cvar in b for b in blk):
                                raise ParseFail(lines[i2 - 1] if i2 else ln)
                            has_transform = True
                    elif lines[i2] == "} else {":
                        blk, i2 = collect_block(lines, i2)
                        branches.append((acc_lo, acc_hi, blk))
                    else:
                        i2 += 1
                had_return = False
                ret_lo, ret_hi = None, None
                for blo, bhi, blk in branches:
                    if blk and blk[-1] == "return;":
                        blk = blk[:-1]
                        # after the whole if-chain, execution continues only when NOT in this branch
                        rl, rh = inv(blo, bhi)
                        ret_lo = rl if ret_lo is None else max(ret_lo, rl)
                        ret_hi = rh if ret_hi is None else min(ret_hi, rh)
                        had_return = True
                    gops, gt = build_ops(fqcn, blk, cvar, jc, depth + 1, valias, derived)
                    has_transform |= gt
                    for op in gops:
                        if blo > 0:
                            op["min"] = max(op.get("min", 0), blo)
                        if bhi < 10**9:
                            op["max"] = min(op.get("max", 10**9), bhi)
                        push(op)
                if had_return:
                    if ret_hi is not None and ret_hi < 10**9:
                        ceiling = ret_hi if ceiling is None else min(ceiling, ret_hi)
                    if ret_lo is not None and ret_lo > 0:
                        rest, rt = build_ops(fqcn, lines[i2:], cvar, jc, depth + 1, valias, derived)
                        has_transform |= rt
                        for op in rest:
                            op["min"] = max(op.get("min", 0), ret_lo)
                            push(op)
                        return ops, has_transform
                i = i2
                continue
            # instanceof / transform-only condition blocks without stream reads inside
            block, i2 = collect_block(lines, i)
            allb = block[:]
            while i2 < len(lines) and lines[i2].startswith("} else"):
                if lines[i2].rstrip().endswith("{"):
                    b2, i2 = collect_block(lines, i2)
                    allb += b2
                else:
                    i2 += 1
            if any(cvar in b for b in allb):
                raise ParseFail(ln)
            has_transform = True
            i = i2
            continue
        # ternary gated reads
        m = re.fullmatch(rf"this\.(\w+) = (\d+) <= {cvar}\.f6067x0 \? (?:\([\w.$\[\]]+\) )?{cvar}\.(readObject\(\)|\w+\(\)) : (.*);", ln)
        if m and (m.group(3) == "readObject()" or m.group(3) in READ_OPS):
            op = {"f": m.group(1), "op": "obj" if m.group(3) == "readObject()" else READ_OPS[m.group(3)], "min": int(m.group(2))}
            push(op)
            # legacy alternative reads from stream?
            if cvar in m.group(4):
                am = re.search(rf"{cvar}\.(\w+\(\))", m.group(4))
                if am and am.group(1) in READ_OPS:
                    push({"f": m.group(1), "op": READ_OPS[am.group(1)], "max": int(m.group(2)) - 1})
                else:
                    raise ParseFail(ln)
            has_transform = True
            i += 1
            continue
        # ConversionType.readObject(cVar)
        m = re.fullmatch(rf"this\.(\w+) = com\.llamalab\.automate\.expr\.ConversionType\.readObject\({cvar}\);", ln)
        if m:
            push({"f": m.group(1), "op": "convtype"})
            i += 1
            continue
        m = re.fullmatch(rf"[\w.$\[\]<>]+ (\w+) = com\.llamalab\.automate\.expr\.ConversionType\.readObject\({cvar}\);", ln)
        if m:
            push({"f": None, "op": "convtype", "_local": m.group(1)})
            locals_read[m.group(1)] = len(ops) - 1
            has_transform = True
            i += 1
            continue
        # stmt.M.b(cVar) static (icon uri helper): wire = one object
        m = re.fullmatch(rf"this\.(\w+) = com\.llamalab\.automate\.stmt\.M\.b\({cvar}\);", ln)
        if m:
            push({"f": m.group(1), "op": "obj"})
            has_transform = True
            i += 1
            continue
        # reads
        m = re.fullmatch(rf"this\.(\w+) = (?:\(([\w.$\[\]]+)\) )?{cvar}\.readObject\(\);", ln)
        if m:
            push({"f": m.group(1), "op": "obj", "cast": m.group(2)})
            i += 1
            continue
        m = re.fullmatch(rf"this\.(\w+) = (?:\([\w.$\[\]]+\) )?{cvar}\.(\w+\(\));", ln)
        if m and m.group(2) in READ_OPS:
            push({"f": m.group(1), "op": READ_OPS[m.group(2)]})
            i += 1
            continue
        m = re.fullmatch(rf"this\.(\w+) = (?:\(([\w.$\[\]]+)\) )?{cvar}\.g\([^)]*\);", ln)
        if m:
            push({"f": m.group(1), "op": "objarray", "cast": m.group(2)})
            i += 1
            continue
        m = re.fullmatch(rf"this\.(\w+) = (?:\([\w.$\[\]]+\) )?{cvar}\.h\([^)]*\);", ln)
        if m:
            push({"f": m.group(1), "op": "parcel"})
            i += 1
            continue
        m = re.fullmatch(rf"{cvar}\.l\(this\.(\w+), [^)]*\);", ln)
        if m:
            push({"f": m.group(1), "op": "parcel"})
            i += 1
            continue
        m = re.fullmatch(rf"{cvar}\.(\w+\(\));", ln)
        if m and m.group(1) in READ_OPS:
            push({"f": None, "op": READ_OPS[m.group(1)]})
            i += 1
            continue
        m = re.fullmatch(rf"[\w.$\[\]<>]+ (\w+) = (?:\(([\w.$\[\]]+)\) )?{cvar}\.readObject\(\);", ln)
        if m:
            push({"f": None, "op": "obj", "cast": m.group(2), "_local": m.group(1)})
            locals_read[m.group(1)] = len(ops) - 1
            has_transform = True
            i += 1
            continue
        # bare (pre-declared) local read: `foo = (Cast) cVar.readObject();`
        m = re.fullmatch(rf"(\w+) = (?:\(([\w.$\[\]]+)\) )?{cvar}\.readObject\(\);", ln)
        if m and m.group(1) != "this":
            push({"f": None, "op": "obj", "cast": m.group(2), "_local": m.group(1)})
            locals_read[m.group(1)] = len(ops) - 1
            has_transform = True
            i += 1
            continue
        m = re.fullmatch(r"this\.(\w+) = (\w+);", ln)
        if m and m.group(2) in locals_read:
            idx = locals_read[m.group(2)]
            if ops[idx]["f"] is None:
                ops[idx]["f"] = m.group(1)
            i += 1
            continue
        if is_ignorable(ln, cvar):
            has_transform = True
            i += 1
            continue
        raise ParseFail(ln)
    # Reads whose value the app discards (or keeps only in a local) still occupy bytes
    # on the wire. Give them synthetic names so a read/write round-trip preserves them.
    for n, op in enumerate(ops):
        if op.get("f") is None:
            op["f"] = f"_anon{n}"
    for op in ops:
        op.pop("_local", None)
    return ops, has_transform

def collect_block(lines, i):
    """lines[i] opens a block. Returns (body, next_index). next_index points at the
    line AFTER the closing '}' — or AT the '} else...' line if the block ends with one."""
    depth = 1
    block = []
    j = i + 1
    while j < len(lines):
        ln = lines[j]
        if depth == 1 and ln.startswith("}"):
            if ln == "}":
                return block, j + 1
            if ln.startswith("} else"):
                return block, j
            # '}' followed by something unusual: treat as close, keep rest
            return block, j + 1
        depth += ln.count("{") - ln.count("}")
        if depth <= 0:
            # closing brace merged in this line (shouldn't happen with jadx style)
            return block, j + 1
        block.append(ln)
        j += 1
    return block, j

IGNORABLE = [
    re.compile(r"^this\.\w+ = (?!.*readObject|.*read)"),
    re.compile(r"^\} else if \(.*\) \{$"),
    re.compile(r"^\} else \{$"),
    re.compile(r"^[\w.$\[\]<>]+ \w+ = (?!.*read)"),
    re.compile(r"^java\.util\.regex\.Pattern pattern"),
    re.compile(r"^return;$"),
    re.compile(r"^\}$"),
]
def is_ignorable(ln, cvar):
    if cvar in ln:
        return False
    for rex in IGNORABLE:
        if rex.match(ln):
            return True
    return False

# variadic base detection
def extends_chain(fqcn):
    chain = []
    cur = load_class(fqcn)
    while cur is not None:
        chain.append(cur.fqcn)
        cur = load_class(cur.extends) if cur.extends else None
    return chain

SPEC_CACHE = {}
def spec_for(fqcn, derived=None):
    derived = derived or fqcn
    key = (fqcn, derived)
    if key in SPEC_CACHE:
        r = SPEC_CACHE[key]
        if isinstance(r, ParseFail):
            raise r
        return r
    jc = load_class(fqcn)
    if jc is None:
        e = ParseFail(f"no source for {fqcn}")
        SPEC_CACHE[key] = e
        raise e
    body, args = jc.method_body("z0", nargs=1)
    if body is None:
        if jc.extends:
            try:
                r = spec_for(jc.extends, derived)
                SPEC_CACHE[key] = r
                return r
            except ParseFail as e:
                SPEC_CACHE[key] = e
                raise
        e = ParseFail(f"no z0 anywhere for {fqcn}")
        SPEC_CACHE[key] = e
        raise e
    cvar = args[0].split()[-1]
    # a0-variadic z0 = b(cVar) / c(cVar)
    joined = " ".join(l for l in body if l)
    if "K3.a0" in extends_chain(fqcn):
        if re.fullmatch(rf"(?:this\.)?b\({cvar}\);", joined):
            r = ([{"f": "args", "op": "varargs", "legacy2": 47}], False)
            SPEC_CACHE[key] = r
            return r
        if re.fullmatch(rf"(?:this\.)?c\({cvar}\);", joined):
            r = ([{"f": "args", "op": "varargs"}], False)
            SPEC_CACHE[key] = r
            return r
    try:
        r = build_ops(fqcn, body, cvar, jc, derived=derived)
        SPEC_CACHE[key] = r
        return r
    except ParseFail as e:
        SPEC_CACHE[key] = e
        raise

# ---------------- manual specs ----------------
S = lambda **kw: kw
MANUAL_SPECS = {
    # K3.F: dictionary-literal expr: count + (key expr, value expr, convtype)*
    "K3.F": [{"f": "pairs", "op": "kvpairs"}],
    # UrlDecode (K3.U ternary base): modern >=109: 3 objs; legacy: obj + obj->Z
    "com.llamalab.automate.expr.func.UrlDecode": [
        {"f": "f4643X", "op": "obj"},
        {"f": "f4644Y", "op": "obj", "min": 109},
        {"f": "f4645Z", "op": "obj", "min": 109},
        {"f": "f4645Z", "op": "obj", "max": 108},
    ],
    # These three carry an Android Parcel we cannot model as fields, so their
    # layout is hand-written in the codec. They do NOT share a base class, and
    # getting that wrong shifts every later object by one:
    #   PlugInCondition  extends StatefulIntermittentDecision  (2 ports + continuity)
    #   PlugInEvent      extends Action                        (1 port)
    #   PlugInSetting    extends IntermittentAction            (1 port + continuity)
    "com.llamalab.automate.stmt.PlugInCondition": "PLUGIN_DECISION",
    "com.llamalab.automate.stmt.PlugInEvent": "PLUGIN_ACTION",
    "com.llamalab.automate.stmt.PlugInSetting": "PLUGIN_ACTION_CONTINUITY",
    "com.llamalab.automate.stmt.Interact": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.IntermittentDecision", "gate": 59},
        {"f": "action", "op": "obj"},
        {"f": "argX", "op": "obj"},
        {"f": "argY", "op": "obj", "min": 94},
        {"f": "packageName", "op": "obj", "min": 75},
        {"f": "displayId", "op": "obj", "min": 105},
        {"f": "schema", "op": "obj", "min": 105},
        {"f": "xpath", "op": "obj", "min": 90},
        {"f": "_legacy1", "op": "obj", "max": 89},
        {"f": "_legacy2", "op": "obj", "max": 89},
        {"f": "_legacy3", "op": "obj", "max": 89},
    ],
    "com.llamalab.automate.stmt.NotificationShow": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Decision", "gate": 68},
        {"f": "continuity", "op": "obj"},
        {"f": "title", "op": "obj"},
        {"f": "message", "op": "obj"},
        {"f": "shortCriticalText", "op": "obj", "min": 110},
        {"f": "pictureUri", "op": "obj", "min": 79},
        {"f": "personUri", "op": "obj", "min": 79},
        {"f": "smallIconUri", "op": "obj", "min": 47},
        {"f": "largeIconUri", "op": "obj", "min": 99},
        {"f": "color", "op": "obj", "min": 99},
        {"f": "cancellable", "op": "obj"},
        {"f": "ongoing", "op": "obj", "min": 17},
        {"f": "_legacyTicker", "op": "obj", "max": 76},
        {"f": "visibility", "op": "obj", "min": 35},
        {"f": "category", "op": "obj", "min": 35},
        {"f": "groupKey", "op": "obj", "min": 110},
        {"f": "channelId", "op": "obj", "min": 77},
        {"f": "_legacyPriority", "op": "obj", "max": 76},
        {"f": "_legacySound", "op": "obj", "max": 76},
        {"f": "_legacyVibrate", "op": "obj", "max": 76},
        {"f": "actionNames", "op": "obj", "min": 50},
        {"f": "varActionClicked", "op": "obj", "min": 50},
        {"f": "varInteracted", "op": "obj", "min": 110},
    ],
    "com.llamalab.automate.stmt.NotificationPosted": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Decision"},
        {"f": "packageName", "op": "obj"},
        {"f": "channelId", "op": "obj", "min": 106},
        {"f": "title", "op": "obj"},
        {"f": "visibility", "op": "obj", "min": 87},
        {"f": "flagsExclude", "op": "obj"},
        {"f": "picturePath", "op": "obj", "min": 97},
        {"f": "index", "op": "obj", "min": 97},
        {"f": "varPackageName", "op": "obj"},
        {"f": "varChannelId", "op": "obj", "min": 106},
        {"f": "varTitle", "op": "obj"},
        {"f": "varMessage", "op": "obj"},
        {"f": "varTicker", "op": "obj"},
        {"f": "varAdditional", "op": "obj", "min": 45},
        {"f": "varPersonUris", "op": "obj", "min": 45},
        {"f": "varCategory", "op": "obj", "min": 35},
        {"f": "varWhen", "op": "obj"},
        {"f": "varExtras", "op": "obj", "min": 94},
        {"f": "varActions", "op": "obj", "min": 50},
        {"f": "varKey", "op": "obj"},
        {"f": "varRemoveReason", "op": "obj", "min": 81},
    ],
    "com.llamalab.automate.stmt.VariablesGive": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Action"},
        {"f": "taker", "op": "obj"},
        {"f": "takerFiberUri", "op": "obj"},
    ],
    "com.llamalab.automate.stmt.VariablesTake": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Decision", "gate": 32},
        {"f": "continuity", "op": "obj", "min": 32},
        {"f": "varGiverFiberUri", "op": "obj"},
        {"f": "variables", "op": "objarray"},
    ],
    # Extends Action — one port, and no continuity. Reading it as a decision
    # consumed an extra object and desynchronised every flow containing it.
    # (Before v46 the gesture payload was written inline with no type id; that
    # branch is still unmodelled, and no v<46 sample exists to check it against.)
    "com.llamalab.automate.stmt.MotionGesture": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Action"},
        {"f": "gesture", "op": "obj", "min": 46},
        {"f": "name", "op": "utf_null"},
    ],
    "com.llamalab.automate.stmt.Goto": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Action"},
        {"f": "labels", "op": "objarray"},
        {"f": "labelValue", "op": "obj"},
    ],
    # fiber-state classes (not flow blocks) — best-effort modern specs
    "com.llamalab.automate.stmt.RunnableC1535o0": [
        {"f": "f14701y0", "op": "svar64"},
        {"f": "f16811y1", "op": "utf_null"},
        {"f": "f16796K1", "op": "utf_null"},
        {"f": "f16797L1", "op": "utf_null", "min": 14},
        {"f": "f16798M1", "op": "utf_null", "min": 9},
        {"f": "f16799N1", "op": "utf_null", "min": 9},
        {"f": "f16800O1", "op": "utf_null", "min": 11},
        {"f": "f16801P1", "op": "utf_null", "min": 11},
        {"f": "f16802Q1", "op": "i32", "min": 11},
        {"f": "f16800O1b", "op": "i16", "max": 10},
        {"f": "f16803R1", "op": "u8"},
        {"f": "f16804S1", "op": "i32", "min": 14},
        {"f": "f16804S1b", "op": "u8", "max": 13},
        {"f": "_skip8", "op": "svar32", "max": 7},
        {"f": "T1", "op": "svar32"},
        {"f": "f16805U1", "op": "utf_null"},
        {"f": "V1", "op": "utf_null", "min": 14},
        {"f": "f16806W1", "op": "utf_null", "min": 8},
        {"f": "f16807X1", "op": "utf_null", "min": 8},
        {"f": "f16808Y1", "op": "f32", "min": 9},
        {"f": "f16808Y1b", "op": "u8", "max": 8},
        {"f": "f16809Z1", "op": "svar64"},
    ],
    "com.llamalab.automate.stmt.N": [
        {"f": "f14701y0", "op": "svar64"},
        {"f": "f16257L1", "op": "svar32"},
        {"f": "f16258M1", "op": "svar32"},
        {"f": "f16259N1", "op": "utf_null"},
        {"f": "f16260O1", "op": "svar32"},
        {"f": "f16261P1", "op": "svar32"},
    ],
    "com.llamalab.automate.stmt.X": "STMT_X",  # custom runtime handler
    "com.llamalab.automate.stmt.DictionaryPut": [
        {"op": "super", "cls": "com.llamalab.automate.stmt.Action"},
        {"f": "key", "op": "obj"},  # verify below
    ],
}

# DictionaryPut: verify actual fields via targeted parse below (drop placeholder if auto works)

# ---------------- run ----------------
schema = OrderedDict()
manual_left = []
FORCE_MANUAL = {
    "com.llamalab.automate.stmt.PlugInCondition",
    "com.llamalab.automate.stmt.PlugInEvent",
    "com.llamalab.automate.stmt.PlugInSetting",
    "com.llamalab.automate.stmt.X",
    "com.llamalab.automate.stmt.RunnableC1535o0",
    "com.llamalab.automate.stmt.N",
    "K3.F",
}
BUILTIN = {
    "I3.a": "array", "I3.e": "dict", "I3.b": "bigint",
    "p098m3.b": "samples_u8", "p098m3.d": "samples_f32",
    "K3.V": "interp_string", "K3.E": "list_expr",
    "K3.C1034b": "bigint_literal", "K3.C1035c": "bigint_literal", "K3.r": "bigint_literal",
}

# try DictionaryPut with the improved parser first
MANUAL_TRY_AUTO = ["com.llamalab.automate.stmt.DictionaryPut"]
for cls in MANUAL_TRY_AUTO:
    try:
        ops, ht = spec_for(cls)
        MANUAL_SPECS.pop(cls, None)
    except ParseFail:
        pass

def check_manual_superclasses():
    """Refuse a hand-written spec that names a superclass the class does not have.

    MANUAL_SPECS is only a fallback for classes the extractor cannot parse, so a
    wrong entry sits unused — and silently correct-looking — until the day
    extraction fails and it is picked up. That is exactly what happened to
    MotionGesture: it claimed IntermittentDecision, actually extends Action, and
    so read two ports plus a continuity where the file holds one port. Every
    flow containing the block desynchronised from that point on, at every format
    version, and nothing downstream could tell.
    """
    problems = []
    for child, spec in MANUAL_SPECS.items():
        if not isinstance(spec, list):
            continue  # a few entries alias another class by name
        for op in spec:
            if not isinstance(op, dict) or op.get("op") != "super":
                continue
            chain = extends_chain(child)[1:]
            if chain and op["cls"] not in chain:
                short = [c.rsplit(".", 1)[-1] for c in chain[:3]]
                problems.append(
                    f"  {child.rsplit('.', 1)[-1]} claims "
                    f"{op['cls'].rsplit('.', 1)[-1]}, actually {' -> '.join(short)}"
                )
    if problems:
        sys.exit("stale manual specs:\n" + "\n".join(problems))


check_manual_superclasses()


def expand_manual(spec):
    """Expand 'super' pseudo-ops in manual specs."""
    out = []
    for op in spec:
        if op.get("op") == "super":
            cls = op["cls"]
            gate = op.get("gate")
            if cls == "com.llamalab.automate.stmt.IntermittentDecision" and gate:
                sops, _ = spec_for("com.llamalab.automate.stmt.Decision")
                sops = [dict(o) for o in sops]
                sops.append({"f": "continuity", "op": "obj", "min": gate})
                out.extend(sops)
            elif cls == "com.llamalab.automate.stmt.Decision" and gate:
                sops, _ = spec_for("com.llamalab.automate.stmt.AbstractStatement")
                sops = [dict(o) for o in sops]
                sops.append({"f": "onPositive", "op": "obj"})
                sops.append({"f": "onNegative", "op": "obj", "min": gate})
                out.extend(sops)
            elif cls == "com.llamalab.automate.stmt.IntermittentAction" and gate:
                sops, _ = spec_for("com.llamalab.automate.stmt.Action")
                sops = [dict(o) for o in sops]
                sops.append({"f": "continuity", "op": "obj", "min": gate})
                out.extend(sops)
            else:
                sops, _ = spec_for(cls)
                out.extend([dict(o) for o in sops])
        else:
            out.append(dict(op))
    return out

for tid in sorted(registry):
    ent = registry[tid]
    cls = ent["cls"]
    rec = {"id": tid, "cls": cls, "kind": ent["kind"]}
    if ent["kind"] == "struct":
        if cls in BUILTIN:
            rec["kind"] = "builtin"
            rec["builtin"] = BUILTIN[cls]
        else:
            auto_ok = False
            if cls not in FORCE_MANUAL:
                try:
                    ops, ht = spec_for(cls)
                    rec["ops"] = [dict(o) for o in ops]
                    if ht:
                        rec["transforms"] = True
                    auto_ok = True
                except ParseFail:
                    pass
            if not auto_ok:
                if cls in MANUAL_SPECS:
                    spec = MANUAL_SPECS[cls]
                    if isinstance(spec, str):
                        rec["kind"] = "builtin"
                        rec["builtin"] = spec
                    else:
                        rec["ops"] = expand_manual(spec)
                        rec["manual"] = True
                else:
                    rec["kind"] = "manual"
                    manual_left.append((tid, cls, "unparsed"))
    schema[str(tid)] = rec

print(f"total: {len(schema)}, unresolved: {len(manual_left)}")
for tid, cls, err in manual_left:
    print(f"  UNRESOLVED {tid} {cls}: {err[:130]}")

# ---------------- catalog ----------------
def annotation_up(fqcn, key):
    cur = load_class(fqcn)
    while cur is not None:
        v = cur.annotations.get(key)
        if v is not None:
            return v
        cur = load_class(cur.extends) if cur.extends else None
    return None

def conn_fields_up(fqcn):
    """field -> connector view res id, walking up hierarchy (nearest wins)."""
    out = {}
    cur = load_class(fqcn)
    while cur is not None:
        for f, rid in cur.field_conn.items():
            out.setdefault(f, rid)
        cur = load_class(cur.extends) if cur.extends else None
    return out

catalog = OrderedDict()
for tid in sorted(registry):
    if tid < 1000:
        continue
    ent = registry[tid]
    cls = ent["cls"]
    if "$" in cls or cls.split(".")[-1][0].islower() or not cls.startswith("com.llamalab.automate.stmt."):
        # inner/fiber classes and non-stmt: skip catalog (but keep in schema)
        # exceptions: C1558t0 etc. under com.llamalab.automate
        if not cls.startswith("com.llamalab.automate.stmt."):
            continue
        last = cls.split(".")[-1]
        if last[0].islower() or last.startswith("RunnableC") or last in ("N", "X", "G0", "M"):
            continue
    last = cls.split(".")[-1]
    if re.fullmatch(r"[A-Z]\d*|RunnableC\d+\w*|C\d+\w*|G0", last):
        continue
    jc = load_class(cls)
    if jc is None:
        continue
    rec = {"id": tid, "name": last}
    a = annotation_up(cls, "a")   # icon integer res
    i_ = annotation_up(cls, "i")  # title
    h = annotation_up(cls, "h")   # summary
    f_ = annotation_up(cls, "f")  # doc
    b_ = annotation_up(cls, "b")  # block layout
    if a and a.isdigit():
        g = res_integer(int(a))
        if g:
            rec["icon"] = g
    if i_ and i_.isdigit():
        rec["title"] = res_string(int(i_))
    if h and h.isdigit():
        rec["summary"] = res_string(int(h))
    if f_:
        rec["doc"] = f_.strip('"')
    if b_ and b_.isdigit():
        rec["layout"] = res_name(int(b_))
    # ports: statement-ref fields from schema ops
    srec = schema.get(str(tid), {})
    ports = []
    conns = conn_fields_up(cls)
    for op in srec.get("ops", []):
        fld = op.get("f")
        if not fld:
            continue
        cast = op.get("cast") or ""
        if cast == "com.llamalab.automate.InterfaceC1482k2" or fld in ("onComplete", "onPositive", "onNegative"):
            vid = conns.get(fld)
            vname = res_name(vid) if vid else None
            ports.append({"field": fld, "conn": vname})
    rec["ports"] = ports
    # editable fields with kinds
    fields = []
    seen = set()
    for op in srec.get("ops", []):
        fld = op.get("f")
        if not fld or fld in seen or fld.startswith("_"):
            continue
        seen.add(fld)
        if any(p["field"] == fld for p in ports):
            continue
        if fld in ("f15575X", "f15576Y", "f15577Z"):  # id, x, y
            continue
        entry = {"name": fld, "op": op.get("op")}
        cast = op.get("cast")
        if cast:
            entry["cast"] = cast
        fields.append(entry)
    rec["fields"] = fields
    catalog[str(tid)] = rec

json.dump(schema, open(os.path.join(OUT, "schema.json"), "w"), indent=1)
json.dump(catalog, open(os.path.join(OUT, "catalog.json"), "w"), indent=1)
print(f"catalog blocks: {len(catalog)}")
print("wrote schema.json + catalog.json")
