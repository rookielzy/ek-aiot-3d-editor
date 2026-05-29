import type { Object3D } from "three";

export class ThreeObjectMap {
  #objects = new Map<string, Object3D>();
  #ids = new WeakMap<Object3D, string>();

  set(objectId: string, object: Object3D): void {
    this.#objects.set(objectId, object);
    this.#ids.set(object, objectId);
  }

  get(objectId: string): Object3D | undefined {
    return this.#objects.get(objectId);
  }

  getId(object: Object3D): string | undefined {
    let current: Object3D | null = object;
    while (current) {
      const id = this.#ids.get(current);
      if (id) {
        return id;
      }
      current = current.parent;
    }
    return undefined;
  }

  delete(objectId: string): Object3D | undefined {
    const object = this.#objects.get(objectId);
    if (object) {
      this.#objects.delete(objectId);
    }
    return object;
  }

  entries(): IterableIterator<[string, Object3D]> {
    return this.#objects.entries();
  }

  clear(): void {
    this.#objects.clear();
    this.#ids = new WeakMap<Object3D, string>();
  }

  get size(): number {
    return this.#objects.size;
  }
}
