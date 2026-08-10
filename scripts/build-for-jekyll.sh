#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: npm run build:jekyll -- <jekyll-output-directory>" >&2
  exit 2
fi

target_dir="$1"

npm run build
mkdir -p "$target_dir"
cp -R dist/. "$target_dir/"

echo "Presentation viewer copied to $target_dir"
