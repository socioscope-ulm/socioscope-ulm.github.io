#!/usr/bin/env python3
"""Make local relative imports explicit for Supabase Edge's Deno bundler.

Changes happen in the ephemeral GitHub Actions checkout, never in the original
source tree on GitHub.
"""
from pathlib import Path
import re

root = Path.cwd()
pattern = re.compile(r"""(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.{1,2}/[^'"]+)\2""")
changed = []
unresolved = set()

for file in [*root.joinpath("server").rglob("*.ts"), *root.joinpath("src").rglob("*.ts"), *root.joinpath("src").rglob("*.tsx")]:
    content = file.read_text(encoding="utf-8")
    def replace(match):
        prefix, quote, rel = match.group(1, 2, 3)
        if Path(rel).suffix:
            return match.group(0)
        base = file.parent / rel
        for ext in (".ts", ".tsx", ".js", ".mjs"):
            if Path(str(base) + ext).is_file():
                return f"{prefix}{quote}{rel}{ext}{quote}"
        for ext in (".ts", ".tsx", ".js"):
            if (base / ("index" + ext)).is_file():
                return f"{prefix}{quote}{rel}/index{ext}{quote}"
        unresolved.add(f"{file.relative_to(root)}: {rel}")
        return match.group(0)
    fixed = pattern.sub(replace, content)
    if fixed != content:
        file.write_text(fixed, encoding="utf-8")
        changed.append(str(file.relative_to(root)))

if unresolved:
    raise SystemExit("Unresolved relative imports:\n" + "\n".join(sorted(unresolved)))
print(f"Updated explicit relative imports in {len(changed)} source files")
