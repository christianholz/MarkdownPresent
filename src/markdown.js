import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

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
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return { frontMatter: "", body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { frontMatter: "", body: normalized };
  return { frontMatter: normalized.slice(4, end), body: normalized.slice(end + 5).replace(/^\s+/, "") };
}

export function preprocessJekyll(markdown) {
  return markdown
    .replace(/\{\{\s*site\.baseurl\s*\}\}/g, "")
    .replace(/\{\{\s*["']([^"']+)["']\s*\|\s*(?:relative_url|absolute_url)\s*\}\}/g, "$1")
    .replace(/\{%\s*link\s+([^%]+?)\s*%\}/g, "$1");
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

function splitAtSlideBoundaries(markdown) {
  const lines = markdown.split("\n");
  const slides = [];
  let current = [];
  let fence = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : (fence || marker);
      current.push(line);
      continue;
    }

    const explicitBreak = !fence && /^\s*(?:<!--\s*slide\s*-->|---)\s*$/i.test(line);
    const headingStart = !fence && /^(?:#|##)\s+/.test(line);
    if ((explicitBreak || headingStart) && current.some((item) => item.trim())) {
      slides.push(current.join("\n").trim());
      current = [];
    }
    if (explicitBreak) continue;
    current.push(line);
  }

  if (current.some((item) => item.trim())) slides.push(current.join("\n").trim());
  return slides;
}

export function splitSlides(markdown) {
  const { body } = extractFrontMatter(markdown);
  const processed = preprocessJekyll(body).trim();
  if (!processed) return [];
  return splitAtSlideBoundaries(processed);
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

function annotateSourceRanges(fragment, markdown) {
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
    setSourceRange(element, start, start + token.raw.length, token.type);
    if (token.type === "list") annotateListSourceRanges(token, element, start);
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

function slideModelFromHtml(html, markdown = "") {
  const template = document.createElement("template");
  template.innerHTML = html;
  if (markdown) annotateSourceRanges(template.content, markdown);
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
  return { markdown, title, content: template.content, images, imageOnly };
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

export function processMarkdown(markdown, source) {
  const slides = splitSlides(markdown).map((slideMarkdown) => slideModelFromHtml(safeHtml(slideMarkdown), slideMarkdown));
  return { source, slides };
}

export function processRenderedHtml(html, source) {
  const slides = splitRenderedHtml(html).map((slideHtml) => slideModelFromHtml(slideHtml));
  return { source, slides };
}
