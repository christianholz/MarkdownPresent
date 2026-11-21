import { splitSlideSections } from "./markdown.js";
import { remapCommentOffsets, replaceMarkdownRange } from "./annotations.js";
import { marked } from "marked";

export function editableSection(markdown, slideModel) {
  const sections = splitSlideSections(markdown);
  const section = sections.find((entry) => entry.sourceStart === slideModel?.sourceStart)
    || sections.find((entry) => entry.sourceStart <= slideModel?.sourceStart && entry.sourceEnd >= slideModel?.sourceEnd);
  if (!section) throw new Error("This slide could not be located in the Markdown source.");
  return section;
}

export function needsSourceEditor(markdown) {
  return /<!--|<\/?[A-Za-z][^>]*>|^\s*\{:\s*\.|\|\s*::\d+_?\s+/m.test(markdown);
}

export function hasEmbeddedImageData(markdown) {
  let embedded = false;
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === "image" && /^(?:data:image\/|blob:)/i.test(token.href || "")) embedded = true;
    if (token.type === "html" && /<img\b[^>]*\bsrc\s*=\s*["']?(?:data:image\/|blob:)/i.test(token.text || "")) embedded = true;
  });
  return embedded;
}

export function replaceEditableSection(markdown, section, replacement, annotationState = {}) {
  const original = markdown.slice(section.sourceStart, section.sourceEnd);
  if (original !== section.markdown) throw new Error("The slide changed while the editor was open. Reopen it and try again.");
  const comments = remapCommentOffsets(
    annotationState.comments || [], section.sourceStart, section.sourceEnd, original, replacement,
  );
  return {
    markdown: replaceMarkdownRange(markdown, section.sourceStart, section.sourceEnd, replacement),
    annotationState: { ...annotationState, comments },
  };
}
