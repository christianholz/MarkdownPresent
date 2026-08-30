import "../src/style.css";
import { AssetManager } from "../src/assets.js";
import { CONFIG } from "../src/config.js";
import { processMarkdown, processRenderedHtml } from "../src/markdown.js";
import { Presentation } from "../src/presentation.js";
import { GithubPageRepository } from "../src/repository.js";
import { SlideOutline } from "../src/slide-outline.js";
import { AnnotationManager } from "../src/annotations.js";
import { extensionDraftKey, extensionDraftRecord, restorableExtensionDraft } from "../src/drafts.js";
import { DocumentSession } from "../src/document-session.js";
import { HistoryController } from "../src/history.js";
import { githubSlideUrl, positionStorageKey, presentationPosition, resolvePresentationPosition } from "../src/positions.js";
import { downloadDeckWorkspace, insertImageIntoSlide, WorkingRepository } from "../src/asset-workspace.js";
import { exportPresentationPdf } from "../src/pdf-export.js";

document.querySelector("#app").innerHTML = `
  <section class="loading-screen" data-screen="loading">
    <div class="loader"></div><p>Reading the GitHub deck…</p>
  </section>
  <section class="deck-screen" data-screen="deck" hidden>
    <div class="deck-topbar">
      <button class="icon-button" id="close" aria-label="Close presentation">×</button>
      <span class="deck-name" id="deck-name">Presentation</span>
      <button class="icon-button" id="fullscreen" aria-label="Toggle fullscreen">⛶</button>
    </div>
    <main class="stage" id="stage"></main>
    <nav class="deck-controls" aria-label="Slide controls">
      <button id="previous" aria-label="Previous slide">←</button>
      <button id="undo" aria-label="Undo last edit" title="Undo" disabled>↶</button>
      <button id="redo" aria-label="Redo last edit" title="Redo" disabled>↷</button>
      <span id="slide-number">1 / 1</span>
      <button id="outline-toggle" aria-label="Show slide list" aria-controls="slide-outline" aria-expanded="false">☷</button>
      <button id="history-toggle" aria-label="Show edit history" aria-controls="history-panel" aria-expanded="false">◷</button>
      <button id="add-image" aria-label="Add an image to this slide" title="Add image">▧+</button>
      <input id="image-input" type="file" accept="image/*" hidden />
      <button id="export-pdf" aria-label="Export all slides as PDF" title="Export PDF">PDF</button>
      <button id="download-comments" aria-label="Download comments" title="Download comments" hidden>⤓</button>
      <button id="next" aria-label="Next slide">→</button>
    </nav>
    <p id="change-status" class="unsaved-comment-count" aria-live="polite" hidden></p>
    <aside class="slide-outline" id="slide-outline" aria-label="Slide list" hidden>
      <header class="slide-outline-header"><strong>Slides</strong><button id="outline-close" aria-label="Close slide list">×</button></header>
      <input class="slide-outline-search" id="outline-search" type="search" placeholder="Search slides…" aria-label="Search slides" autocomplete="off" />
      <nav class="slide-outline-list" id="outline-list" aria-label="Jump to slide"></nav>
    </aside>
    <section class="resume-prompt" id="resume-prompt" aria-live="polite" hidden>
      <span id="resume-message"></span>
      <button id="resume-slide" type="button">Resume</button>
      <button id="resume-start" type="button">Start at beginning</button>
    </section>
    <p class="pdf-preparing-status" id="pdf-status" role="status" hidden>Preparing every slide for PDF…</p>
    <aside class="history-panel" id="history-panel" aria-label="Edit history" hidden>
      <header class="slide-outline-header"><strong>Edit history</strong><button id="history-close" aria-label="Close edit history">×</button></header>
      <div class="history-list" id="history-list"></div>
    </aside>
    <div class="progress-track"><div id="progress"></div></div>
  </section>
  <section class="error-screen" data-screen="error" hidden>
    <span class="error-code">!</span><h1>That deck could not open.</h1><p id="error-message"></p>
    <button class="primary-button" id="close-error">Close this tab</button>
  </section>`;

const $ = (selector) => document.querySelector(selector);
let presentation;
let outline;
let annotations;
let historyController;
let positionKey;
let suppressPositionPersistence = false;
let activeAssetHandler = null;

function setScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
}

function showError(error) {
  $("#error-message").textContent = error?.message || String(error);
  setScreen("error");
}

