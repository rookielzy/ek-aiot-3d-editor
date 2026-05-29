import { describe, expect, it } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";

describe("environment schema validation", () => {
  it("rejects texture backgrounds that point at GLB assets", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      assets: {
        "asset-a": { id: "asset-a", kind: "glb" }
      },
      environment: {
        ...createEmptySnapshot("scene-b").environment,
        background: {
          mode: "texture",
          assetId: "asset-a"
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Background texture asset kind is unsupported");
  });
});
