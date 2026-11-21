import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import "./deck-editor.css";
import { editableSection, hasEmbeddedImageData, needsSourceEditor, replaceEditableSection } from "./deck-editor-source.js";

let CrepeClass;
let activeDialog = null;

async function crepeClass() {
  CrepeClass ||= (await import("@milkdown/crepe")).Crepe;
  return CrepeClass;
}

export async function openDeckEditor({ session, slideModel, slideIndex, assetManager, onSave, onUploadImage }) {
  if (activeDialog?.open) { activeDialog.focus(); return; }
  const section = editableSection(session.markdown, slideModel);
  const original = section.markdown;
  const sourceOnly = needsSourceEditor(original);
  const dialog = document.createElement("dialog");
  dialog.className = "deck-editor-dialog";
  if (!onUploadImage) dialog.classList.add("is-url-only");
  dialog.setAttribute("aria-label", "Edit slide content");
  dialog.innerHTML = `
    <div class="deck-editor-shell">
      <header class="deck-editor-header">
        <div><strong>Edit slide content</strong><p>Slide ${slideIndex + 1} · Changes apply to this Markdown section</p></div>
        <button type="button" class="deck-editor-close" aria-label="Close editor">×</button>
      </header>
      <div class="deck-editor-tabs" role="tablist" aria-label="Editing view">
        <button type="button" role="tab" data-view="visual">Visual</button>
        <button type="button" role="tab" data-view="source">Markdown</button>
      </div>
      <p class="deck-editor-note" hidden></p>
      <div class="deck-editor-source-tools" aria-label="Presentation Markdown inserts" hidden>
        <button type="button" data-insert="toc">Table of contents</button>
        <button type="button" data-insert="caption">Caption</button>
        <button type="button" data-insert="grouped-table">Grouped table</button>
        <button type="button" data-insert="slide-break">Slide break</button>
      </div>
      <div class="deck-editor-visual" role="tabpanel" aria-label="Visual editor"></div>
      <textarea class="deck-editor-source" aria-label="Slide Markdown source" spellcheck="false" hidden></textarea>
      <footer class="deck-editor-footer">
        <span class="deck-editor-error" role="alert" aria-live="polite"></span>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="save" class="deck-editor-save">Save slide</button>
      </footer>
    </div>`;
  document.body.append(dialog);
  const visual = dialog.querySelector(".deck-editor-visual");
  const source = dialog.querySelector(".deck-editor-source");
  const sourceTools = dialog.querySelector(".deck-editor-source-tools");
  const note = dialog.querySelector(".deck-editor-note");
  const error = dialog.querySelector(".deck-editor-error");
  const save = dialog.querySelector('[data-action="save"]');
  source.value = original;
  let view = sourceOnly ? "source" : "visual";
  let crepe = null;
  let visualChanged = false;
  let busy = true;
  save.disabled = true;

  const showError = (message) => { error.textContent = message || ""; };
  const setView = (nextView) => {
    view = nextView;
    visual.hidden = view !== "visual";
    source.hidden = view !== "source";
    sourceTools.hidden = view !== "source";
    note.hidden = view !== "source" || !needsSourceEditor(source.value);
    for (const tab of dialog.querySelectorAll('[role="tab"]')) {
      tab.setAttribute("aria-selected", String(tab.dataset.view === view));
      tab.tabIndex = tab.dataset.view === view ? 0 : -1;
    }
  };
  const createVisual = async (value) => {
    const Crepe = await crepeClass();
    crepe = new Crepe({
      root: visual,
      defaultValue: value,
      features: { [Crepe.Feature.TopBar]: true },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file) => {
            if (!onUploadImage) {
              showError("Paste an existing image URL instead of an image file.");
              throw new Error("Add images by URL in this editor.");
            }
            try { return await onUploadImage(file, crepe?.getMarkdown() || source.value); }
            catch (cause) { showError(cause.message); throw cause; }
          },
          inlineUploadPlaceholderText: onUploadImage ? "or paste link" : "Paste image URL",
          blockUploadPlaceholderText: onUploadImage ? "or paste link" : "Paste image URL",
          proxyDomURL: (url) => assetManager?.getUrl(url).catch(() => url) || url,
        },
      },
    });
    crepe.on((listener) => listener.markdownUpdated(() => { visualChanged = true; }));
    await crepe.create();
    visualChanged = false;
  };
  const destroyVisual = async () => {
    if (!crepe) return;
    const instance = crepe;
    crepe = null;
    try { await instance.destroy(); }
    finally { visual.replaceChildren(); }
  };
  const close = async () => {
    if (busy) return;
    busy = true;
    dialog.close();
    await destroyVisual();
    dialog.remove();
    activeDialog = null;
  };

  const snippets = {
    toc: "<!-- TOC -->",
    caption: "{: .caption}\nCaption text",
    "grouped-table": "| Metric | ::2_ Group |\n| ^ | First | Second |\n| --- | --- | --- |\n| Item | 1 | 2 |",
    "slide-break": "---",
  };
  sourceTools.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-insert]");
    if (!button) return;
    const snippet = snippets[button.dataset.insert];
    if (!snippet) return;
    const before = source.value.slice(0, source.selectionStart);
    const after = source.value.slice(source.selectionEnd);
    const leading = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const trailing = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    const start = source.selectionStart + leading.length;
    source.setRangeText(`${leading}${snippet}${trailing}`, source.selectionStart, source.selectionEnd, "end");
    source.setSelectionRange(start, start + snippet.length);
    source.focus();
  });

  dialog.querySelector(".deck-editor-close").addEventListener("click", () => { void close(); });
  dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => { void close(); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); void close(); });
  dialog.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener("click", async () => {
    if (busy || tab.dataset.view === view) return;
    busy = true;
    showError("");
    try {
      if (tab.dataset.view === "source") {
        if (visualChanged) source.value = crepe.getMarkdown();
        await destroyVisual();
        setView("source");
        source.focus();
      } else if (needsSourceEditor(source.value)) {
        showError("This slide uses custom Markdown. Keep editing it in the Markdown view to preserve that syntax.");
      } else {
        await createVisual(source.value);
        setView("visual");
      }
    } catch (cause) { await destroyVisual().catch(() => {}); showError(cause.message); }
    finally { busy = false; }
  }));
  save.addEventListener("click", async () => {
    if (busy) return;
    const replacement = view === "visual" && visualChanged ? crepe.getMarkdown() : source.value;
    if (replacement === original) { await close(); return; }
    busy = true;
    save.disabled = true;
    showError("");
    try {
      if (hasEmbeddedImageData(replacement)) throw new Error("Use an existing image URL or upload an image file, not image data.");
      const result = replaceEditableSection(session.markdown, section, replacement, session.annotationState);
      await onSave(result.markdown, result.annotationState, {
        historyLabel: "Edit slide content", slideIndex, sourceStart: section.sourceStart,
      });
      dialog.close();
      await destroyVisual();
      dialog.remove();
      activeDialog = null;
    } catch (cause) {
      showError(cause.message || "Could not save this slide.");
      busy = false;
      save.disabled = false;
    }
  });

  note.textContent = "This slide contains custom Markdown. Edit its source to preserve the presentation syntax.";
  setView(view);
  dialog.showModal();
  activeDialog = dialog;
  try {
    if (view === "visual") await createVisual(original);
    else source.focus();
  } catch (cause) {
    await destroyVisual().catch(() => {});
    showError(cause.message || "Could not open the visual editor.");
    setView("source");
    source.focus();
  } finally { busy = false; save.disabled = false; }
}
