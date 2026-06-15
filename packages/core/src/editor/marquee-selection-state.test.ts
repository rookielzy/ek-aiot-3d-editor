import { describe, expect, it, vi } from "vitest";
import { EditorMarqueeSelectionState, normalizeMarqueeSelectionRect } from "./marquee-selection-state";

describe("editor marquee selection state", () => {
  it("keeps marquee drag data session-only and immutable", () => {
    const state = new EditorMarqueeSelectionState();
    const subscriber = vi.fn();
    state.subscribe(subscriber);

    state.start({ x: 120, y: 80 }, "add");
    state.drag({ x: 40, y: 160 }, ["object-b", "object-a"]);

    expect(state.get()).toMatchObject({
      status: "dragging",
      mode: "add",
      start: { x: 120, y: 80 },
      current: { x: 40, y: 160 },
      rect: {
        left: 40,
        top: 80,
        right: 120,
        bottom: 160,
        width: 80,
        height: 80
      },
      candidateNodeIds: ["object-b", "object-a"]
    });
    expect(Object.isFrozen(state.get())).toBe(true);
    expect(Object.isFrozen(state.get().candidateNodeIds)).toBe(true);
    expect(subscriber).toHaveBeenCalledTimes(3);

    state.reset();

    expect(state.get()).toMatchObject({
      status: "idle",
      rect: null,
      candidateNodeIds: []
    });
  });

  it("normalizes drag direction into viewport-space rectangle dimensions", () => {
    expect(normalizeMarqueeSelectionRect({ x: 200, y: 220 }, { x: 20, y: 40 })).toEqual({
      left: 20,
      top: 40,
      right: 200,
      bottom: 220,
      width: 180,
      height: 180
    });
  });
});
