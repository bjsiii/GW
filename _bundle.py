#!/usr/bin/env python
"""Round-trip toolchain for the GW bundled index.html.

  python _bundle.py extract   # index.html  -> _src/ (sources) + _src/_mapping.json + _src/_template.html
  python _bundle.py pack      # _src/        -> index.html  (swaps only the data blobs; template untouched)
  python _bundle.py verify    # confirm current index.html decompresses to exactly the _src files
"""
import re, json, base64, gzip, os, sys, io

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(ROOT, "index.html")
SRC = os.path.join(ROOT, "_src")
MAP = os.path.join(SRC, "_mapping.json")
TEMPLATE = os.path.join(SRC, "_template.html")

ENTRY = re.compile(
    r'"([0-9a-fA-F-]{8,})"\s*:\s*\{\s*"mime"\s*:\s*"([^"]*)"\s*,\s*"compressed"\s*:\s*(true|false)\s*,\s*"data"\s*:\s*"([^"]*)"\s*\}'
)

EXT = {"text/javascript":"js","application/javascript":"js","text/css":"css",
       "text/html":"html","application/json":"json","image/svg+xml":"svg",
       "text/plain":"txt","font/woff2":"woff2","font/woff":"woff"}

def decode(entry):
    b = base64.b64decode(entry["data"])
    if entry["compressed"]:
        b = gzip.decompress(b)
    return b

def name_for(uid, mime, content_bytes):
    # text app files declare themselves with a leading `// Name.jsx` comment
    try:
        head = content_bytes[:120].decode("utf-8", "replace")
    except Exception:
        head = ""
    m = re.match(r'//\s*([A-Za-z0-9_]+\.jsx?)\b', head)
    if m:
        return f"app/{m.group(1)}"
    if mime.startswith("font/"):
        return f"fonts/{uid[:8]}.{EXT.get(mime,'bin')}"
    # react/react-dom/babel bundles (production or development headers)
    low = head.lower()
    if "react-dom.development" in low or "react-dom.production" in low:
        return "vendor/react-dom.production.min.js"
    if "react.development" in low or "react.production" in low:
        return "vendor/react.production.min.js"
    if "babel" in low or "!function" in head[:30]: return "vendor/babel-or-bundle.js"
    return f"_unmapped/{uid[:8]}.{EXT.get(mime,'bin')}"

def extract():
    raw = open(INDEX, "r", encoding="utf-8").read()
    entries = {m.group(1): {"mime":m.group(2), "compressed":m.group(3)=="true", "data":m.group(4)}
               for m in ENTRY.finditer(raw)}
    if not entries:
        sys.exit("no manifest entries found")
    mapping = {}
    for uid, e in entries.items():
        content = decode(e)
        path = name_for(uid, e["mime"], content)
        dest = os.path.join(SRC, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(content)
        mapping[uid] = {"path": path, "mime": e["mime"], "compressed": e["compressed"], "bytes": len(content)}
    os.makedirs(SRC, exist_ok=True)
    json.dump(mapping, open(MAP,"w",encoding="utf-8"), indent=2)
    # pristine template = the original index.html, kept for deterministic re-packing
    if not os.path.exists(TEMPLATE):
        open(TEMPLATE,"w",encoding="utf-8").write(raw)
    print(f"extracted {len(mapping)} files; mapping -> {MAP}; template -> {TEMPLATE}")

def gz(data: bytes) -> bytes:
    buf = io.BytesIO()
    # mtime=0 for deterministic output
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as g:
        g.write(data)
    return buf.getvalue()

def pack():
    mapping = json.load(open(MAP, encoding="utf-8"))
    raw = open(TEMPLATE, "r", encoding="utf-8").read()  # always rebuild from pristine template
    changed = 0
    for uid, meta in mapping.items():
        p = os.path.join(SRC, meta["path"])
        data = open(p, "rb").read()
        blob = gz(data) if meta["compressed"] else data
        b64 = base64.b64encode(blob).decode("ascii")
        new_entry = f'"{uid}":{{"mime":"{meta["mime"]}","compressed":{"true" if meta["compressed"] else "false"},"data":"{b64}"}}'
        pat = re.compile(r'"'+re.escape(uid)+r'"\s*:\s*\{\s*"mime"\s*:\s*"[^"]*"\s*,\s*"compressed"\s*:\s*(?:true|false)\s*,\s*"data"\s*:\s*"[^"]*"\s*\}')
        raw, n = pat.subn(lambda _: new_entry, raw, count=1)
        if n != 1:
            sys.exit(f"FAILED to locate manifest entry for {uid} ({meta['path']})")
        changed += 1
    open(INDEX, "w", encoding="utf-8", newline="").write(raw)
    print(f"packed {changed} entries -> {INDEX} ({len(raw):,} bytes)")

def verify():
    raw = open(INDEX, "r", encoding="utf-8").read()
    entries = {m.group(1): {"mime":m.group(2), "compressed":m.group(3)=="true", "data":m.group(4)}
               for m in ENTRY.finditer(raw)}
    mapping = json.load(open(MAP, encoding="utf-8"))
    ok = bad = 0
    for uid, meta in mapping.items():
        disk = open(os.path.join(SRC, meta["path"]), "rb").read()
        got = decode(entries[uid])
        if got == disk: ok += 1
        else:
            bad += 1
            print(f"  MISMATCH {meta['path']} (disk {len(disk)} vs bundle {len(got)})")
    print(f"verify: {ok} match, {bad} mismatch")
    sys.exit(1 if bad else 0)

{"extract":extract, "pack":pack, "verify":verify}.get(sys.argv[1] if len(sys.argv)>1 else "", lambda: sys.exit(__doc__))()
