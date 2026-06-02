export type TransformMode = "translate" | "rotate" | "scale";

export type TransformModeSubscriber = (mode: TransformMode) => void;

export class EditorTransformModeState {
  #mode: TransformMode = "translate";
  #subscribers = new Set<TransformModeSubscriber>();

  get(): TransformMode {
    return this.#mode;
  }

  set(mode: TransformMode): TransformMode {
    this.#mode = mode;
    this.#notify();
    return this.get();
  }

  subscribe(subscriber: TransformModeSubscriber): () => void {
    this.#subscribers.add(subscriber);
    subscriber(this.get());
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  reset(): void {
    this.set("translate");
  }

  clear(): void {
    this.#subscribers.clear();
  }

  #notify(): void {
    const mode = this.get();
    for (const subscriber of [...this.#subscribers]) {
      subscriber(mode);
    }
  }
}
