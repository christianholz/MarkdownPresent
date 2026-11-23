export const placementAttribute = "data-mdpresent-frame";
export const placementTitlePrefix = "mdpresent-frame ";
export const defaultPlacement = Object.freeze({ x: 50, y: 18, width: 43, height: 64 });

export function boundDiagramPlacement({ x, y, width, height }) {
  const clamp = (value, min, max) => Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
  const w = clamp(width, 5, 100);
  const h = clamp(height, 5, 100);
  return { x: clamp(x, 0, 100 - w), y: clamp(y, 0, 100 - h), width: w, height: h };
}

export function parseDiagramPlacement(value) {
  const parts = value?.trim().split(/\s+/).map(Number);
  if (parts?.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [x, y, width, height] = parts;
  return boundDiagramPlacement({ x, y, width, height });
}

export function serializeDiagramPlacement({ x, y, width, height }) {
  return `${x} ${y} ${width} ${height}`;
}

export function applyDiagramPlacement(element, placement) {
  element.classList.add("slide-positioned-image");
  element.style.left = `${placement.x}%`;
  element.style.top = `${placement.y}%`;
  element.style.width = `${placement.width}%`;
  element.style.height = `${placement.height}%`;
}
