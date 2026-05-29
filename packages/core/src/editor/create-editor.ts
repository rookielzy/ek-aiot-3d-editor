import type { Editor, EditorOptions } from "./editor-api";
import { CoreEditor } from "./lifecycle";

export function createEditor(options: EditorOptions = {}): Editor {
  return new CoreEditor(options);
}
