import { describe, expect, it } from "vitest";
import { createAuthoredCameraView } from "./defaults";
import { resolveDefaultPresentationView } from "./resolve";
import { createEmptySnapshot } from "../snapshot/defaults";

describe("default presentation view resolver", () => {
  it("returns a deterministic none result when no default view is set", () => {
    const snapshot = createEmptySnapshot("scene-a");

    expect(resolveDefaultPresentationView(snapshot)).toMatchObject({
      status: "none",
      view: null,
      defaultCameraId: null
    });
  });

  it("returns the default authored camera view", () => {
    const view = createAuthoredCameraView({ id: "view-a", name: "Hero" });
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      cameras: { "view-a": view },
      presentation: { defaultCameraId: "view-a" }
    };

    expect(resolveDefaultPresentationView(snapshot)).toEqual({
      status: "resolved",
      view,
      defaultCameraId: "view-a"
    });
  });

  it("reports missing references for defensive callers", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      cameras: {},
      presentation: { defaultCameraId: "missing" }
    };

    expect(resolveDefaultPresentationView(snapshot)).toMatchObject({
      status: "missing",
      view: null,
      defaultCameraId: "missing"
    });
  });

  it("does not resolve inherited camera view keys", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      cameras: {},
      presentation: { defaultCameraId: "constructor" }
    };

    expect(resolveDefaultPresentationView(snapshot)).toMatchObject({
      status: "missing",
      view: null,
      defaultCameraId: "constructor"
    });
  });

  it("treats empty-string defaults as missing for defensive callers", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      cameras: {},
      presentation: { defaultCameraId: "" }
    };

    expect(resolveDefaultPresentationView(snapshot)).toMatchObject({
      status: "missing",
      view: null,
      defaultCameraId: ""
    });
  });
});
