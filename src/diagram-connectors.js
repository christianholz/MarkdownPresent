import { automaticBend, bendFraction, roundedRoute, routeAxis } from "./diagram-route.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const axisAttribute = "data-mdpresent-route";
const bendAttribute = "data-mdpresent-bend";
const lineCoordinates = ["x1", "y1", "x2", "y2"];
export const routeSelector = `path[${axisAttribute}="x"], path[${axisAttribute}="y"]`;

function endpoints(element) {
  if (element.localName === "line") {
    const [x1, y1, x2, y2] = lineCoordinates.map((name) => Number(element.getAttribute(name)));
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }
  return [element.getPointAtLength(0), element.getPointAtLength(element.getTotalLength())];
}

function routeGeometry(element) {
  const [start, end] = endpoints(element);
  const axis = element.getAttribute(axisAttribute);
  const fraction = element.hasAttribute(bendAttribute) ? Number(element.getAttribute(bendAttribute)) : automaticBend;
  return { start, end, axis, fraction };
}

export function toggleRoundedRoute(canvas, element) {
  const [start, end] = endpoints(element);
  const isLine = element.localName === "line";
  const replacement = document.createElementNS(svgNamespace, isLine ? "path" : "line");
  for (const { name, value } of element.attributes) {
    if (!["d", ...lineCoordinates, axisAttribute, bendAttribute].includes(name)) replacement.setAttribute(name, value);
  }
  if (isLine) {
    const axis = routeAxis(start, end);
    replacement.setAttribute(axisAttribute, axis);
    replacement.setAttribute("d", roundedRoute(start, end, axis).path);
    replacement.setAttribute("fill", "none");
  } else {
    [start.x, start.y, end.x, end.y].forEach((value, i) => replacement.setAttribute(lineCoordinates[i], value));
  }
  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = canvas.history;
  const command = new BatchCommand(isLine ? "Use rounded route" : "Use straight line");
  const parent = element.parentNode;
  const sibling = element.nextSibling;
  canvas.clearSelection();
  element.replaceWith(replacement);
  command.addSubCommand(new RemoveElementCommand(element, sibling, parent));
  command.addSubCommand(new InsertElementCommand(replacement));
  canvas.addCommandToHistory(command);
  canvas.selectOnly([replacement], true);
}

export function installBendHandles(canvas, container, onChange) {
  const handles = new Map();
  let hovered = null;
  let drag = null;

  function applyBend(path, geometry, fraction) {
    path.setAttribute("d", roundedRoute(geometry.start, geometry.end, geometry.axis, fraction ?? automaticBend).path);
    if (fraction === null) path.removeAttribute(bendAttribute);
    else path.setAttribute(bendAttribute, fraction.toFixed(4));
  }

  function previousValues(path) {
    return { d: path.getAttribute("d"), [bendAttribute]: path.getAttribute(bendAttribute) };
  }

  function recordChange(path, previous, label) {
    if (Object.entries(previous).every(([name, value]) => path.getAttribute(name) === value)) return;
    canvas.addCommandToHistory(new canvas.history.ChangeElementCommand(path, previous, label));
    if (canvas.getSelectedElements().includes(path)) canvas.selectorManager.requestSelector(path).resize();
    onChange();
  }

  function createHandle(path) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "diagram-bend";
    handle.setAttribute("aria-label", "Adjust bend");
    handle.title = "Drag to adjust bend. Double-click to reset.";
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      const matrix = path.getScreenCTM();
      if (!matrix) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      drag = {
        path, pointerId: event.pointerId, matrix: matrix.inverse(), geometry: routeGeometry(path), previous: previousValues(path),
        origin: new DOMPoint(event.clientX, event.clientY), moved: false,
      };
    });
    function resetBend() {
      if (!path.hasAttribute(bendAttribute)) return;
      const previous = previousValues(path);
      applyBend(path, routeGeometry(path), null);
      recordChange(path, previous, "reset bend");
    }
    handle.addEventListener("dblclick", resetBend);
    handle.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        resetBend();
        return;
      }
      const geometry = routeGeometry(path);
      const keys = geometry.axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      const direction = keys.indexOf(event.key);
      if (direction < 0) return;
      event.preventDefault();
      const previous = previousValues(path);
      const sign = direction === 0 ? -1 : 1;
      const position = roundedRoute(geometry.start, geometry.end, geometry.axis, geometry.fraction).handle[geometry.axis];
      applyBend(path, geometry, bendFraction(geometry.start, geometry.end, geometry.axis, position + sign * (event.shiftKey ? 10 : 3)));
      recordChange(path, previous, "bend");
    });
    container.append(handle);
    return handle;
  }

  function refresh() {
    const routes = new Set(canvas.getSvgContent().querySelectorAll(routeSelector));
    for (const [path, handle] of handles) {
      if (routes.has(path)) continue;
      handle.remove();
      handles.delete(path);
    }
    const bounds = container.getBoundingClientRect();
    for (const path of routes) {
      if (!handles.has(path)) handles.set(path, createHandle(path));
      const handle = handles.get(path);
      const geometry = routeGeometry(path);
      const center = roundedRoute(geometry.start, geometry.end, geometry.axis, geometry.fraction).handle;
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const point = new DOMPoint(center.x, center.y).matrixTransform(matrix);
      handle.style.left = `${point.x - bounds.left}px`;
      handle.style.top = `${point.y - bounds.top}px`;
      handle.classList.toggle("is-visible", path === hovered || path.hasAttribute(bendAttribute) || drag?.path === path);
    }
  }

  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    const { path, origin, matrix, geometry } = drag;
    if (!drag.moved && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 3) return;
    drag.moved = true;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    applyBend(path, geometry, bendFraction(geometry.start, geometry.end, geometry.axis, point[geometry.axis]));
    refresh();
  });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    const completed = drag;
    drag = null;
    if (completed.moved) recordChange(completed.path, completed.previous, "bend");
    refresh();
  });
  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    const { path, previous } = drag;
    for (const [name, value] of Object.entries(previous)) {
      if (value === null) path.removeAttribute(name);
      else path.setAttribute(name, value);
    }
    drag = null;
    refresh();
  });

  container.addEventListener("pointermove", (event) => {
    hovered = event.target.closest(routeSelector)
      || (event.target.classList.contains("diagram-bend") ? hovered : null);
    refresh();
  });
  container.addEventListener("pointerleave", () => {
    hovered = null;
    refresh();
  });
  return refresh;
}
