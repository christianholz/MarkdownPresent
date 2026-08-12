import "../src/style.css";
import { AssetManager } from "../src/assets.js";
import { CONFIG } from "../src/config.js";
import { processMarkdown, processRenderedHtml } from "../src/markdown.js";
import { Presentation } from "../src/presentation.js";
import { GithubPageRepository } from "../src/repository.js";
import { SlideOutline } from "../src/slide-outline.js";
import { AnnotationManager } from "../src/annotations.js";

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
      <span id="slide-number">1 / 1</span>
      <button id="outline-toggle" aria-label="Show slide list" aria-controls="slide-outline" aria-expanded="false">☷</button>
      <button id="download-comments" aria-label="Download comments" title="Download comments" hidden>⤓</button>
      <button id="next" aria-label="Next slide">→</button>
    </nav>
    <aside class="slide-outline" id="slide-outline" aria-label="Slide list" hidden>
      <header class="slide-outline-header"><strong>Slides</strong><button id="outline-close" aria-label="Close slide list">×</button></header>
      <nav class="slide-outline-list" id="outline-list" aria-label="Jump to slide"></nav>
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

    const repository = new GithubPageRepository(payload.source, payload.markdown || "", payload.sourceTabId);
    const documentModel = payload.markdown
      ? processMarkdown(payload.markdown, payload.source)
      : processRenderedHtml(payload.renderedHtml, payload.source);
    if (!documentModel.slides.length) throw new Error("The GitHub file does not contain any slide content.");

    const manager = new AssetManager(repository, payload.source, CONFIG.presentation.assetConcurrency);
    presentation = new Presentation({
      stage: $("#stage"),
      counter: $("#slide-number"),
      progress: $("#progress"),
      onIndexChange: (index) => {
        updateSlideHash(index);
        outline?.setActive(index);
      },
    });
    await presentation.create(documentModel, manager);
    const title = documentModel.slides.find((slide) => slide.title?.tagName === "H1")?.title?.textContent?.trim()
      || documentModel.slides.find((slide) => slide.title)?.title?.textContent?.trim()
      || payload.source.path.split("/").pop()
      || "Presentation";
    annotations = new AnnotationManager({
      stage: $("#stage"),
      deck: $(".deck-screen"),
      downloadButton: $("#download-comments"),
      presentation,
      sourceMarkdown: payload.markdown || "",
      sourcePath: payload.source.path,
      title,
      onUpload: () => chrome.tabs.create({ url: githubUploadUrl(payload.source) }),
    });
    outline = new SlideOutline({
      panel: $("#slide-outline"),
      list: $("#outline-list"),
      toggle: $("#outline-toggle"),
      close: $("#outline-close"),
      dismissSurface: $("#stage"),
      onSelect: (index) => presentation?.show(index),
    });
    outline.setSlides(documentModel.slides);
    $("#deck-name").textContent = payload.source.path.split("/").pop() || "Presentation";
    setScreen("deck");
    await presentation.show(slideFromHash());
    await Promise.allSettled(presentation.slides.map((_, index) => presentation.loadAssets(index)));
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

document.addEventListener("keydown", (event) => {
  if ($(".deck-screen").hidden || event.target.matches("input, textarea, button")) return;
  const actions = {
    ArrowRight: () => presentation?.next(), ArrowDown: () => presentation?.next(), PageDown: () => presentation?.next(), " ": () => presentation?.next(),
    ArrowLeft: () => presentation?.previous(), ArrowUp: () => presentation?.previous(), PageUp: () => presentation?.previous(),
    Home: () => presentation?.first(), End: () => presentation?.last(), f: toggleFullscreen, F: toggleFullscreen,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});

boot();
