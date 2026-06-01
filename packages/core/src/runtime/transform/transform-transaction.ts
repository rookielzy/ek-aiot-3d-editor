import type { Object3D } from "three";
import type { CommandDispatcher } from "../../commands/dispatcher";
import type { CommandResult } from "../../commands/types";
import type { Transform } from "../../snapshot/types";
import { applyTransform, readTransform } from "../transform";
import { snapTransform, type SnapSettings } from "./snap";
import type { TransformMode } from "./transform-mode";

export interface TransformTransactionTarget {
  objectId: string;
  object: Object3D;
}

export interface TransformTransactionOptions {
  objectId: string;
  object: Object3D;
  targets?: TransformTransactionTarget[];
  dispatcher: CommandDispatcher;
  mode?: TransformMode;
  snap?: SnapSettings;
}

export class TransformTransaction {
  readonly objectId: string;
  readonly mode: TransformMode;
  readonly before: Transform;
  readonly targets: TransformTransactionTarget[];
  #beforeByObjectId = new Map<string, Transform>();
  #dispatcher: CommandDispatcher;
  #snap: SnapSettings;
  #active = true;
  #changed = false;

  constructor(options: TransformTransactionOptions) {
    this.objectId = options.objectId;
    this.mode = options.mode ?? "translate";
    this.targets = options.targets ?? [{ objectId: options.objectId, object: options.object }];
    this.#dispatcher = options.dispatcher;
    this.#snap = options.snap ?? {};
    for (const target of this.targets) {
      this.#beforeByObjectId.set(target.objectId, readTransform(target.object));
    }
    this.before = this.#beforeByObjectId.get(this.objectId) ?? readTransform(options.object);
  }

  preview(transform: Partial<Transform>, objectId = this.objectId): void {
    this.#assertActive();
    const target = this.#targetFor(objectId);
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
        type: "set-transform" as const,
        objectId: target.objectId,
        transform: this.#filterByMode(readTransform(target.object))
      }));

    return this.#dispatcher.dispatch({
      type: "batch",
      label: this.targets.length > 1 ? "Transform selected objects" : "Transform object",
      commands
    });
  }

  cancel(): void {
    if (!this.#active) {
      return;
    }

    for (const target of this.targets) {
      const before = this.#beforeByObjectId.get(target.objectId);
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

  #targetFor(objectId: string): TransformTransactionTarget {
    const target = this.targets.find((candidate) => candidate.objectId === objectId);
    if (!target) {
      throw new Error(`Object ${objectId} is not part of this transform transaction.`);
    }
    return target;
  }
}
