import { describe, expect, it } from "vitest";
import { boundDiagramPlacement, parseDiagramPlacement, serializeDiagramPlacement } from "../src/diagram-placement.js";

describe("diagram placement", () => {
  it("round trips decimals in slide percentage coordinates", () => {
    const placement = { x: 15.2, y: 11.1, width: 43, height: 64 };
    expect(parseDiagramPlacement(serializeDiagramPlacement(placement))).toEqual(placement);
  });

  it("keeps the full frame on the slide and rejects malformed metadata", () => {
    expect(boundDiagramPlacement({ x: 99, y: -5, width: 44, height: 130 }))
      .toEqual({ x: 56, y: 0, width: 44, height: 100 });
    expect(parseDiagramPlacement("15 16 25 NaN")).toBeNull();
    expect(parseDiagramPlacement("15 16 25")).toBeNull();
  });
});
