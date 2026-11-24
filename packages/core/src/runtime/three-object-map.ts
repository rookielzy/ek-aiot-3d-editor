import type { Object3D } from "three";
import type { ImportedGlbSourceDescriptor } from "../imported-targets/types";
import type { SceneNode } from "../snapshot/types";
import type { ImportedTargetMatchStatus } from "./imported-target-resolver";

export interface RuntimeNodeTarget {
  nodeId: string;
  kind: SceneNode["kind"];
  object: Object3D;
  objectId?: string;
  lightId?: string;
  cameraId?: string;
  ownerObjectId?: string;
  importKey?: string;
  source?: ImportedGlbSourceDescriptor;
  matchStatus?: ImportedTargetMatchStatus;
  aliasNodeIds?: string[];
  pickPriority?: number;
  selected?: boolean;
  primarySelected?: boolean;
  transformable: boolean;
  pickable: boolean;
}

export class ThreeObjectMap {
  #targets = new Map<string, RuntimeNodeTarget>();
  #objectNodeIds = new Map<string, string>();
  #lightNodeIds = new Map<string, string>();
  #cameraNodeIds = new Map<string, string>();
  #ids = new WeakMap<Object3D, Set<string>>();
  #links = new Map<string, Set<Object3D>>();
  #runtimeOnlyObjects = new WeakSet<Object3D>();

  set(nodeId: string, object: Object3D, target?: Partial<Omit<RuntimeNodeTarget, "nodeId" | "object">>): void {
    const previous = this.#targets.get(nodeId);
    if (previous?.objectId) {
      this.#objectNodeIds.delete(previous.objectId);
    }
    if (previous?.lightId) {
      this.#lightNodeIds.delete(previous.lightId);
    }
    if (previous?.cameraId) {
      this.#cameraNodeIds.delete(previous.cameraId);
    }
    this.#unlinkNode(nodeId);

    const kind = target?.kind ?? "object";
    const objectId = target?.objectId ?? (kind === "object" ? nodeId : undefined);
    const entry: RuntimeNodeTarget = {
      nodeId,
      kind,
      object,
      transformable: target?.transformable ?? true,
      pickable: target?.pickable ?? true,
      ...(objectId ? { objectId } : {}),
      ...(target?.lightId ? { lightId: target.lightId } : {}),
      ...(target?.cameraId ? { cameraId: target.cameraId } : {}),
      ...(target?.ownerObjectId ? { ownerObjectId: target.ownerObjectId } : {}),
      ...(target?.importKey ? { importKey: target.importKey } : {}),
      ...(target?.source ? { source: target.source } : {}),
      ...(target?.matchStatus ? { matchStatus: target.matchStatus } : {}),
      ...(target?.aliasNodeIds ? { aliasNodeIds: [...target.aliasNodeIds] } : {}),
      ...(target?.pickPriority !== undefined ? { pickPriority: target.pickPriority } : {}),
      selected: target?.selected ?? Boolean(object.userData.selected),
      primarySelected: target?.primarySelected ?? Boolean(object.userData.primarySelected)
    };

    this.#targets.set(nodeId, entry);
    if (entry.objectId) {
      this.#objectNodeIds.set(entry.objectId, nodeId);
    }
    if (entry.lightId) {
      this.#lightNodeIds.set(entry.lightId, nodeId);
    }
    if (entry.cameraId) {
      this.#cameraNodeIds.set(entry.cameraId, nodeId);
    }
    this.#linkObject(nodeId, object);
  }

  link(nodeId: string, object: Object3D): void {
    if (!this.#targets.has(nodeId)) {
      throw new Error(`Node ${nodeId} is not registered.`);
    }
    this.#linkObject(nodeId, object);
  }

  markRuntimeOnly(object: Object3D): void {
    this.#runtimeOnlyObjects.add(object);
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

  getCamera(cameraId: string): Object3D | undefined {
    const nodeId = this.#cameraNodeIds.get(cameraId);
    return nodeId ? this.get(nodeId) : undefined;
  }

  getCameraNodeId(cameraId: string): string | undefined {
    return this.#cameraNodeIds.get(cameraId);
  }

  getId(object: Object3D): string | undefined {
    return this.getTargetForObject(object)?.nodeId;
  }

  getLinkedNodeIds(object: Object3D): string[] {
    return [...(this.#ids.get(object) ?? [])].sort();
  }

  getTargetForObject(object: Object3D): RuntimeNodeTarget | undefined {
    let current: Object3D | null = object;
    let depth = 0;
    let best: { target: RuntimeNodeTarget; score: number } | null = null;
    const directIds = this.#ids.get(object);
    if (this.#runtimeOnlyObjects.has(object) && !hasPickableTarget(directIds, this.#targets)) {
      return undefined;
    }

    while (current) {
      const ids = this.#ids.get(current);
      if (ids) {
        for (const id of ids) {
          const target = this.#targets.get(id);
          if (!target?.pickable) {
            continue;
          }
          const score = (1000 - depth * 100) + getRuntimeNodePickPriority(target);
          if (!best || score > best.score || (score === best.score && target.nodeId < best.target.nodeId)) {
            best = { target, score };
          }
        }
      }
      current = current.parent;
      depth += 1;
    }
    return best?.target;
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
      if (target.cameraId) {
        this.#cameraNodeIds.delete(target.cameraId);
      }
      this.#unlinkNode(nodeId);
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
    this.#cameraNodeIds.clear();
    this.#ids = new WeakMap<Object3D, Set<string>>();
    this.#links.clear();
    this.#runtimeOnlyObjects = new WeakSet<Object3D>();
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

  #linkObject(nodeId: string, object: Object3D): void {
    const ids = this.#ids.get(object) ?? new Set<string>();
    ids.add(nodeId);
    this.#ids.set(object, ids);
    const links = this.#links.get(nodeId) ?? new Set<Object3D>();
    links.add(object);
    this.#links.set(nodeId, links);
  }

  #unlinkNode(nodeId: string): void {
    const links = this.#links.get(nodeId);
    if (!links) {
      return;
    }
    for (const object of links) {
      const ids = this.#ids.get(object);
      ids?.delete(nodeId);
      if (ids?.size === 0) {
        this.#ids.delete(object);
      }
    }
    this.#links.delete(nodeId);
  }
}

function hasPickableTarget(ids: ReadonlySet<string> | undefined, targets: ReadonlyMap<string, RuntimeNodeTarget>): boolean {
  if (!ids) {
    return false;
  }
  for (const id of ids) {
    if (targets.get(id)?.pickable) {
      return true;
    }
  }
  return false;
}

export function getRuntimeNodePickPriority(target: RuntimeNodeTarget): number {
  if (target.pickPriority !== undefined) return target.pickPriority;
  switch (target.kind) {
    case "imported":
      return 20;
    case "light":
      return 15;
    case "camera":
      return 15;
    case "object":
    case "data-display":
      return 10;
    case "group":
      return 5;
  }
}
