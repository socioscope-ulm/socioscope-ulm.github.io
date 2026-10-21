#!/bin/sh
# Prepare an independently deployable Edge Function in an ephemeral CI checkout.
# All sources come from this repository; no historical GitHub checkout is needed.
set -eu
python3 .github/scripts/prepare-edge.py
destination=supabase/functions/socioscope-api
mkdir -p "$destination"
rm -rf "$destination/server" "$destination/src"
cp -R server "$destination/server"
cp -R src "$destination/src"
printf "import './server/index.ts';\n" > "$destination/index.ts"
cat > "$destination/deno.json" <<'JSON'
{
  "nodeModulesDir": "auto",
  "imports": {
    "xlsx": "npm:xlsx@0.18.5",
    "pdfjs-dist": "npm:pdfjs-dist@5.4.624",
    "react": "npm:react@19.2.6",
    "clsx": "npm:clsx@2.1.1",
    "tailwind-merge": "npm:tailwind-merge@3.4.0"
  }
}
JSON
test -s "$destination/index.ts"
test -s "$destination/server/index.ts"
test -s "$destination/src/lib/agents-import.ts"
test -s "$destination/src/lib/rup.ts"
echo "Edge Function is staged from the autonomous repository; production unchanged."
