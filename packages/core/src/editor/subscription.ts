import type { SceneSnapshot } from "../snapshot/types";

export type SnapshotListener = (snapshot: SceneSnapshot) => void;
export type Unsubscribe = () => void;

export class SubscriptionSet {
  #listeners = new Set<SnapshotListener>();

  subscribe(listener: SnapshotListener): Unsubscribe {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  notify(snapshot: SceneSnapshot): void {
    for (const listener of [...this.#listeners]) {
      listener(snapshot);
    }
  }

  clear(): void {
    this.#listeners.clear();
  }

  get size(): number {
    return this.#listeners.size;
  }
}
