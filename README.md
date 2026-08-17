# MarkdownPresent

A static, browser-only renderer that turns ordinary Markdown into clean 16:9 presentations. Use [MarkdownPresent](https://mdpresent.siplab.org) directly, or install the Chrome extension to present Markdown files from GitHub.

## Markdown format

An H1 creates a title or section slide. An H2 starts a content slide; H3 and deeper headings remain on that slide. Use `---` or `<!-- slide -->` to force a slide break.

```md
# Presentation title

Optional subtitle

## Slide title

- First point
  - Nested point

## A slide with an image

Text stays on the left.

![Result](images/result.png)
```

MarkdownPresent supports formatted text, nested lists, tables, code, images, and math written as `$inline$` or `$$display$$`. Image paths are resolved relative to the Markdown file.

If an H2 section does not fit, it is automatically split into up to three slides with titles such as `(1/3)`, `(2/3)`, and `(3/3)`. Pagination accounts for the included figures and their aspect ratios.

## Using MarkdownPresent

Upload a Markdown file together with its assets, upload a complete folder, or paste Markdown directly. Referenced images are checked before the presentation opens; local image decks should normally be uploaded as a folder.

Navigate with the arrow keys or Space, press `F` for fullscreen, and use the slide outline to jump through the deck. Images can be opened in a focused viewer.

Right-click a heading, paragraph, or bullet to edit it in place, or add a dated comment. Edits update the Markdown, rebuild and repaginate the deck, and can be downloaded afterward.

## Chrome extension

Download the [latest Chrome extension](https://github.com/christianholz/MarkdownPresent/releases/latest/download/mdpresent-chrome-extension.zip), extract it, then open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.

The extension adds a **Present** button to supported GitHub Markdown pages. It is currently scoped to repositories under `eth-siplab-team`.

## Development

Install dependencies and start the Vite development server:

```sh
npx pnpm@11.9.0 install
npx pnpm@11.9.0 dev
```

Run the checks and build both the standalone site and extension with:

```sh
pnpm test
pnpm build
```

The standalone output is written to `dist`; the self-contained extension is written to `dist/extension`. Slide layouts are ordinary HTML templates in `src/templates/`.
