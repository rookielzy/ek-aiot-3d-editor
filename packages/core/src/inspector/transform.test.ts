import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildSetTransformCommand } from "./transform";

describe("transform inspector commands", () => {
  it("builds a set-transform command that preserves untouched axes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [1, 2, 3] } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const result = buildSetTransformCommand(editor.getSnapshot(), "position.x", 4);

    expect(result).toEqual({
      ok: true,
      command: { type: "set-node-transform", nodeId: "object-a", transform: { position: [4, 2, 3] } }
    });
  });

  it("builds set-node-transform commands for group nodes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", transform: { position: [1, 2, 3] }, select: true });

    const result = buildSetTransformCommand(editor.getSnapshot(), "rotation.y", 0.5);

    expect(result).toEqual({
      ok: true,
      command: { type: "set-node-transform", nodeId: "group-a", transform: { rotation: [0, 0.5, 0] } }
    });
  });

  it("builds set-node-transform commands for spatial light nodes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", transform: { position: [1, 2, 3] } } });
    editor.dispatch({ type: "select-node", nodeId: "point-a" });

    const result = buildSetTransformCommand(editor.getSnapshot(), "position.z", 6);

    expect(result).toEqual({
      ok: true,
      command: { type: "set-node-transform", nodeId: "point-a", transform: { position: [1, 2, 6] } }
    });
  });

  it("returns a controlled problem for non-spatial light nodes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    editor.dispatch({ type: "select-node", nodeId: "ambient-a" });

    const result = buildSetTransformCommand(editor.getSnapshot(), "position.x", 4);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toBe("Ambient lights do not have transform controls.");
  });

  it("returns a controlled problem without selection", () => {
    const result = buildSetTransformCommand(createEditor().getSnapshot(), "position.x", 4);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("Select a transformable node");
  });

  it("keeps transform edits undoable through the core dispatcher", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [1, 2, 3] } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const command = buildSetTransformCommand(editor.getSnapshot(), "position.x", 4);
    if (!command.ok) {
      throw new Error(command.problem.message);
    }

    editor.dispatch(command.command);
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 2, 3]);
    editor.undo();
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([1, 2, 3]);
    editor.redo();
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 2, 3]);
  });
});
