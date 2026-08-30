import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

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

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

marked.use({
  gfm: true,
  breaks: false,
  extensions: mathExtension(),
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

function jekyllReplacements(markdown) {
  const replacements = [];
  const collect = (pattern, value) => {
    for (const match of markdown.matchAll(pattern)) {
      replacements.push({ start: match.index, end: match.index + match[0].length, value: value(match) });
    }
  };
  collect(/\{\{\s*site\.baseurl\s*\}\}/g, () => "");
  collect(/\{\{\s*["']([^"']+)["']\s*\|\s*(?:relative_url|absolute_url)\s*\}\}/g, (match) => match[1]);
  collect(/\{%\s*link\s+([^%]+?)\s*%\}/g, (match) => match[1]);
  return replacements.sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((replacement, index, all) => index === 0 || replacement.start >= all[index - 1].end);
}

export function preprocessJekyllWithMap(markdown) {
  const source = String(markdown || "");
  const replacements = jekyllReplacements(source);
  let text = "";
  const sourceOffsets = [0];
  let cursor = 0;

  const appendSource = (start, end) => {
    for (let index = start; index < end; index += 1) {
      text += source[index];
      sourceOffsets.push(index + 1);
    }
  };

  for (const replacement of replacements) {
    appendSource(cursor, replacement.start);
    if (!replacement.value) {
      sourceOffsets[sourceOffsets.length - 1] = replacement.end;
    } else {
      for (let index = 0; index < replacement.value.length; index += 1) {
        text += replacement.value[index];
        const progress = (index + 1) / replacement.value.length;
        sourceOffsets.push(index === replacement.value.length - 1
          ? replacement.end
          : replacement.start + Math.floor((replacement.end - replacement.start) * progress));
      }
    }
    cursor = replacement.end;
  }
  appendSource(cursor, source.length);
  return { text, sourceOffsets };
}

export function preprocessJekyll(markdown) {
  return preprocessJekyllWithMap(markdown).text;
}

export function extractUnsupportedMediaReferences(markdown) {
  const { body } = extractFrontMatter(markdown);
  const source = preprocessJekyll(body)
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
  return splitSlideSections(markdown).map(({ markdown: slideMarkdown }) => preprocessJekyll(slideMarkdown));
}

function safeHtml(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown), {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style", "video", "audio"],
    FORBID_ATTR: ["srcdoc", "formaction"],
  });
}

function tokenElementSelector(token) {
  if (token.type === "heading") return `h${token.depth}`;
  if (token.type === "paragraph") return "p";
  if (token.type === "list") return token.ordered ? "ol" : "ul";
  if (token.type === "blockquote") return "blockquote";
  if (token.type === "code") return "pre";
  if (token.type === "table") return "table";
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

function slideModelFromHtml(html, markdown = "", sourceOffsets = null, sourceStart = null, sourceEnd = null) {
  const template = document.createElement("template");
  template.innerHTML = html;
  if (markdown) annotateSourceRanges(template.content, markdown, sourceOffsets);
  const title = extractTitle(template.content);
  const images = [];
  const imageParents = new Set();
  for (const image of template.content.querySelectorAll("img")) {
    const src = image.getAttribute("src") || "";
    const alt = image.getAttribute("alt") || "";
    if (image.parentElement) imageParents.add(image.parentElement);
    image.removeAttribute("src");
    image.removeAttribute("srcset");
    image.remove();
    images.push({ src, alt });
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
  const slides = splitSlideSections(markdown).map((section, index) => {
    const { text: renderedMarkdown, sourceOffsets } = preprocessJekyllWithMap(section.markdown);
    const key = `${index}\u0000${section.sourceStart}\u0000${section.markdown}`;
    if (cache?.has(key)) return cache.get(key);
    const model = slideModelFromHtml(
      safeHtml(renderedMarkdown),
      section.markdown,
      sourceOffsets,
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
