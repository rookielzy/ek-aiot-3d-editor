import { describe, expect, it } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";

describe("authored problem metadata validation", () => {
  it("keeps persisted problem metadata explicit and JSON-compatible", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      problems: {
        acknowledged: {
          "ack-a": {
            problemId: "asset-unresolved:asset-a:object-a",
            acknowledgedAt: "2026-05-29T00:00:00.000Z",
            metadata: { note: "user accepted missing asset" }
          }
        }
      }
    };

    expect(validateSceneSnapshot(snapshot)).toEqual({ ok: true, errors: [] });
  });
});
