import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildLightSection, getNextActiveLightId } from "./lights";
import { buildAddLightCommand, buildRemoveLightCommand, buildUpdateLightCommand } from "./commands";

describe("light inspector commands", () => {
  it("shows only fields supported by the active light kind", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });
    editor.dispatch({ type: "select-node", nodeId: "ambient-a" });

    const ambient = buildLightSection(editor.getSnapshot(), "ambient-a");
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    const directional = buildLightSection(editor.getSnapshot(), "sun");

    expect(ambient.fields.map((field) => field.id)).not.toContain("target.x");
    expect(ambient.fields.map((field) => field.id)).not.toContain("shadow.enabled");
    expect(directional.fields.map((field) => field.id)).toContain("target.x");
    expect(directional.fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      "shadow.enabled",
      "shadow.mapSize.width",
      "shadow.bias",
      "shadow.normalBias",
      "shadow.radius",
      "shadow.camera.near",
      "shadow.camera.far",
      "shadow.camera.left",
      "shadow.camera.right",
      "shadow.camera.top",
      "shadow.camera.bottom"
    ]));
  });

  it("normalizes rgb light colors for browser color inputs", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "hemi-a", kind: "hemisphere" } });

    editor.dispatch({ type: "select-node", nodeId: "ambient-a" });
    const ambient = buildLightSection(editor.getSnapshot(), "ambient-a");
    editor.dispatch({ type: "select-node", nodeId: "hemi-a" });
    const hemisphere = buildLightSection(editor.getSnapshot(), "hemi-a");

    expect(ambient.fields.find((field) => field.id === "color")?.value).toBe("#ffffff");
    expect(hemisphere.fields.find((field) => field.id === "groundColor")?.value).toBe("#404040");
    expect(editor.getSnapshot().lights["ambient-a"].color).toBe("rgb(255, 255, 255)");
  });

  it("updates active light fields without changing object selection", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional", target: [0, 0, 0] } });
    const command = buildUpdateLightCommand(editor.getSnapshot(), "sun", "target.x", 4);
    if (!command.ok) {
      throw new Error(command.problem.message);
    }

    editor.dispatch(command.command);

    expect(editor.getSnapshot().lights.sun).toMatchObject({ target: [4, 0, 0] });
    expect(editor.getSnapshot().selection.objectId).toBe("object-a");
  });

  it("adds and removes lights through undoable core commands", () => {
    const editor = createEditor();
    const add = buildAddLightCommand("point");
    if (!add.ok) {
      throw new Error(add.problem.message);
    }

    editor.dispatch({ ...add.command, light: { ...add.command.light, id: "point-a" } });
    expect(editor.getSnapshot().lights["point-a"].kind).toBe("point");
    editor.undo();
    expect(editor.getSnapshot().lights["point-a"]).toBeUndefined();
    editor.redo();
    expect(editor.getSnapshot().lights["point-a"].kind).toBe("point");

    const remove = buildRemoveLightCommand(editor.getSnapshot(), "point-a");
    if (!remove.ok) {
      throw new Error(remove.problem.message);
    }
    editor.dispatch(remove.command);
    expect(editor.getSnapshot().lights["point-a"]).toBeUndefined();
  });

  it("returns the next valid UI-local light focus when removing an active light", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "light-b", kind: "ambient" } });

    expect(getNextActiveLightId(editor.getSnapshot(), "light-a")).toBe("light-b");
  });

  it("derives the active light target from selected light nodes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "light-b", kind: "point" } });
    editor.dispatch({ type: "select-node", nodeId: "light-b" });

    const section = buildLightSection(editor.getSnapshot(), "light-a");

    expect(section.activeLightId).toBe("light-b");
    expect(section.activeLightNodeId).toBe("light-b");
    expect(section.fields).not.toEqual([]);
    expect(section.lights).toEqual([
      expect.objectContaining({ id: "light-a", nodeId: "light-a", active: false, selected: false }),
      expect.objectContaining({ id: "light-b", nodeId: "light-b", active: true, selected: true })
    ]);
  });

  it("does not expose a light edit target when no light node is selected", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const section = buildLightSection(editor.getSnapshot(), "light-a");

    expect(section.activeLightId).toBeNull();
    expect(section.activeLightNodeId).toBeNull();
    expect(section.fields).toEqual([]);
    expect(section.reason).toBe("Select a light node to edit scene lighting.");
    expect(section.lights[0]).toEqual(expect.objectContaining({ id: "light-a", nodeId: "light-a", active: false, selected: false }));
  });

  it("rejects out-of-range light numeric drafts before dispatch", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "spot-a", kind: "spot" } });

    const result = buildUpdateLightCommand(editor.getSnapshot(), "spot-a", "angle", Math.PI);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("less than or equal");
  });

  it("builds shadow update commands and leaves validation to dispatch", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });

    const enable = buildUpdateLightCommand(editor.getSnapshot(), "sun", "shadow.enabled", true);
    if (!enable.ok) {
      throw new Error(enable.problem.message);
    }
    editor.dispatch(enable.command);
    expect(editor.getSnapshot().lights.sun).toMatchObject({ shadow: { enabled: true } });

    const invalidMapSize = buildUpdateLightCommand(editor.getSnapshot(), "sun", "shadow.mapSize.width", 1000);
    if (!invalidMapSize.ok) {
      throw new Error(invalidMapSize.problem.message);
    }
    const result = editor.dispatch(invalidMapSize.command);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("power-of-two");
    expect(editor.getSnapshot().lights.sun).toMatchObject({ shadow: { mapSize: { width: 1024 } } });
  });

  it("rejects shadow field drafts for unsupported light kinds before dispatch", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });

    const result = buildUpdateLightCommand(editor.getSnapshot(), "ambient-a", "shadow.enabled", true);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("not supported");
  });
});
