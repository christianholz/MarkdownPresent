import "./style.css";
import { InlineRepository, LocalRepository } from "./repository.js";
import { extractUnsupportedMediaReferences, processMarkdown } from "./markdown.js";
import { AssetManager } from "./assets.js";
import { loadImageMeasurements, Presentation } from "./presentation.js";
import { SlideOutline } from "./slide-outline.js";
import { CONFIG } from "./config.js";
import { AnnotationManager } from "./annotations.js";
import {
  persistExampleAssets,
  persistExampleMarkdown,
  readExampleAssets,
  readExampleMarkdown,
  resetExampleMarkdown,
} from "./example-storage.js";
import { DocumentSession } from "./document-session.js";
import { HistoryController, resolveHistorySlide } from "./history.js";
import { downloadDeckWorkspace, insertImageIntoSlide, WorkingRepository } from "./asset-workspace.js";
import { exportPresentationPdf } from "./pdf-export.js";
import { LayoutDiagnostics } from "./diagnostics.js";
import {
  pastedSlideUrl,
  positionStorageKey,
  presentationPosition,
  readLocalPosition,
  resolvePresentationPosition,
  writeLocalPosition,
} from "./positions.js";

const SAMPLE = `# Research Planning Session

Questions, evidence, and the smallest useful next step

## Overview

<!-- TOC -->

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

## Short captions let the figures carry the slide

Two related views, with one concise line underneath.

![Observed path](./examples/layout-test/images/card-04.svg)
![Expected path](./examples/layout-test/images/card-05.svg)

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

## Grouped evidence stays compact

| Signal | ::2_ Observation | ::2_ Reflection |
| ^ | First round | Second round | First round | Second round |
| --- | --- | --- | --- | --- |
| Orientation | 42 s | 25 s | Uncertain | Clear |
| Recovery | Assisted | Unaided | Frustrating | Expected |
| Confidence | 2.8 / 5 | 4.1 / 5 | Mixed | Strong |

## Analysis code is highlighted locally

~~~python
signals = ["orientation", "recovery", "confidence"]
for signal in signals:
    compare_rounds(signal)
~~~

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
    <header class="brand">
      <img src="/icon.svg" width="28" height="28" alt="" />
      <span>MarkdownPresent</span>
    </header>
    <main class="home-main">
      <div class="intro">
        <p class="eyebrow">Markdown → presentation</p>
        <h1>Your notes, already on stage.</h1>
        <p class="lede">Upload a folder or paste Markdown directly. Everything is rendered in your browser.</p>
      </div>
      <div class="source-area">
        <section class="source-card" aria-label="Choose presentation source">
          <div class="tabs" role="tablist">
            <button class="tab is-active" data-tab="upload" role="tab" aria-selected="true">Upload files</button>
            <button class="tab" data-tab="paste" role="tab" aria-selected="false">Paste Markdown</button>
          </div>
          <div class="tab-panel is-active" data-panel="upload">
            <label class="drop-zone" id="drop-zone">
              <input id="file-input" type="file" accept=".md,.markdown,image/*" multiple />
              <span class="drop-icon">↓</span>
              <strong>Drop a folder or Markdown file</strong>
              <span>or choose a Markdown file and its assets</span>
              <span class="privacy-note">(Files stay in this browser)</span>
            </label>
            <label class="folder-button">Choose a folder <span class="privacy-note">(Files stay in this browser)</span><input id="folder-input" type="file" webkitdirectory multiple /></label>
            <p class="source-note">You can also upload one Markdown file, but every referenced asset must be reachable. If it uses local images, upload the directory instead.</p>
            <p class="asset-status" id="file-status" aria-live="polite">A folder may contain several Markdown presentations.</p>
            <section class="local-browser" id="local-browser" hidden>
              <label class="field-label" for="local-filter">Choose a presentation</label>
              <input id="local-filter" type="search" placeholder="Filter Markdown files…" autocomplete="off" />
              <div class="markdown-files" id="local-files" role="listbox" aria-label="Local Markdown presentations"></div>
            </section>
          </div>
          <div class="tab-panel" data-panel="paste">
            <label class="field-label" for="markdown-input">Markdown</label>
            <div class="paste-editor">
              <textarea id="markdown-input" spellcheck="false" aria-label="Markdown source"></textarea>
              <button class="reset-example" id="reset-example" type="button" aria-label="Reset Markdown to the default example" title="Reset to default" hidden>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8V4m0 0h4M5 4l3.1 3.1a7 7 0 1 1-1.5 7.7"/></svg>
              </button>
            </div>
            <p class="asset-status" id="paste-status" aria-live="polite"></p>
            <button class="primary-button" id="present-paste">Check and present</button>
          </div>
          <p class="form-error" id="form-error" role="alert"></p>
        </section>
        <aside class="extension-prompt">
          <span>Install MarkdownPresent as a Chrome extension to present Markdown directly from GitHub.</span>
          <a href="https://github.com/christianholz/MarkdownPresent/releases/latest/download/mdpresent-chrome-extension.zip">Install extension&nbsp; ↗</a>
        </aside>
      </div>
    </main>
    <footer class="home-footer">
      <span>MarkdownPresent v0.4 · © <a href="https://christianholz.net">Christian Holz</a> 2026 · <a href="https://github.com/christianholz/MarkdownPresent">Source on GitHub</a></span>
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
    <div class="deck-control-cluster">
      <nav class="deck-controls" aria-label="Slide controls">
        <button id="previous" aria-label="Previous slide">←</button>
        <span id="slide-number">1 / 1</span>
        <button id="outline-toggle" aria-label="Show content overview" aria-controls="slide-outline" aria-expanded="false" title="Content overview">
          <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
        </button>
        <button id="edit-toggle" aria-label="Show editing tools" aria-controls="edit-controls" aria-expanded="false" title="Edit">
          <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2.2 2.2 0 0 0-3.1-3.1L5.1 15.9 4 20Z"/><path d="m14.5 6.5 3 3"/></svg>
        </button>
        <button id="next" aria-label="Next slide">→</button>
      </nav>
      <nav class="edit-controls" id="edit-controls" aria-label="Editing tools" hidden>
        <button id="undo" aria-label="Undo last edit" title="Undo" disabled>↶</button>
        <button id="redo" aria-label="Redo last edit" title="Redo" disabled>↷</button>
        <button id="history-toggle" aria-label="Show edit history" aria-controls="history-panel" aria-expanded="false" title="Edit history">
          <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v4l2.8 1.7"/></svg>
        </button>
        <button id="add-image" aria-label="Add an image to this slide" title="Add image"><span class="img-control-icon" aria-hidden="true">IMG</span></button>
        <input id="image-input" type="file" accept="image/*" hidden />
        <button id="download-comments" aria-label="Download changes" title="Download changes" hidden>⤓</button>
        <button id="export-pdf" aria-label="Export all slides as PDF" title="Export PDF">
          <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v5h4M12 11v6m-3-3 3 3 3-3"/></svg>
        </button>
      </nav>
    </div>
    <p id="change-status" class="unsaved-comment-count" aria-live="polite" hidden></p>
    <aside class="slide-outline" id="slide-outline" aria-label="Slide list" hidden>
      <header class="slide-outline-header"><strong>Slides</strong><button id="outline-close" aria-label="Close slide list">×</button></header>
      <input class="slide-outline-search" id="outline-search" type="search" placeholder="Search slides…" aria-label="Search slides" autocomplete="off" />
      <nav class="slide-outline-list" id="outline-list" aria-label="Jump to slide"></nav>
    </aside>
    <aside class="history-panel" id="history-panel" aria-label="Edit history" hidden>
      <header class="slide-outline-header"><strong>Edit history</strong><button id="history-close" aria-label="Close edit history">×</button></header>
      <div class="history-list" id="history-list"></div>
    </aside>
    <section class="resume-prompt" id="resume-prompt" aria-live="polite" hidden>
      <span id="resume-message"></span>
      <button id="resume-slide" type="button">Resume</button>
      <button id="resume-start" type="button">Start at beginning</button>
    </section>
    <p class="pdf-preparing-status" id="pdf-status" role="status" hidden>Preparing every slide for PDF…</p>
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
let historyController;
let activePositionKey = null;
let activeCopySlideLink = null;
let suppressPositionPersistence = false;
let activeAssetHandler = null;
let diagnostics;
let selectedFiles = [];
let markdownFiles = [];
let pastedAssets = readExampleAssets();
const HISTORY_SCREEN_KEY = "mdpresentScreen";
let presentationHistoryActive = false;
let allowHistoryExit = false;
let restorePresentationForClose = false;

$("#markdown-input").value = readExampleMarkdown(SAMPLE);

function syncExampleResetButton() {
  $("#reset-example").hidden = $("#markdown-input").value === SAMPLE;
}

function savePastedMarkdown(markdown) {
  $("#markdown-input").value = markdown;
  persistExampleMarkdown(markdown, SAMPLE);
  syncExampleResetButton();
}

function savePastedAssets(assets) {
  pastedAssets = assets;
  persistExampleAssets(assets);
}

syncExampleResetButton();

function setScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
  if (name !== "deck") {
    $("#resume-prompt").hidden = true;
    setEditControlsOpen(false);
  }
}

function setEditControlsOpen(open) {
  const expanded = Boolean(open);
  const controls = $("#edit-controls");
  const cluster = $(".deck-control-cluster");
  if (expanded) {
    controls.hidden = false;
    controls.inert = false;
    controls.setAttribute("aria-hidden", "false");
    const gap = Number.parseFloat(getComputedStyle(cluster).getPropertyValue("--edit-controls-gap")) || 8;
    cluster.style.setProperty("--edit-controls-shift", `${(controls.offsetWidth + gap) / 2}px`);
    controls.getBoundingClientRect();
  } else {
    controls.inert = true;
    controls.setAttribute("aria-hidden", "true");
  }
  $("#edit-toggle").setAttribute("aria-expanded", String(expanded));
  $("#edit-toggle").classList.toggle("is-active", expanded);
  cluster.classList.toggle("is-edit-open", expanded);
  if (!expanded) historyController?.close();
}

function syncPdfExport(enabled = !document.body.classList.contains("has-layout-diagnostics")) {
  const button = $("#export-pdf");
  button.disabled = !enabled;
  button.title = enabled ? "Export PDF" : "Turn off layout diagnostics before exporting PDF";
}

function showError(error) {
  $("#error-message").textContent = error?.message || String(error);
  setScreen("error");
}

function readHash() { return new URLSearchParams(location.hash.slice(1)); }
function slideFromHash() { return Math.max(0, Number.parseInt(readHash().get("slide") || "1", 10) - 1); }
function historyState(screen) {
  const current = history.state && typeof history.state === "object" ? history.state : {};
  return { ...current, [HISTORY_SCREEN_KEY]: screen };
}
function pageUrl() { return `${location.pathname}${location.search}`; }
function updateSlideHash(index) {
  const hash = readHash();
  hash.set("slide", String(index + 1));
  history.replaceState(historyState("presentation"), "", `#${hash}`);
}
function clearPresentationHash() {
  history.replaceState(historyState("home"), "", pageUrl());
}
function beginPresentationHistory(fromLink = false) {
  if (presentationHistoryActive) return;
  const linkedHash = fromLink ? location.hash : "";
  history.replaceState(historyState("home"), "", pageUrl());
  history.pushState(historyState("presentation"), "", `${pageUrl()}${linkedHash}`);
  presentationHistoryActive = true;
}
function finishPresentationExit() {
  presentationHistoryActive = false;
  allowHistoryExit = false;
  restorePresentationForClose = false;
  outline?.close();
  setScreen("home");
}
function navigateHomeFromPresentation() {
  if (presentationHistoryActive && history.state?.[HISTORY_SCREEN_KEY] === "presentation") {
    allowHistoryExit = true;
    history.back();
  } else {
    clearPresentationHash();
    finishPresentationExit();
  }
}

