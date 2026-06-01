import { describe, expect, it } from "vitest";
import { snapNumber, snapTransform, snapVector } from "./snap";

describe("snap helpers", () => {
  it("snaps translation, rotation, and scale vectors to finite increments", () => {
    expect(snapVector([0.24, -0.26, 1.01], 0.5)).toEqual([0, -0.5, 1]);
    expect(snapTransform({
      position: [0.24, 0.74, -0.74],
      rotation: [0.49, 1.1, -1.1],
      scale: [1.11, 1.24, 1.26]
    }, {
      translate: 0.5,
      rotate: 0.25,
      scale: 0.1
    })).toEqual({
      position: [0, 0.5, -0.5],
      rotation: [0.5, 1, -1],
      scale: [1.1, 1.2000000000000002, 1.3]
    });
  });

  it("rejects non-finite snap values", () => {
    expect(() => snapNumber(Number.NaN, 0.5)).toThrow("finite");
    expect(() => snapNumber(1, 0)).toThrow("positive");
  });
});
