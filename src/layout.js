export function fittedImageStackWidth(maxWidth, availableHeight, aspectRatios, gap = 0) {
  const ratios = aspectRatios.filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  if (ratios.length < 2) return maxWidth;
  const gapsHeight = Math.max(0, ratios.length - 1) * Math.max(0, gap);
  const imageHeight = Math.max(0, availableHeight - gapsHeight - 1);
  const heightAtUnitWidth = ratios.reduce((total, ratio) => total + (1 / ratio), 0);
  return Math.min(maxWidth, imageHeight / heightAtUnitWidth);
}
