function timeLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(timestamp);
}

function pause(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function resolveHistorySlide(presentation, location) {
  if (!presentation?.slides.length || !location) return null;
  const fallback = Number.isInteger(location.slideIndex)
    ? Math.max(0, Math.min(location.slideIndex, presentation.slides.length - 1))
    : null;
  if (!Number.isInteger(location.sourceStart)) return fallback;
  const matches = presentation.slides
    .map(({ model }, index) => ({ model, index }))
    .filter(({ model }) => Number.isInteger(model.sourceStart) && Number.isInteger(model.sourceEnd)
      && location.sourceStart >= model.sourceStart && location.sourceStart <= model.sourceEnd)
    .map(({ index }) => index);
  if (!matches.length) return fallback;
  if (fallback === null) return matches[0];
  return matches.reduce((nearest, index) => (
    Math.abs(index - fallback) < Math.abs(nearest - fallback) ? index : nearest
  ), matches[0]);
}

export class HistoryController {
  constructor({ panel, list, toggle, close, undo, redo, onRestore, currentSlide, resolveSlide, showSlide }) {
    this.panel = panel;
    this.list = list;
    this.toggle = toggle;
    this.closeButton = close;
    this.undoButton = undo;
    this.redoButton = redo;
    this.onRestore = onRestore;
    this.currentSlide = currentSlide;
    this.resolveSlide = resolveSlide;
    this.showSlide = showSlide;
    this.session = null;
    this.unsubscribe = null;
    this.restoring = false;

    toggle.addEventListener("click", () => this.togglePanel());
    close.addEventListener("click", () => this.close());
    undo.addEventListener("click", () => { void this.step("undo"); });
    redo.addEventListener("click", () => { void this.step("redo"); });
    document.addEventListener("keydown", (event) => this.handleKeydown(event), true);
  }

  setSession(session, onRestore = null) {
    if (onRestore) this.onRestore = onRestore;
    if (session === this.session) {
      this.render();
      return;
    }
    this.unsubscribe?.();
    this.session = session;
    this.unsubscribe = session?.subscribe(() => this.render());
    this.close();
    this.render();
  }

  async step(direction) {
    if (!this.session || this.restoring || !this.session[direction === "undo" ? "canUndo" : "canRedo"]) return;
    this.restoring = true;
    this.render();
    try {
      const location = this.session.stepLocation(direction);
      const target = this.resolveSlide?.(location);
      const shouldNavigate = Number.isInteger(target) && target !== this.currentSlide?.();
      if (shouldNavigate) {
        await this.showSlide?.(target);
        await pause(300);
      }
      this.session[direction]();
      this.render();
      await this.onRestore?.(this.session);
    } finally {
      this.restoring = false;
      this.render();
    }
  }

  async restore(index = null) {
    if (!this.session || this.restoring) return;
    this.restoring = true;
    if (index !== null) this.session.restoreHistory(index);
    this.render();
    try { await this.onRestore?.(this.session); }
    finally { this.restoring = false; this.render(); }
  }

  render() {
    if (!this.session) return;
    this.undoButton.disabled = !this.session.canUndo || this.restoring;
    this.redoButton.disabled = !this.session.canRedo || this.restoring;
    this.list.replaceChildren();
    for (const entry of [...this.session.historyEntries].reverse()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-entry";
      button.classList.toggle("is-current", entry.current);
      if (entry.current) button.setAttribute("aria-current", "true");
      button.innerHTML = `<span></span><small></small>`;
      button.querySelector("span").textContent = entry.label;
      button.querySelector("small").textContent = timeLabel(entry.at);
      button.addEventListener("click", () => { void this.restore(entry.index); });
      this.list.append(button);
    }
  }

  open() {
    this.panel.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.render();
    this.list.querySelector(".is-current")?.focus({ preventScroll: true });
  }
  close() { this.panel.hidden = true; this.toggle.setAttribute("aria-expanded", "false"); }
  togglePanel() { if (this.panel.hidden) this.open(); else this.close(); }

  handleKeydown(event) {
    if (event.key === "Escape" && !this.panel.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return;
    if (event.target.matches?.("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void this.step(event.shiftKey ? "redo" : "undo");
  }
}
