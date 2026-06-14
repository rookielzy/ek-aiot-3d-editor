import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, type Line } from "three";
import { describe, expect, it } from "vitest";
import { IDLE_VIEWPORT_SNAP_FEEDBACK } from "../editor/viewport-helper-state";
import { ThreeObjectMap } from "./three-object-map";
import { RuntimeViewportHelpers } from "./viewport-helpers";

describe("runtime viewport helpers", () => {
  it("creates runtime-only grid, floor, and axes helpers without registering pickable targets", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const helpers = new RuntimeViewportHelpers(scene, objects, createOptions());

    expect(helpers.setState({
      visibility: {
        grid: true,
        floor: true,
        axes: true,
        selectionBounds: true,
        hover: false,
        snapFeedback: false
      },
      hoverNodeId: null,
      snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
    })).toBe(true);

    expect(scene.children.map((object) => object.userData.viewportHelper).sort()).toEqual(["axes", "floor", "grid"]);
    expect(scene.children.every((object) => object.userData.runtimeOnly)).toBe(true);
    expect([...objects.targetEntries()]).toEqual([]);

    helpers.dispose();

    expect(scene.children).toHaveLength(0);
  });

  it("syncs hover feedback against node targets and disposes it when disabled", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const target = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    objects.set("object-a", target, { objectId: "object-a", pickable: true, transformable: true });
    const helpers = new RuntimeViewportHelpers(scene, objects, createOptions());

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: true,
        snapFeedback: false
      },
      hoverNodeId: "object-a",
      snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
    });

    expect(scene.children.find((object) => object.userData.hoverHelper)?.userData).toMatchObject({
      runtimeOnly: true,
      viewportHelper: "hover",
      sceneNodeId: "object-a",
      sceneObjectId: "object-a"
    });

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: false,
        snapFeedback: false
      },
      hoverNodeId: "object-a",
      snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
    });

    expect(scene.children.some((object) => object.userData.hoverHelper)).toBe(false);
  });

  it("syncs snap feedback guide lines and clears them when hidden or stale", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const target = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    objects.set("object-a", target, { objectId: "object-a", pickable: true, transformable: true });
    const helpers = new RuntimeViewportHelpers(scene, objects, createOptions());

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: false,
        snapFeedback: true
      },
      hoverNodeId: null,
      snapFeedback: {
        status: "dragging-snapped",
        nodeId: "object-a",
        mode: "translate",
        increment: 0.5,
        channelSnapped: true,
        before: [0, 0, 0],
        preview: [1.24, 0, 0],
        snapped: [1, 0, 0]
      }
    });

    const helper = scene.children.find((object) => object.userData.snapFeedbackHelper) as Line | undefined;
    expect(helper?.userData).toMatchObject({
      runtimeOnly: true,
      viewportHelper: "snapFeedback",
      sceneNodeId: "object-a",
      snapStatus: "dragging-snapped"
    });
    expect([...objects.targetEntries()]).toEqual([["object-a", expect.objectContaining({ object: target })]]);
    const originalGeometry = helper?.geometry;

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: false,
        snapFeedback: true
      },
      hoverNodeId: null,
      snapFeedback: {
        status: "dragging-unsnapped",
        nodeId: "object-a",
        mode: "translate",
        increment: null,
        channelSnapped: false,
        before: [0, 0, 0],
        preview: [2, 0, 0],
        snapped: [2, 0, 0]
      }
    });

    const updatedHelper = scene.children.find((object) => object.userData.snapFeedbackHelper) as Line | undefined;
    expect(updatedHelper).toBe(helper);
    expect(updatedHelper?.geometry).not.toBe(originalGeometry);
    expect(updatedHelper?.userData.snapStatus).toBe("dragging-unsnapped");

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: false,
        snapFeedback: false
      },
      hoverNodeId: null,
      snapFeedback: {
        status: "dragging-unsnapped",
        nodeId: "object-a",
        mode: "translate",
        increment: null,
        channelSnapped: false
      }
    });

    expect(scene.children.some((object) => object.userData.snapFeedbackHelper)).toBe(false);

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: false,
        snapFeedback: true
      },
      hoverNodeId: null,
      snapFeedback: {
        status: "dragging-snapped",
        nodeId: "missing",
        mode: "translate",
        increment: 0.5,
        channelSnapped: true
      }
    });

    expect(scene.children.some((object) => object.userData.snapFeedbackHelper)).toBe(false);

    helpers.setState({
      visibility: {
        grid: false,
        floor: false,
        axes: false,
        selectionBounds: true,
        hover: false,
        snapFeedback: true
      },
      hoverNodeId: null,
      snapFeedback: {
        status: "dragging-snapped",
        nodeId: "object-a",
        mode: "translate",
        increment: 0.5,
        channelSnapped: true
      }
    });
    expect(scene.children.some((object) => object.userData.snapFeedbackHelper)).toBe(true);

    helpers.dispose();

    expect(scene.children).toHaveLength(0);
  });
});

function createOptions() {
  return {
    enabled: true,
    visibility: {
      grid: true,
      floor: false,
      axes: true,
      selectionBounds: true,
      hover: true,
      snapFeedback: true
    },
    grid: true,
    floor: false,
    axes: true,
    selectionBounds: true,
    hover: true,
    snapFeedback: true,
    gridSize: 20,
    gridDivisions: 20,
    gridColor: 0x475569,
    gridCenterLineColor: 0x94a3b8,
    floorSize: 20,
    floorColor: 0x1e293b,
    floorOpacity: 0.22,
    axesSize: 2,
    hoverColor: 0x7dd3fc,
    snapColor: 0xf59e0b
  } as const;
}
