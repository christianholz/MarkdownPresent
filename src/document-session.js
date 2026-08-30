import { normalizeMarkdownSource } from "./markdown.js";

function copyComments(comments = []) {
  return comments.map((comment) => ({ ...comment }));
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

  applyMarkdown(markdown, annotationState = {}) {
    this.markdown = normalizeMarkdownSource(markdown);
    this.captureAnnotationState(annotationState);
    return this.snapshot();
  }

  captureAnnotationState(state = {}) {
    if (Array.isArray(state.comments)) this.comments = copyComments(state.comments);
    if (Number.isInteger(state.revision)) this.revision = state.revision;
    if (Number.isInteger(state.savedRevision)) this.savedRevision = state.savedRevision;
    if (Number.isInteger(state.editCount)) this.editCount = state.editCount;
    if (typeof state.originalSourceMarkdown === "string") {
      this.originalMarkdown = normalizeMarkdownSource(state.originalSourceMarkdown);
    }
    return this.snapshot();
  }

  markSaved({ comments = false } = {}) {
    this.originalMarkdown = this.markdown;
    this.editCount = 0;
    if (comments) this.savedRevision = this.revision;
    return this.snapshot();
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
