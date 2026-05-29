import { describe, expect, it } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";

describe("material schema validation", () => {
  it("rejects runtime metadata in material definitions", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      materials: {
        definitions: {
          "material-a": {
            id: "material-a",
            name: "Runtime material",
            kind: "mesh-standard",
            override: {
              metadata: {
                runtime: new URL("blob:https://example.test/material")
              }
            }
          }
        },
        assignments: {}
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("JSON-compatible");
  });
});
