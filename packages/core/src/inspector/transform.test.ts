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
      command: { type: "set-transform", objectId: "object-a", transform: { position: [4, 2, 3] } }
    });
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
