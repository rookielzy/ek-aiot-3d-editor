export type EditorAction =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "duplicate"
  | "delete"
  | "group"
  | "ungroup"
  | "select-all"
  | "clear-selection"
  | "transform-translate"
  | "transform-rotate"
  | "transform-scale"
  | "toggle-translate-snap"
  | "toggle-rotate-snap"
  | "toggle-scale-snap";

export interface ShortcutInput {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  platform?: "mac" | "windows" | "linux" | "unknown";
}

export interface ShortcutResolution {
  handled: boolean;
  action: EditorAction | null;
  preventDefault: boolean;
}
