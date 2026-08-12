const ATOMIC_INLINE_SELECTOR = "a, strong, em, code, .katex";
const WORD_PATTERN = /[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}'’\-]*[\p{L}\p{N}\p{M}])?/gu;
const TRAILING_PUNCTUATION = /[.,;:!?…\)\]\}”’]/;

function normalizeComment(text) {
  return String(text || "").trim().replace(/\s+/g, " ").replace(/--+/g, "—");
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(year, month - 1, day));
}

function distanceToRect(x, y, rect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

function outerAtomicInline(node, slide) {
  let atomic = node.parentElement?.closest(ATOMIC_INLINE_SELECTOR);
  if (!atomic || !slide.contains(atomic)) return null;
  while (atomic.parentElement?.matches(ATOMIC_INLINE_SELECTOR) && slide.contains(atomic.parentElement)) {
    atomic = atomic.parentElement;
  }
  return atomic;
}

function nearestTextAnchor(slide, clientX, clientY) {
  const candidates = [];
  const atomicElements = new Set();
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest(".slide-comment, .slide-comment-card, .comment-editor, .comment-context-menu, .image-popover")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    const atomic = outerAtomicInline(node, slide);
    if (atomic) {
      if (atomicElements.has(atomic)) continue;
      atomicElements.add(atomic);
      const text = atomic.textContent.trim();
      const rect = atomic.getBoundingClientRect();
      if (text && rect.width && rect.height) {
        candidates.push({ kind: "element", element: atomic, text, rect });
      }
      continue;
    }

    for (const match of node.textContent.matchAll(WORD_PATTERN)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height) {
        candidates.push({ kind: "text", node, start: match.index, end: match.index + match[0].length, text: match[0], rect });
      }
    }
  }

  let best = null;
  for (const candidate of candidates) {
    const distance = distanceToRect(clientX, clientY, candidate.rect);
    if (!best || distance < best.distance) best = { ...candidate, distance };
  }
  if (!best) return null;

  const prior = candidates.filter((candidate) => candidate !== best && candidate.text === best.text && (
    candidate.rect.top < best.rect.top - 1 || (Math.abs(candidate.rect.top - best.rect.top) <= 1 && candidate.rect.left < best.rect.left)
  )).length;
  best.occurrence = prior;
  return best;
}

function markerInsertionRange(anchor) {
  const range = document.createRange();
  if (anchor.kind === "element") {
    range.setStartAfter(anchor.element);
  } else {
    let end = anchor.end;
    while (end < anchor.node.textContent.length && TRAILING_PUNCTUATION.test(anchor.node.textContent[end])) end += 1;
    range.setStart(anchor.node, end);
  }
  range.collapse(true);
  return range;
}

function findOccurrence(source, text, occurrence = 0) {
  let index = -1;
  for (let count = 0; count <= occurrence; count += 1) {
    index = source.indexOf(text, index + 1);
    if (index < 0) return -1;
  }
  return index;
}

