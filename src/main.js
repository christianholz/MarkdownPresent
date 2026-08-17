import "./style.css";
import { InlineRepository, LocalRepository } from "./repository.js";
import { extractUnsupportedMediaReferences, processMarkdown } from "./markdown.js";
import { AssetManager } from "./assets.js";
import { loadImageMeasurements, Presentation } from "./presentation.js";
import { SlideOutline } from "./slide-outline.js";
import { CONFIG } from "./config.js";
import { AnnotationManager } from "./annotations.js";

const SAMPLE = `# Research Planning Session

Questions, evidence, and the smallest useful next step

## A focused pilot will reduce the biggest uncertainty

The first round should answer one question well: **does the proposed workflow help people reach a confident decision faster?**

- Recruit participants who already perform the task
- Observe the complete workflow, not isolated screens
- Record where confidence rises or falls
- Stop when the dominant friction points repeat

![Pilot focus](./examples/layout-test/images/card-03.svg)

## Two evidence streams should be reviewed together

Behavior shows what happened; reflection helps explain why. Neither view is sufficient alone.

- Session observations reveal hesitation, recovery, and workarounds
- Short interviews reveal expectations and decision criteria
- Agreement between both streams creates a stronger signal

![Observed behavior](./examples/layout-test/images/card-01.svg)
![Participant reflection](./examples/layout-test/images/card-06.svg)

## This evidence review deliberately continues onto another slide

The section is intentionally long so the example also demonstrates automatic, image-aware pagination.

### Review the signals as one connected group

- Begin with the participant's goal and the decision they were trying to make
- Record the first moment where the expected path stopped feeling obvious
- Separate brief hesitation from a problem that prevents meaningful progress
- Capture the workaround before explaining the intended interaction
- Compare observed behavior with the participant's own account of what happened
- Mark repeated findings that appeared across roles, tasks, or experience levels
- Connect every proposed change to the signal it is expected to improve
- Keep unresolved questions visible so the next study can answer them directly

![Review sequence](./examples/layout-test/images/card-02.svg)
![Decision signals](./examples/layout-test/images/card-07.svg)

## Two images side by side, with no body text

![Journey overview](./examples/layout-test/images/card-04.svg)
![Outcome overview](./examples/layout-test/images/card-05.svg)

## A shared rubric keeps the review consistent

| Question | Evidence to capture |
| --- | --- |
| Can people begin unaided? | First action and time to orientation |
| Can they recover from mistakes? | Recovery path and assistance required |
| Do they trust the result? | Confidence rating and stated concerns |

### Strong signals should change the next iteration

Prioritize findings that are repeated, consequential, and directly connected to the central research question.

## Math and links are included

Inline equations such as $E = mc^2$, [supporting links](https://example.com), and full display math are rendered locally.

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$

## The next iteration has one job

Keep the successful parts stable and change only the interaction under investigation.

1. Select the highest-impact unresolved finding
2. Define the expected behavioral change
3. Build only what is needed to test that expectation
4. Run the same rubric again

![Next iteration](./examples/layout-test/images/card-08.svg)`;

