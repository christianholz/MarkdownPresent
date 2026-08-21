import { CONFIG } from "./config.js";
import { applySpacingGlue, fittedImageStackWidth } from "./layout.js";
import titleSlideTemplate from "./templates/title-slide.html?raw";
import contentSlideTemplate from "./templates/content-slide.html?raw";
import imageSlideTemplate from "./templates/image-slide.html?raw";
import gallerySlideTemplate from "./templates/gallery-slide.html?raw";

function cloneNode(node) {
  return node ? node.cloneNode(true) : null;
}

function contentChunks(content) {
  const chunks = [];
  for (const node of content.children) {
    if (node.matches("ul, ol") && node.children.length > 1) {
      const start = node.matches("ol") ? Number.parseInt(node.getAttribute("start") || "1", 10) : null;
      [...node.children].forEach((item, index) => {
        chunks.push({ kind: "list-item", list: node, item, index, start, group: node });
      });
    } else {
      chunks.push({ kind: "node", node });
    }
  }
  return chunks;
}

function contentFromChunks(chunks) {
  const content = document.createDocumentFragment();
  let activeList = null;
  let activeGroup = null;
  for (const chunk of chunks) {
    if (chunk.kind === "node") {
      content.append(chunk.node.cloneNode(true));
      activeList = null;
      activeGroup = null;
      continue;
    }
    if (chunk.group !== activeGroup) {
      activeList = chunk.list.cloneNode(false);
      if (activeList.matches("ol") && Number.isFinite(chunk.start)) {
        activeList.setAttribute("start", String(chunk.start + chunk.index));
      }
      content.append(activeList);
      activeGroup = chunk.group;
    }
    activeList.append(chunk.item.cloneNode(true));
  }
  return content;
}

function modelWithChunks(model, chunks) {
  return {
    ...model,
    title: cloneNode(model.title),
    content: contentFromChunks(chunks),
    images: model.images.map((image) => ({ ...image })),
  };
}

export function continuationTitleText(title, page, total) {
  return `${title} (${page}/${total})`;
}

function addContinuationSuffix(model, page, total) {
  if (!model.title || total < 2) return model;
  const title = cloneNode(model.title);
  const heading = title.textContent;
  title.dataset.generatedSuffix = continuationTitleText("", page, total);
  title.setAttribute("aria-label", continuationTitleText(heading, page, total));
  return { ...model, title };
}

function applyImageMeasurements(slide, model, measurements) {
  const body = slide.querySelector(".slide-body");
  const media = slide.querySelector(".slide-media");
  if (!body || !media || model.images.length < 2 || slide.classList.contains("is-caption-layout")) return;
  const ratios = model.images.map(({ src }) => {
    const measurement = measurements.get(src);
    return measurement ? measurement.width / measurement.height : 1;
  });
  const rowGap = Number.parseFloat(getComputedStyle(media).rowGap) || 0;
  const width = fittedImageStackWidth(media.clientWidth, media.clientHeight, ratios, rowGap);
  if (width < media.clientWidth - 0.5) {
    body.style.gridTemplateColumns = `minmax(0, 1fr) ${Math.max(1, width)}px`;
  }
}

function refreshCaptionLayout(slide) {
  slide.classList.remove("is-caption-layout");
  const copy = slide.querySelector(".slide-copy");
  const media = slide.querySelector(".slide-media");
  const blocks = copy ? [...copy.children].filter((element) => !element.matches(".slide-comment-card")) : [];
  const imageCount = media?.querySelectorAll(".image-slot").length || 0;
  const paragraph = blocks.length === 1 && blocks[0].matches("p") ? blocks[0] : null;
  if (!paragraph?.textContent.trim() || imageCount < 1 || imageCount > 2) return false;

  media.style.setProperty("--caption-image-count", String(imageCount));
  slide.classList.add("is-caption-layout");
  const lineHeight = Number.parseFloat(getComputedStyle(paragraph).lineHeight);
  const height = paragraph.getBoundingClientRect().height;
  const isSingleLine = Number.isFinite(lineHeight) && height <= lineHeight * 1.25;
  slide.classList.toggle("is-caption-layout", isSingleLine);
  if (!isSingleLine) media.style.removeProperty("--caption-image-count");
  return isSingleLine;
}

