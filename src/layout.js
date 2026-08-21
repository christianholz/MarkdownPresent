export function fittedImageStackWidth(maxWidth, availableHeight, aspectRatios, gap = 0) {
  const ratios = aspectRatios.filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  if (ratios.length < 2) return maxWidth;
  const gapsHeight = Math.max(0, ratios.length - 1) * Math.max(0, gap);
  const imageHeight = Math.max(0, availableHeight - gapsHeight - 1);
  const heightAtUnitWidth = ratios.reduce((total, ratio) => total + (1 / ratio), 0);
  return Math.min(maxWidth, imageHeight / heightAtUnitWidth);
}

export const SLIDE_SPACING_GLUE = Object.freeze({
  "--slide-h3-before": Object.freeze({ min: 1.0, preferred: 1.6, max: 1.9, unit: "em" }),
  "--slide-h4-before": Object.freeze({ min: 0.75, preferred: 1.2, max: 1.45, unit: "em" }),
  "--slide-h5-before": Object.freeze({ min: 0.5, preferred: 0.8, max: 1.0, unit: "em" }),
  "--slide-h6-before": Object.freeze({ min: 0.5, preferred: 0.8, max: 1.0, unit: "em" }),
  "--slide-heading-after": Object.freeze({ min: 0.22, preferred: 0.35, max: 0.48, unit: "em" }),
  "--slide-paragraph-before": Object.freeze({ min: 0.18, preferred: 0.35, max: 0.48, unit: "em" }),
  "--slide-paragraph-after": Object.freeze({ min: 0.42, preferred: 0.75, max: 1.0, unit: "em" }),
  "--slide-list-before": Object.freeze({ min: 0.12, preferred: 0.25, max: 0.36, unit: "em" }),
  "--slide-list-after": Object.freeze({ min: 0.4, preferred: 0.75, max: 1.0, unit: "em" }),
  "--slide-list-item-gap": Object.freeze({ min: 0.1, preferred: 0.2, max: 0.3, unit: "em" }),
  "--slide-nested-list-gap": Object.freeze({ min: 0.08, preferred: 0.14, max: 0.22, unit: "em" }),
  "--slide-caption-gap": Object.freeze({ min: 1.5, preferred: 2.4, max: 3.2, unit: "cqh" }),
});

export function spacingGlueValue({ min, preferred, max }, factor = 1) {
  const bounded = Math.max(0, Math.min(2, Number.isFinite(factor) ? factor : 1));
  return bounded <= 1
    ? min + (preferred - min) * bounded
    : preferred + (max - preferred) * (bounded - 1);
}

export function applySpacingGlue(slide, factor = 1) {
  for (const [property, glue] of Object.entries(SLIDE_SPACING_GLUE)) {
    slide.style.setProperty(property, `${spacingGlueValue(glue, factor).toFixed(3)}${glue.unit}`);
  }
  slide.dataset.spacingFactor = String(factor);
}