function hashParameters() { return new URLSearchParams(location.hash.slice(1)); }
function slideFromHash() { return Math.max(0, Number.parseInt(hashParameters().get("slide") || "1", 10) - 1); }
function updateSlideHash(index) {
  const hash = hashParameters();
  hash.set("slide", String(index + 1));
  history.replaceState(null, "", `#${hash}`);
}

async function copyText(text) {
  if (!text) return;
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

function githubUploadUrl(source) {
  const directory = source.path.split("/").slice(0, -1);
  const parts = [source.owner, source.repo, "upload", source.ref, ...directory]
    .map((part) => encodeURIComponent(part));
  return `https://github.com/${parts.join("/")}`;
}

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await $(".deck-screen").requestFullscreen();
}

async function boot() {
  try {
    const sourceId = hashParameters().get("source");
    if (!sourceId) throw new Error("The GitHub source was not passed to this tab.");
    const storageKey = `mdpresent:${sourceId}`;
    const stored = await chrome.storage.local.get(storageKey);
    const payload = stored[storageKey];
    if (!payload) throw new Error("The GitHub source expired. Return to the Markdown file and click Present again.");

    const originalMarkdown = payload.markdown || "";
    positionKey = positionStorageKey(payload.source);
    const storedPosition = (await chrome.storage.local.get(positionKey))[positionKey] || null;
    const draftKey = extensionDraftKey(payload.source);
    const storedDraft = originalMarkdown ? (await chrome.storage.local.get(draftKey))[draftKey] : null;
    const restoredDraft = restorableExtensionDraft(storedDraft, originalMarkdown);
    let preserveStaleDraft = Boolean(storedDraft && !restoredDraft);
    let draftWrite = Promise.resolve();
    let repository;
    const persistDraft = (state) => {
      draftWrite = draftWrite.catch(() => {}).then(async () => {
        if (state.dirty) {
          preserveStaleDraft = false;
          const assets = await repository.serializedAssets();
          await chrome.storage.local.set({ [draftKey]: extensionDraftRecord(originalMarkdown, state, Date.now(), assets) });
        } else if (!preserveStaleDraft) {
          await chrome.storage.local.remove(draftKey);
        }
      });
      return draftWrite;
    };
    const discardDraft = () => {
      preserveStaleDraft = false;
      draftWrite = draftWrite.catch(() => {}).then(() => chrome.storage.local.remove(draftKey));
      return draftWrite;
    };
    repository = new WorkingRepository(
      new GithubPageRepository(payload.source, originalMarkdown, payload.sourceTabId),
      payload.source,
      restoredDraft?.assets,
    );
    const manager = new AssetManager(repository, payload.source, CONFIG.presentation.assetConcurrency);
    presentation = new Presentation({
      stage: $("#stage"),
      counter: $("#slide-number"),
      progress: $("#progress"),
      onIndexChange: (index) => {
        updateSlideHash(index);
        outline?.setActive(index);
        if (!suppressPositionPersistence) {
          void chrome.storage.local.set({ [positionKey]: presentationPosition(presentation, index) });
          $("#resume-prompt").hidden = true;
        }
      },
    });
    outline = new SlideOutline({
      panel: $("#slide-outline"),
      list: $("#outline-list"),
      toggle: $("#outline-toggle"),
      close: $("#outline-close"),
      search: $("#outline-search"),
      dismissSurface: $("#stage"),
      onSelect: (index) => presentation?.show(index),
      onCopyLink: (index) => copyText(githubSlideUrl(payload.source, index)),
    });

    const session = new DocumentSession({
      markdown: restoredDraft?.markdown ?? originalMarkdown,
      originalMarkdown: restoredDraft?.annotationState?.originalSourceMarkdown ?? originalMarkdown,
      annotationState: restoredDraft?.annotationState,
      source: payload.source,
      sourcePath: payload.source.path,
    });

    const renderDeck = async (requestedIndex, keepDeckVisible = false) => {
      if (!keepDeckVisible) setScreen("loading");
      const documentModel = session.markdown
        ? processMarkdown(session.markdown, payload.source)
        : processRenderedHtml(payload.renderedHtml, payload.source);
      if (!documentModel.slides.length) throw new Error("The GitHub file does not contain any slide content.");
      await presentation.create(documentModel, manager);
      annotations?.destroy();
      const title = documentModel.slides.find((slide) => slide.title?.tagName === "H1")?.title?.textContent?.trim()
        || documentModel.slides.find((slide) => slide.title)?.title?.textContent?.trim()
        || payload.source.path.split("/").pop()
        || "Presentation";
      annotations = new AnnotationManager({
        stage: $("#stage"),
        deck: $(".deck-screen"),
        downloadButton: $("#download-comments"),
        presentation,
        sourceMarkdown: session.markdown,
        originalSourceMarkdown: session.originalMarkdown,
        sourcePath: payload.source.path,
        title,
        annotationState: session.annotationState,
        discardLabel: "Leave tab without saving",
        onStateChange: originalMarkdown ? (state, details = {}) => {
          session.captureAnnotationState(state, details.historyLabel);
          return persistDraft(state);
        } : undefined,
        onDiscard: originalMarkdown ? discardDraft : undefined,
        onUpload: () => chrome.tabs.create({ url: githubUploadUrl(payload.source) }),
        onDownloadWorkspace: () => downloadDeckWorkspace({
          repository,
          source: payload.source,
          markdown: session.markdown,
          references: [...new Set(documentModel.slides.flatMap((slide) => slide.images.map((image) => image.src)))],
        }),
        onMarkdownChange: originalMarkdown
          ? (nextMarkdown, details = {}) => {
            session.applyMarkdown(nextMarkdown, details.annotationState, details.historyLabel);
            return renderDeck(presentation.index, true);
          }
          : undefined,
      });
      outline.setSlides(documentModel.slides);
      historyController ||= new HistoryController({
        panel: $("#history-panel"),
        list: $("#history-list"),
        toggle: $("#history-toggle"),
        close: $("#history-close"),
        undo: $("#undo"),
        redo: $("#redo"),
      });
      historyController.setSession(session, () => renderDeck(presentation.index, true));
      activeAssetHandler = originalMarkdown ? async (file) => {
        const asset = await repository.addFile(file);
        const result = insertImageIntoSlide(
          session.markdown,
          presentation.slides[presentation.index]?.model,
          asset,
          session.annotationState,
        );
        session.applyMarkdown(result.markdown, result.annotationState, "Add image");
        await renderDeck(presentation.index, true);
      } : null;
      $("#add-image").hidden = !activeAssetHandler;
      $("#deck-name").textContent = payload.source.path.split("/").pop() || "Presentation";
      setScreen("deck");
      await presentation.show(requestedIndex);
      await Promise.allSettled(presentation.slides.map((_, index) => presentation.loadAssets(index)));
    };

    const linkedIndex = Number.isInteger(payload.initialSlide) ? payload.initialSlide : null;
    suppressPositionPersistence = Boolean(storedPosition && linkedIndex === null);
    await renderDeck(linkedIndex ?? 0, false);
    suppressPositionPersistence = false;
    if (storedPosition && linkedIndex === null) {
      const resumeIndex = resolvePresentationPosition(presentation, storedPosition);
      if (resumeIndex > 0) {
        $("#resume-message").textContent = `Continue from slide ${resumeIndex + 1}?`;
        $("#resume-prompt").dataset.index = String(resumeIndex);
        $("#resume-prompt").hidden = false;
      }
    }
    await chrome.storage.local.remove(storageKey);
  } catch (error) { showError(error); }
}

