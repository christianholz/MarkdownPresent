import DOMPurify from "dompurify";
import { parseDiagramPlacement, placementAttribute } from "./diagram-placement.js";

const namespace = "http://www.w3.org/2000/svg";

export function sanitizeDiagramSvg(text) {
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  if (document.documentElement.localName !== "svg" || document.documentElement.namespaceURI !== namespace) {
    throw new Error("Choose a valid SVG file.");
  }
  const clean = DOMPurify.sanitize(text, {
    PARSER_MEDIA_TYPE: "application/xhtml+xml",
    ALLOWED_TAGS: ["svg", "g", "rect", "circle", "ellipse", "line", "path", "polyline", "polygon", "defs", "marker", "title", "desc"],
    KEEP_CONTENT: false,
    ALLOWED_ATTR: [
      "xmlns", "id", "viewBox", "width", "height", "x", "y", "rx", "ry", "r", "cx", "cy",
      "x1", "x2", "y1", "y2", "d", "points", "transform", "fill", "fill-opacity", "fill-rule",
      "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity",
      "marker-end", "marker-start", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["data-mdpresent-route", "data-mdpresent-bend", placementAttribute],
  });
  if (!clean) throw new Error("This SVG has no supported drawing.");
  return clean;
}

export function diagramSvgPlacement(svg) {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  return parseDiagramPlacement(root.getAttribute(placementAttribute));
}
