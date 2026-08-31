function dimensions(element) {
  if (!element) return "—";
  return `${Math.round(element.scrollWidth)}×${Math.round(element.scrollHeight)} / ${Math.round(element.clientWidth)}×${Math.round(element.clientHeight)}`;
}

function sourceRange(model) {
  return Number.isInteger(model?.sourceStart) ? `${model.sourceStart}–${model.sourceEnd}` : "rendered HTML";
}

export class LayoutDiagnostics {
  constructor(presentation) {
    this.presentation = presentation;
    this.enabled = false;
    this.handleKeydown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "d") return;
      if (event.target.matches?.("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle();
    };
    this.handlePointerMove = (event) => {
      if (!this.enabled) return;
      const source = event.target.closest?.("[data-source-start]");
      const slide = event.target.closest?.(".slide");
      const detail = slide?.querySelector(".layout-diagnostics-element");
      if (!detail) return;
      detail.textContent = source
        ? `${source.tagName.toLowerCase()} source ${source.dataset.sourceStart}–${source.dataset.sourceEnd}`
        : "Move over an element to inspect its source range";
    };
    this.handleFit = () => { if (this.enabled) this.refresh(); };
    document.addEventListener("keydown", this.handleKeydown, true);
    presentation.stage.addEventListener("pointermove", this.handlePointerMove);
    presentation.stage.addEventListener("mdpresent:fit", this.handleFit);
  }

  toggle(force = !this.enabled) {
    this.enabled = Boolean(force);
    document.body.classList.toggle("has-layout-diagnostics", this.enabled);
    document.dispatchEvent(new CustomEvent("mdpresent:diagnosticschange", {
      detail: { enabled: this.enabled },
    }));
    this.refresh();
  }

  refresh() {
    this.presentation.stage.querySelectorAll(".layout-diagnostics").forEach((overlay) => overlay.remove());
    if (!this.enabled) return;
    this.presentation.slides.forEach(({ element, model }, index) => {
      const copy = element.querySelector(".slide-copy");
      const media = element.querySelector(".slide-media");
      const style = copy ? getComputedStyle(copy) : null;
      const images = [...element.querySelectorAll(".image-slot img")];
      const overlay = document.createElement("aside");
      overlay.className = "layout-diagnostics";
      overlay.setAttribute("aria-label", `Layout diagnostics for slide ${index + 1}`);
      overlay.innerHTML = `
        <strong>Layout diagnostics · ${index + 1}/${this.presentation.slides.length}</strong>
        <span>source ${sourceRange(model)}${model.continuation ? " · continuation" : ""}</span>
        <span>copy scroll/client ${dimensions(copy)}</span>
        <span>font ${style?.fontSize || "—"} · spacing ${Number(element.dataset.spacingFactor || 0).toFixed(2)}</span>
        <span>media ${dimensions(media)} · ${images.length} image${images.length === 1 ? "" : "s"}</span>
        <span class="layout-diagnostics-element">Move over an element to inspect its source range</span>`;
      element.append(overlay);
    });
  }

  destroy() {
    document.removeEventListener("keydown", this.handleKeydown, true);
    this.presentation.stage.removeEventListener("pointermove", this.handlePointerMove);
    this.presentation.stage.removeEventListener("mdpresent:fit", this.handleFit);
    document.body.classList.remove("has-layout-diagnostics");
    document.dispatchEvent(new CustomEvent("mdpresent:diagnosticschange", {
      detail: { enabled: false },
    }));
    this.presentation.stage.querySelectorAll(".layout-diagnostics").forEach((overlay) => overlay.remove());
  }
}
