import { describe, expect, it, vi } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import { EditorStore } from "./store";

describe("editor subscriptions", () => {
  it("publishes a stable immutable snapshot only when state changes", () => {
    const store = new EditorStore(createEmptySnapshot("scene-a"));
    const listener = vi.fn();

    store.subscribe(listener);
    const firstRead = store.getSnapshot();
    const secondRead = store.getSnapshot();

    expect(firstRead).toBe(secondRead);
    expect(listener).not.toHaveBeenCalled();

    store.update((snapshot) => ({
      ...snapshot,
      scene: {
        ...snapshot.scene,
        name: "Changed"
      }
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(listener.mock.calls[0][0])).toBe(true);
  });

  it("allows subscribers to unsubscribe", () => {
    const store = new EditorStore(createEmptySnapshot("scene-a"));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.update((snapshot) => ({
      ...snapshot,
      scene: {
        ...snapshot.scene,
        name: "Changed"
      }
    }));

    expect(listener).not.toHaveBeenCalled();
  });

  it("defers snapshot notifications until flushNotify after runWithoutNotify", () => {
    const store = new EditorStore(createEmptySnapshot("scene-a"));
    const listener = vi.fn();
    store.subscribe(listener);

    store.runWithoutNotify(() => {
      store.update((snapshot) => ({
        ...snapshot,
        scene: {
          ...snapshot.scene,
          name: "Deferred"
        }
      }));
      expect(listener).not.toHaveBeenCalled();
      expect(store.getSnapshot().scene.name).toBe("Deferred");
    });

    expect(listener).not.toHaveBeenCalled();
    store.flushNotify();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].scene.name).toBe("Deferred");
  });
});
