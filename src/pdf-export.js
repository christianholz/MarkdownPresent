function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

let exporting = false;

export async function exportPresentationPdf(presentation, statusElement = null) {
  if (!presentation || exporting || document.body.classList.contains("has-layout-diagnostics")) return;
  exporting = true;
  document.body.classList.add("is-preparing-pdf");
  if (statusElement) statusElement.hidden = false;
  try {
    await presentation.prepareAllSlides();
    await nextFrame();
    document.body.classList.add("is-print-ready");
    await nextFrame();
    window.print();
  } finally {
    document.body.classList.remove("is-print-ready", "is-preparing-pdf");
    if (statusElement) statusElement.hidden = true;
    exporting = false;
  }
}