$("#previous").addEventListener("click", () => presentation?.previous());
$("#next").addEventListener("click", () => presentation?.next());
$("#close").addEventListener("click", (event) => {
  event.stopPropagation();
  if (annotations) annotations.requestClose(() => window.close()); else window.close();
});
$("#close-error").addEventListener("click", () => window.close());
$("#fullscreen").addEventListener("click", toggleFullscreen);
$("#export-pdf").addEventListener("click", () => { void exportPresentationPdf(presentation, $("#pdf-status")); });
$("#add-image").addEventListener("click", () => $("#image-input").click());
$("#image-input").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file || !activeAssetHandler) return;
  try { await activeAssetHandler(file); }
  catch (error) { showError(error); }
});
$("#resume-slide").addEventListener("click", () => {
  $("#resume-prompt").hidden = true;
  void presentation?.show(Number.parseInt($("#resume-prompt").dataset.index || "0", 10));
});
$("#resume-start").addEventListener("click", () => {
  $("#resume-prompt").hidden = true;
  void presentation?.show(0);
});

document.addEventListener("keydown", (event) => {
  if ($(".deck-screen").hidden || event.target.matches("input, textarea, button, [contenteditable='true']")) return;
  const actions = {
    ArrowRight: () => presentation?.next(), ArrowDown: () => presentation?.next(), PageDown: () => presentation?.next(), " ": () => presentation?.next(),
    ArrowLeft: () => presentation?.previous(), ArrowUp: () => presentation?.previous(), PageUp: () => presentation?.previous(),
    Home: () => presentation?.first(), End: () => presentation?.last(), f: toggleFullscreen, F: toggleFullscreen,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});

boot();
