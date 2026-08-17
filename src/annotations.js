const ATOMIC_INLINE_SELECTOR = "a, strong, em, code, .katex";
const EDITABLE_SOURCE_SELECTOR = "h1[data-source-start], h2[data-source-start], h3[data-source-start], h4[data-source-start], h5[data-source-start], h6[data-source-start], p[data-source-start], li[data-source-start]";
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

function textAnchorForOccurrence(slide, text, occurrence = 0) {
  let seen = 0;
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
      if (atomic.textContent.trim() === text && seen++ === occurrence) return { kind: "element", element: atomic };
      continue;
    }
    for (const match of node.textContent.matchAll(WORD_PATTERN)) {
      if (match[0] === text && seen++ === occurrence) {
        return { kind: "text", node, start: match.index, end: match.index + match[0].length };
      }
    }
  }
  return null;
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
  let previousStart = -1;
  return slides.map((slide) => {
    const markdown = slide.model.markdown || "";
    if (slide.model.continuation) return previousStart;
    const index = markdown ? sourceMarkdown.indexOf(markdown, cursor) : -1;
    if (index >= 0) {
      cursor = index + markdown.length;
      previousStart = index;
    }
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

export function replaceMarkdownFragment(sourceMarkdown, fragment, replacement, startHint = 0) {
  const source = String(sourceMarkdown || "");
  const original = String(fragment || "");
  const preferredStart = Math.max(0, Number.isInteger(startHint) ? startHint : 0);
  const start = source.startsWith(original, preferredStart)
    ? preferredStart
    : source.indexOf(original, preferredStart);
  if (!original || start < 0) throw new Error("The Markdown section could not be located in the source document.");
  return {
    markdown: `${source.slice(0, start)}${replacement}${source.slice(start + original.length)}`,
    start,
  };
}

export function replaceMarkdownRange(sourceMarkdown, start, end, replacement) {
  const source = String(sourceMarkdown || "");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) {
    throw new Error("The edited element no longer matches the Markdown source.");
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

export function remapCommentOffsets(comments, start, end, original, replacement) {
  const before = String(original || "");
  const after = String(replacement || "");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  const delta = after.length - before.length;
  return comments.map((comment) => {
    const offset = comment.sourceOffset;
    if (!Number.isInteger(offset) || offset <= start) return { ...comment };
    if (offset >= end) return { ...comment, sourceOffset: offset + delta };
    if (!after.length) {
      return { ...comment, sourceOffset: start, anchorText: "", anchorOccurrence: 0 };
    }
    const relative = offset - start;
    if (relative <= prefix) return { ...comment };
    if (relative >= before.length - suffix) {
      return { ...comment, sourceOffset: start + after.length - (before.length - relative) };
    }
    return { ...comment, sourceOffset: start + prefix };
  });
}

function commentSnapshot(comment) {
  const { marker, ...snapshot } = comment;
  return { ...snapshot };
}

function escapedMarkdownText(text) {
  return String(text || "").replace(/[\\`*_[\]<>]/g, "\\$&");
}

function inlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapedMarkdownText(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches("[data-generated-label], .slide-comment, .slide-comment-card")) return "";
  if (node.matches(".katex")) {
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    return tex ? `$${tex}$` : escapedMarkdownText(node.textContent);
  }
  const children = () => [...node.childNodes].map(inlineMarkdown).join("");
  if (node.matches("strong, b")) return `**${children()}**`;
  if (node.matches("em, i")) return `*${children()}*`;
  if (node.matches("del, s")) return `~~${children()}~~`;
  if (node.matches("code")) {
    const text = node.textContent || "";
    const fence = text.includes("`") ? "``" : "`";
    return `${fence}${text}${fence}`;
  }
  if (node.matches("a")) {
    const href = node.getAttribute("href") || "";
    const title = node.getAttribute("title");
    return `[${children()}](${href}${title ? ` \"${title.replace(/\"/g, "\\\"")}\"` : ""})`;
  }
  if (node.matches("br")) return "<br>";
  return children();
}

function trailingWhitespace(markdown) {
  return /\s*$/.exec(markdown)?.[0] || "";
}

function directListItemMarkdown(element) {
  return [...element.childNodes]
    .filter((node) => node.nodeType !== Node.ELEMENT_NODE || !node.matches("ul, ol, [data-generated-label]"))
    .map((node) => node.nodeType === Node.ELEMENT_NODE && node.matches("p") ? inlineMarkdown(node) : inlineMarkdown(node))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasEditableListContent(markdown) {
  return String(markdown || "").replace(/<br\s*\/?\s*>/gi, "").trim().length > 0;
}

function editedElementMarkdown(element, originalMarkdown) {
  const trailing = trailingWhitespace(originalMarkdown);
  if (element.matches("h1, h2, h3, h4, h5, h6")) {
    const level = Number(element.tagName.slice(1));
    return `${"#".repeat(level)} ${inlineMarkdown(element).trim()}${trailing}`;
  }
  if (element.matches("p")) return `${inlineMarkdown(element).trim()}${trailing}`;
  if (element.matches("li")) {
    const marker = /^(\s*(?:[-+*]|\d+[.)])\s+)/.exec(originalMarkdown)?.[1];
    if (!marker) throw new Error("The list marker could not be located in the Markdown source.");
    const taskMarker = /^(?:\s*(?:[-+*]|\d+[.)])\s+)(\[[ xX]\]\s+)/.exec(originalMarkdown)?.[1] || "";
    const itemStart = Number(element.dataset.sourceStart);
    const nestedStarts = [...element.querySelectorAll(":scope > ul[data-source-start], :scope > ol[data-source-start]")]
      .map((list) => Number(list.dataset.sourceStart) - itemStart)
      .filter((start) => Number.isInteger(start) && start >= 0);
    if (nestedStarts.length) {
      const nestedStart = Math.min(...nestedStarts);
      const nestedLineStart = originalMarkdown.lastIndexOf("\n", nestedStart) + 1;
      return `${marker}${taskMarker}${directListItemMarkdown(element)}\n${originalMarkdown.slice(nestedLineStart)}`;
    }
    return `${marker}${taskMarker}${directListItemMarkdown(element)}${trailing}`;
  }
  throw new Error("This rendered element cannot be edited as Markdown.");
}

function listItemMarker(originalMarkdown, offset = 0) {
  const match = /^(\s*)([-+*]|(\d+)([.)]))(\s+)/.exec(originalMarkdown);
  if (!match) throw new Error("The list marker could not be located in the Markdown source.");
  const marker = match[3] ? `${Number(match[3]) + offset}${match[4]}` : match[2];
  const task = /^(?:\s*(?:[-+*]|\d+[.)])\s+)\[[ xX]\]\s+/.test(originalMarkdown) ? "[ ] " : "";
  return `${match[1]}${marker}${match[5]}${task}`;
}

function editedListItemsMarkdown(element, createdItems, originalMarkdown) {
  const first = editedElementMarkdown(element, originalMarkdown);
  const firstContent = directListItemMarkdown(element);
  const keepFirst = hasEditableListContent(firstContent) || Boolean(element.querySelector(":scope > ul, :scope > ol"));
  const additions = createdItems
    .map((item) => directListItemMarkdown(item))
    .filter(hasEditableListContent);
  if (!keepFirst && !additions.length) return "";
  if (keepFirst && !additions.length) return first;
  const trailing = trailingWhitespace(first);
  const body = trailing ? first.slice(0, -trailing.length) : first;
  const offset = keepFirst ? 1 : 0;
  const addedItems = additions.map((content, index) => `${listItemMarker(originalMarkdown, index + offset)}${content}`);
  return `${keepFirst ? `${body}\n` : ""}${addedItems.join("\n")}${trailing}`;
}

function insertLineBreak(element) {
  if (document.execCommand?.("insertLineBreak")) return;
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !element.contains(range.startContainer)) return;
  range.deleteContents();
  const lineBreak = document.createElement("br");
  range.insertNode(lineBreak);
  range.setStartAfter(lineBreak);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function sourceElementAt(target, slide, slideMarkdown) {
  const element = target.closest?.(EDITABLE_SOURCE_SELECTOR);
  if (!element || !slide.contains(element)) return null;
  const start = Number(element.dataset.sourceStart);
  const end = Number(element.dataset.sourceEnd);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > slideMarkdown.length) return null;
  const source = slideMarkdown.slice(start, end);
  if (/!\[[^\]]*\]\([^)]*\)/.test(source)) return null;
  return element;
}

export function commentsMarkdown(title, comments) {
  const heading = String(title || "Presentation").trim() || "Presentation";
  const entries = comments.map((comment) => `${comment.date}: ${normalizeComment(comment.text)}`);
  return `# ${heading} comments\n\n${entries.join("\n\n")}\n`;
}

export function changeStatusText(markdownModified, editCount, commentCount) {
  const messages = [];
  if (markdownModified) {
    const count = Math.max(1, Number(editCount) || 0);
    messages.push(`Markdown modified (${count} ${count === 1 ? "edit" : "edits"})`);
  }
  if (commentCount > 0) {
    messages.push(`${commentCount} ${commentCount === 1 ? "comment" : "comments"} added`);
  }
  return messages.join(" • ");
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
  constructor({ stage, deck, downloadButton, presentation, sourceMarkdown, originalSourceMarkdown, sourcePath, title, onUpload, onMarkdownChange, onStateChange, onDiscard, discardLabel = "Continue without saving", annotationState }) {
    this.stage = stage;
    this.deck = deck;
    this.downloadButton = downloadButton;
    this.presentation = presentation;
    this.sourceMarkdown = sourceMarkdown || "";
    this.originalSourceMarkdown = originalSourceMarkdown ?? this.sourceMarkdown;
    this.sourcePath = sourcePath || "presentation.md";
    this.title = title || "Presentation";
    this.onUpload = onUpload;
    this.onMarkdownChange = onMarkdownChange;
    this.onStateChange = onStateChange;
    this.onDiscard = onDiscard;
    this.discardLabel = discardLabel;
    this.stateChangePromise = Promise.resolve();
    this.comments = (annotationState?.comments || []).map(commentSnapshot);
    this.revision = annotationState?.revision ?? this.comments.length;
    this.savedRevision = annotationState?.savedRevision ?? 0;
    this.editCount = annotationState?.editCount ?? (this.sourceChanged ? 1 : 0);
    this.slideStarts = locateSlideStarts(this.sourceMarkdown, presentation.slides);
    this.pendingAnchor = null;
    this.pendingClose = null;
    this.allowUnload = false;
    this.inlineEdit = null;
    this.unsavedIndicator = deck.querySelector("#change-status, .unsaved-comment-count");
    this.ownsUnsavedIndicator = !this.unsavedIndicator;
    if (!this.unsavedIndicator) {
      this.unsavedIndicator = document.createElement("p");
      this.unsavedIndicator.className = "unsaved-comment-count";
      this.unsavedIndicator.setAttribute("aria-live", "polite");
      deck.append(this.unsavedIndicator);
    }
    this.unsavedIndicator.hidden = true;
    this.indicatorPositionRequest = 0;

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
    this.restoreComments();
    this.syncDownloadButton();
  }

  get sourceChanged() { return this.sourceMarkdown !== this.originalSourceMarkdown; }
  get dirty() { return this.sourceChanged || (this.comments.length > 0 && this.revision !== this.savedRevision); }

  onContextMenu(event) {
    const slide = event.target.closest?.(".slide.is-active");
    if (!slide || event.target.closest(".image-popover, .comment-editor, .is-inline-editing, .slide-comment, .slide-comment-card")) return;
    event.preventDefault();
    event.stopPropagation();
    this.dismissMenus();
    const slideIndex = this.presentation.slides.findIndex(({ element }) => element === slide);
    const slideMarkdown = this.presentation.slides[slideIndex]?.model.markdown || "";
    this.pendingAnchor = {
      slide,
      slideIndex,
      clientX: event.clientX,
      clientY: event.clientY,
      anchor: nearestTextAnchor(slide, event.clientX, event.clientY),
      editElement: sourceElementAt(event.target, slide, slideMarkdown),
    };
    this.openContextMenu();
  }

  openContextMenu() {
    const { slide, clientX, clientY } = this.pendingAnchor;
    const rect = slide.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "comment-context-menu";
    menu.setAttribute("role", "menu");
    const actions = [];
    const slideStart = this.slideStarts[this.pendingAnchor.slideIndex];
    const slideMarkdown = this.presentation.slides[this.pendingAnchor.slideIndex]?.model.markdown || "";
    if (this.onMarkdownChange && slideStart >= 0 && slideMarkdown && this.pendingAnchor.editElement) {
      actions.push(["Edit", (event) => {
        event.stopPropagation();
        menu.remove();
        this.startInlineEditing();
      }]);
    }
    actions.push(["Add comment", (event) => {
      event.stopPropagation();
      menu.remove();
      this.openEditor(clientX - rect.left, clientY - rect.top);
    }]);
    for (const [label, action] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", action);
      button.addEventListener("pointerenter", () => button.focus({ preventScroll: true }));
      menu.append(button);
    }
    menu.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.querySelectorAll('[role="menuitem"]')];
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    });
    slide.append(menu);
    const left = Math.max(8, Math.min(clientX - rect.left, slide.clientWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(clientY - rect.top, slide.clientHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  startInlineEditing() {
    const { slideIndex, editElement: element, clientX, clientY } = this.pendingAnchor;
    const slideStart = this.slideStarts[slideIndex];
    const slideMarkdown = this.presentation.slides[slideIndex]?.model.markdown || "";
    const localStart = Number(element?.dataset.sourceStart);
    const localEnd = Number(element?.dataset.sourceEnd);
    if (!element || slideStart < 0 || !slideMarkdown || !Number.isInteger(localStart) || !Number.isInteger(localEnd)) return;

    this.inlineEdit = {
      element,
      createdItems: [],
      handlers: new Map(),
      slideIndex,
      slideStart,
      localStart,
      localEnd,
      originalHtml: element.innerHTML,
      originalMarkdown: slideMarkdown.slice(localStart, localEnd),
      originalAriaLabel: element.getAttribute("aria-label"),
      committing: false,
    };
    this.lockInlineNestedLists();
    this.activateInlineElement(element);
    element.focus({ preventScroll: true });
    this.placeInlineCaret(element, clientX, clientY);
  }

  lockInlineNestedLists() {
    this.inlineEdit?.element.querySelectorAll(":scope > ul, :scope > ol").forEach((list) => {
      list.contentEditable = "false";
      list.dataset.inlineEditLocked = "";
    });
  }

  unlockInlineNestedLists() {
    this.inlineEdit?.element.querySelectorAll("[data-inline-edit-locked]").forEach((list) => {
      list.removeAttribute("contenteditable");
      delete list.dataset.inlineEditLocked;
    });
  }

  activateInlineElement(element) {
    const edit = this.inlineEdit;
    if (!edit) return;
    element.contentEditable = "true";
    element.spellcheck = true;
    element.classList.add("is-inline-editing");
    element.setAttribute("role", "textbox");
    element.setAttribute("aria-label", "Edit slide content");
    const keydown = (event) => this.onInlineEditKeydown(event);
    const blur = () => this.onInlineEditBlur();
    edit.handlers.set(element, { keydown, blur });
    element.addEventListener("keydown", keydown);
    element.addEventListener("blur", blur);
  }

  onInlineEditKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancelInlineEditing();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      this.commitInlineEditing();
    } else if (event.currentTarget.matches("li") && !event.shiftKey) {
      this.addInlineListItem(event.currentTarget);
    } else {
      insertLineBreak(event.currentTarget);
    }
  }

  onInlineEditBlur() {
    window.setTimeout(() => {
      const edit = this.inlineEdit;
      if (!edit || edit.committing) return;
      const focused = document.activeElement;
      if ([...edit.handlers.keys()].some((element) => element === focused || element.contains(focused))) return;
      this.commitInlineEditing();
    }, 0);
  }

  addInlineListItem(after) {
    const edit = this.inlineEdit;
    if (!edit) return;
    const item = document.createElement("li");
    item.append(document.createElement("br"));
    after.after(item);
    edit.createdItems.push(item);
    this.activateInlineElement(item);
    item.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(item, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    this.presentation.fitCurrent();
  }

  placeInlineCaret(element, clientX, clientY) {
    const range = document.caretRangeFromPoint?.(clientX, clientY);
    if (!range || !element.contains(range.startContainer) || range.startContainer.parentElement?.closest("[data-generated-label]")) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  finishInlineEditing() {
    const edit = this.inlineEdit;
    if (!edit) return;
    this.unlockInlineNestedLists();
    for (const [element, handlers] of edit.handlers) {
      element.removeEventListener("keydown", handlers.keydown);
      element.removeEventListener("blur", handlers.blur);
      element.removeAttribute("contenteditable");
      element.removeAttribute("spellcheck");
      element.removeAttribute("role");
      if (element === edit.element && edit.originalAriaLabel !== null) element.setAttribute("aria-label", edit.originalAriaLabel);
      else element.removeAttribute("aria-label");
      element.removeAttribute("aria-invalid");
      element.removeAttribute("title");
      element.classList.remove("is-inline-editing", "has-inline-edit-error");
    }
  }

  cancelInlineEditing() {
    const edit = this.inlineEdit;
    if (!edit || edit.committing) return;
    edit.element.innerHTML = edit.originalHtml;
    this.finishInlineEditing();
    edit.createdItems.forEach((item) => item.remove());
    this.inlineEdit = null;
    this.pendingAnchor = null;
    this.rebuildCommentMarkers();
  }

  async commitInlineEditing() {
    const edit = this.inlineEdit;
    if (!edit || edit.committing) return;
    this.unlockInlineNestedLists();
    if (edit.element.innerHTML === edit.originalHtml && !edit.createdItems.length) {
      this.finishInlineEditing();
      this.inlineEdit = null;
      this.pendingAnchor = null;
      return;
    }
    edit.committing = true;
    try {
      const replacement = edit.element.matches("li")
        ? editedListItemsMarkdown(edit.element, edit.createdItems, edit.originalMarkdown)
        : editedElementMarkdown(edit.element, edit.originalMarkdown);
      const absoluteStart = edit.slideStart + edit.localStart;
      const absoluteEnd = edit.slideStart + edit.localEnd;
      const markdown = replaceMarkdownRange(this.sourceMarkdown, absoluteStart, absoluteEnd, replacement);
      const comments = remapCommentOffsets(this.comments.map(commentSnapshot), absoluteStart, absoluteEnd, edit.originalMarkdown, replacement);
      const editCount = markdown === this.originalSourceMarkdown
        ? 0
        : this.editCount + (markdown === this.sourceMarkdown ? 0 : 1);
      this.finishInlineEditing();
      await this.onMarkdownChange(markdown, {
        slideIndex: edit.slideIndex,
        sourceStart: absoluteStart,
        annotationState: {
          comments,
          revision: this.revision,
          savedRevision: this.savedRevision,
          editCount,
          originalSourceMarkdown: this.originalSourceMarkdown,
        },
      });
    } catch (error) {
      edit.committing = false;
      this.lockInlineNestedLists();
      for (const [element, handlers] of edit.handlers) {
        element.contentEditable = "true";
        element.setAttribute("role", "textbox");
        element.setAttribute("aria-label", "Edit slide content");
        element.classList.add("is-inline-editing");
        element.addEventListener("keydown", handlers.keydown);
        element.addEventListener("blur", handlers.blur);
      }
      edit.element.classList.add("has-inline-edit-error");
      edit.element.setAttribute("aria-invalid", "true");
      edit.element.title = error?.message || String(error);
      edit.element.focus({ preventScroll: true });
    }
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
    const comment = {
      id: crypto.randomUUID(),
      date,
      text,
      slideIndex,
      sourceOffset,
      anchorText: anchor?.text || "",
      anchorOccurrence: anchor?.occurrence || 0,
    };
    const marker = this.createMarker(comment);

    if (anchor) markerInsertionRange(anchor).insertNode(marker);
    else {
      const rect = slide.getBoundingClientRect();
      marker.classList.add("is-free-positioned");
      const left = Math.max(8, Math.min(clientX - rect.left, slide.clientWidth - 30));
      const top = Math.max(8, Math.min(clientY - rect.top, slide.clientHeight - 30));
      marker.style.left = `${left}px`;
      marker.style.top = `${top}px`;
      comment.freePosition = { x: left / slide.clientWidth, y: top / slide.clientHeight };
      slide.append(marker);
    }

    comment.marker = marker;
    this.comments.push(comment);
    this.revision += 1;
    this.syncDownloadButton();
    this.presentation.fitCurrent();
    this.pendingAnchor = null;
  }

  restoreComments() {
    for (const comment of this.comments) {
      const candidates = this.presentation.slides
        .map((slide, index) => ({ slide, index, start: this.slideStarts[index] }))
        .filter(({ slide, start }) => start >= 0 && comment.sourceOffset >= start && comment.sourceOffset <= start + (slide.model.markdown || "").length);
      let placement = null;
      for (const candidate of candidates) {
        const anchor = comment.anchorText
          ? textAnchorForOccurrence(candidate.slide.element, comment.anchorText, comment.anchorOccurrence)
            || textAnchorForOccurrence(candidate.slide.element, comment.anchorText, 0)
          : null;
        if (anchor) {
          placement = { ...candidate, anchor };
          break;
        }
      }
      if (!placement) {
        for (const candidate of candidates) {
          const localOffset = comment.sourceOffset - candidate.start;
          const elements = [...candidate.slide.element.querySelectorAll(EDITABLE_SOURCE_SELECTOR)]
            .filter((element) => Number(element.dataset.sourceStart) <= localOffset && Number(element.dataset.sourceEnd) >= localOffset)
            .sort((a, b) => (Number(a.dataset.sourceEnd) - Number(a.dataset.sourceStart)) - (Number(b.dataset.sourceEnd) - Number(b.dataset.sourceStart)));
          if (elements[0]) {
            placement = { ...candidate, element: elements[0] };
            break;
          }
        }
      }
      const target = placement || candidates[0] || {
        slide: this.presentation.slides[Math.max(0, Math.min(comment.slideIndex || 0, this.presentation.slides.length - 1))],
        index: Math.max(0, Math.min(comment.slideIndex || 0, this.presentation.slides.length - 1)),
      };
      if (!target?.slide?.element) continue;
      const marker = this.createMarker(comment);
      if (target.anchor) markerInsertionRange(target.anchor).insertNode(marker);
      else if (target.element) {
        const range = document.createRange();
        range.selectNodeContents(target.element);
        range.collapse(false);
        range.insertNode(marker);
      } else {
        marker.classList.add("is-free-positioned");
        const { x = .5, y = .5 } = comment.freePosition || {};
        marker.style.left = `${x * target.slide.element.clientWidth}px`;
        marker.style.top = `${y * target.slide.element.clientHeight}px`;
        target.slide.element.append(marker);
      }
      comment.slideIndex = target.index;
      comment.marker = marker;
    }
  }

  rebuildCommentMarkers() {
    this.comments.forEach((comment) => {
      this.parkCommentCard(comment.marker);
      comment.marker?.remove();
      delete comment.marker;
    });
    this.stage.querySelectorAll(".slide-comment").forEach((marker) => marker.remove());
    this.restoreComments();
  }

  createMarker(comment) {
    const marker = document.createElement("span");
    marker.className = "slide-comment";
    marker.contentEditable = "false";
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
    if (event.target.closest?.(".slide-comment, .slide-comment-card, .comment-editor, .is-inline-editing, .comment-context-menu")) return;
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
    if (this.inlineEdit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancelInlineEditing();
    } else if (this.deck.querySelector(".comment-editor")) {
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
    menu.setAttribute("aria-label", closing ? "Unsaved modifications" : "Download changes");
    const heading = document.createElement("strong");
    heading.textContent = closing ? "This file has unsaved modifications." : "Download changes";
    menu.append(heading);

    const actions = [["Download Markdown", () => this.downloadMarkdown()]];
    if (this.comments.length) {
      actions.push(["Download Markdown with comments", () => this.downloadMarkdownWithComments()]);
      actions.push(["Download just comments", () => this.downloadComments()]);
    }
    if (this.onUpload) actions.push([
      this.comments.length ? "Download Markdown with comments and open GitHub upload" : "Download Markdown and open GitHub upload",
      () => this.downloadAndUpload(),
    ]);
    for (const [label, action] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        action();
        if (closing) await this.stateChangePromise;
        if (closing && this.dirty) this.openSaveMenu(true);
        else this.finishPendingClose();
      });
      menu.append(button);
    }
    if (closing) {
      const discard = document.createElement("button");
      discard.type = "button";
      discard.className = "is-secondary";
      discard.textContent = this.discardLabel;
      discard.addEventListener("click", async (event) => {
        event.stopPropagation();
        await Promise.resolve(this.onDiscard?.()).catch(() => {});
        this.allowUnload = true;
        this.finishPendingClose();
      });
      menu.append(discard);
    }
    this.deck.append(menu);
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  downloadMarkdown() {
    const { filename } = filenameParts(this.sourcePath);
    downloadText(filename, this.sourceMarkdown);
    this.originalSourceMarkdown = this.sourceMarkdown;
    this.editCount = 0;
    this.syncDownloadButton();
  }

  downloadMarkdownWithComments() {
    const { filename } = filenameParts(this.sourcePath);
    downloadText(filename, annotatedMarkdown(this.sourceMarkdown, this.comments));
    this.originalSourceMarkdown = this.sourceMarkdown;
    this.editCount = 0;
    this.savedRevision = this.revision;
    this.syncDownloadButton();
  }

  downloadComments() {
    const { stem } = filenameParts(this.sourcePath);
    downloadText(`${stem}-comments.md`, commentsMarkdown(this.title, this.comments));
    this.savedRevision = this.revision;
    this.syncDownloadButton();
  }

  downloadAndUpload() {
    if (this.comments.length) this.downloadMarkdownWithComments();
    else this.downloadMarkdown();
    this.onUpload?.();
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
    this.downloadButton.hidden = !this.dirty && this.comments.length === 0;
    const label = this.sourceChanged ? "Download changes" : "Download comments";
    this.downloadButton.setAttribute("aria-label", label);
    this.downloadButton.title = label;
    this.syncUnsavedIndicator();
    this.notifyStateChange();
  }

  notifyStateChange() {
    if (!this.onStateChange) return;
    const state = {
      markdown: this.sourceMarkdown,
      originalSourceMarkdown: this.originalSourceMarkdown,
      comments: this.comments.map(commentSnapshot),
      revision: this.revision,
      savedRevision: this.savedRevision,
      editCount: this.editCount,
      dirty: this.dirty,
    };
    this.stateChangePromise = this.stateChangePromise
      .catch(() => {})
      .then(() => this.onStateChange(state))
      .catch(() => {});
  }

  syncUnsavedIndicator() {
    const count = Math.max(0, this.revision - this.savedRevision);
    const message = changeStatusText(this.sourceChanged, this.editCount, count);
    this.unsavedIndicator.hidden = !message;
    this.unsavedIndicator.textContent = message;
    if (message) this.positionUnsavedIndicator();
  }

  positionUnsavedIndicator(retry = true) {
    if (this.unsavedIndicator.hidden) return;
    const slide = this.presentation.slides[this.presentation.index]?.element;
    if (!slide?.classList.contains("is-active")) return;
    const rect = slide.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      if (!retry) return;
      if (!this.indicatorPositionRequest) {
        this.indicatorPositionRequest = window.requestAnimationFrame(() => {
          this.indicatorPositionRequest = 0;
          this.positionUnsavedIndicator(false);
        });
      }
      return;
    }
    if (this.indicatorPositionRequest) {
      window.cancelAnimationFrame(this.indicatorPositionRequest);
      this.indicatorPositionRequest = 0;
    }
    this.unsavedIndicator.style.top = `${rect.bottom + 7}px`;
    this.unsavedIndicator.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
    this.unsavedIndicator.style.bottom = "auto";
  }

  destroy() {
    if (this.inlineEdit) this.finishInlineEditing();
    this.inlineEdit = null;
    this.dismissMenus();
    this.comments.forEach((comment) => {
      comment.marker?.commentCard?.remove();
      comment.marker?.remove();
      delete comment.marker;
    });
    this.stage.querySelectorAll(".slide-comment, .slide-comment-card").forEach((element) => element.remove());
    this.stage.removeEventListener("contextmenu", this.handleContextMenu);
    this.stage.removeEventListener("click", this.handleStageClick, true);
    document.removeEventListener("click", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleKeydown, true);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    window.removeEventListener("resize", this.handleViewportChange);
    document.removeEventListener("fullscreenchange", this.handleViewportChange);
    this.downloadButton.removeEventListener("click", this.handleDownload);
    this.downloadButton.hidden = true;
    if (this.indicatorPositionRequest) window.cancelAnimationFrame(this.indicatorPositionRequest);
    this.unsavedIndicator.hidden = true;
    this.unsavedIndicator.textContent = "";
    if (this.ownsUnsavedIndicator) this.unsavedIndicator.remove();
  }
}
