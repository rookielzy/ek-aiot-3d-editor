import {
  AxesHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  Color,
  GridHelper,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type ColorRepresentation,
  type Object3D
} from "three";
import { disposeObjectTree } from "./disposal";
import type { ThreeObjectMap } from "./three-object-map";
import type { ResolvedRuntimeViewportHelperOptions } from "./viewport-controls";
import type { ViewportHelperStateSnapshot, ViewportHelperVisibility, ViewportSnapFeedbackState } from "../editor/viewport-helper-state";

export class RuntimeViewportHelpers {
  #scene: Object3D;
  #objects: ThreeObjectMap;
  #options: ResolvedRuntimeViewportHelperOptions;
  #visibility: ViewportHelperVisibility;
  #hoverNodeId: string | null = null;
  #snapFeedback: ViewportSnapFeedbackState;
  #staticHelpers = new Map<"grid" | "floor" | "axes", Object3D>();
  #hoverHelper: Box3Helper | null = null;
  #snapHelper: Object3D | null = null;
  #disposed = false;

  constructor(scene: Object3D, objects: ThreeObjectMap, options: ResolvedRuntimeViewportHelperOptions) {
    this.#scene = scene;
    this.#objects = objects;
    this.#options = options;
    this.#visibility = options.visibility;
    this.#snapFeedback = {
      status: "idle",
      nodeId: null,
      mode: null,
      increment: null,
      channelSnapped: false
    };
  }

  setState(snapshot: ViewportHelperStateSnapshot): boolean {
    if (this.#disposed) {
      return false;
    }
    this.#visibility = snapshot.visibility;
    this.#hoverNodeId = snapshot.hoverNodeId;
    this.#snapFeedback = snapshot.snapFeedback;
    return this.sync();
  }

  sync(): boolean {
    if (this.#disposed) {
      return false;
    }
    let changed = false;
    changed = this.#syncGrid() || changed;
    changed = this.#syncFloor() || changed;
    changed = this.#syncAxes() || changed;
    changed = this.#syncHover() || changed;
    changed = this.#syncSnapFeedback() || changed;
    return changed;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const helper of this.#staticHelpers.values()) {
      disposeObjectTree(helper);
    }
    this.#staticHelpers.clear();
    this.#disposeHover();
    this.#disposeSnap();
  }

  get size(): number {
    return this.#staticHelpers.size + (this.#hoverHelper ? 1 : 0) + (this.#snapHelper ? 1 : 0);
  }

  #syncGrid(): boolean {
    return this.#syncStatic("grid", this.#visibility.grid, () => {
      const helper = new GridHelper(
        this.#options.gridSize,
        this.#options.gridDivisions,
        this.#options.gridCenterLineColor,
        this.#options.gridColor
      );
      helper.name = "Viewport grid helper";
      return helper;
    });
  }

  #syncFloor(): boolean {
    return this.#syncStatic("floor", this.#visibility.floor, () => {
      const geometry = new PlaneGeometry(this.#options.floorSize, this.#options.floorSize);
      const material = new MeshBasicMaterial({
        color: this.#options.floorColor,
        transparent: true,
        opacity: this.#options.floorOpacity,
        depthWrite: false
      });
      const helper = new Mesh(geometry, material);
      helper.name = "Viewport floor helper";
      helper.rotation.x = -Math.PI / 2;
      return helper;
    });
  }

  #syncAxes(): boolean {
    return this.#syncStatic("axes", this.#visibility.axes, () => {
      const helper = new AxesHelper(this.#options.axesSize);
      helper.name = "Viewport axes helper";
      return helper;
    });
  }

  #syncStatic(key: "grid" | "floor" | "axes", visible: boolean, create: () => Object3D): boolean {
    const existing = this.#staticHelpers.get(key);
    if (!visible) {
      if (!existing) {
        return false;
      }
      disposeObjectTree(existing);
      this.#staticHelpers.delete(key);
      return true;
    }
    if (existing) {
      return false;
    }
    const helper = create();
    markViewportHelper(helper, key);
    this.#objects.markRuntimeOnly(helper);
    this.#staticHelpers.set(key, helper);
    this.#scene.add(helper);
    return true;
  }

  #syncHover(): boolean {
    if (!this.#visibility.hover || !this.#hoverNodeId) {
      return this.#disposeHover();
    }
    const target = this.#objects.getTarget(this.#hoverNodeId);
    if (!target?.pickable) {
      return this.#disposeHover();
    }
    const bounds = boundsForObject(target.object);
    if (this.#hoverHelper) {
      this.#hoverHelper.box.copy(bounds);
      setHelperColor(this.#hoverHelper, this.#options.hoverColor);
      this.#hoverHelper.userData.sceneNodeId = this.#hoverNodeId;
      if (target.objectId) {
        this.#hoverHelper.userData.sceneObjectId = target.objectId;
      } else {
        delete this.#hoverHelper.userData.sceneObjectId;
      }
      if (this.#hoverHelper.parent !== this.#scene) {
        this.#scene.add(this.#hoverHelper);
        return true;
      }
      return false;
    }
    const helper = new Box3Helper(bounds, this.#options.hoverColor);
    helper.name = `Hover helper ${this.#hoverNodeId}`;
    helper.userData.runtimeOnly = true;
    helper.userData.viewportHelper = "hover";
    helper.userData.hoverHelper = true;
    helper.userData.sceneNodeId = this.#hoverNodeId;
    if (target.objectId) {
      helper.userData.sceneObjectId = target.objectId;
    }
    this.#objects.markRuntimeOnly(helper);
    this.#hoverHelper = helper;
    this.#scene.add(helper);
    return true;
  }

  #syncSnapFeedback(): boolean {
    if (!this.#visibility.snapFeedback || this.#snapFeedback.status === "idle" || !this.#snapFeedback.nodeId) {
      return this.#disposeSnap();
    }
    const target = this.#objects.getTarget(this.#snapFeedback.nodeId);
    if (!target) {
      return this.#disposeSnap();
    }
    const points = snapLinePoints(target.object, this.#snapFeedback);
    if (this.#snapHelper) {
      updateLine(this.#snapHelper, points, this.#options.snapColor);
      this.#snapHelper.userData.snapStatus = this.#snapFeedback.status;
      this.#snapHelper.userData.sceneNodeId = this.#snapFeedback.nodeId;
      return false;
    }
    const helper = createLine(points, this.#options.snapColor);
    helper.name = `Snap feedback helper ${this.#snapFeedback.nodeId}`;
    helper.userData.runtimeOnly = true;
    helper.userData.viewportHelper = "snapFeedback";
    helper.userData.snapFeedbackHelper = true;
    helper.userData.snapStatus = this.#snapFeedback.status;
    helper.userData.sceneNodeId = this.#snapFeedback.nodeId;
    this.#objects.markRuntimeOnly(helper);
    this.#snapHelper = helper;
    this.#scene.add(helper);
    return true;
  }

  #disposeHover(): boolean {
    if (!this.#hoverHelper) {
      return false;
    }
    this.#hoverHelper.removeFromParent();
    this.#hoverHelper.dispose();
    this.#hoverHelper = null;
    return true;
  }

  #disposeSnap(): boolean {
    if (!this.#snapHelper) {
      return false;
    }
    disposeObjectTree(this.#snapHelper);
    this.#snapHelper = null;
    return true;
  }
}

function markViewportHelper(object: Object3D, key: string): void {
  object.userData.runtimeOnly = true;
  object.userData.viewportHelper = key;
  object.traverse((entry) => {
    entry.userData.runtimeOnly = true;
    entry.userData.viewportHelper = key;
  });
}

function boundsForObject(object: Object3D): Box3 {
  object.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(object);
  if (!bounds.isEmpty()) {
    return bounds;
  }

  const center = object.getWorldPosition(new Vector3());
  bounds.min.copy(center).addScalar(-0.25);
  bounds.max.copy(center).addScalar(0.25);
  return bounds;
}

function snapLinePoints(object: Object3D, feedback: ViewportSnapFeedbackState): [Vector3, Vector3] {
  const origin = object.getWorldPosition(new Vector3());
  if (!feedback.before || !feedback.snapped) {
    return [origin.clone(), origin.clone().add(new Vector3(0, 0.5, 0))];
  }
  if (feedback.mode === "translate") {
    const delta = new Vector3(
      feedback.snapped[0] - feedback.before[0],
      feedback.snapped[1] - feedback.before[1],
      feedback.snapped[2] - feedback.before[2]
    );
    return [origin.clone().sub(delta), origin.clone()];
  }
  return [origin.clone(), origin.clone().add(new Vector3(0, 0.5, 0))];
}

function createLine(points: [Vector3, Vector3], color: ColorRepresentation): Line {
  const geometry = new BufferGeometry().setFromPoints(points);
  const material = new LineBasicMaterial({ color });
  return new Line(geometry, material);
}

function updateLine(object: Object3D, points: [Vector3, Vector3], color: ColorRepresentation): void {
  const line = object as Line<BufferGeometry, LineBasicMaterial>;
  line.geometry.dispose();
  line.geometry = new BufferGeometry().setFromPoints(points);
  line.material.color.copy(new Color(color));
}

function setHelperColor(helper: Box3Helper, color: ColorRepresentation): void {
  const nextColor = new Color(color);
  const material = helper.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (hasColor(entry)) {
        entry.color.copy(nextColor);
      }
    }
    return;
  }
  if (hasColor(material)) {
    material.color.copy(nextColor);
  }
}

function hasColor(material: unknown): material is { color: Color } {
  return Boolean(material && typeof material === "object" && "color" in material && (material as { color?: unknown }).color instanceof Color);
}
