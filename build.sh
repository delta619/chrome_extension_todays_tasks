#!/bin/bash
set -e

VERSION=$(jq -r '.version' manifest.prod.json)
OUT="dist/todays-tasks-v${VERSION}.zip"

mkdir -p dist

# Swap in prod manifest
cp manifest.json manifest.dev.json.bak
cp manifest.prod.json manifest.json

# Package
zip -r "$OUT" . \
  --exclude "*.git*" \
  --exclude "*.DS_Store" \
  --exclude "dist/*" \
  --exclude "*.bak" \
  --exclude "manifest.prod.json" \
  --exclude "manifest.dev.json.bak" \
  --exclude "build.sh" \
  --exclude "*.pem"

# Restore dev manifest
cp manifest.dev.json.bak manifest.json
rm manifest.dev.json.bak

echo "Built: $OUT"
