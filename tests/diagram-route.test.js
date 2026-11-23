import { describe, expect, it } from "vitest";
import { bendFraction, roundedRoute, routeAxis } from "../src/diagram-route.js";

describe("rounded diagram routes", () => {
  it("keeps the straight runs axis aligned and rounds both corners", () => {
    const start = { x: 10, y: 10 };
    const end = { x: 110, y: 60 };
    expect(roundedRoute(start, end, routeAxis(start, end), 0.7)).toEqual({
      path: "M 10 10 L 68 10 Q 80 10 80 22 L 80 48 Q 80 60 92 60 L 110 60",
      handle: { x: 80, y: 35 },
    });
  });

  it("handles a reverse-direction drag and keeps short routes from doubling back", () => {
    const start = { x: 10, y: 100 };
    const end = { x: 14, y: 0 };
    expect(routeAxis(start, end)).toBe("y");
    expect(bendFraction(start, end, "y", 25)).toBe(0.75);
    expect(bendFraction(start, end, "y", -40)).toBe(0.95);
    expect(roundedRoute(start, end, "y").path)
      .toBe("M 10 100 L 10 52 Q 10 50 12 50 L 12 50 Q 14 50 14 48 L 14 0");
  });
});