const imageMeasurementCaches = new WeakMap();

function decodeImageForMeasurement(image, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      image.src = "";
      reject(new Error("Image check timed out."));
    }, timeout);
    image.decode().then(
      () => { window.clearTimeout(timer); resolve(); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

export async function loadImageMeasurements(models, assetManager) {
  const references = [...new Set(models.flatMap((model) => model.images.map((image) => image.src)).filter(Boolean))];
  let cache = imageMeasurementCaches.get(assetManager);
  if (!cache) {
    cache = new Map();
    imageMeasurementCaches.set(assetManager, cache);
  }
  const entries = await Promise.all(references.map(async (reference) => {
    if (cache.has(reference)) return cache.get(reference);
    const measurement = (async () => {
      try {
        const url = await assetManager.getUrl(reference);
        const image = new Image();
        image.src = url;
        await decodeImageForMeasurement(image);
        if (!image.naturalWidth || !image.naturalHeight) return null;
        return [reference, { width: image.naturalWidth, height: image.naturalHeight }];
      } catch {
        return null;
      }
    })();
    cache.set(reference, measurement);
    try {
      return await measurement;
    } catch {
      return null;
    }
  }));
  return new Map(entries.filter(Boolean));
}

function measurementSlide(model, measurements, spacingFactor = 1) {
  const slide = documentFragmentFrom(model, 0);
  slide.classList.add("is-active", "is-pagination-measure");
  document.body.append(slide);
  const copy = slide.querySelector(".slide-copy");
  if (copy) copy.style.fontSize = `${CONFIG.presentation.paginationFontSize}px`;
  applySpacingGlue(slide, spacingFactor);
  refreshCaptionLayout(slide);
  applyImageMeasurements(slide, model, measurements);
  return slide;
}

function fitsAtPaginationSize(model, measurements) {
  const slide = measurementSlide(model, measurements, 0);
  const copy = slide.querySelector(".slide-copy");
  const fits = !copy || (copy.scrollHeight <= copy.clientHeight + 1 && copy.scrollWidth <= copy.clientWidth + 1);
  slide.remove();
  return fits;
}

function contentHeightAtPaginationSize(model, measurements) {
  const slide = measurementSlide(model, measurements, 1);
  const height = slide.querySelector(".slide-copy")?.scrollHeight || 1;
  slide.remove();
  return height;
}

function isSubheadingChunk(chunk) {
  return chunk?.kind === "node" && chunk.node.matches("h3, h4, h5, h6");
}

function subheadingLevel(chunk) {
  return isSubheadingChunk(chunk) ? Number(chunk.node.tagName.slice(1)) : null;
}

export function continuationContextText(text) {
  return `${text} (cont'd)`;
}

function continuationHeadingChunk(chunk) {
  const node = chunk.node.cloneNode(true);
  const heading = node.textContent;
  node.dataset.generatedSuffix = continuationContextText("");
  node.setAttribute("aria-label", continuationContextText(heading));
  node.dataset.continuationContext = "";
  return { kind: "node", node, continuationContext: true };
}

function addContinuationHeadingContext(groups) {
  let activeHeadings = [];
  return groups.map((group, pageIndex) => {
    const firstLevel = subheadingLevel(group[0]) ?? Number.POSITIVE_INFINITY;
    const context = pageIndex === 0
      ? []
      : activeHeadings
        .filter(({ level }) => level < firstLevel)
        .map(({ chunk }) => continuationHeadingChunk(chunk));

    for (const chunk of group) {
      const level = subheadingLevel(chunk);
      if (!level) continue;
      activeHeadings = activeHeadings.filter((heading) => heading.level < level);
      activeHeadings.push({ level, chunk });
    }
    return [...context, ...group];
  });
}

export function continuationListBreakPenalty(leftCount, rightCount) {
  let penalty = 2_000;
  if (rightCount < 2) penalty += (2 - rightCount) * 100_000;
  if (leftCount === 2) penalty += 100_000;
  return penalty;
}

function continuationBreakPenalty(chunks, index) {
  const before = chunks[index - 1];
  const after = chunks[index];
  if (!before || !after) return 0;

  // A subheading belongs with the content that follows it.
  if (isSubheadingChunk(before)) return 1_000_000;

  // Prefer moving a complete list. If it must split, prevent list widows and
  // orphans: at least two items continue, and two items are not left behind.
  if (before.kind === "list-item" && after.kind === "list-item" && before.group === after.group) {
    let leftCount = 0;
    let rightCount = 0;
    for (let cursor = index - 1; cursor >= 0 && chunks[cursor].kind === "list-item" && chunks[cursor].group === before.group; cursor -= 1) {
      leftCount += 1;
    }
    for (let cursor = index; cursor < chunks.length && chunks[cursor].kind === "list-item" && chunks[cursor].group === after.group; cursor += 1) {
      rightCount += 1;
    }
    return continuationListBreakPenalty(leftCount, rightCount);
  }
  return 0;
}

function balancedContinuationGroups(model, chunks, count, measurements) {
  const weights = chunks.map((chunk) => contentHeightAtPaginationSize(modelWithChunks(model, [chunk]), measurements));
  const prefix = [0];
  for (const weight of weights) prefix.push(prefix.at(-1) + weight);
  let best = null;

  const search = (start, remaining, ends = []) => {
    if (remaining === 1) {
      const boundaries = [...ends, chunks.length];
      let groupStart = 0;
      const groupWeights = boundaries.map((end) => {
        const weight = prefix[end] - prefix[groupStart];
        groupStart = end;
        return weight;
      });
      const spread = Math.max(...groupWeights) - Math.min(...groupWeights);
      const structurePenalty = ends.reduce((total, end) => total + continuationBreakPenalty(chunks, end), 0);
      const score = structurePenalty + spread + Math.max(...groupWeights) * 0.001;
      if (!best || score < best.score) best = { score, structurePenalty, boundaries };
      return;
    }
    const finalEnd = chunks.length - remaining + 1;
    for (let end = start + 1; end <= finalEnd; end += 1) search(end, remaining - 1, [...ends, end]);
  };

  search(0, count);
  let groupStart = 0;
  const groups = best.boundaries.map((end) => {
    const group = chunks.slice(groupStart, end);
    groupStart = end;
    return group;
  });
  return { groups, structurePenalty: best.structurePenalty };
}

function paginateModel(model, measurements) {
  if (model.title?.tagName !== "H2") return [model];
  const chunks = contentChunks(model.content);
  if (chunks.length < 2 || fitsAtPaginationSize(model, measurements)) return [model];

  const groups = [];
  let current = [];
  for (const chunk of chunks) {
    const candidate = [...current, chunk];
    if (current.length && !fitsAtPaginationSize(modelWithChunks(model, candidate), measurements)) {
      groups.push(current);
      current = [chunk];
    } else {
      current = candidate;
    }
  }
  if (current.length) groups.push(current);
  if (groups.length < 2) return [model];
  const estimatedPageCount = Math.min(3, groups.length);
  let pagination;
  for (let pageCount = estimatedPageCount; pageCount >= 2; pageCount -= 1) {
    const candidate = balancedContinuationGroups(model, chunks, pageCount, measurements);
    pagination = candidate;
    if (candidate.structurePenalty < 100_000) break;
  }
  const contextualGroups = addContinuationHeadingContext(pagination.groups);
  const pages = contextualGroups.map((group) => modelWithChunks(model, group));
  return pages.map((page, index) => addContinuationSuffix({
    ...page,
    continuation: index > 0,
  }, index + 1, pages.length));
}

function paginationCacheKey(model, measurements, sourceIndex) {
  if (!model.markdown) return null;
  const imageMeasurements = model.images.map(({ src }) => {
    const measurement = measurements.get(src);
    return `${src}:${measurement?.width || 0}x${measurement?.height || 0}`;
  }).join("|");
  return `${sourceIndex}\u0000${model.markdown}\u0000${imageMeasurements}`;
}

function paginateDocument(documentModel, measurements, cache) {
  return documentModel.slides.flatMap((model, sourceIndex) => {
    const key = paginationCacheKey(model, measurements, sourceIndex);
    if (key && cache.has(key)) return cache.get(key);
    const pages = paginateModel(model, measurements);
    if (key) {
      cache.set(key, pages);
      if (cache.size > 120) cache.delete(cache.keys().next().value);
    }
    return pages;
  });
}

export class Presentation {
  constructor({ stage, counter, progress, onIndexChange }) {
    this.stage = stage;
    this.counter = counter;
    this.progress = progress;
    this.onIndexChange = onIndexChange;
    this.slides = [];
    this.index = 0;
    this.assetManager = null;
    this.paginationCache = new Map();
    this.fontsReady = false;
    this.fontsReadyPromise = null;
    this.imagePopover = null;
    this.imagePopoverTrigger = null;
    this.escapeLockRequest = 0;
    this.handleStageClick = (event) => {
      if (this.imagePopover) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.target.closest?.(".image-popover-image, .image-popover-close")) this.closeImagePopover(true);
        return;
      }
      const image = event.target.closest?.(".image-slot img");
      if (image && this.stage.contains(image)) this.openImagePopover(image);
    };
    this.handleStageKeydown = (event) => {
      const image = event.target.closest?.(".image-slot img");
      if (image && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        this.openImagePopover(image);
      }
    };
    this.handleDocumentKeydown = (event) => {
      if (event.key === "Escape" && this.imagePopover) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closeImagePopover(true);
      }
    };
    this.handleFullscreenChange = () => {
      if (document.fullscreenElement && this.imagePopover) this.lockPopoverEscape();
      else this.unlockPopoverEscape();
    };
    stage.addEventListener("click", this.handleStageClick);
    stage.addEventListener("keydown", this.handleStageKeydown);
    document.addEventListener("keydown", this.handleDocumentKeydown);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.resizeObserver = new ResizeObserver(() => {
      this.fitCurrent();
      this.positionImagePopover();
    });
    this.resizeObserver.observe(stage);
  }

  async create(document, assetManager) {
    this.closeImagePopover();
    const previousAssetManager = this.assetManager;
    const canReuseSlides = previousAssetManager === assetManager;
    if (!canReuseSlides) this.paginationCache.clear();
    if (!this.fontsReady) {
      this.fontsReadyPromise ||= Promise.resolve(globalThis.document.fonts?.ready);
      await this.fontsReadyPromise;
      this.fontsReady = true;
    }
    const measurements = await loadImageMeasurements(document.slides, assetManager);
    document.slides = paginateDocument(document, measurements, this.paginationCache);
    const nextIndex = Math.max(0, Math.min(this.index, document.slides.length - 1));
    const reusableSlides = canReuseSlides
      ? new Map(this.slides.map((slide) => [slide.model, slide]))
      : new Map();
    const nextSlides = document.slides.map((model, index) => {
      const reusable = reusableSlides.get(model);
      const element = reusable?.element || documentFragmentFrom(model, index);
      element.setAttribute("aria-label", `Slide ${index + 1}`);
      element.dataset.slideNumber = String(index + 1);
      element.classList.toggle("is-active", index === nextIndex);
      return reusable || { model, element, assetsLoaded: false };
    });
    this.stage.replaceChildren(...nextSlides.map(({ element }) => element));
    this.slides = nextSlides;
    this.index = nextIndex;
    this.assetManager = assetManager;
    if (previousAssetManager !== assetManager) previousAssetManager?.dispose();
    return this.slides.length;
  }

  async show(index) {
    if (!this.slides.length) return;
    this.closeImagePopover();
    this.index = Math.max(0, Math.min(index, this.slides.length - 1));
    this.slides.forEach(({ element }, i) => element.classList.toggle("is-active", i === this.index));
    this.counter.textContent = `${this.index + 1} / ${this.slides.length}`;
    this.progress.style.transform = `scaleX(${(this.index + 1) / this.slides.length})`;
    this.onIndexChange?.(this.index);
    await Promise.allSettled([-1, 0, 1].map((offset) => this.loadAssets(this.index + offset)));
    this.fitCurrent();
  }

  next() { return this.show(this.index + 1); }
  previous() { return this.show(this.index - 1); }
  first() { return this.show(0); }
  last() { return this.show(this.slides.length - 1); }

  async loadAssets(index) {
    const slide = this.slides[index];
    if (!slide || slide.assetsLoaded) return;
    slide.assetsLoaded = true;
    const slots = [...slide.element.querySelectorAll("[data-image-src]")];
    await Promise.allSettled(slots.map(async (slot) => {
      try {
        const url = await this.assetManager.getUrl(slot.dataset.imageSrc);
        const image = document.createElement("img");
        image.src = url;
        image.alt = slot.dataset.imageAlt || "";
        image.decoding = "async";
        image.tabIndex = 0;
        image.setAttribute("role", "button");
        image.setAttribute("aria-label", image.alt ? `Enlarge image: ${image.alt}` : "Enlarge image");
        await image.decode().catch(() => {});
        slot.replaceChildren(image);
      } catch (error) {
        slot.classList.add("image-error");
        slot.textContent = error.message;
      }
    }));
    if (index === this.index) this.fitCurrent();
  }

  fitCurrent() {
    const slide = this.slides[this.index]?.element;
    if (!slide || !slide.classList.contains("is-active")) return;
    slide.style.setProperty("--slide-number-right", getComputedStyle(slide).paddingRight);
    const body = slide.querySelector(".slide-body");
    const text = slide.querySelector(".slide-copy");
    const media = slide.querySelector(".slide-media");
    if (!body || !text) return;
    text.style.fontSize = `${CONFIG.presentation.maxFontSize}px`;
    applySpacingGlue(slide, 1);
    refreshCaptionLayout(slide);
    this.fitMedia(slide, body, media);
    let low = CONFIG.presentation.minFontSize;
    let high = CONFIG.presentation.maxFontSize;
    const fits = () => text.scrollHeight <= text.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1 && (!media || media.scrollHeight <= media.clientHeight + 1);
    const maximizeSpacing = () => {
      applySpacingGlue(slide, 0);
      if (!fits()) return false;
      applySpacingGlue(slide, 2);
      if (fits()) return true;
      let spacingLow = 0;
      let spacingHigh = 2;
      while (spacingHigh - spacingLow > 0.01) {
        const middle = (spacingLow + spacingHigh) / 2;
        applySpacingGlue(slide, middle);
        if (fits()) spacingLow = middle; else spacingHigh = middle;
      }
      applySpacingGlue(slide, spacingLow);
      return true;
    };
    if (!maximizeSpacing()) {
      while (high - low > 0.35) {
        const middle = (low + high) / 2;
        text.style.fontSize = `${middle}px`;
        if (fits()) low = middle; else high = middle;
      }
      text.style.fontSize = `${low}px`;
      maximizeSpacing();
    }
    slide.classList.toggle("is-overflowing", !fits());
  }

  fitMedia(slide, body, media) {
    body.style.removeProperty("grid-template-columns");
    if (!media || slide.classList.contains("is-caption-layout")) return;
    const images = [...media.querySelectorAll("img")];
    if (images.length < 2 || !slide.classList.contains("is-active")) return;
    const ratios = images.map((image) => image.naturalWidth / image.naturalHeight);
    const rowGap = Number.parseFloat(getComputedStyle(media).rowGap) || 0;
    const width = fittedImageStackWidth(media.clientWidth, media.clientHeight, ratios, rowGap);
    if (width < media.clientWidth - 0.5) {
      body.style.gridTemplateColumns = `minmax(0, 1fr) ${Math.max(1, width)}px`;
    }
  }

  openImagePopover(sourceImage) {
    const slide = sourceImage.closest(".slide");
    if (!slide?.classList.contains("is-active")) return;
    this.closeImagePopover();

    const popover = document.createElement("div");
    popover.className = "image-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "true");
    popover.setAttribute("aria-label", sourceImage.alt ? `Enlarged image: ${sourceImage.alt}` : "Enlarged image");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-button image-popover-close";
    close.setAttribute("aria-label", "Close enlarged image");
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeImagePopover(true);
    });

    const image = document.createElement("img");
    image.className = "image-popover-image";
    image.addEventListener("load", () => this.positionImagePopover(), { once: true });
    image.src = sourceImage.currentSrc || sourceImage.src;
    image.alt = sourceImage.alt;
    image.decoding = "async";

    popover.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.target === popover) this.closeImagePopover(true);
    });
    popover.append(close, image);
    slide.append(popover);
    this.imagePopover = popover;
    this.imagePopoverTrigger = sourceImage;
    this.positionImagePopover();
    this.lockPopoverEscape();
  }

  async lockPopoverEscape() {
    if (!document.fullscreenElement || !navigator.keyboard?.lock) return;
    const request = ++this.escapeLockRequest;
    try {
      await navigator.keyboard.lock(["Escape"]);
      if (request !== this.escapeLockRequest || !document.fullscreenElement || !this.imagePopover) {
        navigator.keyboard.unlock();
      }
    } catch {
      // Keyboard Lock is a progressive enhancement and may be denied by Chrome.
    }
  }

  unlockPopoverEscape() {
    this.escapeLockRequest += 1;
    navigator.keyboard?.unlock?.();
  }

  positionImagePopover() {
    if (!this.imagePopover) return;
    const image = this.imagePopover.querySelector(".image-popover-image");
    const close = this.imagePopover.querySelector(".image-popover-close");
    if (!image?.naturalWidth || !image.naturalHeight || !close) return;

    const inset = 20;
    const availableWidth = Math.max(0, this.imagePopover.clientWidth - inset * 2);
    const availableHeight = Math.max(0, this.imagePopover.clientHeight - inset * 2);
    const scale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const cornerX = inset + (availableWidth - renderedWidth) / 2;
    const cornerY = inset + (availableHeight - renderedHeight) / 2;
    image.style.inset = "auto";
    image.style.left = `${cornerX}px`;
    image.style.top = `${cornerY}px`;
    image.style.width = `${renderedWidth}px`;
    image.style.height = `${renderedHeight}px`;
    close.style.left = `${cornerX - close.offsetWidth / 2}px`;
    close.style.top = `${cornerY - close.offsetHeight / 2}px`;
  }

  closeImagePopover(restoreFocus = false) {
    const trigger = this.imagePopoverTrigger;
    this.unlockPopoverEscape();
    this.imagePopover?.remove();
    this.imagePopover = null;
    this.imagePopoverTrigger = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  destroy() {
    this.closeImagePopover();
    this.stage.removeEventListener("click", this.handleStageClick);
    this.stage.removeEventListener("keydown", this.handleStageKeydown);
    document.removeEventListener("keydown", this.handleDocumentKeydown);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    this.resizeObserver.disconnect();
    this.assetManager?.dispose();
  }
}

