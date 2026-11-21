import "../src/style.css";
import { AssetManager } from "../src/assets.js";
import { CONFIG } from "../src/config.js";
import { processMarkdown, processRenderedHtml } from "../src/markdown.js";
import { Presentation } from "../src/presentation.js";
import { GithubPageRepository } from "../src/repository.js";
import { SlideOutline } from "../src/slide-outline.js";
import { AnnotationManager } from "../src/annotations.js";
import { draftWithoutAssetData, extensionDraftKey, extensionDraftRecord, restorableExtensionDraft } from "../src/drafts.js";
import { DocumentSession } from "../src/document-session.js";
import { HistoryController, resolveHistorySlide } from "../src/history.js";
import { githubSlideUrl, positionStorageKey, presentationPosition, resolvePresentationPosition } from "../src/positions.js";
import { downloadDeckWorkspace, insertImageIntoSlide, WorkingRepository } from "../src/asset-workspace.js";
import { exportPresentationPdf } from "../src/pdf-export.js";
import { requestGitHubToken, writeDeckToGitHub } from "../src/github-writeback.js";
import { LayoutDiagnostics } from "../src/diagnostics.js";
import { copyText, handleDeckNavigationKeydown, setDeckEditControlsOpen, syncPdfExport, toggleFullscreen } from "../src/deck-controls.js";
import { resolveRepoPath } from "../src/paths.js";

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
        <button id="edit-slide" aria-label="Edit this slide" title="Edit slide">✎</button>
        <button id="add-image" aria-label="Add an image file to this slide" title="Add image file"><span class="img-control-icon" aria-hidden="true">IMG</span></button>
        <input id="image-input" type="file" accept="image/*" hidden />
        <button id="download-comments" aria-label="Download changes" title="Download changes" hidden>⤓</button>
        <button id="export-pdf" aria-label="Export all slides as PDF" title="Export PDF">
          <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v5h4M12 11v6m-3-3 3 3 3-3"/></svg>
        </button>
      </nav>
    </div>
    <p id="change-status" class="unsaved-comment-count" aria-live="polite" hidden></p>
    <p id="draft-asset-warning" class="draft-asset-warning" role="alert" hidden></p>
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
let activeDeckEditorHandler = null;
let diagnostics;

function setScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
  if (name !== "deck") setEditControlsOpen(false);
}

function setEditControlsOpen(open) { setDeckEditControlsOpen(open, () => historyController?.close()); }

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

