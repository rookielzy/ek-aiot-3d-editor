import { Box3, Box3Helper, Color, Vector3, type ColorRepresentation, type Object3D } from "three";
import type { ThreeObjectMap } from "./three-object-map";
import type { ResolvedRuntimeSelectionVisualOptions } from "./viewport-controls";

export class RuntimeSelectionVisuals {
  #scene: Object3D;
  #objects: ThreeObjectMap;
  #options: ResolvedRuntimeSelectionVisualOptions;
  #helpers = new Map<string, Box3Helper>();
  #disposed = false;

  constructor(scene: Object3D, objects: ThreeObjectMap, options: ResolvedRuntimeSelectionVisualOptions) {
    this.#scene = scene;
    this.#objects = objects;
    this.#options = options;
  }

  sync(): boolean {
    if (this.#disposed) {
      return false;
    }

    let changed = false;
    const activeIds = new Set<string>();
    for (const [nodeId, target] of this.#objects.targetEntries()) {
      const object = target.object;
      // The card is a camera-facing sprite, so a world-aligned bounds box would not match it.
      if (target.kind === "data-display") continue;
      if (!target.selected && !target.primarySelected) {
        continue;
      }

      activeIds.add(nodeId);
      const color = target.primarySelected
        ? this.#options.primarySelectedColor
        : this.#options.selectedColor;
      const helper = this.#helpers.get(nodeId);
      if (helper) {
        helper.box.copy(boundsForObject(object));
        setHelperColor(helper, color);
        if (helper.parent !== this.#scene) {
          this.#scene.add(helper);
          changed = true;
        }
        continue;
      }

      const nextHelper = new Box3Helper(boundsForObject(object), color);
      nextHelper.name = `Selection helper ${nodeId}`;
      nextHelper.userData.runtimeOnly = true;
      nextHelper.userData.selectionHelper = true;
      nextHelper.userData.sceneNodeId = nodeId;
      this.#objects.markRuntimeOnly(nextHelper);
      if (target.objectId) {
        nextHelper.userData.sceneObjectId = target.objectId;
      }
      if (target.lightId) {
        nextHelper.userData.runtimeLightId = target.lightId;
      }
      this.#helpers.set(nodeId, nextHelper);
      this.#scene.add(nextHelper);
      changed = true;
    }

    for (const [nodeId, helper] of [...this.#helpers]) {
      if (activeIds.has(nodeId)) {
        continue;
      }
      helper.removeFromParent();
      helper.dispose();
      this.#helpers.delete(nodeId);
      changed = true;
    }

    return changed;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    for (const helper of this.#helpers.values()) {
      helper.removeFromParent();
      helper.dispose();
    }
    this.#helpers.clear();
  }

  get size(): number {
    return this.#helpers.size;
  }
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