export function markdownInsertionOffset(slideMarkdown, anchorText, occurrence = 0) {
  let index = findOccurrence(slideMarkdown, anchorText, occurrence);
  if (index < 0 && anchorText.includes(" ")) {
    const fallback = anchorText.trim().split(/\s+/).at(-1);
    index = findOccurrence(slideMarkdown, fallback, occurrence);
    if (index >= 0) anchorText = fallback;
  }
  if (index < 0) return slideMarkdown.length;

  let offset = index + anchorText.length;
  let moved = true;
  while (moved) {
    moved = false;
    if (slideMarkdown.startsWith("](", offset)) {
      let depth = 1;
      let cursor = offset + 2;
      while (cursor < slideMarkdown.length && depth > 0) {
        if (slideMarkdown[cursor] === "\\") cursor += 2;
        else {
          if (slideMarkdown[cursor] === "(") depth += 1;
          if (slideMarkdown[cursor] === ")") depth -= 1;
          cursor += 1;
        }
      }
      offset = cursor;
      moved = true;
    }
    const closer = /^(?:\*\*|__|~~|`+|\*|_)/.exec(slideMarkdown.slice(offset));
    if (closer) {
      offset += closer[0].length;
      moved = true;
    }
    while (offset < slideMarkdown.length && TRAILING_PUNCTUATION.test(slideMarkdown[offset])) {
      offset += 1;
      moved = true;
    }
  }
  return offset;
}

function locateSlideStarts(sourceMarkdown, slides) {
  let cursor = 0;
  return slides.map((slide) => {
    const markdown = slide.model.markdown || "";
    const index = markdown ? sourceMarkdown.indexOf(markdown, cursor) : -1;
    if (index >= 0) cursor = index + markdown.length;
    return index;
  });
}

export function annotatedMarkdown(sourceMarkdown, comments) {
  const insertions = comments
    .filter((comment) => Number.isInteger(comment.sourceOffset))
    .map((comment, order) => ({
      offset: Math.max(0, Math.min(comment.sourceOffset, sourceMarkdown.length)),
      order,
      value: `<!-- ${comment.date}: ${normalizeComment(comment.text)} -->`,
    }))
    .sort((a, b) => b.offset - a.offset || b.order - a.order);

  let result = sourceMarkdown;
  for (const insertion of insertions) {
    const before = insertion.offset > 0 && !/\s/.test(result[insertion.offset - 1]) ? " " : "";
    const after = insertion.offset < result.length && !/\s/.test(result[insertion.offset]) ? " " : "";
    result = `${result.slice(0, insertion.offset)}${before}${insertion.value}${after}${result.slice(insertion.offset)}`;
  }
  return result;
}

export function commentsMarkdown(title, comments) {
  const heading = String(title || "Presentation").trim() || "Presentation";
  const entries = comments.map((comment) => `${comment.date}: ${normalizeComment(comment.text)}`);
  return `# ${heading} comments\n\n${entries.join("\n\n")}\n`;
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenameParts(path) {
  const filename = String(path || "presentation.md").split("/").pop() || "presentation.md";
  const stem = filename.replace(/\.(?:md|markdown)$/i, "") || "presentation";
  return { filename, stem };
}

export class AnnotationManager {
  constructor({ stage, deck, downloadButton, presentation, sourceMarkdown, sourcePath, title, onUpload }) {
    this.stage = stage;
    this.deck = deck;
    this.downloadButton = downloadButton;
    this.presentation = presentation;
    this.sourceMarkdown = sourceMarkdown || "";
    this.sourcePath = sourcePath || "presentation.md";
    this.title = title || "Presentation";
    this.onUpload = onUpload;
    this.comments = [];
    this.revision = 0;
    this.savedRevision = 0;
    this.slideStarts = locateSlideStarts(this.sourceMarkdown, presentation.slides);
    this.pendingAnchor = null;
    this.pendingClose = null;
    this.allowUnload = false;
    this.unsavedIndicator = document.createElement("p");
    this.unsavedIndicator.className = "unsaved-comment-count";
    this.unsavedIndicator.hidden = true;
    this.unsavedIndicator.setAttribute("aria-live", "polite");
    deck.append(this.unsavedIndicator);

    this.handleContextMenu = (event) => this.onContextMenu(event);
    this.handleStageClick = (event) => this.onStageClick(event);
    this.handleDocumentClick = (event) => this.onDocumentClick(event);
    this.handleKeydown = (event) => this.onKeydown(event);
    this.handleBeforeUnload = (event) => this.onBeforeUnload(event);
    this.handleViewportChange = () => this.positionUnsavedIndicator();
    this.handleDownload = (event) => {
      event.stopPropagation();
      this.toggleSaveMenu();
    };

    stage.addEventListener("contextmenu", this.handleContextMenu);
    stage.addEventListener("click", this.handleStageClick, true);
    document.addEventListener("click", this.handleDocumentClick);
    document.addEventListener("keydown", this.handleKeydown, true);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    window.addEventListener("resize", this.handleViewportChange);
    document.addEventListener("fullscreenchange", this.handleViewportChange);
    downloadButton.addEventListener("click", this.handleDownload);
    this.syncDownloadButton();
  }

  get dirty() { return this.comments.length > 0 && this.revision !== this.savedRevision; }

  onContextMenu(event) {
    const slide = event.target.closest?.(".slide.is-active");
    if (!slide || event.target.closest(".image-popover, .comment-editor, .slide-comment, .slide-comment-card")) return;
    event.preventDefault();
    event.stopPropagation();
    this.dismissMenus();
    const slideIndex = this.presentation.slides.findIndex(({ element }) => element === slide);
    this.pendingAnchor = {
      slide,
      slideIndex,
      clientX: event.clientX,
      clientY: event.clientY,
      anchor: nearestTextAnchor(slide, event.clientX, event.clientY),
    };
    this.openContextMenu();
  }

  openContextMenu() {
    const { slide, clientX, clientY } = this.pendingAnchor;
    const rect = slide.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "comment-context-menu";
    menu.setAttribute("role", "menu");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = "Add comment";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.remove();
      this.openEditor(clientX - rect.left, clientY - rect.top);
    });
    menu.append(button);
    slide.append(menu);
    const left = Math.max(8, Math.min(clientX - rect.left, slide.clientWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(clientY - rect.top, slide.clientHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    button.focus({ preventScroll: true });
  }

  openEditor(left, top) {
    const { slide } = this.pendingAnchor;
    const date = localDate();
    const editor = document.createElement("form");
    editor.className = "comment-editor";
    editor.innerHTML = `
      <label><span>${displayDate(date)}</span><textarea rows="3" aria-label="Comment" required></textarea></label>
      <div><button type="button" data-action="cancel">Cancel</button><button type="submit">Add comment</button></div>`;
    editor.addEventListener("click", (event) => event.stopPropagation());
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        editor.requestSubmit();
      }
    });
    editor.querySelector('[data-action="cancel"]').addEventListener("click", () => this.closeEditor());
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = normalizeComment(editor.querySelector("textarea").value);
      if (!text) return;
      this.addComment(text, date);
      editor.remove();
    });
    slide.append(editor);
    editor.style.left = `${Math.max(8, Math.min(left, slide.clientWidth - editor.offsetWidth - 8))}px`;
    editor.style.top = `${Math.max(8, Math.min(top, slide.clientHeight - editor.offsetHeight - 8))}px`;
    editor.querySelector("textarea").focus({ preventScroll: true });
  }

  addComment(text, date) {
    const { slide, slideIndex, anchor, clientX, clientY } = this.pendingAnchor;
    const slideStart = this.slideStarts[slideIndex];
    const slideMarkdown = this.presentation.slides[slideIndex]?.model.markdown || "";
    const localOffset = anchor ? markdownInsertionOffset(slideMarkdown, anchor.text, anchor.occurrence) : slideMarkdown.length;
    const sourceOffset = slideStart >= 0 ? slideStart + localOffset : this.sourceMarkdown.length;
    const comment = { id: crypto.randomUUID(), date, text, slideIndex, sourceOffset };
    const marker = this.createMarker(comment);

    if (anchor) markerInsertionRange(anchor).insertNode(marker);
    else {
      const rect = slide.getBoundingClientRect();
      marker.classList.add("is-free-positioned");
      marker.style.left = `${Math.max(8, Math.min(clientX - rect.left, slide.clientWidth - 30))}px`;
      marker.style.top = `${Math.max(8, Math.min(clientY - rect.top, slide.clientHeight - 30))}px`;
      slide.append(marker);
    }

    comment.marker = marker;
    this.comments.push(comment);
    this.revision += 1;
    this.syncDownloadButton();
    this.presentation.fitCurrent();
    this.pendingAnchor = null;
  }

  createMarker(comment) {
    const marker = document.createElement("span");
    marker.className = "slide-comment";
    marker.tabIndex = 0;
    marker.setAttribute("role", "button");
    marker.setAttribute("aria-label", `Comment from ${displayDate(comment.date)}`);
    marker.innerHTML = `<span class="slide-comment-dot" aria-hidden="true"></span><span class="slide-comment-card"><strong>${displayDate(comment.date)}</strong><span></span></span>`;
    const card = marker.querySelector(".slide-comment-card");
    marker.commentCard = card;
    card.querySelector(":scope > span").textContent = comment.text;
    card.addEventListener("click", (event) => event.stopPropagation());
    const toggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const expanding = !marker.classList.contains("is-expanded");
      this.collapseComments(marker);
      marker.classList.toggle("is-expanded", expanding);
      marker.setAttribute("aria-expanded", String(expanding));
      if (expanding) {
        marker.closest(".slide")?.append(card);
        card.classList.add("is-floating");
        this.positionCommentCard(marker);
      } else {
        this.parkCommentCard(marker);
      }
    };
    marker.addEventListener("click", toggle);
    marker.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) toggle(event);
    });
    return marker;
  }

  positionCommentCard(marker) {
    const card = marker.commentCard;
    const slide = marker.closest(".slide");
    if (!card || !slide) return;
    const slideRect = slide.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const gap = 6;
    const left = Math.max(8, Math.min(
      markerRect.left - slideRect.left + markerRect.width / 2 - cardRect.width / 2,
      slide.clientWidth - cardRect.width - 8,
    ));
    const above = markerRect.top - slideRect.top - cardRect.height - gap;
    const below = markerRect.bottom - slideRect.top + gap;
    const top = above >= 8 ? above : Math.min(below, slide.clientHeight - cardRect.height - 8);
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(8, top)}px`;
  }

  onStageClick(event) {
    if (event.target.closest?.(".slide-comment, .slide-comment-card, .comment-editor, .comment-context-menu")) return;
    this.collapseComments();
    this.removeContextMenu();
  }

  onDocumentClick(event) {
    if (event.target.closest?.(".comment-save-menu, #download-comments")) return;
    if (this.deck.querySelector(".comment-save-menu")) this.pendingClose = null;
    this.closeSaveMenu();
    if (!this.stage.contains(event.target)) this.collapseComments();
  }

  onKeydown(event) {
    if (event.key !== "Escape") return;
    if (this.deck.querySelector(".comment-editor")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closeEditor();
    } else if (this.deck.querySelector(".comment-context-menu, .comment-save-menu") || this.deck.querySelector(".slide-comment.is-expanded")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pendingClose = null;
      this.dismissMenus();
      this.collapseComments();
    }
  }

  onBeforeUnload(event) {
    if (!this.dirty || this.allowUnload) return;
    if (!this.deck.querySelector(".comment-save-menu")) this.openSaveMenu(true);
    event.preventDefault();
    event.returnValue = "";
  }

  toggleSaveMenu() {
    if (this.deck.querySelector(".comment-save-menu")) this.closeSaveMenu();
    else this.openSaveMenu(false);
  }

  openSaveMenu(closing) {
    this.closeSaveMenu();
    const menu = document.createElement("section");
    menu.className = "comment-save-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", closing ? "Save comments before closing" : "Download comments");
    const heading = document.createElement("strong");
    heading.textContent = closing ? "Save comments before closing?" : "Download comments";
    menu.append(heading);

    const actions = [
      ["Download annotated Markdown document", () => this.downloadAnnotated()],
      ["Download just comments", () => this.downloadComments()],
    ];
    if (this.onUpload) actions.push(["Download annotated Markdown and open GitHub upload", () => this.downloadAndUpload()]);
    for (const [label, action] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
        this.finishPendingClose();
      });
      menu.append(button);
    }
    if (closing) {
      const discard = document.createElement("button");
      discard.type = "button";
      discard.className = "is-secondary";
      discard.textContent = "Close without saving";
      discard.addEventListener("click", (event) => {
        event.stopPropagation();
        this.allowUnload = true;
        this.finishPendingClose();
      });
      menu.append(discard);
    }
    this.deck.append(menu);
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  downloadAnnotated() {
    const { filename } = filenameParts(this.sourcePath);
    downloadText(filename, annotatedMarkdown(this.sourceMarkdown, this.comments));
    this.markSaved();
  }

  downloadComments() {
    const { stem } = filenameParts(this.sourcePath);
    downloadText(`${stem}-comments.md`, commentsMarkdown(this.title, this.comments));
    this.markSaved();
  }

  downloadAndUpload() {
    this.downloadAnnotated();
    this.onUpload?.();
  }

  markSaved() {
    this.savedRevision = this.revision;
    this.syncUnsavedIndicator();
  }

  requestClose(callback) {
    if (!this.dirty) {
      this.allowUnload = true;
      callback();
      return;
    }
    this.pendingClose = callback;
    this.openSaveMenu(true);
  }

  finishPendingClose() {
    const callback = this.pendingClose;
    this.pendingClose = null;
    this.closeSaveMenu();
    if (callback) {
      this.allowUnload = true;
      window.setTimeout(callback, 0);
    }
  }

  collapseComments(except = null) {
    this.deck.querySelectorAll(".slide-comment.is-expanded").forEach((marker) => {
      if (marker !== except) {
        marker.classList.remove("is-expanded");
        marker.setAttribute("aria-expanded", "false");
        this.parkCommentCard(marker);
      }
    });
  }

  parkCommentCard(marker) {
    const card = marker.commentCard;
    if (!card) return;
    card.classList.remove("is-floating");
    card.style.removeProperty("left");
    card.style.removeProperty("top");
    marker.append(card);
  }

  removeContextMenu() { this.deck.querySelector(".comment-context-menu")?.remove(); }
  closeEditor() { this.deck.querySelector(".comment-editor")?.remove(); this.pendingAnchor = null; }
  closeSaveMenu() { this.deck.querySelector(".comment-save-menu")?.remove(); }
  dismissMenus() { this.removeContextMenu(); this.closeEditor(); this.closeSaveMenu(); }
  syncDownloadButton() {
    this.downloadButton.hidden = this.comments.length === 0;
    this.syncUnsavedIndicator();
  }

  syncUnsavedIndicator() {
    const count = Math.max(0, this.revision - this.savedRevision);
    this.unsavedIndicator.hidden = count === 0;
    this.unsavedIndicator.textContent = count === 1 ? "1 unsaved comment" : `${count} unsaved comments`;
    if (count) this.positionUnsavedIndicator();
  }

  positionUnsavedIndicator() {
    if (this.unsavedIndicator.hidden) return;
    const slide = this.presentation.slides[this.presentation.index]?.element;
    if (!slide?.classList.contains("is-active")) return;
    const rect = slide.getBoundingClientRect();
    this.unsavedIndicator.style.top = `${rect.bottom + 7}px`;
    this.unsavedIndicator.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
  }

  destroy() {
    this.dismissMenus();
    this.stage.removeEventListener("contextmenu", this.handleContextMenu);
    this.stage.removeEventListener("click", this.handleStageClick, true);
    document.removeEventListener("click", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleKeydown, true);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    window.removeEventListener("resize", this.handleViewportChange);
    document.removeEventListener("fullscreenchange", this.handleViewportChange);
    this.downloadButton.removeEventListener("click", this.handleDownload);
    this.downloadButton.hidden = true;
    this.unsavedIndicator.remove();
  }
}
