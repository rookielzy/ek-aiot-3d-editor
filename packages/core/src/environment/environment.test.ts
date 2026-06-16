import { describe, expect, it } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import { migrateSerializedSnapshot } from "../snapshot/migrations";
import type { V6SceneSnapshot } from "../snapshot/types";
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
          source: { kind: "flat-image", assetId: "asset-a" }
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Environment background flat image asset kind is unsupported");
  });

  it("migrates v6 lighting and background modes into independent source records", () => {
    const current = createEmptySnapshot("scene-a");
    const v6 = {
      ...current,
      version: 6,
      assets: {
        "hdr-a": { id: "hdr-a", kind: "hdr" }
      },
      environment: {
        mode: "hdr",
        background: {
          mode: "hdr",
          assetId: "hdr-a",
          blur: 0.25
        },
        environment: {
          assetId: "hdr-a",
          intensity: 1.5,
          rotation: { x: 0, y: 1, z: 0 }
        }
      }
    } satisfies V6SceneSnapshot;

    const migrated = migrateSerializedSnapshot(v6);

    expect(migrated.version).toBe(7);
    expect(migrated.environment.lighting).toEqual({
      source: { kind: "hdr", assetId: "hdr-a" },
      intensity: 1.5,
      rotation: { x: 0, y: 1, z: 0 }
    });
    expect(migrated.environment.background).toEqual({
      source: { kind: "hdr", assetId: "hdr-a" },
      blur: 0.25
    });
  });

  it("requires complete and unique cubemap faces", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      assets: {
        px: { id: "px", kind: "image" },
        nx: { id: "nx", kind: "image" },
        py: { id: "py", kind: "image" },
        ny: { id: "ny", kind: "image" },
        pz: { id: "pz", kind: "image" }
      },
      environment: {
        ...createEmptySnapshot("scene-b").environment,
        background: {
          source: {
            kind: "cubemap",
            faces: [
              { role: "positive-x", assetId: "px" },
              { role: "negative-x", assetId: "nx" },
              { role: "positive-y", assetId: "py" },
              { role: "negative-y", assetId: "ny" },
              { role: "positive-z", assetId: "pz" },
              { role: "positive-z", assetId: "pz" }
            ]
          }
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("face role positive-z must not be duplicated");
    expect(result.errors.join("\n")).toContain("must include negative-z");
  });

  it("rejects runtime-only values inside environment metadata", () => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      environment: {
        ...createEmptySnapshot("scene-b").environment,
        metadata: {
          texture: new (class RuntimeTexture {})()
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Snapshot environment metadata must be JSON-compatible");
  });
});
