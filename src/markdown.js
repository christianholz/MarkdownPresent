import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import latex from "highlight.js/lib/languages/latex";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import "katex/dist/katex.min.css";

for (const [name, language] of Object.entries({
  bash, cpp, css, java, javascript, json, markdown: markdownLanguage,
  latex, python, rust, swift, typescript, xml, yaml,
})) hljs.registerLanguage(name, language);

const CODE_LANGUAGE_ALIASES = Object.freeze({
  c: "cpp", h: "cpp", cc: "cpp", cxx: "cpp", sh: "bash", shell: "bash",
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  html: "xml", svg: "xml", md: "markdown", yml: "yaml", py: "python",
  tex: "latex", text: "plaintext", txt: "plaintext",
});

let activeTocEntries = [];

export function normalizeMarkdownSource(markdown) {
  return String(markdown || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function mathExtension() {
  return [
    {
      name: "blockMath",
      level: "block",
      start(src) { return src.indexOf("$$"); },
      tokenizer(src) {
        const match = /^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src);
        if (match) return { type: "blockMath", raw: match[0], text: match[1] };
      },
      renderer(token) {
        try { return `<div class="math-display">${katex.renderToString(token.text, { displayMode: true, throwOnError: false })}</div>`; }
        catch { return `<pre>${escapeHtml(token.text)}</pre>`; }
      },
    },
    {
      name: "inlineMath",
      level: "inline",
      start(src) { return src.indexOf("$"); },
      tokenizer(src) {
        const match = /^\$([^$\n]+?)\$/.exec(src);
        if (match) return { type: "inlineMath", raw: match[0], text: match[1] };
      },
      renderer(token) {
        try { return katex.renderToString(token.text, { displayMode: false, throwOnError: false }); }
        catch { return `<code>${escapeHtml(token.text)}</code>`; }
      },
    },
  ];
}

function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableRule(line) {
  return line.trim().startsWith("|") && !line.replace(/[|:\-\s]/g, "");
}

function tableCell(text, lexer) {
  return { text, tokens: lexer.inlineTokens(text) };
}

function parseGroupedTable(source, lexer) {
  const lines = source.replace(/^\s+|\s+$/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  let tableClass = "caption-font-size";
  const pipeLines = [];
  for (const line of lines) {
    const attributes = /^\{:\s*((?:\.[A-Za-z][\w-]*\s*)+)\}$/.exec(line);
    if (attributes) {
      tableClass = attributes[1].match(/\.[A-Za-z][\w-]*/g)?.map((name) => name.slice(1)).join(" ") || tableClass;
    } else if (line.startsWith("|")) pipeLines.push(line);
  }
  const contentLines = pipeLines.filter((line) => !isTableRule(line));
  if (contentLines.length < 2 || !/\|\s*::\d+_?\s+/.test(contentLines[0])) return null;

  const firstHeader = tableCells(contentLines[0]).map((text) => {
    const group = /^::(\d+)(_?)\s+(.*)$/.exec(text);
    return group
      ? { kind: "group", span: Math.max(1, Number(group[1])), underline: Boolean(group[2]), ...tableCell(group[3], lexer) }
      : { kind: "leading", ...tableCell(text, lexer) };
  });
  const secondHeader = tableCells(contentLines[1])
    .filter((text) => text !== "^")
    .map((text) => tableCell(text, lexer));
  const body = [];
  let contentIndex = 0;
  let pendingRule = false;
  for (const line of pipeLines) {
    if (isTableRule(line)) {
      if (contentIndex > 2) pendingRule = true;
      continue;
    }
    contentIndex += 1;
    if (contentIndex <= 2) continue;
    body.push({ cells: tableCells(line).map((text) => tableCell(text, lexer)), topRule: pendingRule });
    pendingRule = false;
  }
  return {
    tableClass,
    firstHeader,
    secondHeader,
    body,
    bottomRule: Boolean(pipeLines.length && isTableRule(pipeLines.at(-1))),
  };
}

function groupedTableExtension() {
  return {
    name: "groupedTable",
    level: "block",
    start(src) {
      return src.search(/(?:^|\n)(?:\{:\s*(?:\.[A-Za-z][\w-]*\s*)+\}\s*\n)?\|[^\n]*\|\s*$/m);
    },
    tokenizer(src) {
      const lines = src.split("\n");
      const selected = [];
      let lineCount = 0;
      if (/^\{:\s*(?:\.[A-Za-z][\w-]*\s*)+\}\s*$/.test(lines[0])) {
        selected.push(lines[0]);
        lineCount += 1;
      }
      while (lineCount < lines.length && /^\s*\|/.test(lines[lineCount])) {
        selected.push(lines[lineCount]);
        lineCount += 1;
      }
      const table = parseGroupedTable(selected.join("\n"), this.lexer);
      if (!table) return undefined;
      const raw = lines.slice(0, lineCount).join("\n") + (lineCount < lines.length ? "\n" : "");
      return { type: "groupedTable", raw, table };
    },
    renderer(token) {
      const inline = (cell) => this.parser.parseInline(cell.tokens);
      const first = token.table.firstHeader.map((cell) => cell.kind === "group"
        ? `<th class="group-heading${cell.underline ? " has-underline" : ""}" colspan="${cell.span}">${inline(cell)}</th>`
        : `<th rowspan="2">${inline(cell)}</th>`).join("");
      const second = token.table.secondHeader.map((cell) => `<th>${inline(cell)}</th>`).join("");
      const body = token.table.body.map((row, index) => `<tr${row.topRule ? ' class="has-top-border"' : ""} data-table-row="${index}">${row.cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("");
      return `<div class="grouped-table"><table class="academic-table ${token.table.tableClass}"><thead><tr>${first}</tr><tr>${second}</tr></thead><tbody${token.table.bottomRule ? ' class="has-bottom-rule"' : ""}>${body}</tbody></table></div>`;
    },
  };
}

function tocExtension() {
  return {
    name: "slideToc",
    level: "block",
    start(src) { return src.search(/<!--\s*toc\s*-->/i); },
    tokenizer(src) {
      const match = /^<!--\s*toc\s*-->(?:\n|$)/i.exec(src);
      if (match) return { type: "slideToc", raw: match[0] };
    },
    renderer() {
      const entries = activeTocEntries.map((entry) => `<button type="button" class="toc-entry${entry.level === 1 ? " is-section" : ""}" data-toc-source-start="${entry.sourceStart}"><span>${entry.html}</span></button>`).join("");
      return `<nav class="slide-toc" aria-label="Table of contents">${entries}</nav>`;
    },
  };
}

function captionExtension() {
  return {
    name: "captionBlock",
    level: "block",
    start(src) { return src.search(/\{:\s*\.caption\s*\}/); },
    tokenizer(src) {
      const match = /^\{:\s*\.caption\s*\}\s*\n([^\n]+(?:\n(?!\s*\n|[#>|`~{]).+)*)?(?:\n|$)/.exec(src);
      if (!match?.[1]) return undefined;
      return { type: "captionBlock", raw: match[0], tokens: this.lexer.inlineTokens(match[1].trim()) };
    },
    renderer(token) { return `<p class="caption">${this.parser.parseInline(token.tokens)}</p>`; },
  };
}

