import { createEmptySnapshot } from "../snapshot/defaults";
import { immutableClone } from "../snapshot/immutability";
import type { SceneSnapshot } from "../snapshot/types";
import { assertValidSceneSnapshot } from "../snapshot/validation";
import { SubscriptionSet, type SnapshotListener, type Unsubscribe } from "./subscription";

export type SnapshotProducer = (snapshot: SceneSnapshot) => SceneSnapshot;

export class EditorStore {
  #snapshot: SceneSnapshot;
  #subscriptions = new SubscriptionSet();
  #disposed = false;

  constructor(initialSnapshot: SceneSnapshot = createEmptySnapshot()) {
    assertValidSceneSnapshot(initialSnapshot);
    this.#snapshot = immutableClone(initialSnapshot);
  }

  getSnapshot(): SceneSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: SnapshotListener): Unsubscribe {
    this.#assertActive();
    return this.#subscriptions.subscribe(listener);
  }

  replaceSnapshot(nextSnapshot: SceneSnapshot): SceneSnapshot {
    this.#assertActive();
    assertValidSceneSnapshot(nextSnapshot);
    this.#snapshot = immutableClone(nextSnapshot);
    this.#subscriptions.notify(this.#snapshot);
    return this.#snapshot;
  }

  update(producer: SnapshotProducer): SceneSnapshot {
    return this.replaceSnapshot(producer(this.#snapshot));
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#subscriptions.clear();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Editor store has been disposed.");
    }
  }
}
