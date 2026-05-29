import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildLightSection, getNextActiveLightId } from "./lights";
import { buildAddLightCommand, buildRemoveLightCommand, buildUpdateLightCommand } from "./commands";

describe("light inspector commands", () => {
  it("shows only fields supported by the active light kind", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });

    const ambient = buildLightSection(editor.getSnapshot(), "ambient-a");
    const directional = buildLightSection(editor.getSnapshot(), "sun");

    expect(ambient.fields.map((field) => field.id)).not.toContain("target.x");
    expect(directional.fields.map((field) => field.id)).toContain("target.x");
  });

  it("normalizes rgb light colors for browser color inputs", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "hemi-a", kind: "hemisphere" } });

    const ambient = buildLightSection(editor.getSnapshot(), "ambient-a");
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

  it("rejects out-of-range light numeric drafts before dispatch", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "spot-a", kind: "spot" } });

    const result = buildUpdateLightCommand(editor.getSnapshot(), "spot-a", "angle", Math.PI);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("less than or equal");
  });
});
