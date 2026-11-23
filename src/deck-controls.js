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
