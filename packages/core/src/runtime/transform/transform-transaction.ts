import type { Object3D } from "three";
import type { CommandDispatcher } from "../../commands/dispatcher";
import type { CommandResult } from "../../commands/types";
import type { Transform } from "../../snapshot/types";
import { applyTransform, readTransform } from "../transform";
import type { TransformMode } from "./transform-mode";

export interface TransformTransactionOptions {
  objectId: string;
  object: Object3D;
  dispatcher: CommandDispatcher;
  mode?: TransformMode;
}

export class TransformTransaction {
  readonly objectId: string;
  readonly mode: TransformMode;
  readonly before: Transform;
  #object: Object3D;
  #dispatcher: CommandDispatcher;
  #active = true;
  #changed = false;

  constructor(options: TransformTransactionOptions) {
    this.objectId = options.objectId;
    this.mode = options.mode ?? "translate";
    this.#object = options.object;
    this.#dispatcher = options.dispatcher;
    this.before = readTransform(this.#object);
  }

  preview(transform: Partial<Transform>): void {
    this.#assertActive();
    const current = readTransform(this.#object);
    applyTransform(this.#object, {
      position: transform.position ?? current.position,
      rotation: transform.rotation ?? current.rotation,
      scale: transform.scale ?? current.scale
    });
    this.#changed = true;
  }

  commit(): CommandResult | null {
    this.#assertActive();
    this.#active = false;

    if (!this.#changed) {
      return null;
    }

    const after = readTransform(this.#object);
    const modeTransform = this.#filterByMode(after);
    return this.#dispatcher.dispatch({
      type: "set-transform",
      objectId: this.objectId,
      transform: modeTransform
    });
  }

  cancel(): void {
    if (!this.#active) {
      return;
    }

    applyTransform(this.#object, this.before);
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
}
