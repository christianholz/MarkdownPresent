const DRAFT_VERSION = 1;

export function extensionDraftKey(source) {
  const parts = [source?.owner, source?.repo, source?.ref, source?.path]
    .map((part) => encodeURIComponent(String(part || "")));
  return `mdpresent:draft:${parts.join(":")}`;
}

export function extensionDraftRecord(baseMarkdown, state, updatedAt = Date.now(), localAssetPaths = []) {
  const record = {
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
  if (localAssetPaths.length) record.localAssetPaths = localAssetPaths;
  return record;
}

export function restorableExtensionDraft(record, baseMarkdown) {
  if (!record || record.version !== DRAFT_VERSION || record.baseMarkdown !== baseMarkdown) return null;
  if (typeof record.markdown !== "string" || !record.annotationState) return null;
  return record;
}

export function draftWithoutAssetData(record) {
  if (!Array.isArray(record?.assets)) return record;
  const { assets, ...textDraft } = record;
  const localAssetPaths = [...new Set([
    ...(Array.isArray(textDraft.localAssetPaths) ? textDraft.localAssetPaths : []),
    ...assets.map((asset) => asset?.path),
  ].filter((path) => typeof path === "string" && path))];
  return { ...textDraft, localAssetPaths };
}
