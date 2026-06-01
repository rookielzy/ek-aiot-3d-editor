import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { executeEditorAction } from "./actions";

describe("execute editor action", () => {
  it("toggles snap settings as session state without changing snapshots", () => {
    const editor = createEditor();
    const before = editor.getSnapshot();

    expect(executeEditorAction(editor, "toggle-translate-snap")?.ok).toBe(true);
    expect(editor.snap.get().translate).toBe(0.5);
    expect(editor.getSnapshot()).toBe(before);

    executeEditorAction(editor, "toggle-translate-snap");
    expect(editor.snap.get().translate).toBeNull();
    expect(editor.getSnapshot()).toBe(before);
  });
});
