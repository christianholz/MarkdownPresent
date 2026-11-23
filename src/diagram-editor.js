import SvgCanvas from "@svgedit/svgcanvas";
import DOMPurify from "dompurify";
import { triggerDownload } from "./asset-workspace.js";
import { installBendHandles, routeSelector, toggleRoundedRoute } from "./diagram-connectors.js";
import "./diagram-editor.css";

const dimensions = [720, 450];
const namespace = "http://www.w3.org/2000/svg";
const arrowId = "mdpresent-arrowhead";
let editor;

const tools = {
  select: ["Select", "select"],
  rect: ["Rectangle", "rect"],
  rounded: ["Rounded rectangle", "rect"],
  circle: ["Circle", "circle"],
  line: ["Line", "line"],
  arrow: ["Arrow", "line"],
  pen: ["Pen", "path"],
};

function svgFromFile(text) {
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  if (document.documentElement.localName !== "svg" || document.documentElement.namespaceURI !== namespace) {
    throw new Error("Choose a valid SVG file.");
  }
  const clean = DOMPurify.sanitize(text, {
    PARSER_MEDIA_TYPE: "application/xhtml+xml",
    ALLOWED_TAGS: ["svg", "g", "rect", "circle", "ellipse", "line", "path", "polyline", "polygon", "defs", "marker", "title", "desc"],
    KEEP_CONTENT: false,
    ALLOWED_ATTR: [
      "xmlns", "id", "viewBox", "width", "height", "x", "y", "rx", "ry", "r", "cx", "cy",
      "x1", "x2", "y1", "y2", "d", "points", "transform", "fill", "fill-opacity", "fill-rule",
      "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity",
      "marker-end", "marker-start", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["data-mdpresent-route", "data-mdpresent-bend"],
  });
  if (!clean) throw new Error("This SVG has no supported drawing.");
  return clean;
}

async function createEditor(host) {
  const dialog = document.createElement("dialog");
  dialog.className = "diagram-editor";
  dialog.setAttribute("aria-label", "Diagram editor");
  dialog.innerHTML = `
    <div class="diagram-layout">
      <header class="diagram-bar">
        <strong>Diagram</strong>
        <button type="button" data-action="open">Open SVG</button>
        <input type="file" accept=".svg,image/svg+xml" hidden>
        <button type="button" data-action="undo" aria-label="Undo diagram edit" title="Undo">↶</button>
        <button type="button" data-action="redo" aria-label="Redo diagram edit" title="Redo">↷</button>
        <button type="button" data-action="close">Close</button>
        <button type="button" data-action="download">Download SVG</button>
        <button type="button" data-action="insert">Insert diagram</button>
      </header>
      <div class="diagram-bar diagram-tools" role="group" aria-label="Drawing tools">
        ${Object.entries(tools).map(([key, [label]]) => `<button type="button" data-tool="${key}" aria-pressed="false">${label}</button>`).join("")}
        <button type="button" data-action="finish" hidden>Finish path</button>
        <button type="button" data-action="route" aria-pressed="false" title="Select a line or arrow to change its route">Rounded route</button>
        <button type="button" data-action="delete" aria-label="Delete selection">Delete</button>
      </div>
      <div class="diagram-workarea" tabindex="0" aria-label="Drawing canvas">
        <div class="diagram-canvas"></div>
      </div>
      <p class="diagram-status" role="status"></p>
    </div>`;
  host.append(dialog);
  const workarea = dialog.querySelector(".diagram-workarea");
  const surface = dialog.querySelector(".diagram-canvas");
  const status = dialog.querySelector(".diagram-status");
  const action = (name) => dialog.querySelector(`[data-action="${name}"]`);
  const fileInput = dialog.querySelector('input[type="file"]');
  const canvas = new SvgCanvas(surface, {
    dimensions, baseUnit: "px", show_outside_canvas: false, initOpacity: 1,
    initFill: { color: "none", opacity: 1 },
    initStroke: { color: "263747", opacity: 1, width: 2 },
  });
  let tool = "select";
  let drawing = false;
  let pending = false;
  let insertDiagram = null;
  let resolveClose;
  let frame;

  const shapes = "rect, circle, ellipse, line, path, polyline, polygon";
  const hasDrawing = () => [...canvas.getSvgContent().querySelectorAll(shapes)]
    .some((shape) => shape !== canvas.getDrawnPath() && !shape.closest("defs"));
  const selected = () => canvas.getSelectedElements().filter(Boolean);
  const selectedLine = () => {
    const elements = selected();
    if (elements.length === 1 && elements[0].matches(`line, ${routeSelector}`)) return elements[0];
    return null;
  };
  const setStatus = (message = "") => { status.textContent = message; };
  const refreshBends = installBendHandles(canvas, workarea, () => sync());

  function sync() {
    if (!dialog.open) return;
    const active = canvas.getMode() === "select" ? "select" : tool;
    const line = selectedLine();
    const routed = line?.matches(routeSelector) ?? false;
    const path = canvas.getDrawnPath();
    const canExport = hasDrawing() && !path && !drawing && !pending;
    const { undoMgr } = canvas;
    for (const button of dialog.querySelectorAll("[data-tool]")) {
      button.setAttribute("aria-pressed", String(button.dataset.tool === active));
    }
    action("route").disabled = !line || drawing || pending;
    action("route").setAttribute("aria-pressed", String(routed));
    surface.classList.toggle("has-routed-selection", routed);
    action("finish").hidden = active !== "pen" || !path;
    action("finish").disabled = (path?.pathSegList.numberOfItems ?? 0) < 2;
    action("delete").disabled = !selected().length || drawing || pending;
    action("open").disabled = hasDrawing() || !!path || drawing || pending
      || !!undoMgr.getUndoStackSize() || !!undoMgr.getRedoStackSize();
    action("undo").disabled = !undoMgr.getUndoStackSize() || drawing || pending;
    action("redo").disabled = !undoMgr.getRedoStackSize() || drawing || pending;
    action("download").disabled = !canExport;
    action("insert").disabled = !canExport;
    action("close").disabled = pending;
    refreshBends();
  }

  const scheduleSync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(sync);
  };

  // A route owns its bend geometry. Keep SVGEdit's generic path point tool off these paths.
  const selectPath = canvas.pathActions.select.bind(canvas.pathActions);
  canvas.pathActions.select = (element, ...args) => {
    if (!element?.matches(routeSelector)) return selectPath(element, ...args);
  };
  surface.addEventListener("dblclick", (event) => {
    if (event.target.closest(routeSelector)) event.stopImmediatePropagation();
  }, true);

  function addArrowhead(line) {
    const defs = canvas.findDefs();
    if (!defs.querySelector(`#${arrowId}`)) {
      const marker = document.createElementNS(namespace, "marker");
      const attrs = { id: arrowId, markerWidth: 6, markerHeight: 6, refX: 5.5, refY: 3, orient: "auto", viewBox: "0 0 6 6" };
      for (const [key, value] of Object.entries(attrs)) marker.setAttribute(key, value);
      const tip = document.createElementNS(namespace, "path");
      tip.setAttribute("d", "M 0 0 L 6 3 L 0 6 Z");
      tip.setAttribute("fill", "#263747");
      marker.append(tip);
      defs.append(marker);
    }
    line.setAttribute("marker-end", `url(#${arrowId})`);
  }

  await canvas.addExtension("mdpresent-tools", () => ({
    mouseUp() {
      const element = canvas.getSvgContent().querySelector(`#${CSS.escape(canvas.getId())}`);
      if (element && canvas.getMode() === tools[tool][1] && tool !== "select") {
        element.setAttribute("opacity", canvas.getStyle().opacity);
      }
      if (tool === "arrow" && canvas.getMode() === "line" && element?.localName === "line") addArrowhead(element);
      if (tool === "rounded" && canvas.getMode() === "rect" && element?.localName === "rect") {
        const radius = Math.min(12, Number(element.getAttribute("width")) / 2, Number(element.getAttribute("height")) / 2);
        element.setAttribute("rx", radius);
        element.setAttribute("ry", radius);
      }
    },
  }), {});

  canvas.bind("changed", scheduleSync);
  canvas.bind("selected", scheduleSync);
  surface.addEventListener("mousedown", () => { drawing = true; });
  for (const type of ["mouseup", "mouseleave", "touchend", "touchcancel"]) {
    surface.addEventListener(type, () => { drawing = false; scheduleSync(); });
  }
  workarea.addEventListener("pointermove", scheduleSync);

  function layout() {
    if (!dialog.open || !workarea.clientWidth || !workarea.clientHeight) return;
    const { w, h } = canvas.getResolution();
    canvas.clearSelection();
    canvas.setZoom(Math.min(1, (workarea.clientWidth - 28) / w, (workarea.clientHeight - 28) / h));
    canvas.updateCanvas(workarea.clientWidth, workarea.clientHeight);
    sync();
  }
  new ResizeObserver(layout).observe(workarea);

  function selectTool(name) {
    tool = name;
    canvas.setMode(tools[tool][1]);
    canvas.clearSelection();
    setStatus(tool === "pen" ? "Click for a corner or drag for a curve. Press Enter to finish." : "");
    sync();
  }

  function finishPath() {
    const drawn = canvas.getDrawnPath();
    if (!drawn || drawn.pathSegList.numberOfItems < 2) return;
    const finished = drawn.cloneNode(true);
    finished.removeAttribute("style");
    finished.setAttribute("opacity", canvas.getStyle().opacity);
    selectTool("select");
    canvas.getCurrentDrawing().getCurrentLayer().append(finished);
    canvas.addCommandToHistory(new canvas.history.InsertElementCommand(finished, "Draw path"));
    canvas.selectOnly([finished], true);
    sync();
  }

  function historyStep(direction) {
    if (pending || drawing) return;
    if (canvas.getDrawnPath()) {
      selectTool("select");
      return;
    }
    canvas.undoMgr[direction]();
    sync();
  }

  function deleteSelection() {
    if (pending || drawing || !selected().length) return;
    canvas.deleteSelectedElements();
    sync();
  }

  function exportFile() {
    return new File([canvas.getSvgString()], "diagram.svg", { type: "image/svg+xml" });
  }

  dialog.querySelector(".diagram-tools").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (button && !pending) selectTool(button.dataset.tool);
  });
  action("route").addEventListener("click", () => {
    const line = selectedLine();
    if (line) {
      toggleRoundedRoute(canvas, line);
      setStatus(line.localName === "line" ? "Hover over the route and drag the bend. Double-click the handle to reset." : "");
      sync();
    }
  });
  action("finish").addEventListener("click", finishPath);
  action("delete").addEventListener("click", deleteSelection);
  action("undo").addEventListener("click", () => historyStep("undo"));
  action("redo").addEventListener("click", () => historyStep("redo"));
  action("close").addEventListener("click", () => dialog.close());
  action("open").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;
    fileInput.value = "";
    if (!file || action("open").disabled) return;
    try {
      if (file.size > 2_000_000) throw new Error("Choose an SVG under 2 MB.");
      const svg = svgFromFile(await file.text());
      if (!dialog.open || action("open").disabled) return;
      if (!canvas.setSvgString(svg, true)) throw new Error("Could not open this SVG.");
      canvas.undoMgr.resetUndoStack();
      layout();
    } catch (error) { setStatus(error.message); }
  });
  action("download").addEventListener("click", () => {
    const file = exportFile();
    triggerDownload(file.name, file);
    setStatus("SVG downloaded.");
  });
  action("insert").addEventListener("click", async () => {
    if (!insertDiagram || pending) return;
    pending = true;
    sync();
    try {
      await insertDiagram(exportFile());
      dialog.close();
    } catch (error) { setStatus(error.message || "Could not insert the diagram."); }
    finally { pending = false; sync(); }
  });
  dialog.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      historyStep(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
    } else if (event.key === "Escape" && canvas.getDrawnPath()) {
      event.preventDefault();
      selectTool("select");
    } else if (event.key === "Enter" && canvas.getDrawnPath()) {
      event.preventDefault();
      finishPath();
    } else if (["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault();
      deleteSelection();
    }
  });
  dialog.addEventListener("cancel", (event) => { if (pending) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    const done = resolveClose;
    resolveClose = null;
    insertDiagram = null;
    done?.();
  });

  return {
    open(nextHost, onInsert) {
      if (dialog.open) return Promise.resolve();
      if (dialog.parentNode !== nextHost) nextHost.append(dialog);
      insertDiagram = onInsert;
      action("insert").hidden = !onInsert;
      canvas.setMode("select");
      canvas.setZoom(1);
      canvas.setResolution(...dimensions);
      canvas.clear();
      drawing = false;
      dialog.showModal();
      selectTool("select");
      layout();
      workarea.focus();
      return new Promise((resolve) => { resolveClose = resolve; });
    },
  };
}

export async function openDiagramEditor(host, onInsert) {
  editor ||= createEditor(host).catch((error) => { editor = null; throw error; });
  return (await editor).open(host, onInsert);
}