function highlightedCode(token) {
  const requested = String(token.lang || "").trim().split(/\s+/, 1)[0].toLowerCase();
  const language = CODE_LANGUAGE_ALIASES[requested] || requested;
  let value;
  let className = "hljs";
  if (language && hljs.getLanguage(language)) {
    value = hljs.highlight(token.text, { language, ignoreIllegals: true }).value;
    className += ` language-${language}`;
  } else {
    value = escapeHtml(token.text);
  }
  const label = requested ? `<span class="code-language" aria-hidden="true">${escapeHtml(requested)}</span>` : "";
  return `<pre class="code-block">${label}<code class="${className}">${value}</code></pre>\n`;
}

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

marked.use({
  gfm: true,
  breaks: false,
  extensions: [...mathExtension(), groupedTableExtension(), tocExtension(), captionExtension()],
  renderer: { code: highlightedCode },
});

export function extractFrontMatter(markdown) {
  const normalized = normalizeMarkdownSource(markdown);
  if (!normalized.startsWith("---\n")) return { frontMatter: "", body: normalized, bodyStart: 0 };
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { frontMatter: "", body: normalized, bodyStart: 0 };
  const untrimmedBody = normalized.slice(end + 5);
  const leadingWhitespace = /^\s+/.exec(untrimmedBody)?.[0].length || 0;
  return {
    frontMatter: normalized.slice(4, end),
    body: untrimmedBody.slice(leadingWhitespace),
    bodyStart: end + 5 + leadingWhitespace,
  };
}

