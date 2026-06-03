import type { Object3D } from "three";
import type { SceneNode } from "../snapshot/types";

export interface RuntimeNodeTarget {
  nodeId: string;
  kind: SceneNode["kind"];
  object: Object3D;
  objectId?: string;
  lightId?: string;
  transformable: boolean;
  pickable: boolean;
}

export class ThreeObjectMap {
  #targets = new Map<string, RuntimeNodeTarget>();
  #objectNodeIds = new Map<string, string>();
  #lightNodeIds = new Map<string, string>();
  #ids = new WeakMap<Object3D, string>();

  set(nodeId: string, object: Object3D, target?: Partial<Omit<RuntimeNodeTarget, "nodeId" | "object">>): void {
    const previous = this.#targets.get(nodeId);
    if (previous?.objectId) {
      this.#objectNodeIds.delete(previous.objectId);
    }
    if (previous?.lightId) {
      this.#lightNodeIds.delete(previous.lightId);
    }

    const kind = target?.kind ?? "object";
    const objectId = target?.objectId ?? (kind === "object" ? nodeId : undefined);
    const entry: RuntimeNodeTarget = {
      nodeId,
      kind,
      object,
      transformable: target?.transformable ?? true,
      pickable: target?.pickable ?? true,
      ...(objectId ? { objectId } : {}),
      ...(target?.lightId ? { lightId: target.lightId } : {})
    };

    this.#targets.set(nodeId, entry);
    if (entry.objectId) {
      this.#objectNodeIds.set(entry.objectId, nodeId);
    }
    if (entry.lightId) {
      this.#lightNodeIds.set(entry.lightId, nodeId);
    }
    this.#ids.set(object, nodeId);
  }

  link(nodeId: string, object: Object3D): void {
    if (!this.#targets.has(nodeId)) {
      throw new Error(`Node ${nodeId} is not registered.`);
    }
    this.#ids.set(object, nodeId);
  }

  get(nodeId: string): Object3D | undefined {
    return this.#targets.get(nodeId)?.object;
  }

  getTarget(nodeId: string): RuntimeNodeTarget | undefined {
    return this.#targets.get(nodeId);
  }

  getObject(objectId: string): Object3D | undefined {
    const nodeId = this.#objectNodeIds.get(objectId);
    return nodeId ? this.get(nodeId) : undefined;
  }

  getObjectNodeId(objectId: string): string | undefined {
    return this.#objectNodeIds.get(objectId);
  }

  getLight(lightId: string): Object3D | undefined {
    const nodeId = this.#lightNodeIds.get(lightId);
    return nodeId ? this.get(nodeId) : undefined;
  }

  getLightNodeId(lightId: string): string | undefined {
    return this.#lightNodeIds.get(lightId);
  }

  getId(object: Object3D): string | undefined {
    let current: Object3D | null = object;
    while (current) {
      const id = this.#ids.get(current);
      if (id) {
        return id;
      }
      current = current.parent;
    }
    return undefined;
  }

  delete(nodeId: string): Object3D | undefined {
    const target = this.#targets.get(nodeId);
    if (target) {
      this.#targets.delete(nodeId);
      if (target.objectId) {
        this.#objectNodeIds.delete(target.objectId);
      }
      if (target.lightId) {
        this.#lightNodeIds.delete(target.lightId);
      }
    }
    return target?.object;
  }

  entries(): IterableIterator<[string, Object3D]> {
    return this.#objectEntries();
  }

  nodeEntries(): IterableIterator<[string, Object3D]> {
    return this.#nodeEntries();
  }

  targetEntries(): IterableIterator<[string, RuntimeNodeTarget]> {
    return this.#targets.entries();
  }

  clear(): void {
    this.#targets.clear();
    this.#objectNodeIds.clear();
    this.#lightNodeIds.clear();
    this.#ids = new WeakMap<Object3D, string>();
  }

  get size(): number {
    return this.#targets.size;
  }

  *#objectEntries(): IterableIterator<[string, Object3D]> {
    for (const target of this.#targets.values()) {
      if (target.kind === "object" && target.objectId) {
        yield [target.objectId, target.object];
      }
    }
  }

  *#nodeEntries(): IterableIterator<[string, Object3D]> {
    for (const [nodeId, target] of this.#targets) {
      yield [nodeId, target.object];
    }
  }
}