document.querySelector("#app").innerHTML = `
  <section class="home-screen" data-screen="home">
    <header class="brand"><span class="brand-mark">MP</span><span>MarkdownPresent</span></header>
    <main class="home-main">
      <div class="intro">
        <p class="eyebrow">Markdown → presentation</p>
        <h1>Your notes, already on stage.</h1>
        <p class="lede">Upload a folder, install the GitHub extension, or paste Markdown directly. Everything is rendered in your browser.</p>
      </div>
      <section class="source-card" aria-label="Choose presentation source">
        <div class="tabs" role="tablist">
          <button class="tab is-active" data-tab="upload" role="tab" aria-selected="true">Upload folder</button>
          <button class="tab" data-tab="extension" role="tab" aria-selected="false">Chrome extension</button>
          <button class="tab" data-tab="paste" role="tab" aria-selected="false">Paste directly</button>
        </div>
        <div class="tab-panel is-active" data-panel="upload">
          <label class="drop-zone" id="drop-zone">
            <input id="file-input" type="file" accept=".md,.markdown,image/*" multiple />
            <span class="drop-icon">↓</span>
            <strong>Drop a folder or Markdown file</strong>
            <span>or choose a Markdown file and its assets</span>
          </label>
          <label class="folder-button">Choose a folder<input id="folder-input" type="file" webkitdirectory multiple /></label>
          <p class="source-note">You can also upload one Markdown file, but every referenced asset must be reachable. If it uses local images, upload the directory instead.</p>
          <p class="asset-status" id="file-status" aria-live="polite">A folder may contain several Markdown presentations.</p>
          <section class="local-browser" id="local-browser" hidden>
            <label class="field-label" for="local-filter">Choose a presentation</label>
            <input id="local-filter" type="search" placeholder="Filter Markdown files…" autocomplete="off" />
            <div class="markdown-files" id="local-files" role="listbox" aria-label="Local Markdown presentations"></div>
          </section>
        </div>
        <div class="tab-panel extension-panel" data-panel="extension">
          <p class="field-label">Chrome extension</p>
          <a class="extension-download" href="https://github.com/christianholz/MarkdownPresent/releases/latest/download/mdpresent-chrome-extension.zip">Download the latest extension</a>
          <ol class="extension-steps">
            <li>Unzip the downloaded file.</li>
            <li>Open <code>chrome://extensions</code> and enable Developer mode.</li>
            <li>Choose <strong>Load unpacked</strong> and select the extracted folder.</li>
          </ol>
          <p class="source-note">On supported GitHub Markdown pages, click <strong>Present</strong> beside the Raw button.</p>
        </div>
        <div class="tab-panel" data-panel="paste">
          <label class="field-label" for="markdown-input">Markdown</label>
          <textarea id="markdown-input" spellcheck="false" aria-label="Markdown source"></textarea>
          <p class="asset-status" id="paste-status" aria-live="polite"></p>
          <button class="primary-button" id="present-paste">Check and present</button>
        </div>
        <p class="form-error" id="form-error" role="alert"></p>
      </section>
    </main>
    <footer class="home-footer">
      <span>Files stay in this browser.</span>
      <span>MarkdownPresent v0.1 · © <a href="https://christianholz.net">Christian Holz</a> 2026 · <a href="https://github.com/christianholz/MarkdownPresent">Source on GitHub</a></span>
      <span>Arrow keys · Space · F for fullscreen</span>
    </footer>
  </section>

  <section class="loading-screen" data-screen="loading" hidden>
    <div class="loader"></div><p>Preparing your slides…</p>
  </section>

  <section class="deck-screen" data-screen="deck" hidden>
    <div class="deck-topbar">
      <button class="icon-button" id="back-home" aria-label="Open another presentation">←</button>
      <span class="deck-name" id="deck-name">Presentation</span>
      <button class="icon-button" id="fullscreen" aria-label="Toggle fullscreen">⛶</button>
    </div>
    <main class="stage" id="stage"></main>
    <nav class="deck-controls" aria-label="Slide controls">
      <button id="previous" aria-label="Previous slide">←</button>
      <span id="slide-number">1 / 1</span>
      <button id="outline-toggle" aria-label="Show slide list" aria-controls="slide-outline" aria-expanded="false">☷</button>
      <button id="download-comments" aria-label="Download comments" title="Download comments" hidden>⤓</button>
      <button id="next" aria-label="Next slide">→</button>
    </nav>
    <p id="change-status" class="unsaved-comment-count" aria-live="polite" hidden></p>
    <aside class="slide-outline" id="slide-outline" aria-label="Slide list" hidden>
      <header class="slide-outline-header"><strong>Slides</strong><button id="outline-close" aria-label="Close slide list">×</button></header>
      <nav class="slide-outline-list" id="outline-list" aria-label="Jump to slide"></nav>
    </aside>
    <div class="progress-track"><div id="progress"></div></div>
  </section>

  <section class="error-screen" data-screen="error" hidden>
    <span class="error-code">!</span><h1>That deck could not open.</h1><p id="error-message"></p>
    <button class="primary-button" id="error-home">Choose another source</button>
  </section>`;

const $ = (selector) => document.querySelector(selector);
let presentation;
let outline;
let annotations;
let selectedFiles = [];
let markdownFiles = [];

$("#markdown-input").value = SAMPLE;

function setScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
}

function showError(error) {
  $("#error-message").textContent = error?.message || String(error);
  setScreen("error");
}

function readHash() { return new URLSearchParams(location.hash.slice(1)); }
function slideFromHash() { return Math.max(0, Number.parseInt(readHash().get("slide") || "1", 10) - 1); }
function updateSlideHash(index) {
  const hash = readHash();
  hash.set("slide", String(index + 1));
  history.replaceState(null, "", `#${hash}`);
}

