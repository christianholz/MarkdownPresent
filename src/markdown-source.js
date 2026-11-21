export function normalizeMarkdownSource(markdown) {
  return String(markdown || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}