function githubUploadUrl(source) {
  const directory = source.path.split("/").slice(0, -1);
  const parts = [source.owner, source.repo, "upload", source.ref, ...directory]
    .map((part) => encodeURIComponent(part));
  return `https://github.com/${parts.join("/")}`;
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
    let remoteMarkdown = originalMarkdown;
    positionKey = positionStorageKey(payload.source);
    const storedPosition = (await chrome.storage.local.get(positionKey))[positionKey] || null;
    const draftKey = extensionDraftKey(payload.source);
    const storedDraft = originalMarkdown ? (await chrome.storage.local.get(draftKey))[draftKey] : null;
    const textDraft = draftWithoutAssetData(storedDraft);
    if (textDraft !== storedDraft) await chrome.storage.local.set({ [draftKey]: textDraft });
    const restoredDraft = restorableExtensionDraft(textDraft, originalMarkdown);
    let preserveStaleDraft = Boolean(storedDraft && !restoredDraft);
    const previousLocalAssetPaths = new Set(Array.isArray(restoredDraft?.localAssetPaths) ? restoredDraft.localAssetPaths : []);
    let draftWrite = Promise.resolve();
    let repository;
    const referencedLocalAssetPaths = (markdown) => {
      const references = processMarkdown(markdown, payload.source).slides.flatMap((slide) => slide.images.map((image) => image.src));
      const referencedPaths = new Set();
      for (const reference of references) {
        if (/^https?:/i.test(reference)) continue;
        try { referencedPaths.add(resolveRepoPath(payload.source.path, reference)); }
        catch { /* Invalid paths cannot match an earlier local upload. */ }
      }
      return [...new Set([...previousLocalAssetPaths, ...repository.assets.keys()])].filter((path) => referencedPaths.has(path));
    };
    const missingLocalAssetPaths = (markdown) => referencedLocalAssetPaths(markdown).filter((path) => !repository.assets.has(path));
    const updateAssetWarning = (markdown) => {
      const missing = missingLocalAssetPaths(markdown);
      const warning = $("#draft-asset-warning");
      if (missing.length) warning.textContent = `Images added in the previous session are unavailable: ${missing.join(", ")}. Re-add them before saving or downloading this deck.`;
      warning.hidden = !missing.length;
    };
    const ensureAssetsAvailable = () => {
      const missing = missingLocalAssetPaths(session.markdown);
      if (missing.length) throw new Error(`Re-add these images before saving or downloading: ${missing.join(", ")}`);
    };
    const persistDraft = (state) => {
      draftWrite = draftWrite.catch(() => {}).then(async () => {
        if (state.dirty) {
          const localAssetPaths = referencedLocalAssetPaths(state.markdown);
          await chrome.storage.local.set({
            [draftKey]: extensionDraftRecord(remoteMarkdown, state, Date.now(), localAssetPaths),
          });
          preserveStaleDraft = false;
        } else if (!preserveStaleDraft) {
          await chrome.storage.local.remove(draftKey);
        }
      });
      return draftWrite;
    };
    const discardDraft = () => {
      draftWrite = draftWrite.catch(() => {}).then(async () => {
        preserveStaleDraft = false;
        previousLocalAssetPaths.clear();
        await chrome.storage.local.remove(draftKey);
        $("#draft-asset-warning").hidden = true;
      });
      return draftWrite;
    };
    repository = new WorkingRepository(
      new GithubPageRepository(payload.source, originalMarkdown, payload.sourceTabId), payload.source,
    );
    const manager = new AssetManager(repository, payload.source, CONFIG.presentation.assetConcurrency);
    presentation = new Presentation({
      stage: $("#stage"),
      counter: $("#slide-number"),
      progress: $("#progress"),
      onExit: leavePresentation,
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
      updateAssetWarning(session.markdown);
      const title = documentModel.slides.find((slide) => slide.title?.tagName === "H1")?.title?.textContent?.trim()
        || documentModel.slides.find((slide) => slide.title)?.title?.textContent?.trim()
        || payload.source.path.split("/").pop()
        || "Presentation";
      const windowTitle = documentModel.slides.find((slide) => slide.title?.tagName === "H1")?.title?.textContent?.trim()
        || payload.source.path.split("/").pop()
        || title;
      document.title = `${windowTitle} — MarkdownPresent`;
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
          session.captureAnnotationState(state, details.historyLabel, details);
          return persistDraft(state);
        } : undefined,
        onDiscard: originalMarkdown ? discardDraft : undefined,
        onUpload: () => chrome.tabs.create({ url: githubUploadUrl(payload.source) }),
        onWriteBack: originalMarkdown ? async () => {
          ensureAssetsAvailable();
          const tokenRecord = await chrome.storage.local.get("mdpresent:github-token");
          const storedToken = tokenRecord["mdpresent:github-token"] || "";
          const token = storedToken || await requestGitHubToken($(".deck-screen"));
          if (!token) throw new Error("GitHub save was cancelled.");
          await chrome.storage.local.set({ "mdpresent:github-token": token });
          try {
            await writeDeckToGitHub({
              source: payload.source,
              token,
              baseMarkdown: remoteMarkdown,
              markdown: session.markdown,
              assets: await repository.serializedAssets(new Set(referencedLocalAssetPaths(session.markdown))),
            });
          } catch (error) {
            if (error.status === 401) {
              await chrome.storage.local.remove("mdpresent:github-token");
              throw new Error("The saved GitHub token is no longer valid. Try saving again to connect a new token.");
            }
            throw error;
          }
          remoteMarkdown = session.markdown;
          await discardDraft();
        } : undefined,
        onDownloadWorkspace: () => {
          ensureAssetsAvailable();
          return downloadDeckWorkspace({
            repository,
            source: payload.source,
            markdown: session.markdown,
            references: [...new Set(documentModel.slides.flatMap((slide) => slide.images.map((image) => image.src)))],
          });
        },
        onMarkdownChange: originalMarkdown
          ? (nextMarkdown, details = {}) => {
            session.applyMarkdown(nextMarkdown, details.annotationState, details.historyLabel, details);
            return renderDeck(presentation.index, true);
          }
          : undefined,
      });
      outline.setSlides(documentModel.slides);
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
        await persistDraft(restoredSession.snapshot());
        return renderDeck(presentation.index, true);
      });
      activeAssetHandler = originalMarkdown ? async (file) => {
        const slideIndex = presentation.index;
        const sourceStart = presentation.slides[slideIndex]?.model.sourceEnd;
        const references = documentModel.slides.flatMap((slide) => slide.images.map((image) => image.src));
        const asset = await repository.addFile(file, references);
        const result = insertImageIntoSlide(
          session.markdown,
          presentation.slides[presentation.index]?.model,
          asset,
          session.annotationState,
        );
        session.applyMarkdown(result.markdown, result.annotationState, "Add image", { slideIndex, sourceStart });
        await persistDraft(session.snapshot());
        await renderDeck(presentation.index, true);
      } : null;
      activeDeckEditorHandler = originalMarkdown ? async () => {
        const slideIndex = Math.min(presentation.index, presentation.slides.length - 1);
        const { openDeckEditor } = await import("../src/deck-editor.js");
        await openDeckEditor({
          session,
          slideModel: presentation.slides[slideIndex]?.model,
          slideIndex,
          presentation,
          assetManager: manager,
          onUploadImage: async (file, editedSection) => {
            const references = [session.markdown, editedSection]
              .flatMap((markdown) => processMarkdown(markdown, payload.source).slides
                .flatMap((slide) => slide.images.map((image) => image.src)));
            const asset = await repository.addFile(file, references);
            return asset.reference;
          },
          onSave: async (nextMarkdown, annotationState, details) => {
            session.applyMarkdown(nextMarkdown, annotationState, details.historyLabel, details);
            await persistDraft(session.snapshot());
            await renderDeck(slideIndex, true);
          },
        });
      } : null;
      $("#edit-slide").hidden = !activeDeckEditorHandler;
      $("#add-image").hidden = !activeAssetHandler;
      $("#deck-name").textContent = payload.source.path.split("/").pop() || "Presentation";
      setScreen("deck");
      await presentation.show(requestedIndex);
      await Promise.allSettled(presentation.slides.map((_, index) => presentation.loadAssets(index)));
      const prepareForPrint = () => { void presentation.prepareAllSlides(); };
      if (window.requestIdleCallback) window.requestIdleCallback(prepareForPrint, { timeout: 1500 });
      else window.setTimeout(prepareForPrint, 250);
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
async function leavePresentation() {
  if (document.fullscreenElement) await document.exitFullscreen();
  if (annotations) annotations.requestClose(() => window.close()); else window.close();
}
$("#close").addEventListener("click", (event) => {
  event.stopPropagation();
  void leavePresentation();
});
$("#close-error").addEventListener("click", () => window.close());
$("#fullscreen").addEventListener("click", toggleFullscreen);
$("#edit-toggle").addEventListener("click", () => {
  setEditControlsOpen(!$(".deck-control-cluster").classList.contains("is-edit-open"));
});
$("#edit-slide").addEventListener("click", () => { if (activeDeckEditorHandler) void activeDeckEditorHandler().catch(showError); });
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
  $("#resume-prompt").hidden = true;
  void presentation?.show(Number.parseInt($("#resume-prompt").dataset.index || "0", 10));
});
$("#resume-start").addEventListener("click", () => {
  $("#resume-prompt").hidden = true;
  void presentation?.show(0);
});

document.addEventListener("keydown", (event) => handleDeckNavigationKeydown(event, presentation));

boot();
