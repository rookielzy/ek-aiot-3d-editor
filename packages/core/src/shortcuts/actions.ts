import type { Editor } from "../editor/editor-api";
import type { CommandResult } from "../commands/types";
import type { EditorAction } from "./types";

export type EditorActionResult = CommandResult | { ok: true; snapshot: ReturnType<Editor["getSnapshot"]> } | null;

export function executeEditorAction(editor: Editor, action: EditorAction): EditorActionResult {
  switch (action) {
    case "undo":
      return editor.undo();
    case "redo":
      return editor.redo();
    case "copy":
      editor.operations.copy();
      return { ok: true, snapshot: editor.getSnapshot() };
    case "paste":
      return editor.operations.paste();
    case "duplicate":
      return editor.operations.duplicate();
    case "delete":
      return editor.operations.delete();
    case "group":
      return editor.operations.group();
    case "ungroup":
      return editor.operations.ungroup();
    case "select-all":
      return editor.operations.selectAll();
    case "clear-selection":
      return editor.operations.clearSelection();
    case "transform-translate":
      editor.transformMode.set("translate");
      return { ok: true, snapshot: editor.getSnapshot() };
    case "transform-rotate":
      editor.transformMode.set("rotate");
      return { ok: true, snapshot: editor.getSnapshot() };
    case "transform-scale":
      editor.transformMode.set("scale");
      return { ok: true, snapshot: editor.getSnapshot() };
    case "toggle-translate-snap":
      editor.snap.toggle("translate", 0.5);
      return { ok: true, snapshot: editor.getSnapshot() };
    case "toggle-rotate-snap":
      editor.snap.toggle("rotate", Math.PI / 12);
      return { ok: true, snapshot: editor.getSnapshot() };
    case "toggle-scale-snap":
      editor.snap.toggle("scale", 0.1);
      return { ok: true, snapshot: editor.getSnapshot() };
  }
}
