export function setDeckEditControlsOpen(open, closeHistory) {
  const expanded = Boolean(open);
  const controls = document.querySelector("#edit-controls");
  const cluster = document.querySelector(".deck-control-cluster");
  if (expanded) {
    controls.hidden = false;
    controls.inert = false;
    controls.setAttribute("aria-hidden", "false");
    const gap = Number.parseFloat(getComputedStyle(cluster).getPropertyValue("--edit-controls-gap")) || 8;
    cluster.style.setProperty("--edit-controls-shift", `${(controls.offsetWidth + gap) / 2}px`);
    controls.getBoundingClientRect();
  } else {
    controls.inert = true;
    controls.setAttribute("aria-hidden", "true");
  }
  const toggle = document.querySelector("#edit-toggle");
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.classList.toggle("is-active", expanded);
  cluster.classList.toggle("is-edit-open", expanded);
  if (!expanded) closeHistory?.();
}

export function syncPdfExport(enabled = !document.body.classList.contains("has-layout-diagnostics")) {
  const button = document.querySelector("#export-pdf");
  button.disabled = !enabled;
  button.title = enabled ? "Export PDF" : "Turn off layout diagnostics before exporting PDF";
}

export async function copyText(text) {
  if (!text) throw new Error("This source cannot be linked until it is available at a stable URL.");
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.querySelector(".deck-screen").requestFullscreen();
}

export function promptForImageUrl(deck, onSubmit) {
  deck.querySelector(".image-url-dialog")?.remove();
  const dialog = document.createElement("form");
  dialog.className = "github-token-dialog image-url-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Add image URL");
  dialog.innerHTML = `
    <strong>Add an existing image</strong>
    <p>Paste an HTTPS URL to an image that is already online.</p>
    <label>Image URL<input type="url" inputmode="url" placeholder="https://example.com/image.png" autocomplete="url" required /></label>
    <p class="image-url-error" role="alert" hidden></p>
    <div><button type="button" data-action="cancel">Cancel</button><button type="submit">Add image</button></div>`;
  const input = dialog.querySelector("input");
  const error = dialog.querySelector(".image-url-error");
  const submit = dialog.querySelector('[type="submit"]');
  const close = () => { dialog.remove(); document.querySelector("#add-image")?.focus({ preventScroll: true }); };
  dialog.querySelector('[data-action="cancel"]').addEventListener("click", close);
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
  dialog.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try { await onSubmit(input.value); close(); }
    catch (failure) {
      error.textContent = failure?.message || String(failure);
      error.hidden = false;
      submit.disabled = false;
      input.focus({ preventScroll: true });
    }
  });
  deck.append(dialog);
  input.focus({ preventScroll: true });
}

export function handleDeckNavigationKeydown(event, presentation) {
  if (document.querySelector(".deck-screen").hidden || document.querySelector(".deck-screen.is-live-editing") || event.target.matches("input, textarea, [contenteditable='true']")) return;
  if (event.target.matches("button") && ["Enter", " "].includes(event.key)) return;
  const actions = {
    ArrowRight: () => presentation?.next(), ArrowDown: () => presentation?.next(), PageDown: () => presentation?.next(), " ": () => presentation?.next(),
    ArrowLeft: () => presentation?.previous(), ArrowUp: () => presentation?.previous(), PageUp: () => presentation?.previous(),
    Home: () => presentation?.first(), End: () => presentation?.last(), f: toggleFullscreen, F: toggleFullscreen,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
}