export function extractUnsupportedMediaReferences(markdown) {
  const { body } = extractFrontMatter(markdown);
  const source = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");
  const references = [];
  const attributePatterns = [
    /<(?:video|audio|source|track|embed|iframe)\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
    /<object\b[^>]*\bdata\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
  ];
  for (const pattern of attributePatterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = (match[1] || match[2] || match[3] || "").trim();
      if (reference) references.push(reference);
    }
  }
  return [...new Set(references)];
}

function splitAtSlideBoundaries(markdown, sourceOffset = 0) {
  const lines = markdown.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) || [];
  const slides = [];
  let current = [];
  let fence = null;
  let offset = 0;

  const commit = () => {
    const raw = current.map(({ line }) => line).join("");
    const leading = /^\s*/.exec(raw)?.[0].length || 0;
    const trailing = /\s*$/.exec(raw)?.[0].length || 0;
    const end = Math.max(leading, raw.length - trailing);
    if (end > leading) {
      slides.push({
        markdown: raw.slice(leading, end),
        sourceStart: sourceOffset + current[0].offset + leading,
        sourceEnd: sourceOffset + current[0].offset + end,
      });
    }
    current = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;
    const lineOffset = offset;
    offset += rawLine.length;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : (fence || marker);
      current.push({ line: rawLine, offset: lineOffset });
      continue;
    }

    const explicitBreak = !fence && /^\s*(?:<!--\s*slide\s*-->|---)\s*$/i.test(line);
    const headingStart = !fence && /^(?:#|##)\s+/.test(line);
    if ((explicitBreak || headingStart) && current.some((item) => item.line.trim())) commit();
    if (explicitBreak) continue;
    current.push({ line: rawLine, offset: lineOffset });
  }

  if (current.some((item) => item.line.trim())) commit();
  return slides;
}

export function splitSlideSections(markdown) {
  const { body, bodyStart } = extractFrontMatter(markdown);
  return splitAtSlideBoundaries(body, bodyStart);
}

export function splitSlides(markdown) {
  return splitSlideSections(markdown).map(({ markdown: slideMarkdown }) => slideMarkdown);
}

function safeHtml(markdown, tocEntries = []) {
  const previous = activeTocEntries;
  activeTocEntries = tocEntries;
  try {
    return DOMPurify.sanitize(marked.parse(markdown), {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style", "video", "audio"],
      FORBID_ATTR: ["srcdoc", "formaction"],
    });
  } finally {
    activeTocEntries = previous;
  }
}

function tokenElementSelector(token) {
  if (token.type === "heading") return `h${token.depth}`;
  if (token.type === "paragraph") return "p";
  if (token.type === "list") return token.ordered ? "ol" : "ul";
  if (token.type === "blockquote") return "blockquote";
  if (token.type === "code") return "pre";
  if (token.type === "table") return "table";
  if (token.type === "groupedTable") return ".grouped-table";
  if (token.type === "slideToc") return ".slide-toc";
  if (token.type === "captionBlock") return "p.caption";
  if (token.type === "hr") return "hr";
  if (token.type === "blockMath") return ".math-display";
  return null;
}

function setSourceRange(element, start, end, kind) {
  if (!element || start < 0 || end < start) return;
  element.dataset.sourceStart = String(start);
  element.dataset.sourceEnd = String(end);
  element.dataset.sourceKind = kind;
}

