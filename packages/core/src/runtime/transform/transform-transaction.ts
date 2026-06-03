import type { Object3D } from "three";
import type { CommandDispatcher } from "../../commands/dispatcher";
import type { CommandResult } from "../../commands/types";
import type { Transform } from "../../snapshot/types";
import { applyTransform, readTransform } from "../transform";
import { snapTransform, type SnapSettings } from "./snap";
import type { TransformMode } from "./transform-mode";

export interface TransformTransactionTarget {
  nodeId: string;
  object: Object3D;
}

export interface TransformTransactionInputTarget {
  nodeId?: string;
  /** @deprecated Runtime transforms now target scene nodes. Use nodeId. */
  objectId?: string;
  object: Object3D;
}

export interface TransformTransactionOptions {
  nodeId?: string;
  /** @deprecated Runtime transforms now target scene nodes. Use nodeId. */
  objectId?: string;
  object: Object3D;
  targets?: TransformTransactionInputTarget[];
  dispatcher: CommandDispatcher;
  mode?: TransformMode;
  snap?: SnapSettings;
}

export class TransformTransaction {
  readonly nodeId: string;
  readonly mode: TransformMode;
  readonly before: Transform;
  readonly targets: TransformTransactionTarget[];
  #beforeByNodeId = new Map<string, Transform>();
  #dispatcher: CommandDispatcher;
  #snap: SnapSettings;
  #active = true;
  #changed = false;

  constructor(options: TransformTransactionOptions) {
    const nodeId = options.nodeId ?? options.objectId;
    if (!nodeId) {
      throw new Error("Transform transaction requires a nodeId.");
    }
    this.nodeId = nodeId;
    this.mode = options.mode ?? "translate";
    this.targets = (options.targets ?? [{ nodeId, object: options.object }])
      .map((target) => {
        const targetNodeId = target.nodeId ?? target.objectId;
        if (!targetNodeId) {
          throw new Error("Transform transaction target requires a nodeId.");
        }
        return { nodeId: targetNodeId, object: target.object };
      });
    this.#dispatcher = options.dispatcher;
    this.#snap = options.snap ?? {};
    for (const target of this.targets) {
      this.#beforeByNodeId.set(target.nodeId, readTransform(target.object));
    }
    this.before = this.#beforeByNodeId.get(this.nodeId) ?? readTransform(options.object);
  }

  /** @deprecated Runtime transforms now target scene nodes. Use nodeId. */
  get objectId(): string {
    return this.nodeId;
  }

  preview(transform: Partial<Transform>, nodeId = this.nodeId): void {
    this.#assertActive();
    const target = this.#targetFor(nodeId);
    const current = readTransform(target.object);
    const snapped = snapTransform({
      position: transform.position ?? current.position,
      rotation: transform.rotation ?? current.rotation,
      scale: transform.scale ?? current.scale
    }, this.#snap);
    const next = {
      position: transform.position ? snapped.position : current.position,
      rotation: transform.rotation ? snapped.rotation : current.rotation,
      scale: transform.scale ? snapped.scale : current.scale
    };
    applyTransform(target.object, next);
    this.#changed = true;
  }

  commit(): CommandResult | null {
    this.#assertActive();
    this.#active = false;

    if (!this.#changed) {
      return null;
    }

    const commands = this.targets
      .map((target) => ({
        type: "set-node-transform" as const,
        nodeId: target.nodeId,
        transform: this.#filterByMode(readTransform(target.object))
      }));

    return this.#dispatcher.dispatch({
      type: "batch",
      label: this.targets.length > 1 ? "Transform selected nodes" : "Transform node",
      commands
    });
  }

  cancel(): void {
    if (!this.#active) {
      return;
    }

    for (const target of this.targets) {
      const before = this.#beforeByNodeId.get(target.nodeId);
      if (before) {
        applyTransform(target.object, before);
      }
    }
    this.#active = false;
  }

  get active(): boolean {
    return this.#active;
  }

  #filterByMode(transform: Transform): Partial<Transform> {
    switch (this.mode) {
      case "translate":
        return { position: transform.position };
      case "rotate":
        return { rotation: transform.rotation };
      case "scale":
        return { scale: transform.scale };
    }
  }

  #assertActive(): void {
    if (!this.#active) {
      throw new Error("Transform transaction is no longer active.");
    }
  }

  #targetFor(nodeId: string): TransformTransactionTarget {
    const target = this.targets.find((candidate) => candidate.nodeId === nodeId);
    if (!target) {
      throw new Error(`Node ${nodeId} is not part of this transform transaction.`);
    }
    return target;
  }
}
