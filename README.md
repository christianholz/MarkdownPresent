# MarkdownPresent

A static, browser-only Markdown presentation renderer. The standalone page offers folder upload, Chrome-extension installation instructions, and direct Markdown paste; the extension presents Markdown files directly from GitHub.

## Features

- Turn ordinary Markdown into clean 16:9 slides with automatic layouts and text fitting
- Present formatted text, nested lists, tables, code, math, and images
- Adapt image layouts to the available space and open images in a focused viewer
- Navigate with the keyboard, jump through a slide outline, and present fullscreen
- Add comments directly to slides and export annotated Markdown or a comments-only document
- Present Markdown files directly from GitHub with the Chrome extension

## Run locally

Install once, then start the Vite development server:

```sh
npx pnpm@11.9.0 install
npx pnpm@11.9.0 dev
```

Open the URL Vite prints. A server is needed during development because the source uses JavaScript modules. After `pnpm build`, any static server can serve `dist`, including `php -S localhost:8000 -t dist`.

## Standalone page

The source card has three tabs:

1. **Upload folder** accepts a directory, a Markdown file, or a selection containing Markdown and supporting assets. If the folder has several `.md`/`.markdown` files, MarkdownPresent displays a filterable presentation picker. Image paths are resolved relative to the selected Markdown file.
2. **Chrome extension** gives the short unpacked-extension installation steps.
3. **Paste directly** accepts Markdown in the page.

Before opening an uploaded or pasted deck, the page checks every referenced image and flags embedded media types the renderer cannot display. Missing local files, failed remote images, and unsupported media references are listed so the user can upload the containing directory or revise the deck. Pasted Markdown is checked automatically after edits and again when **Check and present** is clicked.

## Chrome extension

Download the [latest Chrome extension](https://github.com/christianholz/MarkdownPresent/releases/latest/download/mdpresent-chrome-extension.zip) and extract the ZIP. Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted folder.

To build it from source instead, run `pnpm build` and load `dist/extension`.

On Markdown file pages under `https://github.com/eth-siplab-team/`, the extension adds a **Present** button beside GitHub's **Raw** button. It supports both `/blob/` and `/tree/` file URLs. Clicking it reads the adjacent Raw URL with the GitHub session already active in that tab and opens the deck in an extension tab. If Raw cannot be read, it falls back to GitHub's rendered Markdown article. The extension is scoped to that organization in `extension/public/manifest.json` and `extension/public/content.js`.

Right-click a slide to add a dated comment. The download control can save the original Markdown with comments inserted as HTML comments, save a comments-only Markdown document, or—in the Chrome extension—download the annotated file and open the corresponding GitHub upload page.

The extension build is self-contained in `dist/extension`; it does not depend on the standalone viewer.

## Markdown

An H1 creates a title or section slide. An H2 starts a content slide, while H3 and deeper headings stay within that slide. Use `---` or `<!-- slide -->` when you want to force a slide break.

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

Math uses `$inline$` or `$$display$$`. Diagrams can be included as ordinary image assets.

## Templates

The layouts in `src/templates/` are ordinary HTML files. Vite imports them as source and folds them into both builds; no template AJAX requests are needed.

## Publishing

Every push to `main` tests and builds the standalone page, runs it through Jekyll, and deploys it to [mdpresent.siplab.org](https://mdpresent.siplab.org). The Chrome extension is not part of the Pages deployment.

Pushing a version tag runs the separate release workflow, tests and builds both the standalone page and Chrome extension, and creates a GitHub Release with two independent downloads:

- `mdpresent-site.zip`
- `mdpresent-chrome-extension.zip`

For example:

```sh
git tag v0.1
git push origin v0.1
```

Run `pnpm package` after `pnpm build` to generate the same ZIP files locally in `release/`. Run `pnpm build:jekyll` to prepare the standalone site locally in `.jekyll-source/` using the same pre-Jekyll step as the Pages workflow.