function annotateListSourceRanges(token, list, start) {
  const items = [...list.children].filter((element) => element.matches("li"));
  let itemCursor = 0;
  token.items?.forEach((itemToken, index) => {
    const item = items[index];
    if (!item) return;
    const relativeStart = token.raw.indexOf(itemToken.raw, itemCursor);
    if (relativeStart < 0) return;
    const itemStart = start + relativeStart;
    setSourceRange(item, itemStart, itemStart + itemToken.raw.length, "list-item");
    itemCursor = relativeStart + itemToken.raw.length;

    const nestedTokens = (itemToken.tokens || []).filter((child) => child.type === "list");
    const nestedLists = [...item.children].filter((element) => element.matches("ul, ol"));
    let nestedCursor = 0;
    nestedTokens.forEach((nestedToken, nestedIndex) => {
      const nestedList = nestedLists[nestedIndex];
      if (!nestedList) return;
      const nestedStart = itemToken.raw.indexOf(nestedToken.raw, nestedCursor);
      if (nestedStart < 0) return;
      setSourceRange(nestedList, itemStart + nestedStart, itemStart + nestedStart + nestedToken.raw.length, "list");
      annotateListSourceRanges(nestedToken, nestedList, itemStart + nestedStart);
      nestedCursor = nestedStart + nestedToken.raw.length;
    });
  });
}

function annotateSourceRanges(fragment, markdown, sourceOffsets = null) {
  const elements = [...fragment.children];
  let elementCursor = 0;
  let sourceCursor = 0;
  for (const token of marked.lexer(markdown)) {
    if (!token.raw || token.type === "space") continue;
    const selector = tokenElementSelector(token);
    const start = markdown.indexOf(token.raw, sourceCursor);
    if (start < 0) continue;
    sourceCursor = start + token.raw.length;
    if (!selector) continue;
    const relativeIndex = elements.slice(elementCursor).findIndex((element) => element.matches(selector));
    if (relativeIndex < 0) continue;
    const elementIndex = elementCursor + relativeIndex;
    const element = elements[elementIndex];
    elementCursor = elementIndex + 1;
    const mappedStart = sourceOffsets?.[start] ?? start;
    const mappedEnd = sourceOffsets?.[start + token.raw.length] ?? (start + token.raw.length);
    setSourceRange(element, mappedStart, mappedEnd, token.type);
    if (token.type === "list") annotateListSourceRanges(token, element, mappedStart);
  }
}

function extractTitle(fragment) {
  const heading = fragment.querySelector("h1, h2");
  if (!heading) return null;
  const wrapper = heading.parentElement?.matches(".markdown-heading") ? heading.parentElement : null;
  heading.remove();
  wrapper?.remove();
  return heading;
}

function hasMeaningfulSlideContent(fragment) {
  if (fragment.textContent.trim()) return true;
  return Boolean(fragment.querySelector("table, ul, ol, pre, blockquote, hr, math, .math-display"));
}

function imageSourceRanges(markdown) {
  const ranges = [];

  const visitChildren = (children, parentRaw, parentStart) => {
    let cursor = 0;
    for (const child of children || []) {
      if (!child?.raw) continue;
      let localStart = parentRaw.indexOf(child.raw, cursor);
      if (localStart < 0) localStart = parentRaw.indexOf(child.raw);
      if (localStart < 0) continue;
      visitToken(child, parentStart + localStart);
      cursor = localStart + child.raw.length;
    }
  };

  const visitToken = (token, start) => {
    if (token.type === "image") ranges.push({ start, end: start + token.raw.length });
    if (token.type === "html") {
      for (const match of token.raw.matchAll(/<img\b[^>]*>/gi)) {
        ranges.push({ start: start + match.index, end: start + match.index + match[0].length });
      }
    }
    visitChildren(token.tokens, token.raw, start);
    visitChildren(token.items, token.raw, start);
  };

  const tokens = marked.lexer(markdown);
  let cursor = 0;
  for (const token of tokens) {
    if (!token.raw) continue;
    const start = markdown.indexOf(token.raw, cursor);
    if (start < 0) continue;
    visitToken(token, start);
    cursor = start + token.raw.length;
  }
  return ranges.sort((left, right) => left.start - right.start);
}

