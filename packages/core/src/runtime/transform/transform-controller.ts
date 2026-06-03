import type { CommandDispatcher } from "../../commands/dispatcher";
import type { CommandResult } from "../../commands/types";
import type { Transform } from "../../snapshot/types";
import type { ThreeObjectMap } from "../three-object-map";
import type { SnapSettings } from "./snap";
import { TransformTransaction } from "./transform-transaction";
import type { TransformMode } from "./transform-mode";

export class TransformController {
  #objects: ThreeObjectMap;
  #dispatcher: CommandDispatcher;
  #transaction: TransformTransaction | null = null;

  constructor(objects: ThreeObjectMap, dispatcher: CommandDispatcher) {
    this.#objects = objects;
    this.#dispatcher = dispatcher;
  }

  start(nodeId: string, mode: TransformMode = "translate", options: { nodeIds?: string[]; objectIds?: string[]; snap?: SnapSettings } = {}): TransformTransaction {
    this.cancel();
    const target = this.#objects.getTarget(nodeId);
    const object = target?.object;
    if (!object) {
      throw new Error(`Node ${nodeId} is not projected.`);
    }
    if (!target.transformable) {
      throw new Error(`Node ${nodeId} does not support transforms.`);
    }
    const nodeIds = options.nodeIds?.length
      ? options.nodeIds
      : options.objectIds?.length
        ? options.objectIds.map((objectId) => this.#objects.getObjectNodeId(objectId) ?? objectId)
        : [nodeId];
    const targets = nodeIds.map((targetNodeId) => {
      const targetEntry = this.#objects.getTarget(targetNodeId);
      if (!targetEntry) {
        throw new Error(`Node ${targetNodeId} is not projected.`);
      }
      if (!targetEntry.transformable) {
        throw new Error(`Node ${targetNodeId} does not support transforms.`);
      }
      return { nodeId: targetNodeId, object: targetEntry.object };
    });

    this.#transaction = new TransformTransaction({
      nodeId,
      object,
      targets,
      dispatcher: this.#dispatcher,
      mode,
      snap: options.snap
    });

    return this.#transaction;
  }

  preview(transform: Partial<Transform>): void {
    this.#transaction?.preview(transform);
  }

  commit(): CommandResult | null {
    const transaction = this.#transaction;
    this.#transaction = null;
    return transaction?.commit() ?? null;
  }

  cancel(): void {
    this.#transaction?.cancel();
    this.#transaction = null;
  }

  get activeTransaction(): TransformTransaction | null {
    return this.#transaction;
  }
}
