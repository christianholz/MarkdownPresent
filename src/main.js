import "./style.css";
import { InlineRepository, LocalRepository } from "./repository.js";
import { processMarkdown } from "./markdown.js";
import { AssetManager } from "./assets.js";
import { Presentation } from "./presentation.js";
import { SlideOutline } from "./slide-outline.js";
import { CONFIG } from "./config.js";

const SAMPLE = `# A small deck

Presentation-ready Markdown, directly in your browser.

## Familiar Markdown

- Regular bullets
  - Nested bullets stay nested
- **Emphasis**, [links](https://example.com), and tables

| Feature | Status |
|---|---|
| Math | $E = mc^2$ |
| Images | Included |

## Math, included

Inline equations and full display math are rendered locally.

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$`;

document.querySelector("#app").innerHTML = `
  <section class="home-screen" data-screen="home">
    <header class="brand"><span class="brand-mark">MP</span><span>Meeting Present</span></header>
    <main class="home-main">
      <div class="intro">
        <p class="eyebrow">Markdown → presentation</p>
        <h1>Your notes, already on stage.</h1>
        <p class="lede">Paste Markdown or choose a directory containing one or more decks. Everything is rendered locally in your browser.</p>
      </div>
      <section class="source-card" aria-label="Choose presentation source">
        <div class="tabs" role="tablist">
          <button class="tab is-active" data-tab="paste" role="tab">Paste</button>
          <button class="tab" data-tab="directory" role="tab">Directory</button>
        </div>
        <div class="tab-panel is-active" data-panel="paste">
          <label class="field-label" for="markdown-input">Markdown</label>
          <textarea id="markdown-input" spellcheck="false" aria-label="Markdown source"></textarea>
          <button class="primary-button" id="present-paste">Present</button>
        </div>
        <div class="tab-panel" data-panel="directory">
          <label class="drop-zone" id="drop-zone">
            <input id="file-input" type="file" accept=".md,.markdown,image/*" multiple />
            <span class="drop-icon">↓</span>
            <strong>Drop a directory, or Markdown and image files</strong>
            <span>or choose files from this device</span>
          </label>
          <label class="folder-button">Choose a directory<input id="folder-input" type="file" webkitdirectory multiple /></label>
          <p class="hint" id="file-status">The directory may contain several Markdown presentations.</p>
          <section class="local-browser" id="local-browser" hidden>
            <label class="field-label" for="local-filter">Choose a presentation</label>
            <input id="local-filter" type="search" placeholder="Filter Markdown files…" autocomplete="off" />
            <div class="markdown-files" id="local-files" role="listbox" aria-label="Local Markdown presentations"></div>
          </section>
        </div>
        <p class="form-error" id="form-error" role="alert"></p>
      </section>
    </main>
    <footer class="home-footer"><span>Files stay in this browser.</span><span>Arrow keys · Space · F for fullscreen</span></footer>
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
    <button class="primary-button" id="error-home">Choose another source</button>
  </section>`;

const $ = (selector) => document.querySelector(selector);
let presentation;
let outline;
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

async function loadDeck(repository, source, label) {
  setScreen("loading");
  try {
    const markdown = await repository.readText();
    const documentModel = processMarkdown(markdown, source);
    if (!documentModel.slides.length) throw new Error("The Markdown file does not contain any slide content.");
    const manager = new AssetManager(repository, source, CONFIG.presentation.assetConcurrency);
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
    await presentation.show(slideFromHash());
  } catch (error) { showError(error); }
}

function pathFor(file) { return file.meetingPresentRelativePath || file.webkitRelativePath || file.name; }

function preserveRelativePath(file, path) {
  Object.defineProperty(file, "meetingPresentRelativePath", {
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

function openLocalMarkdown(file) {
  const source = { path: pathFor(file) };
  loadDeck(new LocalRepository(selectedFiles, file), source, file.name);
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
    button.addEventListener("click", () => openLocalMarkdown(file));
    list.append(button);
  }
}

function receiveFiles(files) {
  selectedFiles = [...files];
  markdownFiles = selectedFiles
    .filter((file) => /\.(md|markdown)$/i.test(file.name))
    .sort((a, b) => pathFor(a).localeCompare(pathFor(b)));
  if (!markdownFiles.length) {
    $("#file-status").textContent = "No Markdown file found in that selection.";
    $("#local-browser").hidden = true;
    return;
  }
  $("#file-status").textContent = `${markdownFiles.length} presentation${markdownFiles.length === 1 ? "" : "s"} · ${selectedFiles.length - markdownFiles.length} supporting file${selectedFiles.length - markdownFiles.length === 1 ? "" : "s"}`;
  $("#local-browser").hidden = markdownFiles.length === 1;
  $("#local-filter").value = "";
  renderLocalFiles();
  if (markdownFiles.length === 1) openLocalMarkdown(markdownFiles[0]);
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab));
}));

$("#present-paste").addEventListener("click", () => loadDeck(new InlineRepository($("#markdown-input").value), { path: "slides.md" }, "Pasted deck"));
$("#file-input").addEventListener("change", (event) => receiveFiles(event.target.files));
$("#folder-input").addEventListener("change", (event) => receiveFiles(event.target.files));
$("#local-filter").addEventListener("input", renderLocalFiles);

const dropZone = $("#drop-zone");
for (const eventName of ["dragenter", "dragover"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); });
for (const eventName of ["dragleave", "drop"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("is-dragging"); });
dropZone.addEventListener("drop", async (event) => {
  $("#file-status").textContent = "Reading the dropped directory…";
  try {
    receiveFiles(await filesFromDrop(event.dataTransfer));
  } catch (error) {
    $("#file-status").textContent = `The dropped directory could not be read: ${error.message}`;
  }
});

$("#previous").addEventListener("click", () => presentation?.previous());
$("#next").addEventListener("click", () => presentation?.next());
$("#back-home").addEventListener("click", () => { outline?.close(); setScreen("home"); });
$("#error-home").addEventListener("click", () => setScreen("home"));
$("#fullscreen").addEventListener("click", toggleFullscreen);

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await $(".deck-screen").requestFullscreen();
}

document.addEventListener("keydown", (event) => {
  if ($(".deck-screen").hidden || event.target.matches("input, textarea, button")) return;
  const actions = {
    ArrowRight: () => presentation?.next(), ArrowDown: () => presentation?.next(), PageDown: () => presentation?.next(), " ": () => presentation?.next(),
    ArrowLeft: () => presentation?.previous(), ArrowUp: () => presentation?.previous(), PageUp: () => presentation?.previous(),
    Home: () => presentation?.first(), End: () => presentation?.last(), f: toggleFullscreen, F: toggleFullscreen,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});

setScreen("home");
