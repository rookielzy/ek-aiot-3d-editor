import { describe, expect, it, vi } from "vitest";
import { EditorViewportHelperState } from "./viewport-helper-state";

describe("editor viewport helper state", () => {
  it("keeps helper visibility, hover, and snap feedback session-only", () => {
    const state = new EditorViewportHelperState({ grid: true, axes: true });
    const subscriber = vi.fn();
    state.subscribe(subscriber);

    state.toggle("grid");
    state.setHover("object-a");
    state.setSnapFeedback({
      status: "dragging-snapped",
      nodeId: "object-a",
      mode: "translate",
      increment: 0.5,
      channelSnapped: true,
      before: [0, 0, 0],
      preview: [1.24, -0.26, 0],
      snapped: [1, -0.5, 0]
    });

    expect(state.get()).toMatchObject({
      visibility: { grid: false, axes: true },
      hoverNodeId: "object-a",
      snapFeedback: {
        status: "dragging-snapped",
        nodeId: "object-a",
        snapped: [1, -0.5, 0]
      }
    });
    expect(subscriber).toHaveBeenCalledTimes(4);

    state.reset();

    expect(state.get()).toMatchObject({
      visibility: { grid: true, axes: true },
      hoverNodeId: null,
      snapFeedback: { status: "idle", nodeId: null }
    });
  });

  it("seeds runtime defaults once without overwriting user-owned visibility", () => {
    const state = new EditorViewportHelperState();

    state.seedVisibility({ grid: true, axes: true, hover: true });
    expect(state.get().visibility).toMatchObject({
      grid: true,
      axes: true,
      hover: true
    });

    state.setVisibility({ grid: false });
    state.seedVisibility({ grid: true, floor: true });

    expect(state.get().visibility).toMatchObject({
      grid: false,
      floor: false,
      axes: true,
      hover: true
    });
  });

  it("treats constructor visibility as explicit user-owned defaults", () => {
    const state = new EditorViewportHelperState({ floor: true });

    state.seedVisibility({ grid: true, axes: true, floor: false });
    expect(state.get().visibility).toMatchObject({
      grid: false,
      axes: false,
      floor: true
    });

    state.setVisibility({ floor: false });
    state.reset();
    state.seedVisibility({ grid: true });

    expect(state.get().visibility).toMatchObject({
      grid: false,
      floor: true
    });
  });

  it("clears transient hover and snap feedback when their helpers are hidden", () => {
    const state = new EditorViewportHelperState({ hover: true, snapFeedback: true });
    state.setHover("object-a");
    state.setSnapFeedback({
      status: "dragging-snapped",
      nodeId: "object-a",
      mode: "translate",
      increment: 0.5,
      channelSnapped: true,
      before: [0, 0, 0],
      preview: [1, 0, 0],
      snapped: [1, 0, 0]
    });

    state.setVisibility({ hover: false, snapFeedback: false });

    expect(state.get()).toMatchObject({
      hoverNodeId: null,
      snapFeedback: {
        status: "idle",
        nodeId: null
      }
    });
  });
});
