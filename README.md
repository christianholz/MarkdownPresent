# Meeting Present

A static, browser-only Markdown presentation renderer. Use the page for pasted or local-directory decks, or the Chrome extension to present a Markdown file directly from GitHub.

## Features

- every H1 becomes a title/section slide; H2 starts a content slide; `---` or `<!-- slide -->` force a break
- H3 and deeper headings remain within the current slide
- GitHub-flavored Markdown, nested lists, tables, code, and KaTeX math
- automatic title/content and title/content/images layouts
- 16:9 slides by default, with no YAML configuration required
- image-column resizing and PowerPoint-style text fitting
- keyboard navigation, fullscreen, progress, and hash-based slide restoration
- local folders containing several presentations and their referenced images
- a Manifest V3 Chrome extension for `github.com/eth-siplab-team/*` Markdown file pages
- no GitHub OAuth App, token, server, or server-side code

## Run locally

Install once, then start the Vite development server:

```sh
npx pnpm@11.9.0 install
npx pnpm@11.9.0 dev
```

Open the URL Vite prints. A server is needed during development because the source uses JavaScript modules. After `pnpm build`, any static server can serve `dist`, including `php -S localhost:8000 -t dist`.

## Local directories

Choose **Directory**, then choose a folder containing Markdown and image files. If the directory has one `.md`/`.markdown` file it opens immediately. If it has several, Meeting Present displays a filterable presentation picker. Image paths are resolved relative to the selected Markdown file.

## Chrome extension

Build the site and extension:

```sh
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/extension`.

On Markdown file pages under `https://github.com/eth-siplab-team/`, the extension adds a **Present** button beside GitHub's **Raw** button. It supports both `/blob/` and `/tree/` file URLs. Clicking it reads the adjacent Raw URL with the GitHub session already active in that tab and opens the deck in an extension tab. If Raw cannot be read, it falls back to GitHub's rendered Markdown article. The extension is scoped to that organization in `extension/public/manifest.json` and `extension/public/content.js`.

The extension build is self-contained in `dist/extension`; it does not contact the deployed GitHub Pages viewer.

## Markdown

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

## Templates and Jekyll

The layouts in `src/templates/` are ordinary HTML files. Vite imports them as source and folds them into both builds; no template AJAX requests are needed.

For a Jekyll site, build Jekyll first and then run `npm run build:jekyll -- _site/preview` (replace the target with the desired output path). This copies the compiled page and the unpacked-extension build into the chosen output directory.
