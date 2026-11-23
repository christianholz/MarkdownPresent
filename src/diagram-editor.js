import SvgCanvas from "@svgedit/svgcanvas";
import { sanitizeDiagramSvg } from "./diagram-svg.js";
import {
  applyDiagramPlacement, boundDiagramPlacement, defaultPlacement, parseDiagramPlacement,
  placementAttribute, serializeDiagramPlacement,
} from "./diagram-placement.js";
import { triggerDownload } from "./asset-workspace.js";
import { installBendHandles, routeSelector, toggleRoundedRoute } from "./diagram-connectors.js";
import "./diagram-editor.css";

const dimensions = [720, 450];
const namespace = "http://www.w3.org/2000/svg";
const arrowId = "mdpresent-arrowhead";
let editor;

const tools = {
  select: ["Select", "select", '<path d="M5 3v15l4-4 3 6 3-1-3-6h6z"/>'],
  rect: ["Rectangle", "rect", '<rect x="4" y="5" width="16" height="14"/>'],
  rounded: ["Rounded rectangle", "rect", '<rect x="4" y="5" width="16" height="14" rx="4"/>'],
  circle: ["Circle", "circle", '<circle cx="12" cy="12" r="8"/>'],
  line: ["Line", "line", '<path d="m5 19 14-14"/>'],
  arrow: ["Arrow", "line", '<path d="m5 19 14-14m-7 0h7v7"/>'],
  pen: ["Pen", "path", '<path d="M4 18c8 0 8-12 16-12M9 17l6-10"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>'],
};

