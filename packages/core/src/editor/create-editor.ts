import type { EditorOptions, EditorWithGlbImport } from "./editor-api";
import { CoreEditor } from "./lifecycle";

export function createEditor(options: EditorOptions = {}): EditorWithGlbImport {
  return new CoreEditor(options);
}
