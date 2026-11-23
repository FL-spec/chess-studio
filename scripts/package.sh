#!/usr/bin/env bash
# Build the release ZIP from the extension folder.
# Usage: scripts/package.sh   ->   dist/Chess-Studio-<version>.zip
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ext="$root/extension"
version="$(node -p "require(process.argv[1]).version" "$ext/manifest.json")"
out="$root/dist/Chess-Studio-$version.zip"

mkdir -p "$root/dist"
rm -f "$out"
cd "$ext"
zip -r -X -q "$out" . \
  -x '.*' '*/.*' '*.map' '*.zip' 'node_modules/*' '*.test.*'

echo "$out ($(du -h "$out" | cut -f1))"
