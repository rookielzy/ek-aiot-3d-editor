import type { EditorAction, ShortcutInput, ShortcutResolution } from "./types";

const EMPTY_RESOLUTION: ShortcutResolution = {
  handled: false,
  action: null,
  preventDefault: false
};

export function resolveEditorShortcut(input: ShortcutInput): ShortcutResolution {
  if (isEditableTarget(input.target)) {
    return EMPTY_RESOLUTION;
  }

  const key = input.key.toLowerCase();
  const primary = input.metaKey || input.ctrlKey;
  const shift = Boolean(input.shiftKey);
  const alt = Boolean(input.altKey);

  if (primary && !alt) {
    if (key === "z") {
      return action(shift ? "redo" : "undo");
    }
    if (key === "y") {
      return action("redo");
    }
    if (key === "c") {
      return action("copy");
    }
    if (key === "v") {
      return action("paste");
    }
    if (key === "d") {
      return action("duplicate");
    }
    if (key === "a") {
      return action("select-all");
    }
    if (key === "g") {
      return action(shift ? "ungroup" : "group");
    }
  }

  if (!primary && !alt) {
    if (key === "delete" || key === "backspace") {
      return action("delete");
    }
    if (key === "escape") {
      return action("clear-selection");
    }
    if (key === "w") {
      return action("transform-translate");
    }
    if (key === "e") {
      return action("transform-rotate");
    }
    if (key === "r") {
      return action("transform-scale");
    }
  }

  if (primary && alt) {
    if (key === "w") {
      return action("toggle-translate-snap");
    }
    if (key === "e") {
      return action("toggle-rotate-snap");
    }
    if (key === "r") {
      return action("toggle-scale-snap");
    }
  }

  return EMPTY_RESOLUTION;
}

function action(editorAction: EditorAction): ShortcutResolution {
  return {
    handled: true,
    action: editorAction,
    preventDefault: true
  };
}

export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?(name: string): string | null;
  };
  if (element.isContentEditable) {
    return true;
  }
  const role = element.getAttribute?.("role");
  if (role === "textbox") {
    return true;
  }
  // Folding key events out of a text role are the browser's, not the scene's: a press inside a
  // field must never add, replace, or clear the scene selection behind it.
  if (role === "searchbox") {
    return true;
  }
  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
