import { renderSlideElement } from "./presentation.js";

export function addSlideThumbnails(deck, slides, activeIndex, assetManager, onSelect) {
  const strip = document.createElement("nav");
  strip.className = "deck-editor-slides";
  strip.setAttribute("aria-label", "Slide previews");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const index = Number(entry.target.dataset.slide);
      const preview = renderSlideElement(slides[index].model, index);
      preview.classList.add("is-active", "deck-editor-thumbnail-slide");
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      for (const control of preview.querySelectorAll("a, button, input")) {
        const label = document.createElement("span");
        label.textContent = control.textContent;
        control.replaceWith(label);
      }
      for (const slot of preview.querySelectorAll("[data-image-src]")) {
        assetManager.getUrl(slot.dataset.imageSrc).then((url) => {
          if (!slot.isConnected) return;
          const image = document.createElement("img");
          image.alt = "";
          image.src = url;
          slot.replaceChildren(image);
        }).catch(() => { slot.textContent = ""; });
      }
      entry.target.querySelector(".deck-editor-thumbnail").append(preview);
    }
  }, { root: strip });

  let activeButton;
  slides.forEach(({ model }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.slide = String(index);
    const title = model.title?.textContent?.trim();
    button.setAttribute("aria-label", title ? `Slide ${index + 1}, ${title}` : `Slide ${index + 1}`);
    const image = document.createElement("span");
    image.className = "deck-editor-thumbnail";
    image.setAttribute("aria-hidden", "true");
    const caption = document.createElement("span");
    caption.textContent = title || `Slide ${index + 1}`;
    button.append(image, caption);
    if (index === activeIndex) {
      button.setAttribute("aria-current", "page");
      activeButton = button;
    }
    strip.append(button);
    observer.observe(button);
  });
  strip.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-slide]");
    if (button) onSelect(Number(button.dataset.slide));
  });
  deck.append(strip);
  activeButton?.scrollIntoView({ block: "nearest", inline: "nearest" });
  return () => {
    observer.disconnect();
    strip.remove();
  };
}
