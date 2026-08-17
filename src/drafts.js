const DRAFT_VERSION = 1;

export function extensionDraftKey(source) {
  const parts = [source?.owner, source?.repo, source?.ref, source?.path]
    .map((part) => encodeURIComponent(String(part || "")));
  return `mdpresent:draft:${parts.join(":")}`;
}

export function extensionDraftRecord(baseMarkdown, state, updatedAt = Date.now()) {
  return {
    version: DRAFT_VERSION,
    baseMarkdown,
    markdown: state.markdown,
    annotationState: {
      comments: state.comments,
      revision: state.revision,
      savedRevision: state.savedRevision,
      editCount: state.editCount,
      originalSourceMarkdown: state.originalSourceMarkdown,
    },
    updatedAt,
  };
}

export function restorableExtensionDraft(record, baseMarkdown) {
  if (!record || record.version !== DRAFT_VERSION || record.baseMarkdown !== baseMarkdown) return null;
  if (typeof record.markdown !== "string" || !record.annotationState) return null;
  return record;
}
