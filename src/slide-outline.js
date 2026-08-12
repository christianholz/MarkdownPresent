export function slideOutlineLabel(slide, index) {
  return slide.title?.textContent?.trim() || `Slide ${index + 1}`;
}

export class SlideOutline {
  constructor({ panel, list, toggle, close, dismissSurface, onSelect }) {
    this.panel = panel;
    this.list = list;
    this.toggle = toggle;
    this.closeButton = close;
    this.onSelect = onSelect;
    this.buttons = [];
    this.index = 0;
    this.highlightedIndex = 0;

    toggle.addEventListener("click", () => this.togglePanel());
    close.addEventListener("click", () => this.close());
    dismissSurface.addEventListener("pointerdown", () => {
      if (!this.panel.hidden) this.close();
    });
    document.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  setSlides(slides) {
    this.list.replaceChildren();
    this.buttons = slides.map((slide, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slide-outline-button";
      button.classList.toggle("is-section", slide.title?.tagName === "H1");

      const number = document.createElement("span");
      number.className = "slide-outline-number";
      number.textContent = String(index + 1);
      const label = document.createElement("span");
      label.className = "slide-outline-label";
      label.textContent = slideOutlineLabel(slide, index);
      button.append(number, label);

      button.addEventListener("click", () => {
        this.highlightedIndex = index;
        this.onSelect(index);
        this.close();
      });
      this.list.append(button);
      return button;
    });
    this.setActive(0);
  }

  setActive(index) {
    this.index = index;
    if (this.panel.hidden) this.highlightedIndex = index;
    this.buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  open() {
    this.panel.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.setHighlight(this.index, true);
  }

  close() {
    const focusedElement = document.activeElement;
    this.panel.hidden = true;
    this.toggle.setAttribute("aria-expanded", "false");
    if (focusedElement === this.toggle || this.panel.contains(focusedElement)) {
      focusedElement.blur();
    }
  }

  togglePanel() {
    if (this.panel.hidden) this.open();
    else this.close();
  }

  setHighlight(index, focus = false) {
    if (!this.buttons.length) return;
    this.highlightedIndex = (index + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((button, buttonIndex) => button.classList.toggle("is-highlighted", buttonIndex === this.highlightedIndex));
    const highlighted = this.buttons[this.highlightedIndex];
    highlighted.scrollIntoView({ block: "nearest" });
    if (focus) highlighted.focus({ preventScroll: true });
  }

  handleKeydown(event) {
    if (event.target.matches?.("input, textarea, [contenteditable='true']")) return;
    if (["g", "G", "=", "+"].includes(event.key)) {
      event.preventDefault();
      if (this.panel.hidden) this.open();
      return;
    }
    if (this.panel.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.setHighlight(this.highlightedIndex + 1, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.setHighlight(this.highlightedIndex - 1, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.onSelect(this.highlightedIndex);
      this.close();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }
}
