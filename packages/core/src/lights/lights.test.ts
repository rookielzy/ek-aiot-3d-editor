import { describe, expect, it } from "vitest";
import { createEmptySnapshot, createTransform } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";

describe("light schema validation", () => {
  it("rejects malformed light colors", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      lights: {
        "light-a": {
          id: "light-a",
          kind: "ambient",
          name: "Bad color",
          color: "white",
          intensity: 1
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("color");
  });

  it("rejects directional lights without target intent", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      lights: {
        "light-a": {
          id: "light-a",
          kind: "directional",
          name: "Missing target",
          color: "#ffffff",
          intensity: 1,
          transform: createTransform()
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("target");
  });
});
