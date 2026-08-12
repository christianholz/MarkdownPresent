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
    this.openingIndex = 0;
    this.scrubPointerId = null;
    this.suppressSurfaceClick = false;
    this.dismissPointerId = null;

    toggle.addEventListener("click", () => this.togglePanel());
    close.addEventListener("click", () => this.close());
    dismissSurface.addEventListener("pointerdown", (event) => {
      if (this.panel.hidden || event.button !== 0) return;
      event.preventDefault();
      this.suppressSurfaceClick = true;
      this.dismissPointerId = event.pointerId;
      this.close();
    }, true);
    dismissSurface.addEventListener("click", (event) => {
      if (!this.suppressSurfaceClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressSurfaceClick = false;
      this.dismissPointerId = null;
    }, true);
    document.addEventListener("pointerup", (event) => {
      if (event.pointerId !== this.dismissPointerId) return;
      window.setTimeout(() => {
        this.suppressSurfaceClick = false;
        this.dismissPointerId = null;
      }, 0);
    }, true);
    list.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    list.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    list.addEventListener("pointercancel", (event) => this.handlePointerCancel(event));
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

      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        this.scrubPointerId = event.pointerId;
        this.list.setPointerCapture?.(event.pointerId);
        this.preview(index);
      });
      button.addEventListener("click", (event) => {
        if (event.detail !== 0) {
          event.preventDefault();
          return;
        }
        this.commit(index);
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
    this.openingIndex = this.index;
    this.panel.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.setHighlight(this.index, true);
  }

  close() {
    this.finishScrub();
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

  setHighlight(index, focus = false, scroll = true) {
    if (!this.buttons.length) return;
    this.highlightedIndex = (index + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((button, buttonIndex) => button.classList.toggle("is-highlighted", buttonIndex === this.highlightedIndex));
    const highlighted = this.buttons[this.highlightedIndex];
    if (scroll) highlighted.scrollIntoView({ block: "nearest" });
    if (focus) highlighted.focus({ preventScroll: true });
  }

  preview(index, focus = false, scroll = false) {
    this.setHighlight(index, focus, scroll);
    if (this.index !== this.highlightedIndex) this.onSelect(this.highlightedIndex);
  }

  commit(index = this.highlightedIndex) {
    this.preview(index);
    this.close();
  }

  cancel() {
    const openingIndex = this.openingIndex;
    this.close();
    this.onSelect(openingIndex);
  }

  buttonAtPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const button = element?.closest?.(".slide-outline-button");
    return button && this.list.contains(button) ? button : null;
  }

  buttonColumnContains(clientX) {
    const rect = this.buttons.find((button) => button.offsetParent !== null)?.getBoundingClientRect();
    return Boolean(rect && clientX >= rect.left && clientX <= rect.right);
  }

  handlePointerMove(event) {
    if (event.pointerId !== this.scrubPointerId) return;
    event.preventDefault();
    if (!this.buttonColumnContains(event.clientX)) {
      this.preview(this.openingIndex);
      return;
    }
    const button = this.buttonAtPoint(event.clientX, event.clientY);
    if (button) this.preview(this.buttons.indexOf(button));
  }

  handlePointerUp(event) {
    if (event.pointerId !== this.scrubPointerId) return;
    event.preventDefault();
    const button = this.buttonColumnContains(event.clientX) ? this.buttonAtPoint(event.clientX, event.clientY) : null;
    this.finishScrub(event.pointerId);
    if (button) this.commit(this.buttons.indexOf(button));
    else this.preview(this.openingIndex);
  }

  handlePointerCancel(event) {
    if (event.pointerId !== this.scrubPointerId) return;
    this.finishScrub(event.pointerId);
    this.preview(this.openingIndex);
  }

  finishScrub(pointerId = this.scrubPointerId) {
    if (pointerId === null) return;
    if (this.list.hasPointerCapture?.(pointerId)) this.list.releasePointerCapture(pointerId);
    this.scrubPointerId = null;
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
      this.preview(this.highlightedIndex + 1, true, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.preview(this.highlightedIndex - 1, true, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.cancel();
    }
  }
}
