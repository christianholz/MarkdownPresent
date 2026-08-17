#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: pnpm build:jekyll -- [jekyll-source-directory]" >&2
  exit 2
fi

target_dir="${1:-.jekyll-source}"

pnpm run build:site
mkdir -p "$target_dir"
cp -R dist/. "$target_dir/"

echo "MarkdownPresent site prepared for Jekyll in $target_dir"
