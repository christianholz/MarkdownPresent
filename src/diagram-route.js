export const automaticBend = 0.5;

export function routeAxis(start, end) {
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "x" : "y";
}

export function bendFraction(start, end, axis, position) {
  const span = end[axis] - start[axis];
  if (!span) return automaticBend;
  return Math.max(0.05, Math.min(0.95, (position - start[axis]) / span));
}

export function roundedRoute(start, end, axis, fraction = automaticBend, radius = 12) {
  const bend = start[axis] + (end[axis] - start[axis]) * fraction;
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, [axis]: bend };
  const points = [start, { x: start.x, y: start.y, [axis]: bend }, { x: end.x, y: end.y, [axis]: bend }, end]
    .filter((point, i, all) => !i || point.x !== all[i - 1].x || point.y !== all[i - 1].y);
  const format = ({ x, y }) => `${Number(x.toFixed(3))} ${Number(y.toFixed(3))}`;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const toward = (a, b, step) => {
    const scale = step / distance(a, b);
    return { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale };
  };
  let path = `M ${format(start)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [previous, corner, next] = points.slice(i - 1, i + 2);
    const step = Math.min(radius, distance(corner, previous) / 2, distance(corner, next) / 2);
    path += ` L ${format(toward(corner, previous, step))} Q ${format(corner)} ${format(toward(corner, next, step))}`;
  }
  return { path: `${path} L ${format(end)}`, handle: middle };
}