function instantiateTemplate(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function documentFragmentFrom(model, index) {
  const isTitleSlide = model.title?.tagName === "H1";
  const template = model.imageOnly
    ? gallerySlideTemplate
    : isTitleSlide
    ? titleSlideTemplate
    : model.images.length
      ? imageSlideTemplate
      : contentSlideTemplate;
  const slide = instantiateTemplate(template);
  slide.setAttribute("aria-label", `Slide ${index + 1}`);
  slide.dataset.slideNumber = String(index + 1);

  if (model.title) {
    const title = slide.querySelector('[data-slot="title"]');
    title.append(cloneNode(model.title));
  } else {
    slide.querySelector('[data-slot="title"]')?.remove();
  }

  const copy = slide.querySelector('[data-slot="content"]');
  copy?.append(model.content.cloneNode(true));

  if (model.images.length) {
    const media = slide.querySelector('[data-slot="media"]');
    media.classList.toggle("is-single-image", !model.imageOnly && model.images.length === 1);
    if (model.imageOnly) media.style.setProperty("--gallery-count", model.images.length);
    for (const image of model.images) {
      const slot = document.createElement("figure");
      slot.className = "image-slot";
      slot.dataset.imageSrc = image.src;
      slot.dataset.imageAlt = image.alt;
      slot.innerHTML = '<span class="image-loading">Loading image…</span>';
      media.append(slot);
    }
  }
  return slide;
}
