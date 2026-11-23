import { splitSlideSections } from "./markdown.js";
import { remapCommentOffsets, replaceMarkdownRange } from "./annotations.js";
import { marked } from "marked";

export const markdownInsertTools = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Inline code",
  bullet: "Bullet list",
  ordered: "Numbered list",
  task: "Task list",
  quote: "Quote",
  link: "Link",
  image: "Image URL",
  table: "Table",
  fence: "Code block",
  math: "Math block",
  toc: "Table of contents",
  caption: "Caption",
  groupedTable: "Grouped table",
  slideBreak: "Slide break",
};

export function markdownInsertion(tool, before, selected, after, asset = null) {
  const inline = { bold: "**", italic: "*", strike: "~~", code: "`" };
  if (Object.hasOwn(inline, tool)) {
    const mark = inline[tool];
    return mark + (selected || "text") + mark;
  }
  if (tool === "link") return `[${selected || "Link text"}](https://example.com)`;
  if (tool === "image") {
    const alt = (asset?.alt || selected || "Image description").replace(/[\\\[\]\r\n]/g, " ").trim();
    return `![${alt}](${asset?.reference || "https://example.com/image.png"})`;
  }
  const content = selected || "Text";
  const line = (prefix) => content.split("\n").map((text, index) => prefix(index) + text).join("\n");
  const blocks = {
    bullet: () => line(() => "- "),
    ordered: () => line((index) => `${index + 1}. `),
    task: () => line(() => "- [ ] "),
    quote: () => line(() => "> "),
    table: () => "| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |",
    fence: () => `\`\`\`\n${selected || "code"}\n\`\`\``,
    math: () => `$$\n${selected || "x^2"}\n$$`,
    toc: () => "<!-- TOC -->",
    caption: () => `{: .caption}\n${selected || "Caption text"}`,
    groupedTable: () => "| Metric | ::2_ Group |\n| ^ | First | Second |\n| --- | --- | --- |\n| Item | 1 | 2 |",
    slideBreak: () => "---",
  };
  const block = /^h[1-6]$/.test(tool)
    ? `${"#".repeat(Number(tool[1]))} ${selected.replace(/\s*\n\s*/g, " ") || "Heading"}`
    : blocks[tool]();
  const leading = before ? "\n".repeat(Math.max(0, 2 - (before.match(/\n*$/)[0].length))) : "";
  const trailing = after ? "\n".repeat(Math.max(0, 2 - (after.match(/^\n*/)[0].length))) : "";
  return leading + block + trailing;
}

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
