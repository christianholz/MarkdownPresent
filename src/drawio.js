function parseXml(xml) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  return document.querySelector("parsererror") ? null : document;
}

async function inflateDiagram(payload) {
  if (typeof DecompressionStream !== "function") return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decodeURIComponent(await new Response(stream).text());
}

async function graphModelFromViewerUrl(href) {
  const url = new URL(href);
  if (!url.hash.startsWith("#R")) return null;
  const sourceDocument = parseXml(decodeURIComponent(url.hash.slice(2)));
  if (!sourceDocument) return null;
  const directModel = sourceDocument.querySelector("mxGraphModel");
  if (directModel) return directModel;
  const diagram = sourceDocument.querySelector("diagram");
  if (!diagram) return null;
  const embeddedModel = diagram.querySelector("mxGraphModel");
  if (embeddedModel) return embeddedModel;
  const inflated = await inflateDiagram(diagram.textContent.trim());
  return inflated ? parseXml(inflated)?.querySelector("mxGraphModel") || null : null;
}

function graphBounds(model) {
  const cells = new Map([...model.querySelectorAll("mxCell[id]")].map((cell) => [cell.id, cell]));
  const origins = new Map();
  const geometry = (cell) => [...cell.children].find((child) => child.tagName === "mxGeometry") || null;
  const origin = (cell, seen = new Set()) => {
    if (origins.has(cell)) return origins.get(cell);
    if (seen.has(cell)) return { x: 0, y: 0 };
    seen.add(cell);
    const own = geometry(cell);
    let x = Number.parseFloat(own?.getAttribute("x")) || 0;
    let y = Number.parseFloat(own?.getAttribute("y")) || 0;
    const parent = cells.get(cell.getAttribute("parent"));
    if (parent?.getAttribute("vertex") === "1") {
      const parentOrigin = origin(parent, seen);
      x += parentOrigin.x;
      y += parentOrigin.y;
    }
    const result = { x, y };
    origins.set(cell, result);
    return result;
  };

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const include = (x, y, width = 0, height = 0) => {
    if (![x, y, width, height].every(Number.isFinite)) return;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  };

  for (const cell of cells.values()) {
    if (cell.getAttribute("vertex") !== "1") continue;
    const size = geometry(cell);
    if (!size || size.getAttribute("relative") === "1") continue;
    const { x, y } = origin(cell);
    include(x, y, Number.parseFloat(size.getAttribute("width")) || 0, Number.parseFloat(size.getAttribute("height")) || 0);
  }
  for (const point of model.querySelectorAll("mxPoint")) {
    include(Number.parseFloat(point.getAttribute("x")), Number.parseFloat(point.getAttribute("y")));
  }
  return Number.isFinite(left) && right > left && bottom > top
    ? { width: right - left, height: bottom - top }
    : null;
}

export async function drawioDiagramAspectRatio(href) {
  try {
    const model = await graphModelFromViewerUrl(href);
    const bounds = model ? graphBounds(model) : null;
    if (!bounds) return null;
    return Math.max(0.1, Math.min(10, bounds.width / bounds.height));
  } catch {
    return null;
  }
}