function imageReferences(documentModel) {
  return [...new Set(documentModel.slides.flatMap((slide) => slide.images.map((image) => image.src.trim())).filter(Boolean))];
}

async function checkReferences(markdown, repository, source, manager) {
  const documentModel = processMarkdown(markdown, source);
  const displayableReferences = imageReferences(documentModel);
  const unsupportedReferences = extractUnsupportedMediaReferences(markdown);
  const references = [...new Set([...displayableReferences, ...unsupportedReferences])];
  if (!displayableReferences.length) {
    return { documentModel, references, unavailable: unsupportedReferences };
  }

  const measurements = await loadImageMeasurements(documentModel.slides, manager);
  const unavailableImages = displayableReferences.filter((reference) => !measurements.has(reference));
  return { documentModel, references, unavailable: [...new Set([...unavailableImages, ...unsupportedReferences])] };
}

function unavailableMessage(items) {
  return `The following items are not accessible or cannot be displayed: ${items.join(", ")}. Consider uploading the directory instead.`;
}

function setAssetStatus(element, message, state = "") {
  element.textContent = message;
  element.classList.toggle("is-checking", state === "checking");
  element.classList.toggle("is-error", state === "error");
  element.classList.toggle("is-success", state === "success");
}

async function loadDeck(repository, source, label, state = {}) {
  if (!state.keepDeckVisible) setScreen("loading");
  try {
    const markdown = state.markdown ?? await repository.readText();
    const originalMarkdown = state.originalMarkdown ?? markdown;
    const requestedIndex = state.index ?? slideFromHash();
    const documentModel = processMarkdown(markdown, source);
    if (!documentModel.slides.length) throw new Error("The Markdown file does not contain any slide content.");
    const manager = state.assetManager
      || (state.keepDeckVisible ? presentation?.assetManager : null)
      || new AssetManager(repository, source, CONFIG.presentation.assetConcurrency);
    presentation ||= new Presentation({
      stage: $("#stage"),
      counter: $("#slide-number"),
      progress: $("#progress"),
      onIndexChange: (index) => {
        updateSlideHash(index);
        outline?.setActive(index);
      },
    });
    await presentation.create(documentModel, manager);
    annotations?.destroy();
    const title = documentModel.slides.find((slide) => slide.title?.tagName === "H1")?.title?.textContent?.trim()
      || documentModel.slides.find((slide) => slide.title)?.title?.textContent?.trim()
      || label
      || "Presentation";
    annotations = new AnnotationManager({
      stage: $("#stage"),
      deck: $(".deck-screen"),
      downloadButton: $("#download-comments"),
      presentation,
      sourceMarkdown: markdown,
      originalSourceMarkdown: state.annotationState?.originalSourceMarkdown ?? originalMarkdown,
      sourcePath: source.path,
      title,
      annotationState: state.annotationState,
      discardLabel: "Return without saving",
      onMarkdownChange: (nextMarkdown, details = {}) => loadDeck(repository, source, label, {
        markdown: nextMarkdown,
        originalMarkdown: details.annotationState?.originalSourceMarkdown ?? originalMarkdown,
        annotationState: details.annotationState,
        index: presentation.index,
        keepDeckVisible: true,
        assetManager: manager,
      }),
    });
    outline ||= new SlideOutline({
      panel: $("#slide-outline"),
      list: $("#outline-list"),
      toggle: $("#outline-toggle"),
      close: $("#outline-close"),
      dismissSurface: $("#stage"),
      onSelect: (index) => presentation?.show(index),
    });
    outline.setSlides(documentModel.slides);
    $("#deck-name").textContent = label || "Presentation";
    setScreen("deck");
    await presentation.show(requestedIndex);
  } catch (error) { showError(error); }
}

function pathFor(file) { return file.mdpresentRelativePath || file.webkitRelativePath || file.name; }

function preserveRelativePath(file, path) {
  Object.defineProperty(file, "mdpresentRelativePath", {
    value: path.replace(/^\/+/, ""),
    configurable: true,
  });
  return file;
}

async function filesFromHandle(handle, parentPath = "") {
  const path = `${parentPath}${handle.name}`;
  if (handle.kind === "file") return [preserveRelativePath(await handle.getFile(), path)];
  const files = [];
  for await (const child of handle.values()) {
    files.push(...await filesFromHandle(child, `${path}/`));
  }
  return files;
}

