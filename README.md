# MarkdownPresent

A browser-only renderer that turns ordinary Markdown into clean 16:9 presentations. Use [MarkdownPresent](https://mdpresent.siplab.org) directly, or install the Chrome extension to present Markdown files from GitHub.

## Markdown format

An H1 creates a title or section slide. An H2 starts a content slide; H3–H6 stay within that slide. Use `---` or `<!-- slide -->` to force a break.

```md
# Presentation title

Optional subtitle

## Overview

<!-- TOC -->

## A slide with an image

- First point
  - Nested point

![Result](images/result.png)
```

The TOC marker is case-insensitive and generates links from H1 and H2 headings. MarkdownPresent also supports formatted text, nested lists, ordinary tables, highlighted fenced code, images, and `$inline$` or `$$display$$` math. Image paths are relative to the Markdown file.

Long H2 sections split automatically into up to three image-aware slides. MarkdownPresent keeps headings with their content, avoids list widows, repeats heading context with “(cont'd),” and repeats headers when a table continues.

Grouped table headers use the project’s extended table syntax:

```md
| Metric | ::2_ Before | ::2_ After |
| ^ | A | B | A | B |
| --- | --- | --- | --- | --- |
| Time | 42 s | 25 s | 18 s | 12 s |
```

See the complete [feature-tour Markdown](examples/layout-test/feature-tour.md).

## Use

Upload a folder, choose a Markdown file with its assets, or paste Markdown. Navigate with the arrow keys or Space; press `F` for fullscreen and `/` to search slides.

Right-click a heading, paragraph, or list item to edit it in place or add a dated comment. `Enter` adds a line or list item, `Cmd/Ctrl+Enter` commits, `Escape` discards, and `Tab`/`Shift+Tab` changes list indentation. Undo, redo, edit history, image insertion, PDF export, slide links, and workspace downloads keep Markdown as the canonical source.

## Chrome extension

Download the [latest Chrome extension](https://github.com/christianholz/MarkdownPresent/releases/latest/download/mdpresent-chrome-extension.zip), extract it, then load the folder from `chrome://extensions` with Developer mode enabled.

The extension adds **Present** on supported GitHub Markdown pages. It can restore local drafts and save Markdown plus newly added images back to GitHub with a fine-grained contents token. It is currently scoped to `eth-siplab-team` repositories.

## Development

```sh
npx pnpm@11.9.0 install
pnpm dev
pnpm test
pnpm build
```

Press `Cmd/Ctrl+Shift+D` in a deck to toggle layout diagnostics.
