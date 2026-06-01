import type { SnapSettings } from "../runtime/transform/snap";

export type SnapChannel = keyof SnapSettings;
export type SnapSubscriber = (settings: SnapSettings) => void;

export class EditorSnapState {
  #settings: SnapSettings = Object.freeze({});
  #subscribers = new Set<SnapSubscriber>();

  get(): SnapSettings {
    return this.#settings;
  }

  set(settings: SnapSettings): SnapSettings {
    this.#settings = Object.freeze({ ...settings });
    this.#notify();
    return this.get();
  }

  toggle(channel: SnapChannel, increment: number): SnapSettings {
    const enabled = this.#settings[channel] !== undefined && this.#settings[channel] !== null;
    return this.set({
      ...this.#settings,
      [channel]: enabled ? null : increment
    });
  }

  subscribe(subscriber: SnapSubscriber): () => void {
    this.#subscribers.add(subscriber);
    subscriber(this.get());
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  clear(): void {
    this.#subscribers.clear();
  }

  #notify(): void {
    const settings = this.get();
    for (const subscriber of [...this.#subscribers]) {
      subscriber(settings);
    }
  }
}