function entryFile(entry, path) {
  return new Promise((resolve, reject) => {
    entry.file((file) => resolve(preserveRelativePath(file, path)), reject);
  });
}

function directoryEntries(entry) {
  const reader = entry.createReader();
  return new Promise((resolve, reject) => {
    const entries = [];
    const readBatch = () => reader.readEntries((batch) => {
      if (!batch.length) resolve(entries);
      else {
        entries.push(...batch);
        readBatch();
      }
    }, reject);
    readBatch();
  });
}

async function filesFromEntry(entry, parentPath = "") {
  const path = `${parentPath}${entry.name}`;
  if (entry.isFile) return [await entryFile(entry, path)];
  if (!entry.isDirectory) return [];
  const files = [];
  for (const child of await directoryEntries(entry)) {
    files.push(...await filesFromEntry(child, `${path}/`));
  }
  return files;
}

async function filesFromDrop(dataTransfer) {
  const items = [...dataTransfer.items].filter((item) => item.kind === "file");
  const handlePromises = items.map((item) => typeof item.getAsFileSystemHandle === "function" ? item.getAsFileSystemHandle() : null);
  const entries = items.map((item) => {
    const getEntry = item.getAsEntry || item.webkitGetAsEntry;
    return typeof getEntry === "function" ? getEntry.call(item) : null;
  });

  if (handlePromises.length && handlePromises.every(Boolean)) {
    try {
      const handles = await Promise.all(handlePromises);
      if (handles.every(Boolean)) {
        const files = [];
        for (const handle of handles) files.push(...await filesFromHandle(handle));
        return files;
      }
    } catch {
      // Fall through to the older directory-entry API.
    }
  }

  if (entries.length && entries.every(Boolean)) {
    const files = [];
    for (const entry of entries) files.push(...await filesFromEntry(entry));
    return files;
  }
  return [...dataTransfer.files];
}

async function openLocalMarkdown(file) {
  clearPasteValidation();
  const source = { path: pathFor(file) };
  const repository = new LocalRepository(selectedFiles, file);
  const manager = new AssetManager(repository, source, CONFIG.presentation.assetConcurrency);
  setAssetStatus($("#file-status"), "Checking referenced items…", "checking");
  try {
    const markdown = await repository.readText();
    const result = await checkReferences(markdown, repository, source, manager);
    if (result.unavailable.length) {
      manager.dispose();
      setAssetStatus($("#file-status"), unavailableMessage(result.unavailable), "error");
      return;
    }
    setAssetStatus(
      $("#file-status"),
      result.references.length ? "All referenced items are accessible." : "No referenced items need checking.",
      "success",
    );
    await loadDeck(repository, source, file.name, { markdown, assetManager: manager });
  } catch (error) {
    if (presentation?.assetManager !== manager) manager.dispose();
    setAssetStatus($("#file-status"), `The presentation could not be checked: ${error.message}`, "error");
  }
}

function renderLocalFiles() {
  const query = $("#local-filter").value.trim().toLowerCase();
  const visible = markdownFiles.filter((file) => pathFor(file).toLowerCase().includes(query));
  const list = $("#local-files");
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "file-empty";
    empty.textContent = "No Markdown presentations match that filter.";
    list.append(empty);
    return;
  }
  for (const file of visible) {
    const button = document.createElement("button");
    button.className = "markdown-file";
    button.type = "button";
    button.setAttribute("role", "option");
    button.textContent = pathFor(file);
    button.addEventListener("click", () => { void openLocalMarkdown(file); });
    list.append(button);
  }
}

async function receiveFiles(files) {
  selectedFiles = [...files];
  markdownFiles = selectedFiles
    .filter((file) => /\.(md|markdown)$/i.test(file.name))
    .sort((a, b) => pathFor(a).localeCompare(pathFor(b)));
  if (!markdownFiles.length) {
    setAssetStatus($("#file-status"), "No Markdown file found in that selection.", "error");
    $("#local-browser").hidden = true;
    return;
  }
  setAssetStatus(
    $("#file-status"),
    `${markdownFiles.length} presentation${markdownFiles.length === 1 ? "" : "s"} · ${selectedFiles.length - markdownFiles.length} supporting file${selectedFiles.length - markdownFiles.length === 1 ? "" : "s"}`,
  );
  $("#local-browser").hidden = markdownFiles.length === 1;
  $("#local-filter").value = "";
  renderLocalFiles();
  if (markdownFiles.length === 1) await openLocalMarkdown(markdownFiles[0]);
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab));
  document.querySelectorAll(".tab").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
}));

