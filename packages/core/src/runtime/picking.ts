import { Raycaster, Vector2, type Camera, type Object3D } from "three";
import type { CommandDispatcher } from "../commands/dispatcher";
import type { CommandResult } from "../commands/types";
import type { SelectionMode } from "../selection/selection";
import type { RuntimeNodeTarget, ThreeObjectMap } from "./three-object-map";

export class ObjectPicker {
  #raycaster = new Raycaster();
  #pointer = new Vector2();

  constructor(
    private readonly camera: Camera,
    private readonly objects: ThreeObjectMap,
    private readonly dispatcher: CommandDispatcher
  ) {}

  selectNode(nodeId: string | null, mode: SelectionMode = "replace"): CommandResult {
    if (mode === "replace") {
      return this.dispatcher.dispatch({ type: "select-node", nodeId });
    }
    return this.dispatcher.dispatch({ type: "select-nodes", mode, nodeId });
  }

  selectNodes(nodeIds: string[], mode: SelectionMode = "replace", primaryNodeId: string | null = nodeIds[0] ?? null): CommandResult {
    return this.dispatcher.dispatch({
      type: "select-nodes",
      mode,
      nodeIds,
      primaryNodeId
    });
  }

  selectObject(objectId: string | null, mode: SelectionMode = "replace"): CommandResult {
    const nodeId = objectId ? this.objects.getObjectNodeId(objectId) ?? objectId : null;
    return this.selectNode(nodeId, mode);
  }

  pickNodeFromClientPoint(
    container: HTMLElement,
    clientX: number,
    clientY: number,
    candidates: Object3D[],
    mode: SelectionMode = "replace"
  ): CommandResult {
    const nodeId = this.#hitNodeId(container, clientX, clientY, candidates);
    return this.selectNode(nodeId, mode);
  }

  hitNodeFromClientPoint(
    container: HTMLElement,
    clientX: number,
    clientY: number,
    candidates: Object3D[],
    accepts?: (target: RuntimeNodeTarget) => boolean
  ): string | null {
    return this.#hitNodeId(container, clientX, clientY, candidates, accepts);
  }

  pickFromClientPoint(
    container: HTMLElement,
    clientX: number,
    clientY: number,
    candidates: Object3D[],
    mode: SelectionMode = "replace"
  ): CommandResult {
    const nodeId = this.#hitNodeId(container, clientX, clientY, candidates);
    const target = nodeId ? this.objects.getTarget(nodeId) : undefined;
    if (target?.kind === "object" && target.objectId) {
      return this.selectObject(target.objectId, mode);
    }
    return this.selectNode(nodeId, mode);
  }

  #hitNodeId(
    container: HTMLElement,
    clientX: number,
    clientY: number,
    candidates: Object3D[],
    accepts?: (target: RuntimeNodeTarget) => boolean
  ): string | null {
    const rect = container.getBoundingClientRect();
    const width = rect.width || container.clientWidth || 1;
    const height = rect.height || container.clientHeight || 1;

    this.#pointer.x = ((clientX - rect.left) / width) * 2 - 1;
    this.#pointer.y = -((clientY - rect.top) / height) * 2 + 1;
    this.camera.updateMatrixWorld();
    this.#raycaster.setFromCamera(this.#pointer, this.camera);
    for (const candidate of candidates) {
      candidate.updateWorldMatrix(true, true);
    }

    const hits = this.#raycaster.intersectObjects(candidates, true);
    for (const hit of hits) {
      const target = this.objects.getTargetForObject(hit.object);
      if (target && (!accepts || accepts(target))) {
        return target.nodeId;
      }
    }
    return null;
  }
}
