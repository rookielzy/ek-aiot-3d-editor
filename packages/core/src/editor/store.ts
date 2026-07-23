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
  #suppressNotifyDepth = 0;
  #pendingNotify = false;

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

  /**
   * Apply a store mutation without notifying snapshot subscribers.
   * Used so command side-effects (for example project asset payload registration)
   * can complete before runtime projection observes the new snapshot.
   */
  runWithoutNotify<T>(operation: () => T): T {
    this.#assertActive();
    this.#suppressNotifyDepth += 1;
    try {
      return operation();
    } finally {
      this.#suppressNotifyDepth -= 1;
    }
  }

  replaceSnapshot(nextSnapshot: SceneSnapshot): SceneSnapshot {
    this.#assertActive();
    assertValidSceneSnapshot(nextSnapshot);
    this.#snapshot = immutableClone(nextSnapshot);
    if (this.#suppressNotifyDepth === 0) {
      this.#pendingNotify = false;
      this.#subscriptions.notify(this.#snapshot);
    } else {
      this.#pendingNotify = true;
    }
    return this.#snapshot;
  }

  /**
   * Flush a notification deferred by {@link runWithoutNotify}, if any.
   */
  flushNotify(): void {
    this.#assertActive();
    if (!this.#pendingNotify) {
      return;
    }
    this.#pendingNotify = false;
    this.#subscriptions.notify(this.#snapshot);
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
