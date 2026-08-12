import { CONFIG } from "./config.js";
import { fittedImageStackWidth } from "./layout.js";
import titleSlideTemplate from "./templates/title-slide.html?raw";
import contentSlideTemplate from "./templates/content-slide.html?raw";
import imageSlideTemplate from "./templates/image-slide.html?raw";
import gallerySlideTemplate from "./templates/gallery-slide.html?raw";

function cloneNode(node) {
  return node ? node.cloneNode(true) : null;
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
    this.imagePopover = null;
    this.imagePopoverTrigger = null;
    this.escapeLockRequest = 0;
    this.handleStageClick = (event) => {
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
    this.assetManager?.dispose();
    this.assetManager = assetManager;
    this.stage.replaceChildren();
    this.slides = document.slides.map((model, index) => {
      const slide = documentFragmentFrom(model, index);
      this.stage.append(slide);
      return { model, element: slide, assetsLoaded: false };
    });
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
    const body = slide.querySelector(".slide-body");
    const text = slide.querySelector(".slide-copy");
    const media = slide.querySelector(".slide-media");
    if (!body || !text) return;
    this.fitMedia(slide, body, media);
    text.style.fontSize = `${CONFIG.presentation.maxFontSize}px`;
    let low = CONFIG.presentation.minFontSize;
    let high = CONFIG.presentation.maxFontSize;
    const fits = () => text.scrollHeight <= text.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1 && (!media || media.scrollHeight <= media.clientHeight + 1);
    if (!fits()) {
      while (high - low > 0.35) {
        const middle = (low + high) / 2;
        text.style.fontSize = `${middle}px`;
        if (fits()) low = middle; else high = middle;
      }
      text.style.fontSize = `${low}px`;
    }
    slide.classList.toggle("is-overflowing", !fits());
  }

  fitMedia(slide, body, media) {
    body.style.removeProperty("grid-template-columns");
    if (!media) return;
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

    popover.addEventListener("click", (event) => event.stopPropagation());
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
