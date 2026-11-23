import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import "./deck-editor.css";
import { processMarkdown } from "./markdown.js";
import { renderSlideElement } from "./presentation.js";
import {
  editableSection, hasEmbeddedImageData, markdownInsertion, markdownInsertTools, needsSourceEditor, replaceEditableSection,
} from "./deck-editor-source.js";

let CrepeClass;
let activeEditor = null;

async function crepeClass() {
  CrepeClass ||= (await import("@milkdown/crepe")).Crepe;
  return CrepeClass;
}

function splitHeading(markdown) {
  const match = /^(#{1,2})[ \t]+([^\n]+)(?:\n+|$)/.exec(markdown);
  if (!match) return { line: "", marker: "", body: markdown };
  return { line: `${match[1]} ${match[2]}`, marker: match[1], body: markdown.slice(match[0].length) };
}

function mediaKeyFor(model) {
  return JSON.stringify({
    images: (model?.images || []).map(({ src, alt }) => [src, alt]),
    diagrams: (model?.diagrams || []).map(({ src, title }) => [src, title]),
  });
}

function imageSlot(image, assetManager, isCurrent, onReady) {
  const slot = document.createElement("figure");
  slot.className = "image-slot";
  slot.dataset.imageSrc = image.src;
  const imageElement = document.createElement("img");
  imageElement.alt = image.alt || "";
  imageElement.decoding = "async";
  slot.innerHTML = '<span class="image-loading">Loading image…</span>';
  assetManager.getUrl(image.src).then((url) => {
    if (!isCurrent()) return;
    imageElement.src = url;
    imageElement.decode().catch(() => {}).finally(() => {
      if (!isCurrent()) return;
      slot.replaceChildren(imageElement);
      onReady();
    });
  }).catch((cause) => { if (isCurrent()) slot.textContent = cause.message; });
  return slot;
}

export async function openDeckEditor({
  session, slideModel, slideIndex, presentation, assetManager, historyController, initialView, reopen, onSave, onUploadImage,
}) {
  if (activeEditor) { activeEditor.focus(); return; }
  const section = editableSection(session.markdown, slideModel);
  const original = section.markdown;
  const originalHeading = splitHeading(original);
  const originalRecord = presentation.slides[slideIndex];
  if (!originalRecord) throw new Error("The active slide is no longer available.");
  const deck = presentation.stage.closest(".deck-screen");
  const editButton = deck.querySelector("#edit-toggle");
  const revisionControls = deck.querySelector("#editor-history");
  const inactiveControls = deck.querySelectorAll(".deck-topbar, .deck-control-cluster, .slide-outline, .resume-prompt");
  const sourceOnly = needsSourceEditor(original) || slideModel?.imageOnly || !originalRecord.element.querySelector(".slide-copy");
  let previewRecord = { ...originalRecord, element: originalRecord.element.cloneNode(true) };
  previewRecord.element.classList.add("is-active", "is-live-editing");
  originalRecord.element.replaceWith(previewRecord.element);
  presentation.slides[slideIndex] = previewRecord;
  deck.classList.add("is-live-editing");
  deck.classList.toggle("is-url-only-edit", !onUploadImage);

  const panel = document.createElement("section");
  panel.className = "deck-editor-panel";
  if (!onUploadImage) panel.classList.add("is-url-only");
  panel.tabIndex = -1;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Slide editor");
  panel.innerHTML = `
    <div class="deck-editor-header">
      <strong>Editing slide ${slideIndex + 1}</strong>
      <div class="deck-editor-tabs" role="tablist" aria-label="Editing view">
        <button type="button" role="tab" data-view="visual">Visual</button>
        <button type="button" role="tab" data-view="source">Markdown</button>
      </div>
      <span class="deck-editor-error" role="alert" aria-live="polite"></span>
      <button type="button" data-action="diagram">Diagram</button>
      <button type="button" data-action="cancel">Cancel</button>
      <button type="button" data-action="save" class="deck-editor-save">Save slide</button>
    </div>
    <div class="deck-editor-toolbar-host milkdown" aria-label="Formatting toolbar"></div>
    <div class="deck-editor-source-tools" role="group" aria-label="Insert Markdown" hidden>
      ${Object.entries(markdownInsertTools).map(([tool, label]) => (
        `<button type="button" data-insert="${tool}">${label}</button>`
      )).join("")}
      ${onUploadImage ? '<button type="button" data-action="upload">Upload image</button><input type="file" accept="image/*" hidden>' : ""}
    </div>
    <textarea class="deck-editor-source" aria-label="Slide Markdown source" spellcheck="false" hidden></textarea>`;
  deck.append(panel);
  panel.querySelector(".deck-editor-header").insertBefore(revisionControls, panel.querySelector(".deck-editor-error"));
  panel.append(historyController.panel);
  revisionControls.hidden = false;
  editButton.setAttribute("aria-expanded", "true");
  for (const control of inactiveControls) control.inert = true;
  const source = panel.querySelector(".deck-editor-source");
  const sourceTools = panel.querySelector(".deck-editor-source-tools");
  const toolbarHost = panel.querySelector(".deck-editor-toolbar-host");
  const error = panel.querySelector(".deck-editor-error");
  const save = panel.querySelector('[data-action="save"]');
  source.value = original;
  let view = sourceOnly || initialView === "source" ? "source" : "visual";
  let crepe = null;
  let visualHost = null;
  let titleElement = null;
  let titleChanged = false;
  let visualChanged = false;
  let visualBase = original;
  let visualHeading = originalHeading;
  let busy = true;
  let mediaVersion = 0;
  let mediaKey = mediaKeyFor(slideModel);
  let sourceTimer = null;
  save.disabled = true;
  activeEditor = panel;

  const showError = (message = "") => { error.textContent = message; };
  const fit = () => { if (presentation.slides[slideIndex] === previewRecord) presentation.fitCurrent(); };
  const currentSection = () => {
    if (view === "source" || !crepe) return source.value;
    if (!visualChanged && !titleChanged) return visualBase;
    const heading = titleChanged && titleElement
      ? `${visualHeading.marker} ${titleElement.textContent.trim()}`
      : visualHeading.line;
    const body = visualChanged ? crepe.getMarkdown().trim() : visualHeading.body.trim();
    return [heading, body].filter(Boolean).join("\n\n");
  };

  const updateMedia = (markdown) => {
    const model = processMarkdown(markdown, null).slides[0];
    if (!model || presentation.slides[slideIndex] !== previewRecord) return;
    const slide = previewRecord.element;
    const body = slide.querySelector(".slide-body");
    const images = model.images || [];
    const diagrams = model.diagrams || [];
    const currentMedia = body?.querySelector(".slide-media");
    if (!body) return;
    const nextMediaKey = mediaKeyFor(model);
    if (nextMediaKey === mediaKey) { fit(); return; }
    const version = ++mediaVersion;
    mediaKey = nextMediaKey;
    if (!images.length && !diagrams.length) {
      currentMedia?.remove();
      slide.classList.remove("has-media");
      fit();
      return;
    }
    const media = currentMedia || document.createElement("aside");
    media.className = "slide-media";
    media.classList.toggle("is-single-image", images.length + diagrams.length === 1);
    media.replaceChildren(...images.map((image) => imageSlot(image, assetManager, () => version === mediaVersion, fit)));
    for (const diagram of diagrams) {
      const slot = document.createElement("figure");
      slot.className = "image-slot drawio-slot";
      const frame = document.createElement("iframe");
      frame.className = "drawio-frame";
      frame.title = diagram.title || "Diagram";
      frame.src = diagram.src;
      slot.append(frame);
      media.append(slot);
    }
    if (!currentMedia) body.append(media);
    slide.classList.add("has-media");
    fit();
  };

  const destroyVisual = async () => {
    window.clearTimeout(sourceTimer);
    if (titleElement) {
      titleElement.removeAttribute("contenteditable");
      titleElement.removeAttribute("role");
      titleElement.removeAttribute("aria-label");
    }
    if (!crepe) return;
    const instance = crepe;
    crepe = null;
    try { await instance.destroy(); }
    finally { visualHost?.remove(); visualHost = null; toolbarHost.replaceChildren(); }
  };

  const createVisual = async (value) => {
    const copy = previewRecord.element.querySelector(".slide-copy");
    if (!copy) throw new Error("This slide layout requires Markdown editing.");
    const heading = splitHeading(value);
    visualBase = value;
    visualHeading = heading;
    titleElement = previewRecord.element.querySelector(".slide-title > h1, .slide-title > h2");
    titleChanged = false;
    if (titleElement && heading.marker) {
      titleElement.contentEditable = "plaintext-only";
      titleElement.spellcheck = true;
      titleElement.setAttribute("role", "textbox");
      titleElement.setAttribute("aria-label", "Slide heading");
      titleElement.addEventListener("input", () => { titleChanged = true; fit(); });
      titleElement.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        visualHost?.querySelector(".ProseMirror")?.focus();
      });
    }
    visualHost = document.createElement("div");
    visualHost.className = "deck-editor-inline-root";
    copy.replaceChildren(visualHost);
    const Crepe = await crepeClass();
    crepe = new Crepe({
      root: visualHost,
      defaultValue: heading.body,
      features: {
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.BlockEdit]: false,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file) => {
            if (!onUploadImage) {
              showError("Paste an existing image URL instead of an image file.");
              throw new Error("Add images by URL in this editor.");
            }
            try { return (await onUploadImage(file, currentSection())).reference; }
            catch (cause) { showError(cause.message); throw cause; }
          },
          inlineUploadPlaceholderText: onUploadImage ? "or paste link" : "Paste image URL",
          blockUploadPlaceholderText: onUploadImage ? "or paste link" : "Paste image URL",
          proxyDomURL: (url) => assetManager.getUrl(url).catch(() => url),
        },
      },
    });
    crepe.on((listener) => listener.markdownUpdated(() => {
      visualChanged = true;
      requestAnimationFrame(fit);
      window.clearTimeout(sourceTimer);
      sourceTimer = window.setTimeout(() => updateMedia(currentSection()), 100);
    }));
    await crepe.create();
    const topBar = visualHost.querySelector(".milkdown-top-bar");
    if (topBar) toolbarHost.append(topBar);
    visualChanged = false;
    updateMedia(value);
  };

  const renderSourcePreview = async (value) => {
    const version = ++mediaVersion;
    if (!value.trim()) { showError("The slide is empty; save to remove it."); return; }
    const result = replaceEditableSection(session.markdown, section, value, session.annotationState);
    const models = processMarkdown(result.markdown, null).slides;
    const model = models.find((slide) => slide.sourceStart === section.sourceStart)
      || models.find((slide) => slide.sourceStart >= section.sourceStart);
    if (!model) { showError("The slide is empty; save to remove it."); return; }
    const element = renderSlideElement(model, slideIndex);
    element.classList.add("is-active", "is-live-editing");
    if (version !== mediaVersion) return;
    previewRecord.element.replaceWith(element);
    previewRecord = { model, element, assetsLoaded: false, diagramsLoaded: false };
    mediaKey = mediaKeyFor(model);
    presentation.slides[slideIndex] = previewRecord;
    await presentation.loadAssets(slideIndex);
    fit();
  };

  const setView = (next) => {
    view = next;
    panel.classList.toggle("is-source-mode", view === "source");
    source.hidden = view !== "source";
    sourceTools.hidden = view !== "source";
    toolbarHost.hidden = view !== "visual";
    for (const tab of panel.querySelectorAll('[role="tab"]')) {
      tab.setAttribute("aria-selected", String(tab.dataset.view === view));
      tab.tabIndex = tab.dataset.view === view ? 0 : -1;
    }
  };

  const cleanup = async (restore) => {
    window.clearTimeout(sourceTimer);
    ++mediaVersion;
    await destroyVisual().catch(() => {});
    document.removeEventListener("keydown", handleKeydown, true);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("popstate", cancel);
    historyController.editor = null;
    historyController.close();
    revisionControls.hidden = true;
    deck.append(revisionControls, historyController.panel);
    panel.remove();
    deck.classList.remove("is-live-editing");
    deck.classList.remove("is-url-only-edit");
    editButton.setAttribute("aria-expanded", "false");
    for (const control of inactiveControls) control.inert = false;
    if (restore && presentation.slides[slideIndex] === previewRecord) {
      previewRecord.element.replaceWith(originalRecord.element);
      presentation.slides[slideIndex] = originalRecord;
      presentation.fitCurrent();
    }
    activeEditor = null;
    editButton.focus({ preventScroll: true });
  };
  historyController.editor = {
    beforeRestore: async () => {
      if (busy) return false;
      if (currentSection() !== original) {
        historyController.close();
        showError("Save or cancel your slide changes before restoring a revision.");
        return false;
      }
      busy = true;
      await cleanup(true);
      return true;
    },
    reopen: () => reopen(view),
  };
  const cancel = () => { if (!busy) { busy = true; void cleanup(true); } };
  const handleKeydown = (event) => {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  };
  const handleBeforeUnload = (event) => {
    if (currentSection() === original) return;
    event.preventDefault();
    event.returnValue = "";
  };
  document.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("popstate", cancel);
  panel.querySelector('[data-action="cancel"]').addEventListener("click", cancel);
  panel.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener("click", async () => {
    if (busy || tab.dataset.view === view) return;
    busy = true;
    showError("");
    try {
      if (tab.dataset.view === "source") {
        source.value = currentSection();
        await destroyVisual();
        setView("source");
        await renderSourcePreview(source.value);
        source.focus();
      } else if (needsSourceEditor(source.value)) {
        showError("This slide uses custom Markdown; edit its source to preserve that syntax.");
      } else {
        await createVisual(source.value);
        setView("visual");
      }
    } catch (cause) {
      await destroyVisual().catch(() => {});
      setView("source");
      await renderSourcePreview(source.value).catch(() => {});
      showError(cause.message || "Could not switch editor views.");
    }
    finally { busy = false; }
  }));

  const insertMarkdown = (tool, asset) => {
    const { selectionStart: start, selectionEnd: end, value } = source;
    const text = markdownInsertion(tool, value.slice(0, start), value.slice(start, end), value.slice(end), asset);
    source.focus();
    source.setSelectionRange(start, end);
    if (!document.execCommand?.("insertText", false, text)) {
      source.setRangeText(text, start, end, "end");
      source.dispatchEvent(new Event("input"));
    }
    if (tool === "image" && !asset) {
      const urlStart = start + text.lastIndexOf("https://");
      source.setSelectionRange(urlStart, start + text.length - 1);
    }
  };
  panel.querySelector('[data-action="diagram"]').addEventListener("click", async (event) => {
    if (busy) return;
    const button = event.currentTarget;
    busy = true;
    button.disabled = true;
    save.disabled = true;
    try {
      const { openDiagramEditor } = await import("./diagram-editor.js");
      await openDiagramEditor(deck, onUploadImage && (async (file) => {
        const markdown = currentSection();
        const asset = await onUploadImage(file, markdown);
        if (view === "visual") {
          source.value = markdown;
          await destroyVisual();
          setView("source");
          source.setSelectionRange(markdown.length, markdown.length);
          if (markdown && !markdown.endsWith("\n\n")) {
            source.setRangeText(markdown.endsWith("\n") ? "\n" : "\n\n", markdown.length, markdown.length, "end");
          }
        }
        insertMarkdown("image", asset);
      }));
    } catch (error) {
      showError(error.message || "Could not open the diagram editor.");
    } finally {
      busy = false;
      button.disabled = false;
      save.disabled = false;
      if (view === "source") source.focus();
      else button.focus();
    }
  });
  sourceTools.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-insert]");
    if (button && !busy) insertMarkdown(button.dataset.insert);
  });
  if (onUploadImage) {
    const fileInput = sourceTools.querySelector('input[type="file"]');
    sourceTools.querySelector('[data-action="upload"]').addEventListener("click", () => {
      if (!busy) fileInput.click();
    });
    fileInput.addEventListener("change", async () => {
      const [file] = fileInput.files;
      fileInput.value = "";
      if (!file || busy) return;
      busy = true;
      source.readOnly = true;
      save.disabled = true;
      try {
        const asset = await onUploadImage(file, source.value);
        source.readOnly = false;
        insertMarkdown("image", asset);
      } catch (cause) {
        showError(cause.message || "Could not add the image.");
      } finally {
        source.readOnly = false;
        busy = false;
        save.disabled = false;
      }
    });
  }
  source.addEventListener("input", () => {
    showError("");
    window.clearTimeout(sourceTimer);
    sourceTimer = window.setTimeout(() => { void renderSourcePreview(source.value).catch((cause) => showError(cause.message)); }, 140);
  });
  save.addEventListener("click", async () => {
    if (busy) return;
    const replacement = currentSection();
    if (replacement === original) { busy = true; await cleanup(true); return; }
    busy = true;
    save.disabled = true;
    showError("");
    try {
      if (hasEmbeddedImageData(replacement)) throw new Error("Use an image URL or upload a file, not image data.");
      const result = replaceEditableSection(session.markdown, section, replacement, session.annotationState);
      // The preview must never be reused as a final slide after the deck renders.
      previewRecord.model = null;
      await onSave(result.markdown, result.annotationState, {
        historyLabel: "Edit slide content", slideIndex, sourceStart: section.sourceStart,
      });
      await cleanup(false);
    } catch (cause) {
      showError(cause.message || "Could not save this slide.");
      busy = false;
      save.disabled = false;
    }
  });

  setView(view);
  if (sourceOnly) showError("This slide uses presentation-specific Markdown; edit its source while watching the slide.");
  try {
    if (view === "visual") await createVisual(original);
    else source.focus();
  } catch (cause) {
    await destroyVisual().catch(() => {});
    setView("source");
    await renderSourcePreview(source.value).catch(() => {});
    showError(cause.message || "Could not open the visual editor.");
    source.focus();
  } finally { busy = false; save.disabled = false; fit(); }
}
