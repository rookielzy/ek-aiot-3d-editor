import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildCameraSection, getNextActiveCameraViewId, resolveActiveCameraViewId } from "./cameras";
import {
  buildCreateCameraViewCommand,
  buildDeleteCameraViewCommand,
  buildSetDefaultCameraViewCommand,
  buildUpdateCameraViewCommand
} from "./commands";

describe("camera inspector commands", () => {
  it("shows an enabled empty section before authored camera views exist", () => {
    const editor = createEditor();

    const section = buildCameraSection(editor.getSnapshot(), { runtimeReady: true });

    expect(section).toMatchObject({
      id: "cameras",
      enabled: true,
      empty: true,
      activeCameraViewId: null,
      defaultCameraViewId: null,
      canCapture: true,
      canApply: false
    });
    expect(section.cameraViews).toEqual([]);
    expect(section.fields).toEqual([]);
  });

  it("derives active, default, rows, and editable fields", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero", projection: { kind: "perspective", fov: 60 } } });
    editor.dispatch({ type: "create-camera-view", view: { id: "view-b", name: "Detail", projection: { kind: "perspective", fov: 35 } } });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-b" });

    const section = buildCameraSection(editor.getSnapshot(), { activeCameraViewId: "view-a", runtimeReady: true });

    expect(section.activeCameraViewId).toBe("view-a");
    expect(section.defaultCameraViewId).toBe("view-b");
    expect(section.canApply).toBe(true);
    expect(section.cameraViews).toEqual([
      expect.objectContaining({ id: "view-a", label: "Hero", active: true, default: false, summary: "60deg FOV" }),
      expect.objectContaining({ id: "view-b", label: "Detail", active: false, default: true, summary: "35deg FOV" })
    ]);
    expect(section.fields.map((field) => field.id)).toEqual([
      "name",
      "fov",
      "near",
      "far",
      "position.x",
      "position.y",
      "position.z",
      "target.x",
      "target.y",
      "target.z"
    ]);
  });

  it("falls back from stale active view state to the default view", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "view-b" } });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-b" });

    expect(resolveActiveCameraViewId(editor.getSnapshot(), "deleted")).toBe("view-b");
  });

  it("ignores inherited camera view keys when resolving active/default state", () => {
    const snapshot = {
      ...createEditor().getSnapshot(),
      cameras: {},
      presentation: { defaultCameraId: "constructor" }
    };

    expect(resolveActiveCameraViewId(snapshot, "constructor")).toBeNull();
    expect(buildCameraSection(snapshot, { activeCameraViewId: "constructor" }).activeCameraViewId).toBeNull();
  });

  it("builds create, update, default, and delete commands", () => {
    const editor = createEditor();
    const create = buildCreateCameraViewCommand({ id: "view-a", name: "Hero" });
    if (!create.ok) {
      throw new Error(create.problem.message);
    }
    editor.dispatch(create.command);

    const update = buildUpdateCameraViewCommand(editor.getSnapshot(), "view-a", "position.y", 4);
    const setDefault = buildSetDefaultCameraViewCommand(editor.getSnapshot(), "view-a");
    const remove = buildDeleteCameraViewCommand(editor.getSnapshot(), "view-a");

    expect(update.ok ? update.command : null).toEqual({
      type: "update-camera-view",
      viewId: "view-a",
      patch: { position: [0, 4, 5] }
    });
    expect(setDefault.ok ? setDefault.command : null).toEqual({ type: "set-default-camera-view", viewId: "view-a" });
    expect(remove.ok ? remove.command : null).toEqual({ type: "delete-camera-view", viewId: "view-a" });
  });

  it.each([
    ["fov", 180, "less than or equal"],
    ["near", -1, "greater than or equal"],
    ["far", 0.01, "far must be greater than near"],
    ["position.x", Number.NaN, "finite"]
  ] as const)("rejects invalid %s drafts before dispatch", (fieldId, value, message) => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });

    const result = buildUpdateCameraViewCommand(editor.getSnapshot(), "view-a", fieldId, value);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.problem.message).toContain(message);
  });

  it("returns next UI-local active camera view when deleting a view", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "view-b" } });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-b" });

    expect(getNextActiveCameraViewId(editor.getSnapshot(), "view-a")).toBe("view-b");
    expect(getNextActiveCameraViewId(editor.getSnapshot(), "view-b")).toBe("view-a");
  });
});
