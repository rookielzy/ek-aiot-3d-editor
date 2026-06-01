import { describe, expect, it } from "vitest";
import { resolveEditorShortcut } from "./resolve-shortcut";

describe("resolve editor shortcut", () => {
  it.each([
    [{ key: "z", metaKey: true }, "undo"],
    [{ key: "z", ctrlKey: true, shiftKey: true }, "redo"],
    [{ key: "y", ctrlKey: true }, "redo"],
    [{ key: "c", metaKey: true }, "copy"],
    [{ key: "v", ctrlKey: true }, "paste"],
    [{ key: "d", ctrlKey: true }, "duplicate"],
    [{ key: "Delete" }, "delete"],
    [{ key: "a", ctrlKey: true }, "select-all"],
    [{ key: "g", ctrlKey: true }, "group"],
    [{ key: "g", ctrlKey: true, shiftKey: true }, "ungroup"],
    [{ key: "Escape" }, "clear-selection"],
    [{ key: "w" }, "transform-translate"],
    [{ key: "e" }, "transform-rotate"],
    [{ key: "r" }, "transform-scale"],
    [{ key: "w", ctrlKey: true, altKey: true }, "toggle-translate-snap"]
  ] as const)("maps %o to %s", (input, action) => {
    expect(resolveEditorShortcut(input)).toEqual({ handled: true, action, preventDefault: true });
  });

  it("ignores editable targets", () => {
    const target = document.createElement("input");

    expect(resolveEditorShortcut({ key: "a", ctrlKey: true, target })).toEqual({
      handled: false,
      action: null,
      preventDefault: false
    });
  });
});
