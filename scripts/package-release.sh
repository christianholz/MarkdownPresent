#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f dist/index.html || ! -f dist/extension/manifest.json ]]; then
  echo "Build output is missing. Run pnpm build first." >&2
  exit 1
fi

rm -rf release
mkdir -p release/site

cp -R dist/. release/site/
rm -rf release/site/extension

(
  cd release/site
  zip -qr ../mdpresent-site.zip .
)

(
  cd dist/extension
  zip -qr ../../release/mdpresent-chrome-extension.zip .
)

echo "Release packages written to release/"
