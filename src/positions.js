export function positionStorageKey(source) {
  if (typeof source === "string") return `mdpresent:position:${source}`;
  const identity = [source?.owner, source?.repo, source?.ref, source?.path]
    .map((part) => encodeURIComponent(String(part || ""))).join(":");
  return `mdpresent:position:${identity}`;
}

export function presentationPosition(presentation, index = presentation?.index || 0) {
  const slide = presentation?.slides?.[index];
  const sourceStart = slide?.model?.sourceStart;
  const continuation = Number.isInteger(sourceStart)
    ? presentation.slides.slice(0, index).filter((candidate) => candidate.model.sourceStart === sourceStart).length
    : 0;
  return { index, sourceStart, continuation };
}

export function resolvePresentationPosition(presentation, position) {
  if (!presentation?.slides?.length || !position) return 0;
  if (Number.isInteger(position.sourceStart)) {
    const candidates = presentation.slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => slide.model.sourceStart === position.sourceStart);
    if (candidates.length) return candidates[Math.min(position.continuation || 0, candidates.length - 1)].index;
  }
  return Math.max(0, Math.min(Number(position.index) || 0, presentation.slides.length - 1));
}

export function readLocalPosition(key, storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(key) || "null"); }
  catch { return null; }
}

export function writeLocalPosition(key, position, storage = globalThis.localStorage) {
  try { storage?.setItem(key, JSON.stringify(position)); }
  catch { /* Position persistence is a progressive enhancement. */ }
}

export function githubSlideUrl(source, index) {
  if (!source?.owner || !source?.repo || !source?.ref || !source?.path) return null;
  const path = source.path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const base = `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/blob/${encodeURIComponent(source.ref)}/${path}`;
  return `${base}#mdpresent-slide=${index + 1}`;
}

export function pastedSlideUrl(url, index) {
  const target = new URL(url);
  target.hash = new URLSearchParams({ deck: "paste", slide: String(index + 1) }).toString();
  return target.href;
}
