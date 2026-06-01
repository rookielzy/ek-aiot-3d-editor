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

  start(objectId: string, mode: TransformMode = "translate", options: { objectIds?: string[]; snap?: SnapSettings } = {}): TransformTransaction {
    this.cancel();
    const object = this.#objects.get(objectId);
    if (!object) {
      throw new Error(`Object ${objectId} is not projected.`);
    }
    const objectIds = options.objectIds?.length ? options.objectIds : [objectId];
    const targets = objectIds.map((targetObjectId) => {
      const targetObject = this.#objects.get(targetObjectId);
      if (!targetObject) {
        throw new Error(`Object ${targetObjectId} is not projected.`);
      }
      return { objectId: targetObjectId, object: targetObject };
    });

    this.#transaction = new TransformTransaction({
      objectId,
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