function slideModelFromHtml(html, markdown = "", sourceOffsets = null, sourceStart = null, sourceEnd = null) {
  const template = document.createElement("template");
  template.innerHTML = html;
  if (markdown) annotateSourceRanges(template.content, markdown, sourceOffsets);
  const title = extractTitle(template.content);
  const images = [];
  const sourceRanges = markdown ? imageSourceRanges(markdown) : [];
  let sourceRangeIndex = 0;
  const imageParents = new Set();
  for (const image of template.content.querySelectorAll("img")) {
    const src = image.getAttribute("src") || "";
    const alt = image.getAttribute("alt") || "";
    const range = sourceRanges[sourceRangeIndex++];
    if (image.parentElement) imageParents.add(image.parentElement);
    image.removeAttribute("src");
    image.removeAttribute("srcset");
    image.remove();
    images.push({
      src,
      alt,
      sourceStart: range ? (sourceOffsets?.[range.start] ?? range.start) : null,
      sourceEnd: range ? (sourceOffsets?.[range.end] ?? range.end) : null,
    });
  }
  for (const parent of imageParents) {
    if (!parent.textContent.trim() && !parent.children.length) parent.remove();
  }
  for (const link of template.content.querySelectorAll("a")) {
    const href = link.getAttribute("href") || "";
    if (/^https?:/i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }
  const imageOnly = images.length > 0 && !hasMeaningfulSlideContent(template.content);
  return { markdown, sourceStart, sourceEnd, title, content: template.content, images, imageOnly };
}

function splitRenderedHtml(html) {
  const sourceTemplate = document.createElement("template");
  sourceTemplate.innerHTML = html;
  sourceTemplate.content.querySelectorAll("markdown-accessiblity-table").forEach((table) => table.remove());
  const template = document.createElement("template");
  template.innerHTML = DOMPurify.sanitize(sourceTemplate.innerHTML, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style", "video", "audio"],
    FORBID_ATTR: ["srcdoc", "formaction"],
  });
  const root = template.content.querySelector("article.markdown-body") || template.content;
  const slides = [];
  let current = document.createElement("div");

  const commit = () => {
    if (!current.textContent.trim() && !current.querySelector("img")) return;
    slides.push(current.innerHTML);
    current = document.createElement("div");
  };

  for (const node of [...root.children]) {
    if (node.matches("hr")) {
      commit();
      continue;
    }
    const heading = node.matches("h1, h2")
      ? node
      : node.matches(".markdown-heading")
        ? node.querySelector("h1, h2")
        : null;
    if (heading && (current.textContent.trim() || current.querySelector("img"))) commit();
    current.append(node.cloneNode(true));
  }
  commit();
  return slides;
}

const markdownModelCaches = new WeakMap();

function markdownModelCache(source) {
  if (!source || (typeof source !== "object" && typeof source !== "function")) return null;
  let cache = markdownModelCaches.get(source);
  if (!cache) {
    cache = new Map();
    markdownModelCaches.set(source, cache);
  }
  return cache;
}

export function processMarkdown(markdown, source) {
  const cache = markdownModelCache(source);
  const sections = splitSlideSections(markdown);
  const tocEntries = sections.flatMap((section) => {
    const heading = /^(#{1,2})\s+(.+?)\s*#*\s*(?:\n|$)/.exec(section.markdown);
    if (!heading) return [];
    const html = DOMPurify.sanitize(marked.parseInline(heading[2]), { FORBID_TAGS: ["img"] });
    return [{ level: heading[1].length, html, sourceStart: section.sourceStart }];
  });
  const slides = sections.map((section, index) => {
    const key = `${index}\u0000${section.sourceStart}\u0000${section.markdown}`;
    if (cache?.has(key)) return cache.get(key);
    const model = slideModelFromHtml(
      safeHtml(section.markdown, tocEntries),
      section.markdown,
      null,
      section.sourceStart,
      section.sourceEnd,
    );
    if (cache) {
      cache.set(key, model);
      if (cache.size > 120) cache.delete(cache.keys().next().value);
    }
    return model;
  });
  return { source, slides };
}

export function processRenderedHtml(html, source) {
  const slides = splitRenderedHtml(html).map((slideHtml) => slideModelFromHtml(slideHtml));
  return { source, slides };
}