async function copyText(text) {
  if (!text) throw new Error("This source cannot be linked until it is available at a stable URL.");
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function offerResume(index) {
  if (index <= 0) return;
  $("#resume-message").textContent = `Continue from slide ${index + 1}?`;
  $("#resume-prompt").dataset.index = String(index);
  $("#resume-prompt").hidden = false;
}

function deckState(state, session, manager) {
  return {
    onSourceMarkdownChange: state.onSourceMarkdownChange,
    onAssetsChange: state.onAssetsChange,
    session,
    index: presentation.index,
    keepDeckVisible: true,
    assetManager: manager,
    positionKey: state.positionKey,
    copySlideLink: state.copySlideLink,
  };
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
  if (!state.keepDeckVisible) {
    beginPresentationHistory(Boolean(state.fromLink));
    setScreen("loading");
  }
  try {
    const deckRepository = repository instanceof WorkingRepository
      ? repository
      : new WorkingRepository(repository, source, state.assets);
    const initialMarkdown = state.markdown ?? await deckRepository.readText();
    const session = state.session || new DocumentSession({
      markdown: initialMarkdown,
      originalMarkdown: state.originalMarkdown ?? initialMarkdown,
      annotationState: state.annotationState,
      source,
      sourcePath: source.path,
    });
    const markdown = session.markdown;
    const originalMarkdown = session.originalMarkdown;
    const explicitIndex = Number.isInteger(state.index) ? state.index : (state.fromLink ? slideFromHash() : null);
    const savedPosition = explicitIndex === null && state.positionKey ? readLocalPosition(state.positionKey) : null;
    const requestedIndex = explicitIndex ?? 0;
    const documentModel = processMarkdown(markdown, source);
    if (!documentModel.slides.length) throw new Error("The Markdown file does not contain any slide content.");
    const manager = state.assetManager?.repository === deckRepository
      ? state.assetManager
      || (state.keepDeckVisible ? presentation?.assetManager : null)
      : new AssetManager(deckRepository, source, CONFIG.presentation.assetConcurrency);
    if (state.assetManager && state.assetManager !== manager) state.assetManager.dispose();
    presentation ||= new Presentation({
      stage: $("#stage"),
      counter: $("#slide-number"),
      progress: $("#progress"),
      onExit: leavePresentation,
      onIndexChange: (index) => {
        updateSlideHash(index);
        outline?.setActive(index);
        if (!suppressPositionPersistence && activePositionKey) {
          writeLocalPosition(activePositionKey, presentationPosition(presentation, index));
        }
        if (!suppressPositionPersistence && !$("#resume-prompt").hidden) $("#resume-prompt").hidden = true;
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
      annotationState: session.annotationState,
      discardLabel: "Return without saving",
      onMarkdownChange: (nextMarkdown, details = {}) => {
        session.applyMarkdown(nextMarkdown, details.annotationState, details.historyLabel, details);
        state.onSourceMarkdownChange?.(nextMarkdown);
        return loadDeck(deckRepository, source, label, deckState(state, session, manager));
      },
      onStateChange: (nextState, details = {}) => session.captureAnnotationState(nextState, details.historyLabel, details),
      onDownloadWorkspace: () => downloadDeckWorkspace({
        repository: deckRepository,
        source,
        markdown: session.markdown,
        references: imageReferences(processMarkdown(session.markdown, source)),
      }),
    });
    outline ||= new SlideOutline({
      panel: $("#slide-outline"),
      list: $("#outline-list"),
      toggle: $("#outline-toggle"),
      close: $("#outline-close"),
      search: $("#outline-search"),
      dismissSurface: $("#stage"),
      onSelect: (index) => presentation?.show(index),
      onCopyLink: (index) => copyText(activeCopySlideLink?.(index)),
    });
    outline.setSlides(documentModel.slides, { copyLinks: Boolean(state.copySlideLink) });
    diagnostics ||= new LayoutDiagnostics(presentation);
    diagnostics.refresh();
    historyController ||= new HistoryController({
      panel: $("#history-panel"),
      list: $("#history-list"),
      toggle: $("#history-toggle"),
      close: $("#history-close"),
      undo: $("#undo"),
      redo: $("#redo"),
      currentSlide: () => presentation?.atEnd ? null : presentation?.index,
      resolveSlide: (location) => resolveHistorySlide(presentation, location),
      showSlide: (index) => presentation?.show(index),
    });
    historyController.setSession(session, async (restoredSession) => {
      state.onSourceMarkdownChange?.(restoredSession.markdown);
      await loadDeck(deckRepository, source, label, deckState(state, restoredSession, manager));
    });
    $("#deck-name").textContent = label || "Presentation";
    activePositionKey = state.positionKey || null;
    activeCopySlideLink = state.copySlideLink || null;
    activeAssetHandler = async (file) => {
      const slideIndex = presentation.index;
      const sourceStart = presentation.slides[slideIndex]?.model.sourceEnd;
      const asset = await deckRepository.addFile(file);
      const result = insertImageIntoSlide(
        session.markdown,
        presentation.slides[presentation.index]?.model,
        asset,
        session.annotationState,
      );
      session.applyMarkdown(result.markdown, result.annotationState, "Add image", { slideIndex, sourceStart });
      state.onAssetsChange?.(await deckRepository.serializedAssets());
      state.onSourceMarkdownChange?.(session.markdown);
      await loadDeck(deckRepository, source, label, deckState(state, session, manager));
    };
    $("#add-image").hidden = false;
    setScreen("deck");
    suppressPositionPersistence = Boolean(savedPosition);
    await presentation.show(requestedIndex);
    suppressPositionPersistence = false;
    if (savedPosition) offerResume(resolvePresentationPosition(presentation, savedPosition));
    const prepareForPrint = () => { void presentation.prepareAllSlides(); };
    if (window.requestIdleCallback) window.requestIdleCallback(prepareForPrint, { timeout: 1500 });
    else window.setTimeout(prepareForPrint, 250);
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
    await loadDeck(repository, source, file.name, {
      markdown,
      assetManager: manager,
      positionKey: positionStorageKey(`local:${source.path}:${file.size}:${file.lastModified}`),
    });
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

async function checkPastedMarkdown({ present = false, fromLink = false } = {}) {
  const request = ++pasteCheckRequest;
  const markdown = $("#markdown-input").value;
  if (pasteValidation?.markdown === markdown) {
    const validation = pasteValidation;
    if (present) {
      pasteValidation = null;
      await loadDeck(validation.repository, validation.source, "Pasted deck", {
        markdown,
        assetManager: validation.manager,
        onSourceMarkdownChange: savePastedMarkdown,
        onAssetsChange: savePastedAssets,
        positionKey: positionStorageKey("paste"),
        copySlideLink: (index) => pastedSlideUrl(location.href, index),
        fromLink,
      });
    }
    return true;
  }
  clearPasteValidation();
  const source = { path: "slides.md" };
  const repository = new WorkingRepository(new InlineRepository(markdown), source, pastedAssets);
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
    if (present) await loadDeck(repository, source, "Pasted deck", {
      markdown,
      assetManager: manager,
      onSourceMarkdownChange: savePastedMarkdown,
      onAssetsChange: savePastedAssets,
      positionKey: positionStorageKey("paste"),
      copySlideLink: (index) => pastedSlideUrl(location.href, index),
      fromLink,
    });
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
$("#markdown-input").addEventListener("input", () => {
  persistExampleMarkdown($("#markdown-input").value, SAMPLE);
  syncExampleResetButton();
  schedulePasteCheck();
});
$("#reset-example").addEventListener("click", () => {
  if (!window.confirm("Discard edits?")) return;
  resetExampleMarkdown();
  pastedAssets = [];
  $("#markdown-input").value = SAMPLE;
  syncExampleResetButton();
  clearPasteValidation();
  window.clearTimeout(pasteCheckTimer);
  pasteCheckRequest += 1;
  setAssetStatus($("#paste-status"), "Example restored.", "success");
  $("#markdown-input").focus();
});
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
async function leavePresentation() {
  if (document.fullscreenElement) await document.exitFullscreen();
  if (annotations) annotations.requestClose(navigateHomeFromPresentation);
  else navigateHomeFromPresentation();
}
$("#back-home").addEventListener("click", (event) => {
  event.stopPropagation();
  void leavePresentation();
});
$("#error-home").addEventListener("click", navigateHomeFromPresentation);
window.addEventListener("popstate", (event) => {
  const screen = event.state?.[HISTORY_SCREEN_KEY];
  if (screen === "presentation") {
    presentationHistoryActive = true;
    setScreen("deck");
    void presentation?.show(slideFromHash());
    if (restorePresentationForClose) {
      restorePresentationForClose = false;
      annotations?.requestClose(navigateHomeFromPresentation);
    }
    return;
  }
  if (!presentationHistoryActive) return;
  if (allowHistoryExit) {
    finishPresentationExit();
    return;
  }
  if (annotations?.dirty) {
    restorePresentationForClose = true;
    history.forward();
    return;
  }
  finishPresentationExit();
});
$("#fullscreen").addEventListener("click", toggleFullscreen);
$("#edit-toggle").addEventListener("click", () => {
  setEditControlsOpen(!$(".deck-control-cluster").classList.contains("is-edit-open"));
});
$("#export-pdf").addEventListener("click", () => { void exportPresentationPdf(presentation, $("#pdf-status")); });
const addImageButton = $("#add-image");
addImageButton.addEventListener("pointerleave", () => addImageButton.classList.remove("is-hover-suppressed"));
addImageButton.addEventListener("click", (event) => {
  if (event.detail > 0) addImageButton.classList.add("is-hover-suppressed");
  $("#image-input").click();
});
$("#image-input").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file || !activeAssetHandler) return;
  try { await activeAssetHandler(file); }
  catch (error) { showError(error); }
  finally { if (addImageButton.classList.contains("is-hover-suppressed")) addImageButton.blur(); }
});
document.addEventListener("mdpresent:diagnosticschange", (event) => {
  syncPdfExport(!event.detail?.enabled);
});
syncPdfExport();
$("#resume-slide").addEventListener("click", () => {
  const index = Number.parseInt($("#resume-prompt").dataset.index || "0", 10);
  $("#resume-prompt").hidden = true;
  void presentation?.show(index);
});
$("#resume-start").addEventListener("click", () => {
  $("#resume-prompt").hidden = true;
  void presentation?.show(0);
  if (activePositionKey) writeLocalPosition(activePositionKey, presentationPosition(presentation, 0));
});

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await $(".deck-screen").requestFullscreen();
}

document.addEventListener("keydown", (event) => {
  if ($(".deck-screen").hidden || event.target.matches("input, textarea, [contenteditable='true']")) return;
  if (event.target.matches("button") && ["Enter", " "].includes(event.key)) return;
  const actions = {
    ArrowRight: () => presentation?.next(), ArrowDown: () => presentation?.next(), PageDown: () => presentation?.next(), " ": () => presentation?.next(),
    ArrowLeft: () => presentation?.previous(), ArrowUp: () => presentation?.previous(), PageUp: () => presentation?.previous(),
    Home: () => presentation?.first(), End: () => presentation?.last(), f: toggleFullscreen, F: toggleFullscreen,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});

setScreen("home");
schedulePasteCheck();
if (readHash().get("deck") === "paste") void checkPastedMarkdown({ present: true, fromLink: true });