function icon(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

async function createEditor(slot) {
  const dialog = document.createElement("section");
  dialog.className = "diagram-editor";
  dialog.setAttribute("aria-label", "Diagram tools");
  dialog.hidden = true;
  dialog.innerHTML = `
      <header class="diagram-bar">
        <strong>Diagram</strong>
        <button type="button" data-action="open">Open SVG</button>
        <input type="file" accept=".svg,image/svg+xml" hidden>
        <button type="button" data-action="undo" aria-label="Undo diagram edit" title="Undo">↶</button>
        <button type="button" data-action="redo" aria-label="Redo diagram edit" title="Redo">↷</button>
        <button type="button" data-action="close">Cancel drawing</button>
        <button type="button" data-action="download">Download SVG</button>
        <button type="button" data-action="insert">Apply diagram</button>
      </header>
      <div class="diagram-bar diagram-tools" role="group" aria-label="Drawing tools">
        ${Object.entries(tools).map(([key, [label, , path]]) => (
          `<button type="button" data-tool="${key}" aria-pressed="false" aria-label="${label}" title="${label}">${icon(path)}</button>`
        )).join("")}
        <button type="button" data-action="finish" aria-label="Finish path" title="Finish path" hidden>${icon('<path d="m5 12 4 4 10-10"/>')}</button>
        <button type="button" data-action="route" aria-pressed="false" aria-label="Rounded route" title="Rounded route for the selected line or arrow">${icon('<path d="M4 6h5a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h5"/>')}</button>
        <button type="button" data-action="delete" aria-label="Delete selection" title="Delete selection">${icon('<path d="M4 6h16M9 6V3h6v3m3 0-1 14H7L6 6m4 4v6m4-6v6"/>')}</button>
      </div>
      <div class="diagram-bar diagram-placement" role="group" aria-label="Position and size on the slide, in percent">
        <label>X <input type="number" min="0" max="100" step="0.1" data-position="x" aria-label="Horizontal position (%)"></label>
        <label>Y <input type="number" min="0" max="100" step="0.1" data-position="y" aria-label="Vertical position (%)"></label>
        <label>Width <input type="number" min="5" max="100" step="0.1" data-position="width" aria-label="Width (%)"></label>
        <label>Height <input type="number" min="5" max="100" step="0.1" data-position="height" aria-label="Height (%)"></label>
        <span aria-hidden="true">%</span>
      </div>
      <p class="diagram-status" role="status"></p>`;
  const workarea = document.createElement("div");
  workarea.className = "diagram-workarea";
  workarea.tabIndex = 0;
  workarea.setAttribute("aria-label", "Drawing canvas");
  const surface = document.createElement("div");
  surface.className = "diagram-canvas";
  const moveHandle = document.createElement("button");
  moveHandle.type = "button";
  moveHandle.className = "diagram-move-handle";
  moveHandle.title = "Drag to position the diagram";
  moveHandle.setAttribute("aria-label", "Move diagram");
  moveHandle.innerHTML = icon('<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>');
  workarea.append(surface, moveHandle);
  slot.append(workarea);
  const status = dialog.querySelector(".diagram-status");
  const action = (name) => dialog.querySelector(`[data-action="${name}"]`);
  const fileInput = dialog.querySelector('input[type="file"]');
  const positionFields = [...dialog.querySelectorAll("[data-position]")];
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
  let moveGesture;
  let displayedPlacement;

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
  const getPlacement = () => parseDiagramPlacement(canvas.getSvgContent().getAttribute(placementAttribute)) || defaultPlacement;

  function showPlacement(placement, syncFields = true) {
    const value = serializeDiagramPlacement(placement);
    if (displayedPlacement !== value) {
      applyDiagramPlacement(workarea.parentElement, placement);
      displayedPlacement = value;
    }
    if (syncFields) {
      for (const field of positionFields) {
        if (field !== document.activeElement) field.value = placement[field.dataset.position];
      }
    }
  }

  function changePlacement(placement) {
    const drawingRoot = canvas.getSvgContent();
    const previous = drawingRoot.getAttribute(placementAttribute);
    const next = serializeDiagramPlacement(placement);
    if (next !== previous) {
      drawingRoot.setAttribute(placementAttribute, next);
      canvas.addCommandToHistory(new canvas.history.ChangeElementCommand(drawingRoot, { [placementAttribute]: previous }, "diagram position"));
    }
    sync();
  }

  function sync() {
    if (dialog.hidden) return;
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
    if (!moveGesture) showPlacement(getPlacement());
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
    if (dialog.hidden || !workarea.clientWidth || !workarea.clientHeight) return;
    const { w, h } = canvas.getResolution();
    canvas.clearSelection();
    canvas.setZoom(Math.min(workarea.clientWidth / w, workarea.clientHeight / h));
    canvas.updateCanvas(workarea.clientWidth, workarea.clientHeight);
    sync();
  }
  new ResizeObserver(layout).observe(workarea);

  for (const field of positionFields) {
    field.addEventListener("change", () => {
      if (pending || moveGesture) return;
      const placement = getPlacement();
      const number = field.valueAsNumber;
      const next = Number.isFinite(number)
        ? boundDiagramPlacement({ ...placement, [field.dataset.position]: number }) : placement;
      changePlacement(next);
      field.value = next[field.dataset.position];
    });
  }
  moveHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pending || moveGesture) return;
    event.preventDefault();
    event.stopPropagation();
    const slide = workarea.closest(".slide");
    const bounds = slide.getBoundingClientRect();
    const initial = getPlacement();
    let next = initial;
    const gesture = new AbortController();
    moveGesture = gesture;
    const { pointerId, clientX, clientY } = event;
    const options = { signal: gesture.signal };
    document.addEventListener("pointermove", (move) => {
      if (move.pointerId !== pointerId) return;
      next = boundDiagramPlacement({
        ...initial,
        x: initial.x + (move.clientX - clientX) * 100 / bounds.width,
        y: initial.y + (move.clientY - clientY) * 100 / bounds.height,
      });
      showPlacement(next, false);
    }, options);
    const end = (release) => {
      if (release.pointerId !== pointerId) return;
      gesture.abort();
      moveGesture = null;
      changePlacement(release.type === "pointercancel" ? initial : next);
    };
    document.addEventListener("pointerup", end, options);
    document.addEventListener("pointercancel", end, options);
  });
  moveHandle.addEventListener("keydown", (event) => {
    const directions = { ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", -1], ArrowDown: ["y", 1] };
    if (!directions[event.key] || pending) return;
    event.preventDefault();
    const [axis, step] = directions[event.key];
    const placement = getPlacement();
    changePlacement(boundDiagramPlacement({ ...placement, [axis]: placement[axis] + step * (event.shiftKey ? 5 : 1) }));
  });

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
    if (pending || drawing || moveGesture) return;
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
  action("close").addEventListener("click", () => close());
  action("open").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;
    fileInput.value = "";
    if (!file || action("open").disabled) return;
    try {
      if (file.size > 2_000_000) throw new Error("Choose an SVG under 2 MB.");
      const svg = sanitizeDiagramSvg(await file.text());
      if (dialog.hidden || action("open").disabled) return;
      const currentPlacement = getPlacement();
      if (!canvas.setSvgString(svg, true)) throw new Error("Could not open this SVG.");
      canvas.getSvgContent().setAttribute(placementAttribute, serializeDiagramPlacement(currentPlacement));
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
      await insertDiagram(exportFile(), serializeDiagramPlacement(getPlacement()));
      close();
    } catch (error) { setStatus(error.message || "Could not insert the diagram."); }
    finally { pending = false; sync(); }
  });
  function handleKeydown(event) {
    if (event.defaultPrevented || event.isComposing || event.target.matches("input")) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      historyStep(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
    } else if (event.key === "Escape" && !pending) {
      event.preventDefault();
      if (canvas.getDrawnPath()) selectTool("select");
      else close();
    } else if (event.key === "Enter" && canvas.getDrawnPath()) {
      event.preventDefault();
      finishPath();
    } else if (["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault();
      deleteSelection();
    }
  }
  dialog.addEventListener("keydown", handleKeydown);
  workarea.addEventListener("keydown", handleKeydown);

  function close() {
    cancelAnimationFrame(frame);
    moveGesture?.abort();
    moveGesture = null;
    dialog.hidden = true;
    dialog.remove();
    workarea.remove();
    const done = resolveClose;
    resolveClose = null;
    insertDiagram = null;
    done?.();
  }

  return {
    open(toolbar, slot, onInsert, svg, placement) {
      if (!dialog.hidden) return Promise.resolve();
      insertDiagram = onInsert;
      toolbar.append(dialog);
      slot.append(workarea);
      canvas.setMode("select");
      canvas.setZoom(1);
      canvas.setResolution(...dimensions);
      canvas.clear();
      drawing = false;
      displayedPlacement = null;
      try {
        if (svg && !canvas.setSvgString(sanitizeDiagramSvg(svg), true)) throw new Error("Could not open this SVG.");
      } catch (error) {
        close();
        throw error;
      }
      canvas.getSvgContent().setAttribute(placementAttribute, serializeDiagramPlacement(placement || defaultPlacement));
      dialog.hidden = false;
      selectTool("select");
      layout();
      workarea.focus();
      return new Promise((resolve) => { resolveClose = resolve; });
    },
  };
}

export async function openDiagramEditor(toolbar, slot, onInsert, svg, placement) {
  editor ||= createEditor(slot).catch((error) => { editor = null; throw error; });
  return (await editor).open(toolbar, slot, onInsert, svg, placement);
}
