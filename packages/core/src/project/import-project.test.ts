import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";

describe("project import", () => {
  it("restores a valid package and resolves packaged payloads", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) } });
    const exported = editor.exportProject();
    const fresh = createEditor();

    const imported = fresh.importProject(exported.packageBytes as Uint8Array);

    expect(imported.ok).toBe(true);
    expect(fresh.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(fresh.exportProject().ok).toBe(true);
  });

  it("preserves prior editor state when validation fails", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-before", asset: { id: "asset-before" } });

    const imported = editor.importProject(new Uint8Array([0, 1, 2]));

    expect(imported.ok).toBe(false);
    expect(editor.getSnapshot().objects["object-before"]).toBeDefined();
    expect(editor.getHistoryState().undoCount).toBe(1);
  });
});
