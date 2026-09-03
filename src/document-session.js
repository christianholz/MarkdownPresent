import { normalizeMarkdownSource } from "./markdown.js";

function copyComments(comments = []) {
  return comments.map((comment) => ({ ...comment }));
}

function documentState(session) {
  return {
    markdown: session.markdown,
    comments: copyComments(session.comments),
    revision: session.revision,
    editCount: session.editCount,
  };
}

function statesEqual(left, right) {
  return left.markdown === right.markdown
    && left.revision === right.revision
    && JSON.stringify(left.comments) === JSON.stringify(right.comments);
}

function historyLocation(location = null) {
  if (!location) return null;
  const slideIndex = Number.isInteger(location.slideIndex) ? location.slideIndex : null;
  const sourceStart = Number.isInteger(location.sourceStart) ? location.sourceStart : null;
  return slideIndex === null && sourceStart === null ? null : { slideIndex, sourceStart };
}

export class DocumentSession {
  constructor({ markdown = "", originalMarkdown, annotationState = {}, source = null, sourcePath = "presentation.md" } = {}) {
    this.markdown = normalizeMarkdownSource(markdown);
    this.originalMarkdown = normalizeMarkdownSource(originalMarkdown ?? this.markdown);
    this.source = source;
    this.sourcePath = sourcePath;
    this.comments = copyComments(annotationState.comments);
    this.revision = annotationState.revision ?? this.comments.length;
    this.savedRevision = annotationState.savedRevision ?? 0;
    this.editCount = annotationState.editCount ?? (this.markdown === this.originalMarkdown ? 0 : 1);
    this.history = [{ id: crypto.randomUUID(), label: "Opened", at: Date.now(), state: documentState(this) }];
    this.historyIndex = 0;
    this.listeners = new Set();
  }

  get dirty() {
    return this.markdown !== this.originalMarkdown || (this.comments.length > 0 && this.revision !== this.savedRevision);
  }

  get annotationState() {
    return {
      comments: copyComments(this.comments),
      revision: this.revision,
      savedRevision: this.savedRevision,
      editCount: this.editCount,
      originalSourceMarkdown: this.originalMarkdown,
    };
  }

  get canUndo() { return this.historyIndex > 0; }
  get canRedo() { return this.historyIndex < this.history.length - 1; }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(reason = "update") {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot, reason);
    return snapshot;
  }

  applyMarkdown(markdown, annotationState = {}, label = "Edit content", location = null) {
    const next = {
      markdown: normalizeMarkdownSource(markdown),
      comments: Array.isArray(annotationState.comments) ? copyComments(annotationState.comments) : copyComments(this.comments),
      revision: Number.isInteger(annotationState.revision) ? annotationState.revision : this.revision,
      editCount: Number.isInteger(annotationState.editCount) ? annotationState.editCount : this.editCount + 1,
    };
    return this.commit(label, next, location);
  }

  captureAnnotationState(state = {}, label = null, location = null) {
    const next = {
      markdown: typeof state.markdown === "string" ? normalizeMarkdownSource(state.markdown) : this.markdown,
      comments: Array.isArray(state.comments) ? copyComments(state.comments) : copyComments(this.comments),
      revision: Number.isInteger(state.revision) ? state.revision : this.revision,
      editCount: Number.isInteger(state.editCount) ? state.editCount : this.editCount,
    };
    if (label && !statesEqual(documentState(this), next)) return this.commit(label, next, location);
    this.applyDocumentState(next);
    if (Number.isInteger(state.savedRevision)) this.savedRevision = state.savedRevision;
    if (typeof state.originalSourceMarkdown === "string") {
      this.originalMarkdown = normalizeMarkdownSource(state.originalSourceMarkdown);
    }
    this.history[this.historyIndex].state = documentState(this);
    return this.notify("sync");
  }

  commit(label, state, location = null) {
    if (statesEqual(documentState(this), state)) return this.snapshot();
    this.applyDocumentState(state);
    this.history.splice(this.historyIndex + 1);
    this.history.push({
      id: crypto.randomUUID(),
      label: String(label || "Edit content"),
      at: Date.now(),
      state: documentState(this),
      location: historyLocation(location),
    });
    if (this.history.length > 100) this.history.shift();
    this.historyIndex = this.history.length - 1;
    return this.notify("commit");
  }

  applyDocumentState(state) {
    this.markdown = normalizeMarkdownSource(state.markdown);
    this.comments = copyComments(state.comments);
    this.revision = state.revision;
    this.editCount = state.editCount;
  }

  restoreHistory(index) {
    const nextIndex = Math.max(0, Math.min(Number(index), this.history.length - 1));
    if (!Number.isInteger(nextIndex) || nextIndex === this.historyIndex) return this.snapshot();
    this.historyIndex = nextIndex;
    this.applyDocumentState(this.history[nextIndex].state);
    return this.notify("restore");
  }

  undo() {
    return this.canUndo ? this.restoreHistory(this.historyIndex - 1) : this.snapshot();
  }

  redo() {
    return this.canRedo ? this.restoreHistory(this.historyIndex + 1) : this.snapshot();
  }

  stepLocation(direction) {
    const index = direction === "undo" ? this.historyIndex : this.historyIndex + 1;
    const location = this.history[index]?.location;
    return location ? { ...location } : null;
  }

  get historyEntries() {
    return this.history.map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      at: entry.at,
      index,
      current: index === this.historyIndex,
    }));
  }

  markSaved({ comments = false } = {}) {
    this.originalMarkdown = this.markdown;
    this.editCount = 0;
    if (comments) this.savedRevision = this.revision;
    this.history[this.historyIndex].state = documentState(this);
    return this.notify("saved");
  }

  snapshot() {
    return {
      markdown: this.markdown,
      originalSourceMarkdown: this.originalMarkdown,
      comments: copyComments(this.comments),
      revision: this.revision,
      savedRevision: this.savedRevision,
      editCount: this.editCount,
      dirty: this.dirty,
    };
  }
}