let pasteCheckTimer;
let pasteCheckRequest = 0;
let pasteValidation = null;

function clearPasteValidation() {
  pasteValidation?.manager.dispose();
  pasteValidation = null;
}

async function checkPastedMarkdown({ present = false } = {}) {
  const request = ++pasteCheckRequest;
  const markdown = $("#markdown-input").value;
  if (pasteValidation?.markdown === markdown) {
    const validation = pasteValidation;
    if (present) {
      pasteValidation = null;
      await loadDeck(validation.repository, validation.source, "Pasted deck", {
        markdown,
        assetManager: validation.manager,
      });
    }
    return true;
  }
  clearPasteValidation();
  const repository = new InlineRepository(markdown);
  const source = { path: "slides.md" };
  const manager = new AssetManager(repository, source, CONFIG.presentation.assetConcurrency);
  setAssetStatus($("#paste-status"), "Checking referenced items…", "checking");
  try {
    const result = await checkReferences(markdown, repository, source, manager);
    if (request !== pasteCheckRequest) {
      manager.dispose();
      return false;
    }
    if (result.unavailable.length) {
      manager.dispose();
      setAssetStatus($("#paste-status"), unavailableMessage(result.unavailable), "error");
      return false;
    }
    setAssetStatus(
      $("#paste-status"),
      result.references.length ? "All referenced items are accessible." : "No referenced items need checking.",
      "success",
    );
    if (present) await loadDeck(repository, source, "Pasted deck", { markdown, assetManager: manager });
    else pasteValidation = { markdown, repository, source, manager };
    return true;
  } catch (error) {
    if (presentation?.assetManager !== manager) manager.dispose();
    if (request === pasteCheckRequest) {
      setAssetStatus($("#paste-status"), `The Markdown could not be checked: ${error.message}`, "error");
    }
    return false;
  }
}

function schedulePasteCheck() {
  if (pasteValidation?.markdown !== $("#markdown-input").value) clearPasteValidation();
  window.clearTimeout(pasteCheckTimer);
  pasteCheckTimer = window.setTimeout(() => { void checkPastedMarkdown(); }, 350);
}

$("#present-paste").addEventListener("click", () => { void checkPastedMarkdown({ present: true }); });
$("#markdown-input").addEventListener("input", schedulePasteCheck);
$("#file-input").addEventListener("change", (event) => { void receiveFiles(event.target.files); });
$("#folder-input").addEventListener("change", (event) => { void receiveFiles(event.target.files); });
$("#local-filter").addEventListener("input", renderLocalFiles);

const dropZone = $("#drop-zone");
for (const eventName of ["dragenter", "dragover"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); });
for (const eventName of ["dragleave", "drop"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("is-dragging"); });
dropZone.addEventListener("drop", async (event) => {
  setAssetStatus($("#file-status"), "Reading the dropped selection…", "checking");
  try {
    await receiveFiles(await filesFromDrop(event.dataTransfer));
  } catch (error) {
    setAssetStatus($("#file-status"), `The dropped selection could not be read: ${error.message}`, "error");
  }
});

$("#previous").addEventListener("click", () => presentation?.previous());
$("#next").addEventListener("click", () => presentation?.next());
$("#back-home").addEventListener("click", (event) => {
  event.stopPropagation();
  const close = () => { outline?.close(); setScreen("home"); };
  if (annotations) annotations.requestClose(close); else close();
});
$("#error-home").addEventListener("click", () => setScreen("home"));
$("#fullscreen").addEventListener("click", toggleFullscreen);

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await $(".deck-screen").requestFullscreen();
}

document.addEventListener("keydown", (event) => {
  if ($(".deck-screen").hidden || event.target.matches("input, textarea, button, [contenteditable='true']")) return;
  const actions = {
    ArrowRight: () => presentation?.next(), ArrowDown: () => presentation?.next(), PageDown: () => presentation?.next(), " ": () => presentation?.next(),
    ArrowLeft: () => presentation?.previous(), ArrowUp: () => presentation?.previous(), PageUp: () => presentation?.previous(),
    Home: () => presentation?.first(), End: () => presentation?.last(), f: toggleFullscreen, F: toggleFullscreen,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});

setScreen("home");
schedulePasteCheck();
